---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
releaseMode: phased
inputDocuments:
  - ProblemStatement.md
  - _bmad-output/planning-artifacts/research/market-strength-training-apps-and-ai-coaching-research-2026-05-14.md
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 1
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: 'PWA (Android-compatible web app); native Android documented as deferred option'
  domain: 'Strength-training tracker (log-and-decide focus, not coach-and-program focus)'
  complexity: 'Low–Medium (rises to Medium when AI, Withings, and analytics are layered together)'
  projectContext: 'greenfield (spreadsheet is the de facto v0)'
  multiUserStance: 'Single-user as a hard architectural commitment. Multi-user contingency is satisfied by bulletproof export/import, not by building any multi-user infrastructure.'
  aiScope: 'open — analyst, coach, or both; opt-in; configurable provider (hosted or local)'
  postMVPDirection: 'Coach-and-program focus is an explicit follow-up after MVP is in active use; not part of the initial product.'
scopeBoundaries:
  - 'AI-as-centerpiece (front-door for "what should I do today?", multi-turn coaching) is a v2+ direction, not an MVP path. MVP keeps AI opt-in, bounded, and side-of-stage.'
  - 'Hosting other people''s data is explicitly out of scope. Multi-user contingency is satisfied by export/import (each user runs their own instance); it does not extend to managed hosting for others.'
  - 'In-app set/rest timing is deferred to Growth (item 11). The user manages timing externally (e.g., a watch); the MVP records no time data and provides no timer surface. The state machine collapses to IDLE / ACTIVE in MVP; LIFTING/RESTING substates return when timing lands.'
firstPrinciplesFoundations:
  - 'Core loop: (lift_variant, rep_range) → prior data point → next-set decision. Everything else is value layered on top.'
  - 'Variant model: lift variants are user-defined, first-class entities discriminating on equipment / gym / setup; the variant is the comparison key for like-for-like history; the lift family (e.g., Shoulder Press) groups variants for swap suggestions and muscle coverage. Sub-rules: (a) default-don''t-fork — assume same variant as the most recent session for that lift family at the current location; never prompt; (b) constrained suggestions — existing variants surfaced first, "create new" is a deliberate secondary action; (c) variant merge is non-destructive and first-class.'
  - 'Don''t ask what the user already knows. The app reserves attention-cost for genuinely required input. Defaults always come from the most recent relevant signal (last variant, last location, last suggested weight from rep-range-matched history, today''s planned split day). Mistakes are made cheap to undo, not prevented by prompting.'
  - 'Location is a first-class signal (manually-selected, persists per session, defaults to last-used; not GPS-based). Influences variant defaulting.'
  - 'Deviation is a primitive, not an exception. The data model must allow logged ≠ planned without correction gymnastics.'
  - 'Data fidelity over feature richness. If a feature can corrupt or muddy the log, it does not ship.'
  - 'Spreadsheet import is a correctness oracle for the data model: the existing year of data must transform cleanly into the schema, proving the model fits reality. The import itself is a one-off AI-assisted transform run once to seed the database; undifferentiated historical entries become a "legacy / unspecified" variant per lift, retroactively re-taggable. Not a polished, repeatable in-app feature.'
  - 'MVP minimalism: ship-ability beats feature richness. The MVP that gets used is the MVP that gets built fast. Every MVP feature must survive the test "could I cut this and still use the app tomorrow?" If yes, it is post-MVP.'
  - 'AI is opt-in and bounded. The core loop must work with zero AI configured.'
  - 'Local-first by default. The data of record lives on the user''s device. Any cloud touch (AI provider, export destination, future Withings integration) is user-controlled and never on the critical write path. The app must never depend on a backend to function.'
  - 'Local data is precious; durable backup is not optional. The app must auto-export on a regular cadence to a user-chosen destination (file, Drive, etc.), not only on user demand. Loss of the device or eviction of browser storage must never mean lost training history.'
  - 'Physical context constraint: every interaction must survive a gym, on a phone, with sweaty fingers, between sets, sometimes online sometimes not.'
---

# Product Requirements Document - WorkoutBuddy

**Author:** Cody
**Date:** 2026-05-14

## Executive Summary

WorkoutBuddy is a **personal-use, local-first PWA** that replaces a Google Sheets PPL workflow with a strength-training **decision-support log**. Where existing apps (Strong, Hevy, Fitbod) treat workout data as a feed to scroll or a program to follow, WorkoutBuddy treats it as the user's training log whose primary job is informing **the next-set decision** — *"given what I did the last time I trained this exact lift in this exact rep range, what should I do today?"*

The target user is a self-programming intermediate lifter (1+ year of training) running a defined split (PPL today; arbitrary splits in principle) who already maintains their own workout structure, knows their own rest preferences, and wants the app to remove friction at the moment of decision — not to take the decision over. The product is built around a single pivotal moment: **the first time the user taps a lift mid-workout and the rep-range-matched history is just there**, with no scrolling, no prompting, and no genericized "last time you did this lift" lie.

Everything else in the product — supersets, swap-lift flow, muscle-coverage hints, AI-assisted analysis, progress visualization, Withings integration — exists in service of, or as a layer on top of, that core loop. Anything that would compromise log integrity, force the user to re-enter what the app already knows, or block the gym-floor flow is excluded from MVP by design.

### What Makes This Special

Three things, in order of importance:

1. **The variant + rep-range model.** Lift comparisons are made against `(lift_variant, rep_range)`, where a *variant* is a user-defined identity (equipment, gym, machine model) under a shared lift family. "Shoulder Press on the Hammer Strength at home" and "Shoulder Press at the hotel barbell" don't pollute each other's history. No surveyed competitor surfaces rep-range-matched history as a first-class concept; none model variants this way. This is the headline differentiator.

