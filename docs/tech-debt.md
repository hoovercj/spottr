# Tech debt — known cleanup, deferred work, and pre-daily-use checklist

Living checklist captured after a comprehensive code review (2026-05-15) before
the app graduates from "working on it" to "depending on it for daily lifting".
Items here are intentionally **not** blocking shipping — the MVP works — but
they're worth knocking down opportunistically.

## ✅ Done in the review pass

- Migrated user-visible read paths off raw `db.*` to tombstone-aware `db.live.*`:
  `src/features/progress/queries.ts`, `src/features/history/queries.ts`,
  `src/data/init.ts`. (`src/data/fakeHistory.ts` is dev-only and runs against
  a freshly seeded DB; left as raw reads.)
- Added `console.error` to the two silent-swallow sites in `Home.tsx` (init)
  and `Lift.tsx` (history/suggestion fetch) so failures still produce diagnostic
  signal even when the UX degrades gracefully.
- Test backfill:
  - `src/features/programs/actions.test.ts` — `createSlotSupersetGroup`,
    `removeSlotPlan` cascade (drops single-survivor group; trims 3 → 2),
    `removeSlotSupersetGroup`, `addSlotPlan` ordering.
  - `src/features/library/actions.test.ts` — `createCustomExercise` (default
    - explicit `isFreeWeight`), trim/empty validation, `createCustomVariant`.
  - `src/features/sundries/actions.test.ts` — `toggleStretch` (single row /
    update), `setCardio` (idempotent per session), `setLiftNote` (clear on
    empty).
- `e2e/smoke.spec.ts` — end-to-end happy path: start today's workout →
  navigate into a lift → log a set → complete → land back on home. Wipes
  IndexedDB before each run so the test sees the canonical seeded routine.

## ❌ Not yet done — recommended before daily reliance

### Tests still missing

- **Multi-device sync edge case.** `features/export/merge.test.ts` covers
  basic LWW + tombstones, but not the "device A edits at T1 → merge from B's
  T2 → device A re-edits at T0.5" path. The `updatedAt` is auto-stamped by
  Dexie hooks, so this is mostly an integration concern.
