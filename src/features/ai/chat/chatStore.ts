/**
 * Singleton chat-session state. Lifted out of `useChatSession`'s
 * component-local `useState` so the conversation survives the Coach
 * dialog being closed and re-opened, AND a full page reload (mirrored
 * to a `meta` row that is intentionally excluded from Drive sync).
 *
 * Persistence flow:
 *   - On first read, `hydrate()` lazily loads from `meta:ai:conversation`.
 *   - On every message mutation, a 300ms-debounced save mirrors the
 *     current `messages` array back to the same meta row.
 *   - `reset()` wipes both store and meta row.
 *
 * One conversation only for MVP. Multi-conversation / thread list is
 * deferred.
 */

import { create } from 'zustand';
import { resolveProvider } from '@/features/ai/providers/registry';
import { TOOLS, getToolByName } from '@/features/ai/tools/catalog';
import { buildSystemPrompt } from '@/features/ai/prompts/systemPrompt';
import { todayLocalDateString } from '@/data/calendarDate';
import { newId } from '@/data/ids';
import { getDb } from '@/data/db';
import { getUserProfile } from '@/features/ai/settings/userProfile';
import type { AIMessage, AIToolCall } from '@/features/ai/providers/types';

const MAX_TOOL_LOOPS = 6;
/**
 * Hard cap on how many transcript messages we replay to the model per
 * send. Long conversations are pruned to the most recent slice (the
 * full history still lives in storage / UI). Keeps token cost bounded
 * and latency from creeping up at chat #50.
 */
const MAX_HISTORY_MESSAGES = 12;
const PERSIST_KEY = 'ai:conversation';
const PERSIST_DEBOUNCE_MS = 300;

async function fetchActiveProgramName(): Promise<string | null> {
  const programs = await getDb().live.program.toArray();
  return programs.find((p) => p.isActive)?.name ?? null;
}

/**
 * Cap how much transcript we replay to the model. Keeps the system
 * message intact and trims the oldest user/assistant/tool messages.
 * Exported for tests; pure / no side effects.
 */
export function pruneHistory(
  history: ReadonlyArray<AIMessage>,
  maxKeep = MAX_HISTORY_MESSAGES,
): AIMessage[] {
  if (history.length <= maxKeep) return [...history];
  return history.slice(-maxKeep);
}

interface State {
  messages: AIMessage[];
  isStreaming: boolean;
  error: string | null;
  /** True once we've finished loading from storage (or determined storage was empty). */
  isHydrated: boolean;
  /** Internal — held so cancel() can abort whatever is in flight. */
  abortCtrl: AbortController | null;
}

interface Actions {
  send(text: string): Promise<void>;
  cancel(): void;
  reset(): Promise<void>;
  hydrate(): Promise<void>;
}

