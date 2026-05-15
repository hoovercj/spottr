/**
 * One-shot importer: Spottr-flat-CSV → Spottr backup JSON.
 *
 * Usage:
 *   node scripts/import-sheet.mjs <baseline.json> <data.csv> [out.json]
 *
 *   baseline.json: a fresh Spottr export (Settings → Export now). The
 *     importer reuses its liftFamily / variant / location / program /
 *     scheduleSlot / splitDayType / slotPlan rows so the user keeps a
 *     real PPL routine attached to imported sessions.
 *   data.csv:      the flat CSV (Date, Exercise Name, Set Number, Weight,
 *     Reps, Notes).
 *   out.json:      defaults to .tmp/spottr-import.json.
 *
 * Workflow:
 *   1. User opens Spottr, picks any backup destination, hits "Export now".
 *   2. User runs this script with paths to both files.
 *   3. User opens Settings → Restore from file and picks the output.
 *
 * The output is a complete Spottr export: baseline data verbatim, plus
 * Session / SessionLift / SessionSet rows generated from the CSV. Imported
 * sessions are tagged to the active PPL routine's scheduleSlots by
 * weekday (Mon=Pull 0, Tue=Push 1, …).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const [, , baselinePathArg, csvPathArg, outPathArg] = process.argv;
if (!baselinePathArg || !csvPathArg) {
  console.error('Usage: node scripts/import-sheet.mjs <baseline.json> <data.csv> [out.json]');
  process.exit(1);
}
const baselinePath = resolve(baselinePathArg);
const csvPath = resolve(csvPathArg);
const outPath = resolve(outPathArg ?? '.tmp/spottr-import.json');

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const csvText = readFileSync(csvPath, 'utf8');

// ---------- CSV parsing ----------

function parseCsv(text) {
  const rows = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < rawLine.length; i++) {
      const c = rawLine[i];
      if (inQ) {
        if (c === '"' && rawLine[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') {
          inQ = false;
        } else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') {
          cells.push(cur);
          cur = '';
        } else cur += c;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const csvRows = parseCsv(csvText)
  .slice(1)
  .map((r) => ({
    date: r[0]?.trim() ?? '',
    exercise: r[1]?.trim() ?? '',
    setNumber: Number.parseInt(r[2] ?? '0', 10) || 1,
    weight: r[3]?.trim() ?? '',
    reps: r[4]?.trim() ?? '',
    note: r[5]?.trim() ?? '',
  }));

// ---------- Lookup maps from baseline ----------

const families = new Map(); // name (lower) → row
const variantsByFamily = new Map(); // familyId → Map(kind → row)
const variantsByFamilyAndName = new Map(); // familyId → Map(nameLower → row)
for (const f of baseline.stores.liftFamily) families.set(f.name.toLowerCase(), f);
for (const v of baseline.stores.variant) {
  if (!variantsByFamily.has(v.liftFamilyId)) variantsByFamily.set(v.liftFamilyId, new Map());
  if (!variantsByFamilyAndName.has(v.liftFamilyId))
    variantsByFamilyAndName.set(v.liftFamilyId, new Map());
  variantsByFamily.get(v.liftFamilyId).set(v.equipmentKind, v);
  variantsByFamilyAndName.get(v.liftFamilyId).set(v.name.toLowerCase(), v);
}

function familyByName(name) {
  const f = families.get(name.toLowerCase());
  if (!f) throw new Error(`Baseline has no lift family named "${name}"`);
  return f;
}
function variant(familyName, kind) {
  const f = familyByName(familyName);
  const v = variantsByFamily.get(f.id)?.get(kind);
  if (!v)
    throw new Error(
      `Baseline has no "${kind}" variant for ${familyName} (have: ${[
        ...(variantsByFamily.get(f.id)?.keys() ?? []),
      ].join(', ')})`,
    );
  return { familyId: f.id, variantId: v.id, familyName: f.name, variantName: v.name };
}

const noLocation = baseline.stores.location.find((l) => l.name.toLowerCase() === 'no location');
if (!noLocation) throw new Error('Baseline has no "No location" row');

const activeProgram = baseline.stores.program.find((p) => p.isActive);
if (!activeProgram) throw new Error('Baseline has no active program');
const activeSlots = baseline.stores.scheduleSlot
  .filter((s) => s.programId === activeProgram.id)
  .sort((a, b) => a.orderIndex - b.orderIndex);
const slotByOrderIndex = new Map(activeSlots.map((s) => [s.orderIndex, s]));

// Weekday → slot index. Mon=0, Tue=1, … Sun=6 (Date.getDay returns Sun=0).
function slotForDate(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // Sun=0..Sat=6
  const mondayFirst = (dow + 6) % 7; // Mon=0..Sun=6
  return slotByOrderIndex.get(mondayFirst) ?? null;
}

// ---------- Exercise → mapping ----------

/**
 * Normalize an exercise label by stripping the rep-scheme prefix and
 * collapsing whitespace, then lowercasing for compare.
 *
 * "4x5, 1x5+ Bench Press" → "bench press"
 * "3x8-12 Pulldowns/Pullups/Chinups" → "pulldowns/pullups/chinups"
 * "Dips " → "dips"
 */