- **Multi-lift superset rendering** (`useSessionLiftGroup` in
  `src/features/session/hooks.ts`). No React component test exists; the data
  hook is exercised indirectly through `Lift.tsx`. Add a
  `@testing-library/react` test (it's already in deps and unused).
- **SetTable rep-range tinting.** `rangeStatusFor()` is pure but lives inside
  `SetTable.tsx`. Extract it (or just dispatch a small unit test) so the
  under-yellow / over-green logic doesn't silently regress.
- **Seed superset disambiguation.** `seed.test.ts` validates one Push day;
  cover both Push days + assert that the new `planByFamilyKind` tuple form
  resolves cable Lateral Raise on superset 1 and dumbbell Lateral Raise on
  superset 2 (regression guard for the bug fixed in `seed.ts`).

### Performance NFRs (PRD §NFR1–NFR6) need real measurements

These targets exist as design intent but have not been validated on the
target device:

| NFR  | Target                               | Status     |
| ---- | ------------------------------------ | ---------- |
| NFR1 | Cold start <1.5s offline             | Unmeasured |
| NFR2 | Lift-screen tap-to-render <100ms p95 | Unmeasured |
| NFR3 | Set-entry commit <100ms p95          | Unmeasured |
| NFR4 | History query <200ms p95 @ ~6k sets  | Unmeasured |
| NFR5 | Suggested-weight <50ms from paint    | Unmeasured |
| NFR6 | Auto-export <10s typical mobile      | Unmeasured |

Easiest path: one Lighthouse run + one manual session on the Pixel 7 Pro
with `performance.mark` already in place (search the codebase). If any of
these miss, file a perf bug; otherwise document the measured numbers here.

### Walk through a real workout end-to-end

Code review and unit tests catch logic bugs; they don't catch routing
hiccups, settings persistence, OAuth flow, or PWA install quirks. Plan to
do one full real workout on the target device before betting on it. Watch
for: location pinning, suggested-weight values, export prompt, Drive auth
expiry, ScopeModal flow, variant picker.

## 🛠️ Architecture cleanup (worth doing after some real use)

Hold off on these until the UX stabilizes — premature consolidation while
the app is still shifting will create churn.

### `RoutineEdit.tsx` is a god component (~1377 lines, 7 sub-components)

Subcomponents to extract to `src/components/routine-editor/`:
`AnchorPicker`, `SlotCard`, `SupersetGroupCard`, `SlotPlanRow`,
`SetSchemeEditor`. (`AddExerciseFlow` should probably merge with
`Workout.tsx`'s `AddLiftFlow` — see next item.)

### Picker duplication: `AddLiftFlow` ≈ `AddExerciseFlow`

`Workout.tsx:633-780` and `RoutineEdit.tsx:1129-1340+` are ~250 lines of
near-identical multi-step picker logic (family search → variant select →
"+ Create new exercise" → final step). They diverge only on the final
step (`ScopeModal` vs day-picker). Extract a shared `<ExercisePicker>`
with a render prop / callback for the final step.

### `Workout.tsx` is large (~819 lines)

`LiftList` is inline and renders the superset grouping logic. Extract
`src/components/LiftList.tsx`; consider whether the grouping reducer
belongs in `useGroupedSessionLifts(view)` hook.

### `Lift.tsx` (~620 lines)

Already partly extracted (`LiftSection`). The variant-picker drawer and
reattribute-confirm modal are still inline; extracting them would shrink
the file and let those interactions be tested in isolation.

### Theme-token coverage

Inline `sx` values in route components mix theme keys (`'plates.blue'`)
with ad-hoc magic numbers (`py: 1.5`, `px: 1`, `borderRadius: 1`). A
`src/theme/sx.ts` exporting common preset objects would be a one-shot
consolidation when the UX stops shifting.

### `liveTable.ts` has no unit tests

Tombstone-filtering logic underpins the entire migration. A `liveTable.test.ts`
covering `toArray`, `where().equals().toArray()`, `softDelete()`, and
`softDeleteAll()` is small and would catch any future regression to the
filter predicate.

## 🚧 Feature gaps (PRD partials)

These FRs are partially implemented per the PRD; functional today but with
rough edges.

| FR   | Gap                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR7  | Re-tag historical sets to a different variant — schema supports, no UI surface                                                                       |
| FR15 | Scope-conflict warning (narrower scope shadows broader) — UI may not be wired                                                                        |
| FR28 | Reattribute already-logged sets on variant change — confirm UI exists; behavior under "Move them" needs a real-workout test                          |
| FR32 | Ad-hoc superset on the fly during a workout — schema tracks `locationSupersetMemory`; in-session pairing UI is best-effort, may not handle all flows |
| FR37 | Mark cardio "skipped today" — schema supports it, no clear UI affordance                                                                             |
| FR43 | Single-session full record view (`SessionSummary`) — verify cardio / stretch / notes / location all render on a real completed session               |

## 🌱 Growth backlog (PRD §Phase 2 — explicitly deferred)

Tracking only so we don't lose them. Nothing here is in flight.

- AI as analyst (chat grounded in data, opt-in)
- Variant-creation reference (sibling weights when adding a new variant)
- Richer progress visualization (1RM trends, volume, frequency dashboards)
- Muscle-group coverage dashboard
- Lift-swap suggestions ("can't squat today — what's similar?")
- Withings integration (body weight history)
- Repeatable in-app spreadsheet import
- Multi-program switcher in the UI (schema supports multiple programs)
- Family-aggregated history (across variants of the same lift)
- Heterogeneous set schemes (drop sets, pyramids, RPT) — schema is forward-compatible
- In-app set/rest timing (LIFTING/RESTING substates)
- Light theme (token system is forward-compatible; design is dark-only for MVP)

## 📋 How to use this doc

- Knock items down opportunistically; don't make this a sprint.
- When a "Not yet done" item ships, move it to "Done in the review pass".
- When a Growth item is picked up, move it out of this doc into a feature plan.
- If a new piece of tech debt surfaces during real use, append to the
  appropriate section with a brief note about why it bites.
