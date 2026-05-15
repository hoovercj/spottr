/**
 * Thin selector hook over the singleton `chatStore`. The actual session
 * state, tool-call loop, streaming patches, and persistence all live
 * in `chatStore.ts` so a chat survives the Coach dialog being closed
 * and re-opened (and a page reload).
 *
 * Kept as a separate hook so existing call sites (ChatThread, tests)
 * have a stable import; future refactors can drop the wrapper if we
 * decide direct store access is cleaner.
 */

import { useCallback, useEffect } from 'react';
import { useChatStore } from '@/features/ai/chat/chatStore';
import type { AIMessage } from '@/features/ai/providers/types';

export interface ChatSessionState {
  messages: AIMessage[];
  isStreaming: boolean;
  error: string | null;
}

export interface UseChatSession {
  state: ChatSessionState;
  send(text: string): Promise<void>;
  reset(): Promise<void>;
  cancel(): void;
  /** Alias for `cancel` — reads more naturally from a Stop button. */
  stop(): void;
}

export function useChatSession(): UseChatSession {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const error = useChatStore((s) => s.error);

  // The store's actions are plain closures — not class methods — but
  // ESLint's `unbound-method` flags them anyway because they're
  // extracted as property references. Wrap them in stable callbacks
  // so consumers receive `this`-free callables.
  const send = useCallback((text: string): Promise<void> => useChatStore.getState().send(text), []);
  const cancel = useCallback((): void => useChatStore.getState().cancel(), []);
  const reset = useCallback((): Promise<void> => useChatStore.getState().reset(), []);

  // Lazy-hydrate the first time anyone reads the session. Idempotent;
  // subsequent calls short-circuit on the store's `isHydrated` flag.
  useEffect(() => {
    void useChatStore.getState().hydrate();
  }, []);

  return {
    state: { messages, isStreaming, error },
    send,
    reset,
    cancel,
    stop: cancel,
  };
}
