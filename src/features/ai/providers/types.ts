/**
 * Provider-agnostic chat + tool-use interface.
 *
 * The MVP ships only the Gemini implementation, but every concept here is
 * the lowest-common-denominator across Gemini / Anthropic / OpenAI: a
 * sequence of `AIMessage`s in, a fresh tail of `AIMessage`s out, with tools
 * declared in a canonical JSON-Schema shape and translated per provider.
 *
 * Mutations are deliberately out of scope for MVP; `ToolSpec.mutates` and
 * `ToolSpec.risk` exist now so the surrounding plumbing (confirmation,
 * undo) can be added later without rewriting the adapter.
 */

/**
 * Minimal JSON Schema shape sufficient for tool argument declarations.
 * We don't try to model the entire spec — providers (Gemini in particular)
 * reject `oneOf`/`anyOf`/`$ref` anyway, so keeping the surface narrow makes
 * the per-provider translators safer.
 */
export interface ToolJsonSchema {
  type: 'object';
  description?: string;
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolPropertySchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: ReadonlyArray<string | number>;
  items?: ToolPropertySchema;
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
  format?: string;
}

export type ToolRisk = 'read' | 'low' | 'high';

export interface ToolCtx {
  /** ISO date the user's "now" is anchored to. Lets tools deterministically resolve "this week". */
  now: string;
}

export interface ToolSpec<TArgs = Record<string, unknown>, TResult = unknown> {
  /** snake_case, stable wire id passed to the model. */
  name: string;
  description: string;
  /** Provider-neutral JSON Schema for the arguments. */
  jsonSchema: ToolJsonSchema;
  /** True if the tool persists state. Read tools are false. */
  mutates: boolean;
  /** Used by the phase-2 confirmation router; harmless metadata in MVP. */
  risk: ToolRisk;
  run(args: TArgs, ctx: ToolCtx): Promise<TResult>;
}

export type AIRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AIMessage {
  role: AIRole;
  /** Text content. Empty string when an assistant turn only emits tool calls. */
  content: string;
  /** Present on assistant turns that requested tool execution. */
  toolCalls?: AIToolCall[];
  /** Present on `role: 'tool'` messages — references the call this is a response to. */
  toolCallId?: string;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AISendRequest {
  messages: AIMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

export interface AISendResult {
  /** New messages produced this turn (assistant + any tool calls it requested). */
  messages: AIMessage[];
  usage?: AIUsage;
}

export type ProviderId = 'gemini' | 'claude' | 'openai';

export interface AIProvider {
  id: ProviderId;
  defaultModel: string;
  /** One round-trip to the provider — does not loop on tool calls. */
  send(req: AISendRequest): Promise<AISendResult>;
}
