/**
 * Drives one chat conversation: holds the message log, dispatches user
 * turns through the configured provider, executes any tool calls the
 * model requests, and loops until the model returns text instead of more
 * tool calls. A loop cap keeps a misbehaving model from spinning forever.
 *
 * Stateless across mounts in MVP — conversations don't persist yet.
 */

import { useCallback, useRef, useState } from 'react';
import { resolveProvider } from '@/features/ai/providers/registry';
import { TOOLS, getToolByName } from '@/features/ai/tools/catalog';
import { buildSystemPrompt } from '@/features/ai/prompts/systemPrompt';
import { todayLocalDateString } from '@/data/calendarDate';
import type { AIMessage, AIToolCall } from '@/features/ai/providers/types';

const MAX_TOOL_LOOPS = 6;

export interface ChatSessionState {
  messages: AIMessage[];
  isStreaming: boolean;
  error: string | null;
}

export interface UseChatSession {
  state: ChatSessionState;
  send(text: string): Promise<void>;
  reset(): void;
  cancel(): void;
}

export function useChatSession(): UseChatSession {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      setError(null);
      const provider = await resolveProvider();
      if (!provider) {
        setError(
          'No AI provider configured. Set a Gemini API key in Settings → AI to start chatting.',
        );
        return;
      }
      const system: AIMessage = {
        role: 'system',
        content: buildSystemPrompt(todayLocalDateString()),
      };
      const userMsg: AIMessage = { role: 'user', content: trimmed };
      const baseTranscript: AIMessage[] = [...messages, userMsg];
      setMessages(baseTranscript);
      setIsStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        let working: AIMessage[] = [system, ...baseTranscript];
        for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
          const res = await provider.send({
            messages: working,
            tools: TOOLS,
            signal: ctrl.signal,
          });
          // Append the new assistant turn(s) — strip the system prompt
          // before exposing to the UI; that's an implementation detail.
          const newMsgs = res.messages;
          working = [...working, ...newMsgs];
          setMessages((cur) => [...cur, ...newMsgs]);

          const last = newMsgs[newMsgs.length - 1];
          if (!last) break;
          if (!last.toolCalls || last.toolCalls.length === 0) {
            // Plain assistant text — turn complete.
            return;
          }
          // Execute each tool call, append the responses, and loop.
          const toolResponses: AIMessage[] = [];
          for (const call of last.toolCalls) {
            const out = await runTool(call);
            toolResponses.push({
              role: 'tool',
              content: JSON.stringify(out),
              toolCallId: call.id,
            });
          }
          working = [...working, ...toolResponses];
          setMessages((cur) => [...cur, ...toolResponses]);
        }
        setError(
          'The assistant called tools more than six times in a row without answering. Stopped to avoid a runaway loop — try rephrasing or asking a narrower question.',
        );
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return;
        setError(formatError(e));
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  return {
    state: { messages, isStreaming, error },
    send,
    reset,
    cancel,
  };
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
