/**
 * Bridges our session-state-owning `useChatSession` to assistant-ui's
 * `useExternalStoreRuntime`. We pre-collapse the message stream into
 * view-messages (one row per user turn or assistant turn, with
 * `role: 'tool'` responses merged into the preceding assistant's
 * tool-call parts), then map each to assistant-ui's `ThreadMessageLike`.
 *
 * The view-message pass is intentionally outside `convertMessage`
 * because the converter only sees one message at a time and we need
 * to join across the array. Stable assistant ids (assigned in
 * `useChatSession`) keep the runtime from re-mounting tool-call rows
 * on every streaming chunk.
 */

import { useMemo, useCallback } from 'react';
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import type { AIMessage } from '@/features/ai/providers/types';
import type { UseChatSession } from '@/features/ai/chat/useChatSession';
import { deriveSuggestions } from '@/features/ai/chat/suggestions';

interface ViewMessageBase {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface ToolCallPart {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

interface ViewAssistant extends ViewMessageBase {
  role: 'assistant';
  toolCalls: ToolCallPart[];
}

interface ViewUser extends ViewMessageBase {
  role: 'user';
}

type ViewMessage = ViewUser | ViewAssistant;

export function buildViewMessages(messages: AIMessage[]): ViewMessage[] {
  const view: ViewMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      view.push({
        id: m.id ?? `user-${view.length}`,
        role: 'user',
        text: m.content,
      });
      continue;
    }
    if (m.role === 'assistant') {
      view.push({
        id: m.id ?? `asst-${view.length}`,
        role: 'assistant',
        text: m.content,
        toolCalls: (m.toolCalls ?? []).map((tc) => ({
          callId: tc.id,
          toolName: tc.name,
          args: tc.args,
        })),
      });
      continue;
    }
    if (m.role === 'tool') {
      // Find the most recent assistant view-message and attach this result
      // to the matching tool-call part.
      for (let i = view.length - 1; i >= 0; i--) {
        const candidate = view[i]!;
        if (candidate.role !== 'assistant') continue;
        const part = candidate.toolCalls.find((tc) => tc.callId === m.toolCallId);
        if (part) {
          part.result = safeParseJson(m.content) ?? m.content;
        }
        break;
      }
    }
  }
  return view;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function convertViewMessage(vm: ViewMessage): ThreadMessageLike {
  if (vm.role === 'user') {
    return {
      id: vm.id,
      role: 'user',
      content: [{ type: 'text', text: vm.text }],
    };
  }
  const parts: ThreadMessageLike['content'] = [];
  const arr = parts as unknown as Array<Record<string, unknown>>;
  if (vm.text) arr.push({ type: 'text', text: vm.text });
  for (const tc of vm.toolCalls) {
    arr.push({
      type: 'tool-call',
      toolCallId: tc.callId,
      toolName: tc.toolName,
      args: tc.args,
      result: tc.result,
    });
  }
  return {
    id: vm.id,
    role: 'assistant',
    content: parts,
  };
}

export function useChatRuntime(session: UseChatSession) {
  const viewMessages = useMemo(
    () => buildViewMessages(session.state.messages),
    [session.state.messages],
  );
  const suggestions = useMemo(
    () => deriveSuggestions(session.state.messages).map((prompt) => ({ prompt })),
    [session.state.messages],
  );

  const onNew = useCallback(
    async (message: AppendMessage): Promise<void> => {
      // We only support plain text user input in MVP — pull the first
      // text part. assistant-ui's composer doesn't emit non-text parts
      // unless attachments are wired up.
      const text = message.content
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join('')
        .trim();
      if (!text) return;
      await session.send(text);
    },
    [session],
  );

  // Adapter expects `() => Promise<void>` even though our cancel is sync;
  // return the resolved promise instead of marking the arrow async (which
  // ESLint's `require-await` would flag for having no await).
  const onCancel = useCallback((): Promise<void> => {
    session.cancel();
    return Promise.resolve();
  }, [session]);

  const adapter: ExternalStoreAdapter<ViewMessage> = {
    messages: viewMessages,
    isRunning: session.state.isStreaming,
    convertMessage: convertViewMessage,
    suggestions,
    onNew,
    onCancel,
  };

  return useExternalStoreRuntime(adapter);
}