export const useChatStore = create<State & Actions>((set, get) => ({
  messages: [],
  isStreaming: false,
  error: null,
  isHydrated: false,
  abortCtrl: null,

  hydrate: async (): Promise<void> => {
    if (get().isHydrated) return;
    try {
      const row = await getDb().meta.get(PERSIST_KEY);
      const stored = (row?.value as AIMessage[] | undefined) ?? [];
      set({ messages: stored, isHydrated: true });
    } catch {
      // If load fails (corrupt blob, IDB blocked, etc.), start empty
      // rather than refusing to open the chat.
      set({ messages: [], isHydrated: true });
    }
  },

  send: async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || get().isStreaming) return;
    set({ error: null });
    const provider = await resolveProvider();
    if (!provider) {
      set({
        error:
          'No AI provider configured. Set a Gemini API key in Settings → AI to start chatting.',
      });
      return;
    }
    // Refresh profile + active program every send so a Settings edit
    // takes effect immediately on the next message (both reads are cheap
    // and ride on Dexie's in-memory cache).
    const [profile, activeProgramName] = await Promise.all([
      getUserProfile(),
      fetchActiveProgramName(),
    ]);
    const system: AIMessage = {
      role: 'system',
      content: buildSystemPrompt({
        todayLocal: todayLocalDateString(),
        profile,
        activeProgramName,
      }),
    };
    const userMsg: AIMessage = {
      id: `user-${newId()}`,
      role: 'user',
      content: trimmed,
    };
    const baseTranscript: AIMessage[] = [...get().messages, userMsg];
    set({ messages: baseTranscript, isStreaming: true });

    const ctrl = new AbortController();
    set({ abortCtrl: ctrl });

    try {
      // Cap how much history we replay per turn. The full transcript
      // still lives in storage and the UI; we just don't ship every
      // past turn to the model. Cycles started this turn (assistant
      // turn, tool responses) are appended after pruning and always
      // sent in full.
      let working: AIMessage[] = [system, ...pruneHistory(baseTranscript)];
      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
        const assistantId = `asst-${newId()}`;
        const placeholder: AIMessage = {
          id: assistantId,
          role: 'assistant',
          content: '',
        };
        set((s) => ({ messages: [...s.messages, placeholder] }));

        let finalMsg: AIMessage = placeholder;
        const res = await provider.send({
          messages: working,
          tools: TOOLS,
          signal: ctrl.signal,
          onProgress: (partial) => {
            finalMsg = { ...placeholder, ...partial, id: assistantId };
            set((s) => ({ messages: replaceById(s.messages, assistantId, finalMsg) }));
          },
        });
        const last = res.messages[res.messages.length - 1];
        if (last) {
          finalMsg = { ...placeholder, ...last, id: assistantId };
          set((s) => ({ messages: replaceById(s.messages, assistantId, finalMsg) }));
        }
        working = [...working, finalMsg];

        if (!finalMsg.toolCalls || finalMsg.toolCalls.length === 0) {
          return;
        }

        const toolResponses: AIMessage[] = [];
        for (const call of finalMsg.toolCalls) {
          const out = await runTool(call);
          toolResponses.push({
            id: `tool-${newId()}`,
            role: 'tool',
            content: JSON.stringify(out),
            toolCallId: call.id,
          });
        }
        working = [...working, ...toolResponses];
        set((s) => ({ messages: [...s.messages, ...toolResponses] }));
      }
      set({
        error:
          'The assistant called tools more than six times in a row without answering. Stopped to avoid a runaway loop — try rephrasing or asking a narrower question.',
      });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      set({ error: formatError(e) });
    } finally {
      set({ isStreaming: false, abortCtrl: null });
    }
  },

  cancel: () => {
    get().abortCtrl?.abort();
  },

  reset: async (): Promise<void> => {
    get().abortCtrl?.abort();
    set({ messages: [], error: null, isStreaming: false, abortCtrl: null });
    await clearPersistedMessages();
  },
}));

/* ----------------------------------------------------------------------- */
/* Persistence — debounced mirror of `messages` to the `meta` table         */
/* ----------------------------------------------------------------------- */

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessages: AIMessage[] | null = null;

function scheduleSave(messages: AIMessage[]): void {
  pendingMessages = messages;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const toWrite = pendingMessages;
    pendingMessages = null;
    if (!toWrite) return;
    void persistMessages(toWrite);
  }, PERSIST_DEBOUNCE_MS);
}

async function persistMessages(messages: AIMessage[]): Promise<void> {
  try {
    if (messages.length === 0) {
      await getDb().meta.delete(PERSIST_KEY);
      return;
    }
    await getDb().meta.put({ key: PERSIST_KEY, value: messages });
  } catch {
    // Persistence is best-effort; failing to save shouldn't disrupt
    // the live chat experience. Swallowing here keeps the user from
    // seeing a transient IDB blip as an in-chat error.
  }
}

async function clearPersistedMessages(): Promise<void> {
  // Drain any pending debounced save before clearing so we don't
  // race-condition a stale write back into storage.
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingMessages = null;
  }
  try {
    await getDb().meta.delete(PERSIST_KEY);
  } catch {
    // ditto — best effort
  }
}

useChatStore.subscribe((state, prev) => {
  if (!state.isHydrated) return;
  if (state.messages === prev.messages) return;
  scheduleSave(state.messages);
});

/* ----------------------------------------------------------------------- */
/* Test-only helpers — keep the store deterministic across describe blocks */
/* ----------------------------------------------------------------------- */

/**
 * Reset the store + clear any pending persistence timer. Tests that
 * `_resetDbForTest()` should call this in `beforeEach` so the singleton
 * store doesn't carry messages over.
 */
export function _resetChatStoreForTest(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingMessages = null;
  }
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    error: null,
    isHydrated: false,
    abortCtrl: null,
  });
}

/** Forces any pending debounced save to flush immediately. */
export async function _flushChatStorePersistForTest(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const toWrite = pendingMessages;
  pendingMessages = null;
  if (toWrite) await persistMessages(toWrite);
}

/* ----------------------------------------------------------------------- */

function replaceById(messages: AIMessage[], id: string, next: AIMessage): AIMessage[] {
  return messages.map((m) => (m.id === id ? next : m));
}

async function runTool(call: AIToolCall): Promise<unknown> {
  const tool = getToolByName(call.name);
  if (!tool) return { error: `Unknown tool: ${call.name}` };
  try {
    return await tool.run(call.args, { now: new Date().toISOString() });
  } catch (e) {
    return { error: (e as Error).message ?? 'Tool failed' };
  }
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
