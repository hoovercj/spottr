/**
 * Per-turn follow-up suggestions surfaced as tappable chips below the
 * thread. Templated from the last assistant turn — no extra LLM call.
 *
 * Empty conversation → three onboarding prompts.
 * After a tool call → 1-2 follow-ups that natural continue from that
 * tool's output ("show me the most recent session" after
 * list_recent_sessions, "how does that compare in 8-12" after a 5x5
 * progress series, etc.).
 * No assistant turn yet / unknown tool → empty (no chips).
 */

import type { AIMessage } from '@/features/ai/providers/types';

const EMPTY_STATE_PROMPTS: ReadonlyArray<string> = [
  "What's my squat PR?",
  'How has my volume trended over the past 8 weeks?',
  "What did I lift this week?",
];

export function deriveSuggestions(messages: AIMessage[]): string[] {
  if (messages.length === 0) return [...EMPTY_STATE_PROMPTS];

  // Walk backwards to the last assistant message and inspect its tool calls.
  let lastAssistant: AIMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'assistant') {
      lastAssistant = m;
      break;
    }
  }
  if (!lastAssistant) return [];

  const calls = lastAssistant.toolCalls ?? [];
  // Use the most recent tool call as the basis for follow-ups; if there
  // are multiple, the user is more likely to follow up on the latest.
  const lastCall = calls[calls.length - 1];
  if (!lastCall) {
    // Plain text answer with no tools. Offer a generic deeper-cut prompt.
    return ['Show me my recent sessions.'];
  }

  switch (lastCall.name) {
    case 'list_recent_sessions':
      return [
        'Show me details for the most recent session.',
        'How has my volume trended over those weeks?',
      ];
    case 'get_session_detail':
      return [
        'How does this session compare to my last one for the same workout?',
        "What's my PR on the heaviest lift here?",
      ];
    case 'get_variant_history':
      return [
        "What's my PR for this lift?",
        'How does this compare across other rep ranges?',
      ];
    case 'get_progress_series':
      return [
        "What's my all-time PR for this?",
        'Show me the weekly volume for this lift family.',
      ];
    case 'get_prs':
      return [
        'How has this trended over the past 8 weeks?',
        'Show me my weekly volume.',
      ];
    case 'get_weekly_volume':
      return [
        "Which lift family contributed most to that volume?",
        'Am I trending up or holding steady?',
      ];
    case 'get_active_routine':
      return [
        'What did I actually do this week vs the plan?',
        'How am I trending on the first lift of each day?',
      ];
    case 'list_chartable_buckets':
      // The model usually calls this as a precursor; suggesting a
      // follow-up here would be redundant with whatever it's about to
      // do next.
      return [];
    default:
      return [];
  }
}
