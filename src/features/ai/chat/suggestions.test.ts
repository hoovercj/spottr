import { describe, expect, it } from 'vitest';
import { deriveSuggestions } from '@/features/ai/chat/suggestions';
import type { AIMessage } from '@/features/ai/providers/types';

function asstWithTool(name: string): AIMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: 'sure',
    toolCalls: [{ id: 'c1', name, args: {} }],
  };
}

describe('deriveSuggestions', () => {
  it('returns three onboarding prompts when the conversation is empty', () => {
    const s = deriveSuggestions([]);
    expect(s).toHaveLength(3);
    expect(s.every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
  });

  it('returns no suggestions when there is no assistant turn yet', () => {
    expect(deriveSuggestions([{ role: 'user', content: 'hi' }])).toEqual([]);
  });

  it('offers a deeper-cut prompt when the assistant answered without tools', () => {
    const s = deriveSuggestions([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(s).toEqual(['Show me my recent sessions.']);
  });

  it('offers session-detail follow-up after list_recent_sessions', () => {
    const s = deriveSuggestions([
      { role: 'user', content: 'this week?' },
      asstWithTool('list_recent_sessions'),
    ]);
    expect(s).toContain('Show me details for the most recent session.');
  });

  it('offers PR + cross-range follow-up after get_variant_history', () => {
    const s = deriveSuggestions([asstWithTool('get_variant_history')]);
    expect(s).toContain("What's my PR for this lift?");
  });

  it('offers PR + volume follow-up after get_progress_series', () => {
    const s = deriveSuggestions([asstWithTool('get_progress_series')]);
    expect(s).toContain("What's my all-time PR for this?");
  });

  it('offers trend + volume follow-up after get_prs', () => {
    const s = deriveSuggestions([asstWithTool('get_prs')]);
    expect(s).toContain('Show me my weekly volume.');
  });

  it('offers family-breakdown + trend follow-up after get_weekly_volume', () => {
    const s = deriveSuggestions([asstWithTool('get_weekly_volume')]);
    expect(s[0]).toContain('volume');
  });

  it('returns empty after list_chartable_buckets (precursor, not actionable on its own)', () => {
    expect(deriveSuggestions([asstWithTool('list_chartable_buckets')])).toEqual([]);
  });

  it('uses the most recent assistant message even if older assistant turns exist', () => {
    const s = deriveSuggestions([
      asstWithTool('list_recent_sessions'),
      { role: 'user', content: 'and then' },
      asstWithTool('get_prs'),
    ]);
    expect(s).toContain('Show me my weekly volume.');
  });

  it('inspects only the most recent toolCall of the latest assistant turn', () => {
    const s = deriveSuggestions([
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'c1', name: 'list_chartable_buckets', args: {} },
          { id: 'c2', name: 'get_progress_series', args: {} },
        ],
      },
    ]);
    expect(s).toContain("What's my all-time PR for this?");
  });
});
