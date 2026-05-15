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
import { newId } from '@/data/ids';
import type { AIMessage, AIToolCall } from '@/features/ai/providers/types';

/**
 * Each assistant turn gets a stable client-generated id so the streaming
 * patch can replace the same row in `messages` without identity churn —
 * critical to keep assistant-ui's tool-call accordions from re-mounting
 * on every chunk.
 */
function newAssistantId(): string {
  return `asst-${newId()}`;
}

function newToolMessageId(): string {
  return `tool-${newId()}`;
}

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
  /** Alias for `cancel` — reads more naturally from a Stop button. */
  stop(): void;
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
      const userMsg: AIMessage = {
        id: `user-${newId()}`,
        role: 'user',
        content: trimmed,
      };
      const baseTranscript: AIMessage[] = [...messages, userMsg];
      setMessages(baseTranscript);
      setIsStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        // `working` is the model-facing transcript (includes the system
        // prompt). `userVisible` (= setMessages) excludes it.
        let working: AIMessage[] = [system, ...baseTranscript];
        for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
          // Reserve a stable assistant message row up front so the
          // streaming patch always updates the same identity. The row
          // starts empty and fills in via onProgress.
          const assistantId = newAssistantId();
          const placeholder: AIMessage = {
            id: assistantId,
            role: 'assistant',
            content: '',
          };
          setMessages((cur) => [...cur, placeholder]);

          let finalMsg: AIMessage = placeholder;
          const res = await provider.send({
            messages: working,
            tools: TOOLS,
            signal: ctrl.signal,
            onProgress: (partial) => {
              finalMsg = { ...placeholder, ...partial, id: assistantId };
              setMessages((cur) => replaceById(cur, assistantId, finalMsg));
            },
          });
          // Providers may return the full assistant turn in `messages[0]`;
          // prefer that as the canonical final state if richer than
          // what we've streamed.
          const last = res.messages[res.messages.length - 1];
          if (last) {
            finalMsg = { ...placeholder, ...last, id: assistantId };
            setMessages((cur) => replaceById(cur, assistantId, finalMsg));
          }
          working = [...working, finalMsg];

          if (!finalMsg.toolCalls || finalMsg.toolCalls.length === 0) {
            return; // plain assistant text — done
          }

          // Execute each tool call, append responses, loop.
          const toolResponses: AIMessage[] = [];
          for (const call of finalMsg.toolCalls) {
            const out = await runTool(call);
            toolResponses.push({
              id: newToolMessageId(),
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
    stop: cancel,
  };
}

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