function normalizeName(raw) {
  let s = raw
    .replace(/^\s*\d+x[\d+-]+(\s*,\s*\d+x[\d+-]+)*\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  // Common typos.
  s = s.replace('pulldown get the s', 'pulldowns');
  s = s.replace('tri extlends', 'tri extends');
  return s;
}

/**
 * Map a normalized name to one or two SessionLift descriptors. Supersets
 * (`A SS B`) return both halves; non-supersets return one.
 *
 * Each descriptor: { family, variantKind, role: 'single'|'ssA'|'ssB' }
 * The note hook fires per-row (after splitting) so a `pullup` note can
 * override the family/variant pick.
 */
function resolveExercise(label) {
  const norm = normalizeName(label);
  if (norm.includes(' ss ')) {
    // Each half can carry its own rep-scheme prefix
    // ("3x8-12 Triceps Pushdowns SS 3x15-20 Lat Raises"). Re-normalize.
    const [a, b] = norm.split(' ss ').map((x) => normalizeName(x));
    const specA = resolveSingle(a);
    // Per-context override for the second leg's variant: triceps-pushdowns
    // pair their lat raises on the cable stack; overhead-tri extensions
    // pair theirs with dumbbells.
    let specB;
    if (specA.family === 'Tricep Pushdown' && b === 'lat raises') {
      specB = { family: 'Lateral Raise', variantKind: 'cable' };
    } else {
      specB = resolveSingle(b);
    }
    return [
      { ...specA, role: 'ssA' },
      { ...specB, role: 'ssB' },
    ];
  }
  return [{ ...resolveSingle(norm), role: 'single' }];
}

function resolveSingle(norm) {
  // strict map keyed by normalized name
  const map = {
    deadlift: { family: 'Deadlift', variantKind: 'barbell' },
    'barbell rows': { family: 'Row', variantKind: 'machine', expandSingleSetTo: 5 },
    'pulldowns/pullups/chinups': { family: 'Lat Pulldown', variantKind: 'machine' },
    'chest supported rows/seated cable rows': {
      family: 'Seated Cable Row',
      variantKind: 'cable',
    },
    'face pulls': { family: 'Face Pull', variantKind: 'cable' },
    'hammer curls': { family: 'Hammer Curl', variantKind: 'dumbbell' },
    'dumbbell curls': { family: 'Bicep Curl', variantKind: 'dumbbell' },
    'rear delt': { family: 'Rear Delt Fly', variantKind: 'cable' },
    'reverse fly': { family: 'Rear Delt Fly', variantKind: 'dumbbell' },
    'bench press': { family: 'Bench Press', variantKind: 'machine' },
    'overhead press': { family: 'Shoulder Press', variantKind: 'machine' },
    'incline dumbbell press': { family: 'Incline Bench Press', variantKind: 'dumbbell' },
    'triceps pushdowns': { family: 'Tricep Pushdown', variantKind: 'cable' },
    'overhead tri extends': {
      family: 'Overhead Tricep Extension',
      variantKind: 'dumbbell',
    },
    'lat raises': { family: 'Lateral Raise', variantKind: 'dumbbell' },
    'pec deck': { family: 'Pec Deck', variantKind: 'machine' },
    squat: { family: 'Squat', variantKind: 'machine' },
    'romanian deadlift': { family: 'Romanian Deadlift', variantKind: 'barbell' },
    'leg press': { family: 'Leg Press', variantKind: 'machine' },
    'leg curls': { family: 'Leg Curl', variantKind: 'machine' },
    'leg curl': { family: 'Leg Curl', variantKind: 'machine' },
    'calf raises': { family: 'Calf Raise', variantKind: 'machine' },
    'hammer curl/cable upright row': { family: 'Hammer Curl', variantKind: 'dumbbell' },
    dips: { family: 'Dip', variantKind: 'bodyweight' },
  };
  const hit = map[norm];
  if (!hit) throw new Error(`Unrecognized exercise: "${norm}"`);
  return hit;
}

/**
 * Note-based variant override. Returns either the unchanged spec or a
 * substituted one. `(bench)` on Overhead Press → Bench Press (Barbell).
 */
function applyNoteOverride(spec, note) {
  if (!note) return spec;
  const n = note.toLowerCase();
  // Pull-up substitution on Pulldowns/Pullups/Chinups.
  if (spec.family === 'Lat Pulldown' && /\bpullup|^pu\b|\bchinup|kg pullup|pullups/.test(n)) {
    return { family: 'Pull-up', variantKind: 'bodyweight', _bodyweight: true };
  }
  // (bench) on Overhead Press → Bench Press (Barbell).
  if (spec.family === 'Shoulder Press' && /\(?bench\)?/.test(n)) {
    return { family: 'Bench Press', variantKind: 'barbell' };
  }
  return spec;
}

// ---------- Set parsing ----------

function parseFloats(cell) {
  // Slash + dot can both separate per-set values. `5.5` → [5, 5]; `5.5.5.5`
  // → [5,5,5,5]; `60/60/60/50/50` → 5 weights.
  if (!cell) return [];
  const slashes = cell
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (slashes.length > 1) return slashes.map(Number).filter((n) => Number.isFinite(n));
  // single token; try dot-split if it looks like repeating digits
  if (/^\d+(\.\d+)+$/.test(cell)) {
    const parts = cell.split('.').map(Number);
    // heuristic: if every part is the same integer ≤ 30, it's a per-set
    // reps notation; else it's a decimal weight.
    if (parts.every((n) => Number.isInteger(n) && n <= 30) && parts.length > 1) return parts;
  }
  const n = Number(cell);
  return Number.isFinite(n) ? [n] : [];
}

/**
 * Build the list of sets for one exercise-instance from its CSV rows.
 *
 * Three flatten shapes we accept:
 *   - One CSV row per set: rows.length === setCount, each row has scalar
 *     weight + scalar reps.
 *   - One CSV row with slash-compacted weight + slash-compacted reps:
 *     rows.length === 1, weight.split('/').length === reps.split('/').length.
 *   - Mixed: rows.length > 1 but each row still has a slash-compacted
 *     weight (Gemini's superset shape, where the same weight string is
 *     stamped on every set row).
 */
function buildSets(rows, spec) {
  const result = [];
  if (rows.length > 1) {
    // One row per set. The weight cell may be slash-separated (per-set
    // values) — pick the slot matching this set's index, or fall back to
    // the first value.
    for (const r of rows) {
      const ws = parseFloats(r.weight);
      const rs = parseFloats(r.reps);
      const idx = Math.min(r.setNumber - 1, Math.max(0, ws.length - 1));
      const weight = ws[idx] ?? ws[0] ?? null;
      const reps = rs[0] ?? null; // single-row reps are usually scalar
      result.push({ weight, reps });
    }
    return result;
  }
  // rows.length === 1 — the row may compress multiple sets.
  const r = rows[0];
  const ws = parseFloats(r.weight);
  const rs = parseFloats(r.reps);
  const nSets = Math.max(ws.length, rs.length, 1);
  // Only broadcast a scalar across all sets when the cell has exactly one
  // value. If it was a per-set list with trailing gaps (e.g. `5/5/4/`),
  // leave the missing slots empty so we don't fabricate reps.
  const weightBroadcast = ws.length <= 1;
  const repsBroadcast = rs.length <= 1;
  for (let i = 0; i < nSets; i++) {
    const weight = ws[i] ?? (weightBroadcast ? ws[0] : null) ?? null;
    const reps = rs[i] ?? (repsBroadcast ? rs[0] : null) ?? null;
    result.push({ weight, reps });
  }
  // Expand-single-set rule: if the exercise spec says to and we ended up
  // with only one set, replicate it N times.
  if (spec.expandSingleSetTo && result.length === 1) {
    const [only] = result;
    while (result.length < spec.expandSingleSetTo) result.push({ ...only });
  }
  return result;
}

/**
 * Variant of buildSets for SS rows. Splits sets between leg A and leg B.
 * Weight cell shape is `A/B` (one weight each), reps cell shape is a
 * single number applied to every set in this row's set number.
 */
function buildSupersetSet(row, leg) {
  const ws = parseFloats(row.weight);
  const rs = parseFloats(row.reps);
  const weight = leg === 'ssA' ? (ws[0] ?? null) : (ws[1] ?? ws[0] ?? null);
  const reps = rs[0] ?? null;
  return { weight, reps };
}

// ---------- Output assembly ----------

const now = new Date().toISOString();
const newSessions = [];
const newSessionLifts = [];
const newSessionSets = [];
const skipped = [];

// Group CSV rows by (date, exercise label). Order within group by setNumber.
const groupKey = (r) => `${r.date}::${r.exercise}`;
const groups = new Map();
for (const r of csvRows) {
  if (!r.date) continue;
  if (!groups.has(groupKey(r))) groups.set(groupKey(r), []);
  groups.get(groupKey(r)).push(r);
}
for (const arr of groups.values()) arr.sort((a, b) => a.setNumber - b.setNumber);

// Sessions are keyed on date; collect SessionLifts under each.
const sessionByDate = new Map();
function getOrMakeSession(date) {
  if (sessionByDate.has(date)) return sessionByDate.get(date);
  const slot = slotForDate(date);
  const id = randomUUID();
  const sess = {
    id,
    startedAt: `${date}T18:00:00.000Z`,
    completedAt: `${date}T19:30:00.000Z`,
    state: 'COMPLETED',
    locationId: noLocation.id,
    calendarDate: date,
    ...(slot ? { scheduleSlotId: slot.id } : {}),
  };
  newSessions.push(sess);
  sessionByDate.set(date, sess);
  return sess;
}

let liftOrderPerSession = new Map(); // sessionId → next orderIndex

for (const [, rows] of groups) {
  const { date, exercise, note } = rows[0];
  let specs;
  try {
    specs = resolveExercise(exercise);
  } catch (err) {
    skipped.push({ date, exercise, reason: err.message });
    continue;
  }

  // Apply note-driven overrides per row group (note tends to be consistent
  // across set rows of the same group).
  specs = specs.map((s) => applyNoteOverride(s, note));

  const session = getOrMakeSession(date);
  const sessionLiftIdsToOrder = liftOrderPerSession.get(session.id) ?? 0;
  liftOrderPerSession.set(session.id, sessionLiftIdsToOrder);

  if (specs.length === 1) {
    // Single exercise.
    const spec = specs[0];
    let vRes;
    try {
      vRes = variant(spec.family, spec.variantKind);
    } catch (err) {
      skipped.push({ date, exercise, reason: err.message });
      continue;
    }
    const liftId = randomUUID();
    const sets = buildSets(rows, spec);
    const sessionLift = {
      id: liftId,
      sessionId: session.id,
      liftFamilyId: vRes.familyId,
      variantId: vRes.variantId,
      orderIndex: liftOrderPerSession.get(session.id),
      scope: 'planned',
      ...(note ? { note } : {}),
    };
    liftOrderPerSession.set(session.id, sessionLift.orderIndex + 1);
    newSessionLifts.push(sessionLift);
    sets.forEach((s, i) => {
      // Skip rows with no logged data at all.
      if (s.weight == null && s.reps == null) return;
      newSessionSets.push({
        id: randomUUID(),
        sessionLiftId: liftId,
        variantId: vRes.variantId,
        orderIndex: i,
        plannedRepsMin: s.reps ?? 0,
        plannedRepsMax: s.reps ?? 0,
        plannedReps: s.reps ?? 0,
        ...(s.weight != null ? { loggedWeight: spec._bodyweight ? 0 : s.weight } : {}),
        ...(s.reps != null ? { loggedReps: s.reps } : {}),
        // A set with weight but no reps is "weight done, count unknown" —
        // keep it un-logged so progress/queries don't pick up a phantom
        // rep count of zero.
        ...(s.reps != null ? { loggedAt: session.completedAt } : {}),
      });
    });
  } else {
    // Superset. specs has [ssA, ssB]. Each row in `rows` is one logged set
    // for ONE leg. Original sheet layout: sets 1..N/2 = ssA, N/2+1..N = ssB
    // (where N is the visible number of set columns logged). When only 3
    // are present, all 3 belong to ssA.
    const setCount = rows.length;
    const halfWayDown = Math.max(1, Math.ceil(setCount / 2));
    const aRows = rows.filter((_, i) => i < halfWayDown);
    const bRows = rows.filter((_, i) => i >= halfWayDown);

    for (const [leg, legRows] of [
      ['ssA', aRows],
      ['ssB', bRows],
    ]) {
      if (legRows.length === 0) continue;
      const spec = specs.find((s) => s.role === leg);
      let vRes;
      try {
        vRes = variant(spec.family, spec.variantKind);
      } catch (err) {
        skipped.push({ date, exercise: `${exercise} [${leg}]`, reason: err.message });
        continue;
      }
      const liftId = randomUUID();
      const sessionLift = {
        id: liftId,
        sessionId: session.id,
        liftFamilyId: vRes.familyId,
        variantId: vRes.variantId,
        orderIndex: liftOrderPerSession.get(session.id),
        scope: 'planned',
        ...(note ? { note } : {}),
      };
      liftOrderPerSession.set(session.id, sessionLift.orderIndex + 1);
      newSessionLifts.push(sessionLift);
      legRows.forEach((r, i) => {
        const s = buildSupersetSet(r, leg);
        if (s.weight == null && s.reps == null) return;
        newSessionSets.push({
          id: randomUUID(),
          sessionLiftId: liftId,
          variantId: vRes.variantId,
          orderIndex: i,
          plannedRepsMin: s.reps ?? 0,
          plannedRepsMax: s.reps ?? 0,
          plannedReps: s.reps ?? 0,
          ...(s.weight != null ? { loggedWeight: s.weight } : {}),
          ...(s.reps != null ? { loggedReps: s.reps } : {}),
          ...(s.reps != null ? { loggedAt: session.completedAt } : {}),
        });
      });
    }
  }
}

// ---------- Merge into baseline ----------

const out = {
  ...baseline,
  exportedAt: now,
  stores: {
    ...baseline.stores,
    session: [...baseline.stores.session, ...newSessions],
    sessionLift: [...baseline.stores.sessionLift, ...newSessionLifts],
    sessionSet: [...baseline.stores.sessionSet, ...newSessionSets],
  },
};

writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('');
console.log('Wrote', outPath);
console.log('');
console.log('Sessions added:    ', newSessions.length);
console.log('SessionLifts added:', newSessionLifts.length);
console.log('SessionSets added: ', newSessionSets.length);
console.log('Group entries:     ', groups.size);
console.log('Skipped:           ', skipped.length);
if (skipped.length) {
  console.log('');
  console.log('Skipped detail:');
  const grouped = {};
  for (const s of skipped) {
    grouped[s.reason] = (grouped[s.reason] || 0) + 1;
  }
  for (const [reason, count] of Object.entries(grouped).sort((a, b) => b[1] - a[1])) {
    console.log(' ', count, '×', reason);
  }
}
