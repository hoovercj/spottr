/**
 * Per-device AI provider settings, stored in the `meta` table which is
 * deliberately excluded from Drive sync (see MERGEABLE_TABLES in db.ts).
 * Keys never travel between devices and never appear in export payloads.
 *
 * Honesty UI note: the key is unencrypted at rest, the same way the rest of
 * the IndexedDB data is. The Settings panel surfaces this rather than
 * pretending otherwise.
 */

import { getDb } from '@/data/db';
import type { ProviderId } from '@/features/ai/providers/types';

const META_KEY_PREFIX = 'ai:apiKey:';
const META_PROVIDER = 'ai:provider';
const META_MODEL = 'ai:model';

export interface AISettings {
  provider: ProviderId;
  model: string;
  apiKey: string | null;
}

const DEFAULTS: Pick<AISettings, 'provider' | 'model'> = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
};

export async function getAISettings(): Promise<AISettings> {
  const db = getDb();
  const [providerRow, modelRow] = await Promise.all([
    db.meta.get(META_PROVIDER),
    db.meta.get(META_MODEL),
  ]);
  const provider = (providerRow?.value as ProviderId | undefined) ?? DEFAULTS.provider;
  const model = (modelRow?.value as string | undefined) ?? DEFAULTS.model;
  const keyRow = await db.meta.get(META_KEY_PREFIX + provider);
  const apiKey = (keyRow?.value as string | undefined) ?? null;
  return { provider, model, apiKey };
}

export async function setApiKey(provider: ProviderId, apiKey: string): Promise<void> {
  await getDb().meta.put({ key: META_KEY_PREFIX + provider, value: apiKey });
}

export async function clearApiKey(provider: ProviderId): Promise<void> {
  await getDb().meta.delete(META_KEY_PREFIX + provider);
}

export async function setProvider(provider: ProviderId): Promise<void> {
  await getDb().meta.put({ key: META_PROVIDER, value: provider });
}

export async function setModel(model: string): Promise<void> {
  await getDb().meta.put({ key: META_MODEL, value: model });
}

/** Defensive guard for any code path that might surface the key in logs. */
export function redactKey(key: string | null): string {
  if (!key) return '(none)';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
