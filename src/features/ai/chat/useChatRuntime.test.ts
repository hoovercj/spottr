import { describe, expect, it } from 'vitest';
import { buildViewMessages } from '@/features/ai/chat/useChatRuntime';
import type { AIMessage } from '@/features/ai/providers/types';

describe('buildViewMessages', () => {
  it('drops system messages', () => {
    const view = buildViewMessages([
      { id: 's1', role: 'system', content: 'sys' },
      { id: 'u1', role: 'user', content: 'hi' },
    ]);
    expect(view).toHaveLength(1);
    expect(view[0]!.role).toBe('user');
  });

  it('maps user + plain-text assistant 1:1', () => {
    const messages: AIMessage[] = [
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a1', role: 'assistant', content: 'hello back' },
    ];
    const view = buildViewMessages(messages);
    expect(view).toEqual([
      { id: 'u1', role: 'user', text: 'hi' },
      { id: 'a1', role: 'assistant', text: 'hello back', toolCalls: [] },
    ]);
  });

  it('merges a role:tool response into the preceding assistant turn tool-call part', () => {
    const messages: AIMessage[] = [
      { id: 'u1', role: 'user', content: 'history please' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'list_recent_sessions', args: { limit: 5 } }],
      },
      {
        id: 't1',
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({ sessions: [{ sessionId: 'sess-9' }] }),
      },
      { id: 'a2', role: 'assistant', content: 'here is your history.' },
    ];
    const view = buildViewMessages(messages);
    expect(view).toHaveLength(3);
    expect(view[0]!.role).toBe('user');
    expect(view[1]!.role).toBe('assistant');
    const assistant1 = view[1] as Extract<(typeof view)[number], { role: 'assistant' }>;
    expect(assistant1.toolCalls).toHaveLength(1);
    expect(assistant1.toolCalls[0]!.callId).toBe('call-1');
    expect(assistant1.toolCalls[0]!.toolName).toBe('list_recent_sessions');
    expect(assistant1.toolCalls[0]!.args).toEqual({ limit: 5 });
    expect(assistant1.toolCalls[0]!.result).toEqual({ sessions: [{ sessionId: 'sess-9' }] });
    expect(view[2]!.role).toBe('assistant');
  });

  it('keeps tool-result as raw string when not parseable JSON', () => {
    const messages: AIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-X', name: 'thing', args: {} }],
      },
      { id: 't1', role: 'tool', toolCallId: 'call-X', content: 'not json' },
    ];
    const view = buildViewMessages(messages);
    const assistant = view[0] as Extract<(typeof view)[number], { role: 'assistant' }>;
    expect(assistant.toolCalls[0]!.result).toBe('not json');
  });

  it('ignores a tool response whose toolCallId does not match anything', () => {
    const messages: AIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'a', args: {} }],
      },
      { id: 't1', role: 'tool', toolCallId: 'call-MISSING', content: '{}' },
    ];
    const view = buildViewMessages(messages);
    const assistant = view[0] as Extract<(typeof view)[number], { role: 'assistant' }>;
    expect(assistant.toolCalls[0]!.result).toBeUndefined();
  });
});
