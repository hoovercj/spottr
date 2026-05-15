# WorkoutBuddy — Architecture

Status: living document. Authoritative for schema, migration policy, and the suggested-weight rule. Cross-references PRD FR / NFR numbers verbatim.

## 1. Schema (Dexie v1)

All persistent state lives in IndexedDB via Dexie. Single database `workout-buddy`. Every record has an opaque string `id` (uuid v4); never a numeric primary key, never a composite key surfaced to UI.

### 1.1 Stores

| Store                    | Primary key    | Indexes                                                                                             |
| ------------------------ | -------------- | --------------------------------------------------------------------------------------------------- |
| `meta`                   | `key` (string) | —                                                                                                   |
| `liftFamily`             | `id`           | `name`, `isCustom`                                                                                  |
| `variant`                | `id`           | `liftFamilyId`, `[liftFamilyId+name]`, `isAlias`                                                    |
| `location`               | `id`           | `name`                                                                                              |
| `program`                | `id`           | `isActive`                                                                                          |
| `splitDayType`           | `id`           | `programId`                                                                                         |
| `scheduleSlot`           | `id`           | `programId`, `[programId+orderIndex]`, `splitDayTypeId`                                             |
| `slotPlan`               | `id`           | `scheduleSlotId`, `[scheduleSlotId+orderIndex]`, `liftFamilyId`                                     |
| `slotPlanSupersetGroup`  | `id`           | `scheduleSlotId`                                                                                    |
| `locationSupersetMemory` | `id`           | `[locationId+liftFamilyIdA+liftFamilyIdB]`                                                          |
| `session`                | `id`           | `scheduleSlotId`, `state`, `startedAt`, `completedAt`                                               |
| `sessionLift`            | `id`           | `sessionId`, `[sessionId+orderIndex]`, `liftFamilyId`, `variantId`                                  |
| `sessionSet`             | `id`           | `sessionLiftId`, `[sessionLiftId+orderIndex]`, `[variantId+plannedRepsMin+plannedRepsMax+loggedAt]` |
| `cardioEntry`            | `id`           | `sessionId`                                                                                         |
| `stretchEntry`           | `id`           | `sessionId`                                                                                         |
| `migrationLog`           | `id`           | `timestamp`                                                                                         |

### 1.2 Type shapes

See `src/data/types.ts` for the authoritative TypeScript declarations. Notes:

