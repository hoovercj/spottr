import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import { runSeed } from '@/data/seed';
import { runExport } from '@/features/export/service';
import { MemoryDestination, setDestinationFactory } from '@/features/export/destination';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportPayload } from '@/features/export/types';
import { parseExportPayload, restoreFromPayload } from '@/features/export/restore';

describe('runExport', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    setDestinationFactory(null);
    await getDb().delete();
  });

  it('writes a JSON and CSV file to the destination and records a success row', async () => {
    await runSeed();
    const dest = new MemoryDestination();
    setDestinationFactory(() => Promise.resolve(dest));

    const result = await runExport({ trigger: 'manual' });
    expect(result.ok).toBe(true);
    expect(dest.files).toHaveLength(2);
    expect(dest.files[0]!.name).toMatch(/\.json$/);
    expect(dest.files[1]!.name).toMatch(/\.csv$/);
    expect(dest.files[0]!.contentType).toBe('application/json');
    expect(dest.files[1]!.contentType).toBe('text/csv');

    const parsed = JSON.parse(dest.files[0]!.contents) as ExportPayload;
    expect(parsed.format).toBe(EXPORT_FORMAT);
    expect(parsed.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(parsed.stores.liftFamily.length).toBeGreaterThan(0);
    // Seed now ships several popular routines as defaults; just check we
    // wrote at least one.
    expect(parsed.stores.program.length).toBeGreaterThanOrEqual(1);
  });

  it('records a failure row when the destination throws', async () => {
    await runSeed();
    setDestinationFactory(() =>
      Promise.resolve({
        kind: 'memory',
        write: () => Promise.reject(new Error('disk full')),
      }),
    );

    const result = await runExport({ trigger: 'manual' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.message).toBe('disk full');
    }
    const failRow = await getDb().meta.get('export:lastFail');
    expect(failRow).toBeDefined();
  });

  it('round-trips: export → parse → restore yields identical row counts', async () => {
    await runSeed();
    const dest = new MemoryDestination();
    setDestinationFactory(() => Promise.resolve(dest));

    const first = await runExport({ trigger: 'manual' });
    if (!first.ok) throw new Error('export failed');
    const beforeFamilies = await getDb().liftFamily.count();
    const beforeVariants = await getDb().variant.count();

    // Wipe everything except meta to simulate a fresh device.
    await getDb().liftFamily.clear();
    await getDb().variant.clear();
    await getDb().location.clear();
    await getDb().program.clear();
    await getDb().splitDayType.clear();
    await getDb().scheduleSlot.clear();
    await getDb().slotPlan.clear();
    await getDb().slotPlanSupersetGroup.clear();

    const payload = parseExportPayload(dest.files[0]!.contents);
    await restoreFromPayload(payload);

    const afterFamilies = await getDb().liftFamily.count();
    const afterVariants = await getDb().variant.count();
    expect(afterFamilies).toBe(beforeFamilies);
    expect(afterVariants).toBe(beforeVariants);
  });

  it('CSV companion uses CRLF line endings and includes a header row', async () => {
    await runSeed();
    const dest = new MemoryDestination();
    setDestinationFactory(() => Promise.resolve(dest));

    await runExport({ trigger: 'manual' });
    const csv = dest.files[1]!.contents;
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('sessionId');
    expect(lines[0]).toContain('loggedWeight');
    expect(lines.at(-1)).toBe(''); // trailing CRLF
  });
});

describe('parseExportPayload', () => {
  it('rejects non-JSON input', () => {
    expect(() => parseExportPayload('not json')).toThrow();
  });

  it('rejects an export with the wrong format tag', () => {
    expect(() =>
      parseExportPayload(JSON.stringify({ format: 'other', formatVersion: 1, stores: {} })),
    ).toThrow(/format tag/);
  });

  it('rejects an export with an unsupported format version', () => {
    expect(() =>
      parseExportPayload(JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 999, stores: {} })),
    ).toThrow(/format version/);
  });
});
