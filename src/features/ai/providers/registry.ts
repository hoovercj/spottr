/**
 * Resolves the configured provider from local AI settings. Gemini is the
 * only impl in MVP; the switch is here so adding Claude/OpenAI is a leaf
 * change.
 */

import type { AIProvider } from '@/features/ai/providers/types';
import { GeminiProvider } from '@/features/ai/providers/gemini';
import { getAISettings } from '@/features/ai/settings/apiKeyStore';

export async function resolveProvider(): Promise<AIProvider | null> {
  const settings = await getAISettings();
  if (!settings.apiKey) return null;
  if (settings.provider === 'gemini') {
    return new GeminiProvider({ apiKey: settings.apiKey, model: settings.model });
  }
  // Other providers come later; until then, treat a non-Gemini selection
  // with a key as "not configured" rather than crashing the chat UI.
  return null;
}