2. **"Don't ask what the user already knows" as a UX discipline, not a slogan.** Defaults always come from the most recent relevant signal (last variant, last location, last suggested weight, today's planned split day). The variant is silently assumed from the most recent session for that lift family at the current location. Mistakes are made cheap to undo, never prevented by prompting.

3. **AI as analyst, not coach (in MVP).** AI is opt-in, configurable per provider (hosted or local), grounded in the user's actual logged data, and can never write to the log without explicit confirmation. The core loop works with zero AI configured. Coach-and-program AI is an explicit post-MVP direction.

Three architectural commitments make these possible: **single-user as a hard commitment** (multi-user contingency satisfied by export/import only), **local-first by default** (the data of record lives on the device; no backend on the critical write path), and **durable backup as a non-optional auto-export** to a user-chosen destination.

## Project Classification

| Dimension | Value |
|---|---|
| **Project Type** | PWA (Android-compatible, mobile-first); native Android documented as a deferred option |
| **Domain** | Strength-training tracker (log-and-decide focus, not coach-and-program focus) |
| **Complexity** | Low–Medium for the core loop; rises to Medium when AI, Withings, and analytics are layered together |
| **Project Context** | Greenfield (the user's existing Google Sheets is the de facto v0 and the correctness oracle for the data model) |
| **Multi-user stance** | Single-user as a hard architectural commitment. Multi-user contingency is satisfied by bulletproof export/import — never by building multi-user infrastructure |
| **AI scope** | Opt-in; configurable provider (hosted or local); analyst-first in MVP, coach-and-program a post-MVP direction |
| **Architectural posture** | Local-first by default; no backend on the critical write path |

## Success Criteria

### User Success

The single most important success criterion, derived from the vision: **the user stops opening the spreadsheet.** Within 2 weeks of MVP being installed, the Google Sheet is no longer the source of truth for active training. Within 30 days, it has not been touched.

| Milestone | Measure |
|---|---|
| **Decision moment proven** | Within the first 3 logged workouts, every working set's "what weight should I do?" question is answered by a glance at the lift screen — no scrolling, no querying, no spreadsheet. |
| **No re-entry of known facts** | Across 10 logged workouts, the app never prompts for information it already has (variant, location, today's planned day, suggested weight). Count of "ask-what-user-already-knows" prompts: zero. |
| **Variant integrity holds** | After 4 weeks of use including at least one workout at a non-default location, no lift family has accidentally-forked variants. Variant merges, if any, were intentional. |
| **Deviation works** | Across the first 4 weeks, every spreadsheet-style deviation the user naturally does (skip a day, swap a lift, add a set, reorder, superset) is supported without fighting the app. |
| **Logging speed** | Median time-to-log a working set: ≤ 4 seconds from "set finished" to "set recorded." |
| **Trust** | After 4 weeks of logging, the user trusts the data enough to stop double-entering anything in the spreadsheet "just in case." |

### Business Success

N/A. This is personal-use software. The only "business" success is **the build does not get abandoned**, which means MVP must be small enough to ship in weeks, not months (see Product Scope below). Sharing with friends via the export bridge is a possible future direction, not a current optimization target.

### Technical Success

| Concern | Bar |
|---|---|
| **Local-first integrity** | All writes succeed against local storage with zero network dependency. The app is fully functional in airplane mode, including AI features when configured against a local model. |
| **Durable backup** | Auto-export runs on a configured cadence; "last successful export" is always visible; eviction or device loss is recoverable from the most recent backup with no missing workouts. |
| **Data fidelity / round-trip** | The one-off spreadsheet import round-trips the existing year of data into the schema with zero hand-fixing of historical entries. (This is the correctness oracle.) |
| **In-gym responsiveness** | Set entry, lift selection, and history display all render in < 100ms on the user's actual phone. No spinners on the critical path. |
| **AI groundedness** | Any AI response that references the user's data must be traceable to specific logged workouts. Hallucinated lifts, dates, or volumes do not happen; if they do, they are a P0 bug. |
| **No-AI baseline** | Every MVP feature works without any AI provider configured. AI is purely additive. |

### Measurable Outcomes

The whole-product test, applied at 30 days post-MVP-install:

- Workouts logged in WorkoutBuddy ÷ workouts logged total: **≥ 95%**
- Times the spreadsheet was opened for a *current* training decision: **0**
- Subjective answer to "would you rather use the spreadsheet right now?": **No.**

If those three numbers do not hit, MVP did not actually solve the problem and scope should be revisited rather than features piled on.

## Product Scope

### MVP — Minimum Viable Product

The strict cut. Every item passes the test: *"Could I cut this and still use the app tomorrow?"* If yes, it is not here.

1. **Lift family + variant model** — schema, mid-workout variant selection, default-don't-fork behavior, variant creation, variant merge.
2. **Location** — manually-selected, persists per session, defaults to last-used. Drives variant defaulting.
3. **Workout planning model** — define a split (PPL initially), assign each day a planned set of lifts with planned rep ranges. Today's workout defaults to today's planned day; user can pick a different day.
4. **Core logging loop** — start workout → tap a lift row → tap a checkbox per set to log, with the rep-range-matched prior data point and suggested weight always visible on the lift screen. (No in-app timing in MVP — deferred to Growth item 11.)
5. **Mid-workout flexibility** — add sets, swap lifts, reorder, add unplanned lifts, superset two lifts (alternation tracked).
6. **Suggested-weight logic** — derive next-set suggestion from rep-range-matched prior performance using a simple, transparent rule (not AI). User always sees the rule's reasoning.
7. **One-off spreadsheet import** — out-of-app AI-assisted transform that produces the seed database. The correctness oracle is satisfied here, not in-app.
8. **Auto-export + manual export** — JSON (canonical) and CSV (spreadsheet-friendly) to a user-chosen destination on a configured cadence. **Two destinations supported in MVP: Google Drive (primary) and download-to-file (fallback for when Drive OAuth is unavailable, fragile, or the user is offline at setup).** Always shows last-successful-export status.
9. **Basic history view** — for any lift variant, see all prior sessions and their sets. Sortable/filterable by rep range. Read-only is fine for MVP.

Nine items. Anything not on this list is post-MVP.

### Growth Features (Post-MVP)

Ordered roughly by likely sequence; not a commitment.

- **AI as analyst** — opt-in, configurable provider; talk-to-your-training-history queries grounded in logged data. ("Why did I plateau on bench in March?", "Summarize the last 4 weeks.")
- **Variant-creation reference** — when creating a new variant for an existing lift family, surface the last weights and rep-ranges for sibling variants as a quick reference, so the user has a sensible starting point on a new machine / barbell / setup.
- **Progress visualization** — charts of estimated 1RM, volume, frequency per lift family / muscle group over time.
- **Muscle-group coverage dashboard** — see what groups today's planned workout hits, what the week is hitting, what is under-hit.
- **Lift-swap suggestions** — when the machine is taken or the user wants variety, suggest alternates from the same family or targeting the same muscles.
- **Withings integration** — pull body composition; correlate with strength trends.
- **Repeatable, in-app spreadsheet import** — only if needed for sharing with others or re-importing.
- **Multi-program support** — beyond PPL, support 5/3/1, GZCL, etc., as program templates.

### Vision (Future)

- **AI as coach** — proactive programming suggestions ("you're due for a deload"), conversational program adjustments, persistent memory of preferences and injuries.
- **Shared export viewing** — open someone else's export read-only to compare.

## User Journeys

**Persona — Cody, the self-programming intermediate lifter.** A year of consistent training, runs a 6-day PPL split (often skipping leg day), tracks in a Google Sheet, lifts at one home gym most of the time but occasionally travels. Knows his program, knows his rest preferences, doesn't want a coach — wants the friction of looking up "what did I do last time?" to disappear. Cares about data ownership; wary of cloud lock-in; willing to use AI but not dependent on it.

### Workout-flow model (clarification)

The app does **not** drive lift order. It shows today's planned lifts (with any saved superset groupings already in place — see Journey 5) plus an **"add more"** affordance, and lets the user tap whichever lift they are about to do, in any order. There is no "next lift," no "skip," no "reorder." Order is an emergent property of the user's taps; lifts not yet done remain visible and tappable; lifts done show their logged sets inline.

When the user adds a lift mid-workout via "add more," they pick a scope:
- **For today only** — transient, doesn't change programming.
- **Add to this split day permanently** — amends the programming for that split day going forward (e.g., Pull Day 1 vs Pull Day 2 picked explicitly).

### Variant model (clarification)

Location is a discriminator only for **machine variants**. Free-weight variants (barbell, dumbbell, EZ-bar, etc.) are location-agnostic — a barbell is a barbell at any gym. Location's role is **variant defaulting**: at the home gym, "Shoulder Press" defaults to the home Hammer Strength machine; at the hotel gym, the same lift family might default to "Barbell" because no machine variant exists for that location yet.

### Journey 1: Tuesday Push Day (the happy path that defines the product)

**Opening scene.** Tuesday, 6:15 PM. Cody walks into his home gym, phone in hand. He opens WorkoutBuddy. The home screen shows: **"Tuesday — Push (Day 2)"** with the day's planned lifts laid out: Bench 5x5, Shoulder Press 3x8-12, Incline DB 3x10, a saved superset of Tricep Pushdown 3x12 + Lateral Raise 3x15. Location at the top: **"Home Gym."** No prompts. No setup. He taps **Start Workout.**

**Rising action.** The workout view shows all the day's lifts, none done yet. He walks to the bench. Taps "Bench" on the workout screen. The lift screen shows:
- Lift: **Bench (Barbell)** — free-weight variant, location-agnostic, no ambiguity
- Last 5x5: **May 7 — 225 × 5, 5, 5, 4, 4**
- Suggested today: **225** with one-line reasoning *"matched last 5x5; missed reps on sets 4-5, hold weight"*
- Set 1 button, big and obvious

He loads 225, lifts, taps the **set 1 checkbox** to log it (pre-filled at 225 × 5; he'd tap the reps cell to change to 4 if he missed a rep). The checkbox fills, the cells become read-only, the next unchecked row is now the visual focus. He moves to set 2. After 5 sets, the lift card shows complete; he goes back to the workout view (or the lift screen has a "back to workout" affordance) and picks the next lift to do.

**Climax.** He gets to Shoulder Press, planned 3x8-12. Default variant: **Shoulder Press (Hammer Strength — Home)** — a machine variant defaulted from this location's last session. The screen shows his last 3x8-12 of *that* variant — not his last 5x5 of Shoulder Press from last Friday on a different machine, because (variant, rep range) is the comparison key.

**Resolution.** All lifts done. He taps **End Workout.** Status banner: *"Last export: 2 hours ago."* Total time logged. He never opened a spreadsheet. The decision was already in front of him for each lift.

**Capabilities revealed:** today's-workout default; workout view as a tappable list (no driven order); lift screen with rep-range-matched history and suggested weight; per-set checkbox logging with editable weight/reps cells; auto variant defaulting (location-aware for machines, location-agnostic for free weights); auto export status.

### Journey 2: Skipped Day → Pick a Different Workout

**Opening scene.** Wednesday. Yesterday was Tuesday (Push), and Cody skipped it. Today is "Pull" by the calendar but he wants to do Push instead.

**Rising action.** Opens app. Home screen shows **"Wednesday — Pull (Day 3)"** by default. He taps the workout name → menu of split days appears with last-completed dates: *"Day 1 Push (May 7)", "Day 2 Pull (May 9)", "Day 3 Legs (May 4)"…* He picks Day 1 Push.

**Climax & Resolution.** Workout proceeds exactly like Journey 1. Tomorrow's default is still based on the calendar, not on what was actually done today — one swapped day doesn't cascade.

**Capabilities revealed:** workout-day picker with "what was each day, when did I last do it" context; planning model decoupled from the calendar.

### Journey 3: Travel Day → New Machine Variant, No Friction

**Opening scene.** Thursday. Cody is at a hotel with a small machines-and-barbells gym. Opens app. Home screen still defaults to today's planned day (Push). Location at the top: **"Home Gym."** He taps it → location picker → creates **"Hotel Gym (Denver)"** in two seconds. Now location says Hotel Gym (Denver).

**Rising action.** He starts the workout. Taps Bench. Lift screen shows:
- Lift: **Bench (Barbell)** — free-weight variant, no location entanglement, history continues from his home barbell sessions. Suggested weight is correct. Good.

He gets to Shoulder Press. Default at this new location: there is no Hammer Strength here, and there's no machine variant of Shoulder Press recorded for this location yet. The app falls back to a sensible default — likely the most-used machine variant overall, or the user is shown variant choices prominently. He sees existing variants: *Hammer Strength (Home)*, *Smith (Home)*, *Barbell* (free weight). Taps **+ New variant** → "Hotel Denver shoulder press machine" → done. Suggested-weight area shows *"No prior data for this variant. (Post-MVP: reference last weights from sibling variants.)"*

**Climax.** He picks 95 lbs (a guess), lifts, logs. Data lives under the new variant. Home-gym machine history is uncontaminated.

**Resolution.** Saturday at home. App location auto-picks last-used: Hotel Gym (Denver). He taps it, switches back to Home Gym. Opens Shoulder Press → variant defaults silently to Hammer Strength (Home). History resumes correctly.

**Failure-case branch.** If Cody had ignored the variant default and just lifted, machine data would be silently misattributed. Mitigation (per foundations): variant name always visible on the lift screen, and **variant merge** lets him retroactively split out bad entries to a new variant.

**Capabilities revealed:** location as a first-class signal (machine-variant defaulting only); free-weight variants are location-independent; mid-workout variant change with constrained suggestions; "create new variant" as a deliberate secondary action; clean data partitioning across machine variants while free-weight history flows across locations.

### Journey 4: Machine Taken → Mid-Workout Swap

**Opening scene.** Tuesday Push at home gym. Cody gets to Shoulder Press. Hammer Strength is occupied.

**Rising action.** On the workout view, he taps Shoulder Press. The lift screen opens with the default variant (Hammer Strength). He has two paths:

- **Just change the variant** for this lift to *Barbell* or *Smith (Home)* — the lift identity stays "Shoulder Press," the variant is what changes. The lift screen updates to show history for that variant. He lifts.
- **Swap to a different lift entirely** — from the lift screen or workout view, an explicit "Replace this lift" affordance opens a picker: same-family lifts first, then any lift.

He picks the variant change to *Barbell*. The workout view now records this lift slot as *Shoulder Press (Barbell)* for today's session, with planned-vs-logged divergence noted.

**Resolution.** When he gets back to the workout view, the lift slot reflects what he actually did. The planning model isn't disturbed.

**Capabilities revealed:** the variant change *is* the swap for same-family substitutions; explicit replace-lift action only needed for cross-family substitutions; deviation as a primitive; planned ≠ logged distinction recorded.

### Journey 5: Superset (saved, not improvised)

**Context.** The decision to superset two lifts is **either part of initial programming or remembered across workouts at a location** (TBD which). It is not invented mid-workout each session. So when Cody opens Tuesday Push, Tricep Pushdown + Lateral Raise are *already* shown grouped as a superset block on the workout view.

**Opening scene.** End of Push day. The grouped block is the next thing he wants to do. He taps it.

**Rising action.** The lift screen now shows both lifts side-by-side (or stacked) with the rep-range-matched history for each. He does Tricep Pushdown set → taps the set 1 checkbox on Tricep → screen flips to Lateral Raise → does set → taps the set 1 checkbox on Lateral Raise → flips back to Tricep. No explicit "rest" state in MVP. The app records the alternation via per-lift set logs (per-set timing is deferred to Growth item 11).

**Climax.** When he's done with the superset block, the workout view shows the block complete with both lifts' sets logged.

**Resolved by FR33:** location-memory — the first time the user manually supersets two lifts at a location, the app pre-groups them on subsequent workouts at that location. Programming-time superset definition (FR16) is the planned-program path.

**Capabilities revealed:** superset as a programmed grouping (not an improvised mid-workout state); alternation tracking; "no preset rest" model handles supersets naturally because rest isn't a required state; programming model supports lift grouping.

### Journey 6: Add a Lift Mid-Workout — With Scope

**Opening scene.** Cody is mid-workout. He realizes he wants to add Face Pulls (rear delts) today — a new accessory.

**Rising action.** On the workout view, taps **+ Add lift**. Picker: search/browse lifts. He picks Face Pulls. Then a scope chooser:
- **For today only** — the lift is added to today's session, programming unchanged.
- **Add to this schedule slot permanently** — with slot picker (since he might want it on Pull-slot-1 vs Pull-slot-2 specifically; in this case he'd choose to add it to Push-slot-1).
- **Add to all slots of this split-day-type permanently** — applies to every Push slot in the schedule.

He picks *for today only*. Lift slot appears on the workout view. He does it. Logs.

**Resolution.** Tomorrow, Push Day 1's planned list is unchanged. Today's session has the extra lift recorded.

**Capabilities revealed:** add-lift with explicit scope (transient vs. programming amendment); programming amendment is per-split-day-instance, not per-day-of-week (handles Pull Day 1 vs Pull Day 2 cleanly).

### Journey 7: Recovery — Storage Eviction

**Opening scene.** Two months in. Cody hasn't opened the app in 4 days (vacation). Phone storage was tight; Android evicted some of WorkoutBuddy's IndexedDB cache. He opens the app. Startup detects missing data.

**Rising action.** Home screen shows a banner: *"Storage was reset. Restoring from your last export — May 12, 11:43 PM (4 days ago)."* Restore happens automatically from the configured auto-export destination. Takes a few seconds. App resumes normal state.

**Climax.** Banner persists with: *"4 days have passed since your last backup. If you logged any workouts elsewhere since then, import them now."* He hasn't, dismisses, continues. No data lost.

**Resolution.** This flow exists *because* foundations promised it. Setup of an auto-export destination is a **hard gate before the user can record their first workout.** (The user accepted this is the right call — if onboarding friction proves unwelcome, it can be relaxed later.)

**Capabilities revealed:** durable backup as a first-class lifecycle concern; auto-export gating at onboarding; auto-restoration from configured destination; honest staleness messaging.

### Journey Requirements Summary

| Journey | New / reinforced capability |
|---|---|
| 1. Happy path | Today's-workout default; workout view as tappable list (no driven order); lift screen with rep-range-matched history; per-set checkbox logging; auto variant defaulting (machine = location-aware, free-weight = location-agnostic); export status visible |
| 2. Skipped day | Workout-day picker with last-completed metadata; planning model decoupled from calendar |
| 3. Travel | Location create + switch; mid-workout variant change; new-variant cold-start UX; variant merge as a recovery tool; free-weight variants flow across locations |
| 4. Swap | Variant change = same-family swap; explicit replace-lift for cross-family; planned-vs-logged tracking |
| 5. Superset | Superset as a programmed (or location-remembered) grouping, not mid-workout improvisation; alternation tracked via per-lift set logs |
| 6. Add lift mid-workout | Add-lift action with explicit scope (transient vs. permanent amendment); programming amendments are per-split-day-instance |
| 7. Eviction | Auto-export gating at onboarding (hard gate); auto-restore from configured destination; staleness messaging |

Three classes of MVP capability:

- **Workout-time UX:** today's default, workout view as tappable list, lift screen, per-set checkbox logging, variant change, replace-lift, add-lift-with-scope, superset block.
- **Data-model integrity:** variant + family + location (location applies to machine variants only), planned-vs-logged distinction, variant merge.
- **Lifecycle / durability:** auto-export gate, restore-on-startup, status indicators.

### Open Questions Raised by Journeys

Both open questions raised here have been resolved in Functional Requirements:

- **Superset persistence mechanism** (Journey 5) — resolved by FR33: location-memory after single occurrence; programmed-superset path (FR16) for planned cases.
- **Variant default at a brand-new location** (Journey 3) — resolved by FR11: resolution order is (1) most recent at this location, (2) most recent at any location, (3) lift family's first listed default variant, (4) prompt user.

## PWA (Web App) Specific Requirements

### Project-Type Overview

WorkoutBuddy is a **Progressive Web App** built mobile-first for Android. The architectural posture is local-first (data of record on device), backend-optional (no backend on the critical write path), and installable (added to the home screen on Android, runs without browser chrome). Native Android is documented as a deferred option if PWA-specific limits prove blocking.

### Application Shape

| Concern | Decision |
|---|---|
| **SPA or MPA?** | SPA. Single-user, stateful, in-gym responsiveness ≤ 100ms — no per-route server round-trips. |
| **Framework (chosen)** | **React.** Chosen for user familiarity. Constraint: must not preclude offline-first or static deployment. |
| **Routing** | Client-side router. Routes are: home/today, workout-in-progress, lift screen, history, settings. |
| **Build target** | Static assets deployable to any static host (no server runtime required). |

### Browser & Platform Support

| Concern | Decision |
|---|---|
| **Primary platform** | Android, recent Chrome / Chromium. The user's actual phone is the test bench. |
| **Secondary** | Desktop Chrome / Edge / Firefox for occasional history browsing or program editing — not in-gym critical path. |
| **iOS Safari** | Not a target. If it works incidentally, fine; not validated, not blocked-against. |
| **Browser-version floor** | Latest 2 stable versions of Chromium-based browsers; no IE, no legacy Edge, no obligation to old Safari. |

### Offline & Service Worker

| Concern | Decision |
|---|---|
| **Offline requirement** | App must be **fully functional with no network** for the entire core loop (start workout, tap lift, log sets, end workout, browse history). |
| **Service worker** | Required. Cache-first for app shell + assets; offline-first for data. App must launch and render the home screen with no network on cold start after install. |
| **Update strategy** | Service worker prompts user to refresh on new app version. **Activation during an in-progress workout is forbidden** — deferred until app backgrounded ≥ 30s or next cold start (per NFR19). Set-commit code path wraps `navigator.locks` to prevent any activation interleaving with an in-flight write. Schema migrations versioned and snapshot-protected (per FR58). |

### Installability

| Concern | Decision |
|---|---|
| **Add to Home Screen** | Required. Manifest with proper icons, theme color, display: standalone. App launches without browser chrome. |
| **Splash screen** | Standard PWA-generated splash from manifest is fine for MVP. |
| **App icon** | Needs to exist and be recognizable on Android home screen. Design TBD (out of MVP scope to over-design). |

### Local Storage & Data Layer

| Concern | Decision |
|---|---|
| **Persistence engine** | IndexedDB. Schema versioned and migration-aware. |
| **Schema strategy** | Designed in detail in solutioning step; must accommodate variant + family + location + planned-vs-logged + program model. |
| **Eviction handling** | Detect storage loss on startup; auto-restore from latest configured export (per Journey 7). Hard gate on auto-export setup before first workout. |
| **Storage quota** | Request `navigator.storage.persist()` at appropriate moment to reduce eviction likelihood. |

### Auto-Export & Backup

| Concern | Decision |
|---|---|
| **Cadence** | Before and after every workout (per FR48). On new-workout start, also retries if the last export failed (per FR49). No daily-minimum cadence — if no new workouts, no exports needed. |
| **Destination (MVP)** | **Google Drive** (PKCE OAuth in-browser, dedicated app folder — no backend) and **download-to-file** (fallback for when Drive is unavailable, fragile, or user is offline at setup). One must be configured before first workout (hard onboarding gate, FR47). |
| **Format** | JSON (canonical, full fidelity) + CSV (for spreadsheet round-trip / human inspection). JSON is the source of truth for restore. |
| **Status visibility** | "Last export: <relative time>" visible in app chrome at all times. Failed exports surface a non-blocking notice. |

### Performance Targets

Formal contract is in NFR1–NFR6. Summary: cold start <1.5s offline; tap-to-render lift screen <100ms p95; set entry <100ms p95; history query <200ms p95 (1-year data); suggested-weight computation <50ms; Drive auto-export <10s.

### Responsive Design / Mobile UX

| Concern | Decision |
|---|---|
| **Primary form factor** | Android phone, portrait, ~6.5" class (e.g., Pixel 7 Pro / S23). One-handed reachable, **left-handed** (per NFR14). |
| **Tap targets** | All interactive elements meet the **48 dp Material baseline** (NFR8). |
| **Orientation** | Portrait only for MVP. No rotation handling needed (NFR25). |
| **Desktop layout** | Functional fallback only — usable for browsing history / editing programs from a laptop, not the focus. |

### Accessibility

**Posture: accessible by default.** Build to WCAG principles from day one — not as polish, not as a deferred concern, not bolted on later. We are not formally auditing or validating with assistive technologies, but the engineering work is done correctly the first time.

Formal contract is in NFR8–NFR12 (48 dp tap targets, WCAG AA contrast, keyboard navigation, `prefers-reduced-motion`, light/dark mode following `prefers-color-scheme`). Additionally: semantic HTML over generic `<div>`s; every input has an associated label or `aria-label`; errors are announced; layout doesn't break at 200% zoom; meaningful imagery has alt text, decorative imagery is `aria-hidden`. **No formal WCAG audit and no screen-reader / AT testing in MVP** — the discipline is preventive, not certified.

### AI Integration (PWA-specific concerns)

| Concern | Decision |
|---|---|
| **Provider call shape** | Direct browser → provider (Anthropic / OpenAI / Google / local Ollama on home network). No backend proxy required. |
| **API key handling** | Stored in IndexedDB (single-user, local-first; no shared-secret risk). Never logged or exported. |
| **Network failure** | AI features degrade gracefully; core loop remains fully functional. |
| **Streaming** | Use streaming responses where supported (better perceived latency for analyst chat). |

### Out of Scope for MVP (PWA-specific deferrals)

- **Push notifications** — no MVP use case (no reminders, no coaching nudges).
- **Web Share API** — no sharing flows in MVP.
- **Background sync** — not needed; auto-export runs on app foreground.
- **Wear OS / Garmin companion** — out of scope per earlier decision.
- **Web Bluetooth / sensor integration** — Withings is post-MVP via cloud API, not direct sensor.

### Implementation Considerations

- **React** is the chosen framework. Other framework decisions (state management, routing library, IndexedDB wrapper) are deferred to solutioning.
- **Build tooling** must produce a valid PWA manifest + service worker out of the box. Vite + a PWA plugin satisfies this trivially.
- **Hosting** is any static host — GitHub Pages, Netlify, Vercel, Cloudflare Pages — none require a backend.
- **AI provider abstraction** must be thin enough that swapping providers is a config change, not a refactor. Critical given the foundation's commitment to configurable AI.
- **Google Drive OAuth** uses PKCE flow entirely in-browser to preserve no-backend posture. Drive scope limited to a dedicated app folder, not full Drive access.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach: Problem-Solving MVP.** The bar is *"Cody actually replaces the spreadsheet within 2 weeks of installing."* Not platform completeness, not impressive feature count, not validated learning across users (there are no other users) — just *does this single product solve the actual problem for its actual user.* This shapes every scoping decision: anything that doesn't directly serve the decision moment, the gym-floor flow, or data integrity is post-MVP, no matter how interesting it is.

**Resource Requirements:** Solo build by Cody. No team. The MVP-minimalism foundation exists *because* solo personal projects most reliably die from scope, not from technical difficulty.

### MVP Feature Set (Phase 1)

Nine items, locked. No additions, no subtractions from the Step 3 cut:

1. Lift family + variant model (incl. variant merge as first-class)
2. Location (machine variants only; free weights location-agnostic)
3. Workout planning model (PPL split, per-day planned lifts + rep ranges)
4. Core logging loop (start workout → tap a lift row → tap a checkbox per set) with rep-range-matched history + suggested weight always visible
5. Mid-workout flexibility (add lift with scope, change variant, replace lift, programmed/location-remembered supersets)
6. Suggested-weight logic (transparent rule, not AI)
7. One-off spreadsheet import (out-of-app AI-assisted transform)
8. Auto-export + manual export (JSON canonical + CSV) to **Google Drive (primary) and download-to-file (fallback)**; export-destination setup is a hard gate before first workout
9. Basic history view (per variant, sortable/filterable by rep range, read-only acceptable)

**Core user journeys supported by MVP:** All seven (happy path, skipped day, travel/new variant, machine taken, programmed superset, add lift mid-workout with scope, eviction recovery). MVP is journey-complete.

### Post-MVP Features (Phase 2 — Growth)

In rough priority order:

1. **AI as analyst** — chat panel grounded in logged data; outside the critical write path; opt-in.
2. **Variant-creation reference** — show sibling-variant weights when creating a new variant.
3. **Progress visualization** — charts of estimated 1RM, volume, frequency over time.
4. **Muscle-group coverage dashboard** — week-level coverage vs. plan, gap suggestions.
5. **Lift-swap suggestions** — same-family / similar-muscle alternates surfaced contextually.
6. **Withings integration** — body composition correlation; needs OAuth + cloud API.
7. **Repeatable in-app spreadsheet import** — only if needed for sharing or re-seeding.
8. **Multi-program support** — splits beyond PPL.
9. **Family-aggregated history view** — all sessions for a lift family aggregated across variants (e.g., bench across barbell, dumbbell, machine); deferred from MVP because the per-variant history view (FR42) covers the daily decision-making case.
10. **Heterogeneous set schemes** — drop sets, ascending/descending pyramids, RPT, and any program structure where sets within a single lift have different planned weights or rep targets. (MVP assumes homogeneous sets-per-lift; the per-set data model `[{plannedWeight, plannedReps}, …]` is forward-compatible.)
11. **In-app set/rest timing** — passive observation of time-per-set and time-per-rest, with no countdowns and no notifications ("the system never tells the user when rest is over"). Deferred from MVP because the user currently manages timing externally on a watch. Re-introduces `LIFTING` and `RESTING` substates to the FR23 state machine when added.
12. **Light theme** — MVP ships dark-mode-only (Cody's primary use is in low-light home gym and indoor commercial gyms; light mode would require a separately hand-designed token set with WCAG AA verification, which is unfunded design work for a single-user app whose owner runs the device on dark mode). Adding light theme is a discrete design + theming pass: define the light token set, verify all contrast pairs, wire `prefers-color-scheme` switching. Forward-compatible because all colors are already named tokens, not literal hexes at call sites.

### Phase 3 (Vision)

- **AI as coach** — proactive programming, persistent memory of preferences/injuries/constraints.
- **Shared export viewing** — read-only inspection of someone else's exported data (still no managed multi-user hosting).

### Risk Mitigation Strategy

**Technical Risks:**

- *Variant model proves wrong under real data.* Mitigation: spreadsheet import runs **first** as the correctness oracle; do not write UI on an unproven schema.
- *Variant merge transactional integrity in IndexedDB.* Mitigation: design variant-merge before locking MVP UI; treat as a named milestone. Transactional contract pinned by NFR21a.
- *Service-worker activation interleaving with in-flight writes.* Mitigation: NFR19 forbids SW activation during an in-progress workout (deferred until app backgrounded ≥30s or next cold start) and wraps the set-commit path in `navigator.locks`.
- *PWA storage eviction.* Mitigation: hard gate on auto-export setup; restoration UX (Journey 7); request `navigator.storage.persist()` on first run.
- *Google Drive OAuth fragility in browser.* Mitigation: download-to-file is a co-equal MVP destination, not a future fallback. Day-one users can ship without Drive if PKCE proves brittle on their device.

**Market Risks (single-user variant):**

- *Cody doesn't actually use it.* Mitigation: 30-day measurable-outcomes test from success criteria. If it fails, revisit scope; do not pile on features.
- *MVP scope creep.* Mitigation: the MVP-minimalism foundation; the 9-item list is locked unless explicitly revisited.

**Resource Risks:**

- *Solo build, finite evening time.* Mitigation: MVP item count is small enough to ship in weeks. If any single MVP item starts threatening the timeline, it gets cut to growth — and the cut is documented, not silent.
- *Abandonment.* The biggest risk identified in earlier elicitation. Mitigation: ship a usable thin slice as fast as possible; the success-test moment matters more than feature breadth.

## Functional Requirements

### Lift Library & Variant Model

- **FR1:** System ships with a built-in seed library of common lift families (bench press, shoulder press, squat, deadlift, row, tricep pushdown, pull-up, etc.).
- **FR2:** Each seed lift family ships with one or more default variants drawn from a fixed vocabulary: **barbell, dumbbell, machine, cable, bodyweight, smith machine** (e.g., bench press → barbell + dumbbell + machine; tricep pushdown → cable only).
- **FR3:** User can add additional variants to any lift family from the built-in vocabulary OR define a custom variant name.
- **FR4:** User can define custom lift families beyond the seed library.
- **FR5:** Each variant carries a **free-weight** flag. Built-in vocabulary defaults: barbell / dumbbell / bodyweight = free-weight; machine / cable / smith machine = location-scoped. **When the user creates a custom variant, the free-weight choice is required input (no silent default); the form may suggest a default but cannot skip the question.** User can change the flag on any variant at any time; change persists permanently.
- **FR6:** User can perform a **non-destructive variant merge**, defined as: all sets logged against either source variant become attributed to the chosen canonical variant; the non-canonical variant ID is retained as an alias (queryable in audit log) so the merge can be inspected and undone for at least 30 days.
- **FR7:** User can re-tag historical sets logged under a placeholder variant (e.g., "legacy / unspecified") to the correct variant retroactively.
- **FR8:** System surfaces existing variants first when the user is selecting a variant for a lift family; "create new variant" is available but secondary.

### Location Model

- **FR9:** User can define and maintain a list of *locations* (manually labeled; never derived from GPS).
- **FR10:** User can select a current location at the start of a workout; selection persists for the session and defaults to the most recently used location.
- **FR11:** System defaults the variant for non-free-weight lifts using this resolution order: (1) most recent variant used at this location for this lift family; (2) most recent variant used at any location for this lift family; (3) the lift family's first listed default variant; (4) prompt user.

### Workout Planning

- **FR12:** User can define a workout-split program consisting of named *split-day-types* (e.g., "Push", "Pull", "Legs") and a *schedule* placing those types into ordered *schedule slots* (e.g., 6-day PPL: Pull, Push, Rest, Pull, Push, Legs, Rest). "Rest" is a first-class slot type with no planned lifts.
- **FR13:** User can plan, per schedule slot, an ordered list of planned lifts with rep ranges. Two slots of the same split-day-type can share most lifts but differ in priority/rep-scheme.
- **FR14:** When the user mutates a planned lift list (add lift, remove lift, change order, change rep range), the system presents a **three-tier scope modal** with radio options: **(1) Today only** (default, pre-selected), **(2) This schedule slot permanently**, **(3) All slots of this split-day-type permanently**, plus Confirm/Cancel buttons. "Today only" applies the change to the current session without altering programming.
- **FR15:** Conflict resolution for amendments: narrower scope shadows broader. If the user later applies a broader-scope change to a lift that has a narrower-scope override, the system warns and asks whether to keep or discard the narrower override.
- **FR16:** User can group two or more lifts as a *programmed superset* within a slot.
- **FR17:** System tracks which schedule slot was last completed (with timestamp), independent of calendar weekday.
- **FR18:** User can choose which schedule slot to do today; system defaults to the next-after-last-completed (skipping rest slots). Choosing a different slot than the suggestion does NOT update last-completed-tracking — it is a one-time override, not a re-baseline.

### Workout Logging Loop

- **FR19:** User can start a workout session bound to a chosen schedule slot and a current location.
- **FR20:** System presents the workout view as a tappable list of planned (and any added) lifts, plus stretching (FR35) and cardio (FR36). User chooses order at tap time.
- **FR21:** User can tap a planned lift to enter the *lift screen*, which displays rep-range-matched prior performance for that exact `(variant, rep_range)` and a suggested next-set weight.
- **FR22:** User can log a set by entering reps and weight; system records the set against the current `(variant, rep_range)`.
- **FR23:** System advances state via a user-driven state machine: states are `IDLE` and `ACTIVE`. Transitions: `IDLE → ACTIVE` (user taps **Start Workout**), `ACTIVE → IDLE` (user taps **Workout Complete**, reachable from ACTIVE per FR25). Set logging occurs within `ACTIVE` via per-set checkbox tap (FR23a); no `LIFTING` / `RESTING` substates exist in MVP. *(`LIFTING` / `RESTING` substates and time-tracking return as part of Growth item 11.)*
- **FR23a:** Within `ACTIVE` state, each planned set is rendered as a row with editable weight and reps cells (pre-filled with the engine's suggestion / planned values). Tapping a row's checkbox logs that set at the displayed values; tapping a checked checkbox unlogs the set and re-enables editing. Sets may be logged in any order. No "are you sure" confirms.
- **FR23b:** User can attach a single free-text **per-lift note** to each lift's session entry (e.g., "struggled with grip", "new bar slip", "left shoulder twinge"). Notes are scoped to the (lift, session) pair — not per-set, not per-workout.
  - **Storage:** single nullable string field on the per-lift session record (logical shape: `session.lifts[i].note`); empty/null when absent. Plain text, no formatting, no length cap in MVP (UI may visually truncate previews).
  - **Surfacing:** optional, never prompted, no placeholder hint pre-populates the field. Entered via a dedicated affordance on the lift screen that is collapsed by default; the rack-side loop never surfaces a note input as required input.
  - **Persistence:** persists with the session record per FR26; survives app close / device restart.
  - **Views:** included in single-session views per FR43 (full text shown).
  - **Export:** included in both the JSON canonical and CSV companion exports per FR48 (one column / field per lift entry; empty cell when absent).
- **FR24:** *[Deferred to Growth item 11.]* In-app set/rest timing is not part of MVP; the system records no time data and provides no timer surface. The user manages timing externally (e.g., a watch). FR23 substates and the FR24 timing capability return together when Growth item 11 lands.
- **FR25:** User can mark a workout session as complete from any state.
- **FR26:** System persists in-progress workout state continuously; closing/reopening the app or device restart resumes the session at its last persisted state with no data loss.

### Mid-Workout Flexibility

- **FR27:** User can change the active variant for a lift mid-workout (same lift family, different variant). Subsequent sets log against the new variant.
- **FR28:** User can **re-attribute already-logged sets within the current session** to a different variant of the same lift family, with a confirmation showing which sets will move.
- **FR29:** User can **edit or delete any set logged in the current session** (reps, weight, or remove entirely).
- **FR30:** User can replace a planned lift with a different lift (cross-family swap) for the current session only. Replace triggers the three-tier scope modal (FR14).
- **FR31:** User can add an unplanned lift to the current session. Add triggers the three-tier scope modal (FR14).
- **FR32:** User can superset two or more lifts ad-hoc during a session; alternation is tracked via per-lift set logs (no separate rest-state semantics needed since timing is deferred per FR24).
- **FR33:** System remembers ad-hoc supersets per location after a single occurrence; on the next workout at that location, the app pre-groups those lifts as a superset.
- **FR34:** User can record sets that deviate from the planned rep range; system stores logged values without forcing reconciliation.

### Stretching & Cardio (Always-On Workout Components)

- **FR35:** **Stretching** appears on every workout view as a single binary checkbox ("Stretched today"). No duration, no detail. Logged for frequency tracking only.
- **FR36:** **Cardio** appears on every workout view as a single component with: (a) the most-recently-used cardio modality from a built-in vocabulary (exercise bike, stair stepper, treadmill, outdoor run, rowing erg) pre-selected, (b) ability to change modality, (c) a single duration field. No intensity, distance, or interval logging in MVP.
- **FR37:** User can mark cardio as "skipped today" without entering duration.
- **FR38:** System logs each cardio entry with modality + duration + timestamp for simple statistics (frequency, total duration per modality).

### Suggested Weight Logic

- **FR39:** System computes a suggested next-set weight from the user's most recent rep-range-matched performance for the active `(variant, rep_range)` using a transparent rule. **The MVP rule is:** *suggest the same weight as the last completed set in this `(variant, rep_range)`; if that set hit the top of the rep range across all sets, suggest the next increment (configurable, default 5 lb / 2.5 kg).* The full formal rule including edge cases (deload, missed reps) is captured in the architecture spec.
- **FR40:** System exposes the reasoning behind any suggested weight on demand (e.g., "based on 3×8 @ 65 lb on May 2 at Home Gym").
- **FR41:** When no rep-range-matched history exists for a `(variant, rep_range)`, the system surfaces an explicit cold-start state on the lift screen (no fabricated suggestion).

### History & Querying

- **FR42:** User can view all logged sessions for a given variant, sortable and filterable by rep range.
- **FR43:** User can view a single session's full record (lifts, sets, per-lift notes per FR23b, cardio, stretching, location, timestamps).

### Data Import (One-Off)

- **FR44:** User can perform a one-time seed import of an external workout history via an out-of-app AI-assisted transform that produces a JSON file consumed by the app. The AI transform happens outside the app; the app only consumes the resulting JSON.
- **FR45:** System tags imported sets whose variant cannot be determined as a placeholder "legacy / unspecified" variant per lift family, available for retroactive re-tagging (per FR7).

### Backup & Export

- **FR46:** **Durability SLO:** No completed workout is more than one workout-completion-event away from being in a recoverable backup. The following FRs are implementations of this SLO.
- **FR47:** User must configure at least one export destination — Google Drive (PKCE OAuth in-browser, dedicated app folder) or download-to-file — before recording any workout (hard onboarding gate). Onboarding state persists across abandoned sessions; failed auth does not reset progress.
- **FR48:** System auto-exports the full database (JSON canonical + CSV companion) **before and after every workout**, asynchronously (does not block the "start workout" or "complete workout" actions). The pre-workout export ensures the most recent committed state is in backup before any new session begins; the post-workout export captures the just-completed session. Export status is surfaced via FR51, not blocking UI.
- **FR49:** When the user starts a new workout, system checks whether the last auto-export attempt succeeded; if not, it retries the export in the background. **Failure taxonomy:** `NETWORK_ERROR` and `TIMEOUT` trigger silent retry; `AUTH_EXPIRED` and `PERMISSION_REVOKED` trigger an in-app re-auth prompt and block the new workout from starting until resolved or until the user explicitly switches to the fallback download-to-file destination.
- **FR50:** User can trigger an on-demand manual export at any time.
- **FR51:** System surfaces last-successful-export status (timestamp, destination) at all times in a non-intrusive but visible location.
- **FR52:** On app start, system checks for missing or evicted local data (defined as: expected IndexedDB stores absent, or schema-version row missing) and offers automatic restore from the configured export destination.
- **FR53:** After restore, system surfaces honest staleness messaging (time elapsed since last backup; warning if user may have logged elsewhere).
- **FR54:** System supports **restore on a fresh device**: opening the PWA on a new device with no local data offers to authenticate to the same export destination and restore.

### Lifecycle, Storage, Installability

- **FR55:** User can install the app to the Android home screen as a PWA and launch it without browser chrome.
- **FR56:** **Offline contract:** the following operate fully offline — workout logging (FR19–34), stretching/cardio logging (FR35–38), suggested weight (FR39–41), history viewing (FR42–43). The following are online-only with explicit UI feedback when unavailable: Drive auto-export (FR48–49), restore (FR52, FR54). Manual download-to-file export (FR50) operates offline.
- **FR57:** System requests persistent storage (`navigator.storage.persist()`) on first run.
- **FR58:** **Schema migration:** migrations are forward-only, atomic per migration (all-or-nothing), and snapshot-the-database to a recovery file before applying. On migration failure, the app refuses to boot and offers (a) restore from snapshot, (b) restore from configured backup destination. Schema version is tracked in a dedicated meta-store row.

## Non-Functional Requirements

### Performance

- **NFR1 (Cold start):** App shell renders the home screen within **1.5 seconds** of icon tap on a mid-range Android phone (~6.5", representative of Cody's device class), measured offline. **Measurement:** Lighthouse mobile preset, throttled 4G off, 4× CPU slowdown, median of 5 runs is the gating signal during development; on-device measurement against the user's actual phone (per NFR23) is the truth-test before each release.
- **NFR2 (Tap-to-render lift screen):** Tapping a planned lift renders the lift screen with rep-range-matched history visible within **100 ms** at p95. **"Renders" is defined as: data committed to UI state and reflected in the DOM, not the completion of any decorative animation.** Measurement: in-app `performance.mark`/`measure` rolling p95 over 100 samples, persisted to a local `perf_log` store.
- **NFR3 (Set entry commit):** Logging a set commits to local storage and updates the lift screen within **100 ms** at p95. **"Commit" = write enqueued in an open IndexedDB transaction + UI reflects it.** Durability is asserted separately by NFR17.
- **NFR4 (History query):** Querying all sessions for a given variant filtered by rep range returns within **200 ms** at p95 against **1 year of realistic data** (~300 sessions, ~6,000 sets). Re-test trigger: when the live database crosses 10,000 sets.
- **NFR5 (Suggested-weight computation):** Suggested next-set weight appears within **50 ms of lift-screen paint**. May be computed in a Web Worker; must never block the lift-screen render.
- **NFR6 (Auto-export):** Auto-export to Google Drive of the full database completes within **10 seconds** on a typical mobile connection for a database of up to 1 year of data; runs asynchronously and never blocks workout completion.
- **NFR7 (Animation budget):** Animations on primary workflow transitions are decorative-only; the interactive target is hit-testable and the data is rendered within the NFR2/NFR3 budgets. Animations may complete after the budget but must not gate input.

### Usability & Accessibility

- **NFR8 (Tap target size):** All interactive elements meet the **48 dp Material baseline** in both dimensions.
- **NFR9 (Contrast):** Text and meaningful UI elements meet **WCAG AA contrast ratios** (4.5:1 normal text, 3:1 large text and UI components), in both light and dark themes.
- **NFR10 (Keyboard navigation):** All app functionality is reachable via keyboard, with visible focus indicators and semantic HTML.
- **NFR11 (Reduced motion):** App honors `prefers-reduced-motion`; non-essential animations are suppressed when set.
- **NFR12 (Light and dark mode):** App provides both light and dark themes following the system `prefers-color-scheme`. User may override via in-app toggle; override persists.
- **NFR13 (Interaction budget per workflow):** Tap counts for named workflows:
  - Log a planned set: ≤ 3 taps
  - Log a set with a variant change: ≤ 4 taps
  - Correct the most recently logged set: ≤ 2 taps
  - Add an unplanned lift to today's session: ≤ 3 taps
  - Mark stretching as done: 1 tap
  - Log cardio (modality unchanged): ≤ 2 taps (modality + duration)
- **NFR14 (Left-handed one-handed reach):** No **screen-level primary action** — defined as a single, non-repeating command that advances the lift→rest→lift state machine (e.g., the `Workout Complete` footer button, modal confirm buttons) — may be placed in the **upper-right quadrant of the viewport**. Screen-level primary actions live in the lower half, full-width or left-aligned where possible. **Repeating row-level affordances** (per-set log checkboxes, per-row chips) are exempt and may follow established conventions: per-set log checkboxes sit on the **right edge of each row** (Strong/Hevy convention; the trailing position reads as "done" cognitively, even for a left-handed user, and the user has accepted the cross-centerline reach for this affordance). Secondary actions (settings, history scrub, back chevron) may live anywhere.
- **NFR15 (Wake lock during active workout):** While a workout session is active, the app holds a screen wake lock so the device does not sleep mid-set. Wake lock is released when the session ends, when the app is backgrounded, or after **10 minutes of no interaction** (covering the "walked away and forgot to end" case).
- **NFR16 (Pocket recovery):** If the screen locks mid-workout and the user re-opens the app within 10 minutes, the user lands on the exact lift screen and mid-set state at which they left, with zero taps required to resume. (Reinforces FR26.)

### Reliability & Data Durability

- **NFR17 (Data loss tolerance):** A logged and committed set survives app crash, browser crash, device reboot, and service-worker update. Tested per scenario with explicit fixtures.
- **NFR18 (Backup recency SLO, restated):** A completed workout is in a recoverable backup within one workout-completion-event of being committed (per FR46). **Maximum acceptable data loss in an eviction-restore scenario is the sets of the currently-in-progress workout.** Eviction mid-workout is an accepted trade-off for the simplicity of workout-granular backup.
- **NFR19 (Service-worker activation safety):** A new service worker MUST NOT activate while a workout session is in progress. Activation is deferred until the app has been backgrounded for at least **30 seconds** or until the next cold start. The set-commit code path is wrapped in a `navigator.locks` exclusive lock so any attempted activation cannot interleave with an in-flight write.
- **NFR20 (Eviction recovery):** When IndexedDB is evicted, the app recovers from the configured backup destination within **30 seconds** of the next launch (assuming online and authenticated to the destination).
- **NFR21 (Schema migration safety):** No schema migration may render the database unreadable. A failed migration must leave the user with at least one route to data recovery (snapshot or backup destination), and the app must surface the recovery UI rather than failing silently.
- **NFR21a (Variant merge atomicity):** Variant merge (FR6) executes as an atomic IndexedDB transaction across all sets referencing the merged variants — either all sets are re-attributed to the canonical variant and the source variant becomes an alias, or the database is unchanged. Partial merges are not a permitted intermediate state. The merge audit log entry is committed in the same transaction.

### Compatibility

- **NFR22 (Browser support):** App functions correctly on the **two most recent major versions of Chrome on Android** at MVP. Other Android browsers and iOS Safari are best-effort, not contractual.
- **NFR23 (Device class):** Primary target is mid-range Android phones (~6.5" display, ~4 GB RAM, released within the past 4 years). Performance NFRs are validated against this class.
- **NFR24 (PWA installability):** App passes Chrome's PWA install criteria (valid manifest, registered service worker, served over HTTPS).
- **NFR25 (Orientation):** App is **portrait-only** in MVP; rotation is locked.

### Maintainability

- **NFR26 (Solo-dev operability):** App requires no backend, no database administration, and no specialized infrastructure knowledge to operate. Hosting is any static host with a free tier (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
- **NFR27 (Local discipline):** Pre-commit runs typecheck and unit tests locally; deploy is manual from `main`. CI orchestration is **not required for MVP** but is a planned growth item.
- **NFR28 (AI provider abstraction):** Switching configured AI provider (when feature lands post-MVP) is a configuration change, not a code change. Verified by a contract test that swaps providers via env var with no source diff.
- **NFR29 (Schema versioning):** Every persistent data shape carries a schema version; migrations are versioned and ordered; the migration log is human-readable (each entry: `{timestamp, version_from, version_to, action, status, message}`; message is plain English, no JSON blobs or stack traces).

### Privacy

- **NFR30 (Local-first data residency):** All training data lives on the user's device. No backend stores, transmits, or processes the user's training data in any form.
- **NFR31 (Backup destination scope):** Google Drive integration uses a dedicated app folder (Drive `appDataFolder` scope or equivalent). The app cannot read or write any other Drive files.
- **NFR32 (AI provider data exposure):** When AI features are enabled (post-MVP), the user is shown a one-time consent modal naming the configured provider and the data scope sent on each call. Consent is persisted and revocable; no AI network call is made before consent is recorded.
- **NFR33 (Credential storage):** API keys, OAuth tokens, and provider credentials are stored in IndexedDB (same security boundary as training data); never logged, never transmitted to any party other than the configured provider, never embedded in exports.
- **NFR34 (Export portability):** Exported JSON is the canonical schema; CSV is companion. The user can read, edit, or migrate their data without the app being involved. No vendor lock-in.