- `Variant.isAlias` + `Variant.canonicalId` implement non-destructive merge (FR6). Aliases are queryable in the audit log for at least 30 days; in practice they live forever — disk is cheap. Reads automatically follow `canonicalId` to the canonical variant when one is set.
- `Variant.isFreeWeight` — must be supplied on custom-variant creation (FR5). Built-in vocabulary defaults: barbell / dumbbell / bodyweight = true; machine / cable / smith machine = false.
- `SlotPlan.plannedSets` — array of `{orderIndex, plannedWeight?, plannedRepsMin, plannedRepsMax}`. Homogeneous in MVP (every set in a slot-plan has the same target); heterogeneous schemes are forward-compatible (Growth #10) — the array shape doesn't change, only the values per element will diverge.
- `SessionLift.scope` — `'planned' | 'session-only' | 'permanent-slot' | 'permanent-type'` records the three-tier scope chosen at add/replace time (FR14 / FR30 / FR31).
- `SessionSet.{loggedWeight, loggedReps, loggedAt}` are absent until the set is logged. Logging the same set twice (untap, re-tap) overwrites these. There is no separate "log history" — set state is current state.
- `LocationSupersetMemory` (FR33) records that at location L, lift families A and B were super-setted ad-hoc; on the next workout at L, the planning engine pre-groups them.

### 1.3 `(variant, rep_range)` matching key

The product's headline differentiator (PRD §FR21 / FR39 / FR42) requires fast lookup of prior performance for the exact `(variantId, plannedRepsMin, plannedRepsMax)` triplet. Implementation:

- Compound index on `sessionSet`: `[variantId+plannedRepsMin+plannedRepsMax+loggedAt]`.
- Query pattern: `db.sessionSet.where('[variantId+plannedRepsMin+plannedRepsMax+loggedAt]').between([vid, min, max, MIN_DATE], [vid, min, max, MAX_DATE]).reverse().limit(N)`.
- Aliases (post-merge): the reader resolves `variantId` via `Variant.canonicalId` before issuing the query; merged history flows naturally.

NFR4 target: 200 ms p95 at ~6,000 sets. The compound-index strategy is intentionally chosen so the engine never has to scan a session, lift, or set list.

## 2. Migration policy

Forward-only. Per PRD NFR21 / NFR21a / NFR29.

### 2.1 Before each migration

1. Read `meta:schemaVersion`.
2. Take a **snapshot**: serialize every store to a single JSON blob, store under `meta:snapshot:<targetVersion>`.
3. Write a `migrationLog` entry: `{status: 'started', versionFrom, versionTo, action: '<descriptive>', message: ''}`.

### 2.2 Apply

The migration runs inside one Dexie upgrade transaction. Atomic per migration (NFR21). If it throws, the transaction aborts and the database is unchanged.

### 2.3 After

- Success: append `{status: 'completed', message: '<human-readable summary>'}` log entry; update `meta:schemaVersion`.
- Failure: append `{status: 'failed', message: '<error>'}` log entry; app boots into a recovery surface that offers (a) restore from the just-taken snapshot, (b) restore from the configured backup destination.

### 2.4 Snapshot retention

Keep the **two most recent** snapshots. Older snapshots are deleted lazily at boot to bound storage.

## 3. Variant merge (FR6 / NFR21a)

Single Dexie `rw` transaction across `sessionLift`, `variant`, `migrationLog`. The merge:

1. Read source-variant ID `S` and canonical-variant ID `C`. Assert `S.liftFamilyId === C.liftFamilyId`.
2. Update every `sessionLift` with `variantId === S` to `variantId = C`.
3. Mark `S.isAlias = true`, `S.canonicalId = C`.
4. Append `migrationLog` entry `{action: 'variant-merge', message: 'merged <S.name> into <C.name> (<n> sessionLifts re-attributed)'}`.

Partial merge is not a permitted intermediate state. If the transaction fails, the database is unchanged.

## 4. `navigator.locks` wrapper (NFR19)

Every write to `sessionSet` (and any other store touched during a workout) is wrapped in a `navigator.locks.request('workout-write', ...)` exclusive lock. The service-worker activation handler waits on the same lock before allowing activation. In practice this means an in-flight set-commit cannot interleave with an SW activation, even at frame boundaries.

API: `src/data/locks.ts` exposes `withWriteLock<T>(name: string, fn: () => Promise<T>): Promise<T>`. The SW registration handler uses `'workout-write'` as the lock name.

Fallback: browsers without `navigator.locks` (Safari pre-16.4) silently degrade — the wrapper just awaits the function. This is acceptable per UX spec §Browser & Platform Support (iOS Safari is not a target).

## 5. Suggested-weight rule (FR39)

Pure function: `(history: SessionSet[], plannedRepRange: {min, max}, increment: number) => Suggestion`.

Where `Suggestion = { weight: number | null, reasoning: string }`.

### 5.1 Inputs

- `history`: the most recent `n` sessionSets for `(variantId, plannedRepsMin, plannedRepsMax)`, in descending `loggedAt` order. n ≥ 1 (the _most recent session's full set list_, not just one row). If empty, suggestion is `{ weight: null, reasoning: 'No previous data for this variant + rep range.' }`.
- `plannedRepRange`: the target range for _today's_ sets.
- `increment`: 5 (lb) or 2.5 (kg), per user settings.

### 5.2 Rule

Given the most-recent matching session's sets `S = [s1, s2, ..., sk]` (all at the same weight `w`):

1. **No history** → `weight: null`, reasoning: _"No previous data for this variant + rep range."_
2. **Top of range, every set** → if every `s_i.loggedReps >= plannedRepRange.max`, suggest `w + increment` with reasoning _"Hit top of range on every set; +{increment}."_
3. **Missed bottom of range, any set** → if any `s_i.loggedReps < plannedRepRange.min`, suggest `w` with reasoning _"Missed bottom of range on set {i}; hold weight."_
4. **In range** → suggest `w` with reasoning _"Matched last {k}×{repScheme}; hold weight."_

`repScheme` is rendered as `'5×5'` if all sets had the same target reps; otherwise as `'mixed'` (Growth #10 — heterogeneous schemes). MVP only emits `'<n>×<m>'`.

### 5.3 Execution

Runs in a Web Worker (NFR5: 50 ms budget; must not block lift-screen render). The worker takes a `(variantId, plannedRepRange, increment)` triple, queries Dexie, runs the pure rule, and returns the suggestion. The lift-screen first paints a skeleton row, then receives the suggestion via `postMessage`.

### 5.4 Cold-start UX (FR41)

When the suggestion is `{ weight: null, ... }`, the lift screen surfaces an explicit cold-start state: _"No previous data for this variant + rep range. Enter a starting weight."_ The keypad opens to a blank value; no fabricated suggestion appears in the pre-fill.

## 6. Auto-export (FR48 / FR49)

Local file (Sprint 2):

- User picks a directory at onboarding via `showDirectoryPicker()`. Handle persisted in `meta:exportDirHandle`.
- Auto-export fires `before` and `after` every workout. JSON canonical + CSV companion.
- Filenames: `workoutbuddy-<iso8601-ms>.json` and `workoutbuddy-<iso8601-ms>.csv`.
- "Last successful export" timestamp lives in `meta:lastExportAt`; surfaced in app chrome (FR51).
- On `start workout`, the export service retries the last failed attempt. Failure taxonomy per FR49 (`NETWORK_ERROR`/`TIMEOUT` silent retry, `AUTH_EXPIRED`/`PERMISSION_REVOKED` blocks).
- File System Access API permission can be revoked between sessions; the wrapper requests `'readwrite'` permission on first export per session.

Drive (Sprint 7, requires user OAuth setup): same JSON / CSV produced; uploaded to Drive `appDataFolder` via `gapi`. The export service is provider-pluggable (`LocalDirProvider` vs `DriveAppDataProvider` implementing one interface).

## 7. Open architectural decisions

| Decision                   | Choice                                                                      | Rationale                                               |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| Time zone                  | UTC ISO8601 storage; render via `Intl.DateTimeFormat`                       | No DST surprises in queries; UI shows the user's local. |
| Units                      | lb by default; kg user-switchable; increments scale (5 / 2.5)               | PRD FR39.                                               |
| Per-set commit granularity | One Dexie `rw` transaction per checkbox tap                                 | Atomic; sub-frame latency (NFR3).                       |
| SW update strategy         | `registerType: 'prompt'`; activation deferred ≥30s background or cold start | NFR19.                                                  |
| GitHub Pages base path     | Compile-time literal `/WorkoutBuddy/`                                       | One-line config + redeploy to switch later.             |
| Pigment-CSS                | Deferred to Sprint 6 polish                                                 | Bleeding-edge integration; not blocking MVP shape.      |
| Wake-lock fallback         | Silent degrade if `navigator.wakeLock` is unavailable                       | Best-effort per NFR15.                                  |

## 8. Future migrations to anticipate

- **Heterogeneous set schemes (Growth #10):** `slotPlan.plannedSets[i]` can already vary per set; no schema change needed. UI gains a per-row weight/reps editor in program edit.
- **In-app timing (Growth #11):** add `sessionSet.startedAt` and `sessionSet.completedAt`; reintroduces `LIFTING` / `RESTING` substates to the FR23 state machine.
- **Light theme (Growth #12):** purely token-pack swap; no schema change.
- **Drive provider (Sprint 7):** no schema change; provider plug-in only.
- **Multi-program (Growth #8):** already supported by `program` store; UI gains an "active program" switcher in settings.
