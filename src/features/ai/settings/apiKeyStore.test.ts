import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import {
  clearApiKey,
  getAISettings,
  redactKey,
  setApiKey,
  setModel,
  setProvider,
} from '@/features/ai/settings/apiKeyStore';
import { buildExportPayload } from '@/features/export/serialize';

describe('AI settings key store', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
  });
  afterEach(async () => {
    await getDb().delete();
  });

  it('round-trips key and provider settings', async () => {
    await setApiKey('gemini', 'AIzaTESTkey1234567890ABC');
    await setProvider('gemini');
    await setModel('gemini-2.5-pro');
    const s = await getAISettings();
    expect(s.provider).toBe('gemini');
    expect(s.model).toBe('gemini-2.5-pro');
    expect(s.apiKey).toBe('AIzaTESTkey1234567890ABC');
  });

  it('returns Gemini defaults when nothing is stored', async () => {
    const s = await getAISettings();
    expect(s.provider).toBe('gemini');
    expect(s.model).toBe('gemini-2.5-flash');
    expect(s.apiKey).toBeNull();
  });

  it('clearApiKey removes the stored key but leaves provider/model alone', async () => {
    await setApiKey('gemini', 'AIzaTESTkey1234567890ABC');
    await setModel('gemini-2.5-pro');
    await clearApiKey('gemini');
    const s = await getAISettings();
    expect(s.apiKey).toBeNull();
    expect(s.model).toBe('gemini-2.5-pro');
  });

  it('API key is NOT included in export payload (meta excluded from sync)', async () => {
    await setApiKey('gemini', 'AIzaSECRETkey1234567890XYZ');
    const payload = await buildExportPayload();
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('AIzaSECRETkey1234567890XYZ');
    expect(serialized).not.toContain('ai:apiKey');
  });

  it('redactKey shows head/tail only', () => {
    expect(redactKey(null)).toBe('(none)');
    expect(redactKey('short')).toBe('••••');
    expect(redactKey('AIzaTESTkey1234567890ABC')).toBe('AIza…0ABC');
  });
});
