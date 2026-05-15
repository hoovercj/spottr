# Importing a flat-CSV workout sheet

Spottr ships with a one-shot script that ingests a flattened CSV of historic workouts and produces a Spottr backup JSON. Restore that JSON via **Settings → Restore from file** and the imported sessions appear in History + Progress, tagged to the active routine's day slots.

The script is intentionally not a UI surface: it was built for a single migration moment. Re-run it if you tweak the parser, but don't bake it into the app.

## Expected CSV shape

```
Date,Exercise Name,Set Number,Weight,Reps,Notes
2025-12-15,"4x5, 1x5+ Bench Press",1,82.5,5,
2025-12-15,"4x5, 1x5+ Bench Press",2,82.5,5,
...
```

- `Date` is `YYYY-MM-DD` in local time.
- `Exercise Name` may carry a rep-scheme prefix (`4x5, 1x5+ ...`); the script strips it. Supersets are recognized via a literal `SS` between the two halves (`Triceps Pushdowns SS Lat Raises`).
- `Set Number` is 1-based. If the same `(date, exercise)` has multiple set rows, each is one set; if there's only one row but `Weight` or `Reps` is slash- or dot-separated, the script expands them into multiple sets.
- `Weight` can be a scalar, slash-separated per-set (`60/60/60/50/50`), or, for superset rows, an `A/B` pair (`17/3.4` = 17 for leg A, 3.4 for leg B).
- `Reps` can be scalar, slash-separated (`5/5/4`), or dot-separated repeating (`5.5.5.5.5`). Trailing empties are dropped — `5/5/4/` becomes three sets, not four with a phantom zero.
- `Notes` is preserved verbatim on the SessionLift. A handful of well-known annotations also override the variant (`pullup` on a Pulldown row switches to Pull-up Bodyweight; `(bench)` on an Overhead Press row switches to Bench Press Barbell).

## Workflow

1. **Make a fresh Spottr export.** Open the deployed app, go to **Settings → Backups**, pick any destination, hit **Export now**, and find the resulting `spottr-backup.json` (downloads folder or the local-folder destination you picked).
2. **Drop both files into `.tmp/`.** Save the export as `.tmp/spottr-baseline.json` and the flat CSV as `.tmp/sheet.csv` (or any names you prefer — paths are arguments). `.tmp/` is gitignored.
3. **Run the importer:**
   ```sh
   node scripts/import-sheet.mjs .tmp/spottr-baseline.json .tmp/sheet.csv
   ```
   Output lands at `.tmp/spottr-import.json` by default. The script prints a summary of sessions / lifts / sets created and a list of any rows it couldn't parse with the reason.
4. **Restore** in the app: **Settings → Restore from file** → pick `spottr-import.json`. The restore is destructive — it clears the current DB and rewrites it with the merged payload. Your existing exports are unaffected; the snapshot stored as part of the restore lets you recover if something looks wrong.

## What the script does and doesn't do

**Does**

- Builds a `Session` per unique calendar date.
- Builds one `SessionLift` per exercise instance on that date (two for superset rows).
- Builds `SessionSet` records, deriving per-set weight/reps from slash/dot splits.
- Resolves exercise labels to the `LiftFamily` + `Variant` rows already in your baseline. Single-variant families with only one plausible mapping work out of the box.
- Tags each session's `scheduleSlotId` to the active routine's day-of-week slot (Mon = slot 0, etc.).
- Replicates a single-set row to 5 sets when the exercise carries the `expandSingleSetTo` rule (currently just Barbell Rows, since you only ever did machine rows in 5-set blocks).
- Preserves the original `Notes` text on the SessionLift so nothing is lost.

**Doesn't**

- Doesn't create new `LiftFamily` or `Variant` rows. If your CSV mentions an exercise that isn't in the baseline, the script skips it and prints a warning. Add the family/variant to `src/data/seed.ts`, regenerate the baseline, and re-run.
- Doesn't try to detect location changes from the notes (everything goes to "No location").
- Doesn't try to read context-sensitive sentences out of free-form notes — only a small allow-list of variant-substitution markers.
- Doesn't try to be clever about partial sets: a set with weight-but-no-reps is stored as planned (not logged) so the progress chart doesn't pick up phantom zero-rep entries.

## Tuning the mapping

If the script complains about an unrecognized exercise, edit the `resolveSingle` map in `scripts/import-sheet.mjs`. Each entry is `'normalized name'` → `{ family, variantKind, expandSingleSetTo? }`. The same file holds the SS-leg-B override (for the cable/dumbbell lateral-raise distinction).
