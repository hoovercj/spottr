// One-off helper to generate a fresh-seed Spottr export JSON in Node.
// Used by the importer when no real Spottr export is handy. Writes to
// .tmp/spottr-baseline.json.
import 'fake-indexeddb/auto';
import { runSeed } from '../src/data/seed.ts';
import { buildExportPayload } from '../src/features/export/serialize.ts';
import { writeFileSync } from 'node:fs';

await runSeed();
const payload = await buildExportPayload();
writeFileSync('.tmp/spottr-baseline.json', JSON.stringify(payload, null, 2));
console.log('wrote .tmp/spottr-baseline.json');
