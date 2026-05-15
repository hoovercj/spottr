/**
 * Gemini provider for the AI chat. Hits Google AI Studio's
 * `generativelanguage.googleapis.com` Generative Language API directly from
 * the browser (Vertex AI is NOT supported — its CORS / auth model differs).
 *
 * One `send()` call = one model turn. The chat session orchestrator loops
 * over `send()` until the assistant returns text instead of tool calls, so
 * keeping this single-shot keeps the provider boundary clean.
 *
 * When the caller passes `onProgress`, we use `:streamGenerateContent?alt=sse`
 * and emit a partial assistant message after each parsed event. Otherwise
 * we use the non-streaming `:generateContent` endpoint (slightly cheaper
 * to debug; also used by the Settings "Test connection" button).
 */

import type {
  AIMessage,
  AIProvider,
  AISendRequest,
  AISendResult,
  AIToolCall,
  ToolSpec,
} from '@/features/ai/providers/types';
import { toGeminiSchema, type GeminiParameterSchema } from '@/features/ai/providers/geminiSchema';
import { newId } from '@/data/ids';

const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiTextPart {
  text: string;
}
interface GeminiFunctionCallPart {
  functionCall: { name: string; args: Record<string, unknown> };
}
interface GeminiFunctionResponsePart {
  functionResponse: { name: string; response: { content: unknown } };
}
type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart;

interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: GeminiParameterSchema;
}

interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiGenerationConfig {
  temperature?: number;
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiTextPart[] };
  tools?: GeminiTool[];
  generationConfig?: GeminiGenerationConfig;
}

/**
 * Analysis-grade default: low enough that the coach doesn't take
 * creative liberties with numbers, high enough to allow some natural
 * sentence variation. Settable per-provider via GeminiProviderOptions
 * so a future Settings slider can override.
 */
const DEFAULT_TEMPERATURE = 0.4;

interface GeminiCandidate {
  content?: { role?: string; parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { code: number; message: string; status?: string };
}

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  /** Sampling temperature for the model. Defaults to `DEFAULT_TEMPERATURE`. */
  temperature?: number;
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly defaultModel: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #temperature: number;

  constructor(opts: GeminiProviderOptions) {
    if (!opts.apiKey) throw new Error('GeminiProvider requires a non-empty apiKey');
    this.#apiKey = opts.apiKey;
    this.#model = opts.model ?? 'gemini-2.5-flash';
    this.#temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
    this.defaultModel = this.#model;
  }

  async send(req: AISendRequest): Promise<AISendResult> {
    const body = buildRequestBody(req.messages, req.tools);
    body.generationConfig = { temperature: this.#temperature };
    if (req.onProgress) {
      return this.#sendStreaming(body, req.signal, req.onProgress);
    }
    const url = `${ENDPOINT_BASE}/${encodeURIComponent(this.#model)}:generateContent?key=${encodeURIComponent(this.#apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    const json = (await res.json()) as GeminiResponse;
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `Gemini HTTP ${res.status}`;
      throw new Error(`Gemini request failed: ${msg}`);
    }
    return decodeResponse(json);
  }

  async #sendStreaming(
    body: GeminiRequest,
    signal: AbortSignal | undefined,
    onProgress: (partial: AIMessage) => void,
  ): Promise<AISendResult> {
    const url = `${ENDPOINT_BASE}/${encodeURIComponent(this.#model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.#apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      // Non-2xx on the streaming endpoint returns a single JSON error.
      const errJson = (await res.json().catch(() => null)) as GeminiResponse | null;
      const msg = errJson?.error?.message ?? `Gemini HTTP ${res.status}`;
      throw new Error(`Gemini stream failed: ${msg}`);
    }
    if (!res.body) throw new Error('Gemini stream: no response body');

    // Accumulate text + tool calls across SSE events. Tool-call state must
    // live OUTSIDE the per-chunk loop (assistant-ui flickers if tool-call
    // parts blink in/out between chunks).
    let text = '';
    const toolCalls: AIToolCall[] = [];
    let lastUsage: AISendResult['usage'];

    for await (const chunk of parseSseStream(res.body)) {
      // Each SSE `data:` payload is a single GeminiResponse-shaped JSON.
      let parsed: GeminiResponse | null = null;
      try {
        parsed = JSON.parse(chunk) as GeminiResponse;
      } catch {
        // Skip malformed events; Gemini occasionally emits keep-alive
        // blank lines that our parser already filters, but we belt-and-
        // suspender it here.
        continue;
      }
      if (parsed.error) {
        throw new Error(`Gemini stream error: ${parsed.error.message}`);
      }
      const candidate = parsed.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      for (const p of parts) {
        if ('text' in p && typeof p.text === 'string') text += p.text;
        if ('functionCall' in p) {
          toolCalls.push({
            id: newId(),
            name: p.functionCall.name,
            args: p.functionCall.args ?? {},
          });
        }
      }
      if (parsed.usageMetadata) {
        lastUsage = {
          inputTokens: parsed.usageMetadata.promptTokenCount,
          outputTokens: parsed.usageMetadata.candidatesTokenCount,
        };
      }
      onProgress(makePartial(text, toolCalls));
    }

    return { messages: [makePartial(text, toolCalls)], usage: lastUsage };
  }
}

function makePartial(text: string, toolCalls: AIToolCall[]): AIMessage {
  const msg: AIMessage = { role: 'assistant', content: text };
  if (toolCalls.length > 0) msg.toolCalls = toolCalls;
  return msg;
}

/**
 * Yields each `data:` payload (one Gemini event = one JSON blob) from a
 * server-sent-events response body. Handles split UTF-8 codepoints across
 * chunk boundaries, multi-line data blocks, and ignores comments / empty
 * keep-alives.
 */
export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        // Decode any trailing bytes. SSE events terminate on a blank
        // line, but some providers omit the trailing one — force-close
        // the final event so a stream that ends mid-buffer still emits
        // anything its buffer contains.
        buffer += decoder.decode();
        if (buffer.length > 0 && !/\n\n$|\r\n\r\n$/.test(buffer)) {
          buffer += '\n\n';
        }
        const tail = popEvents(buffer);
        for (const e of tail.events) yield e;
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const out = popEvents(buffer);
      buffer = out.remainder;
      for (const e of out.events) yield e;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * SSE events are separated by a blank line ("\n\n" or "\r\n\r\n"). Each
 * event is a set of `field: value` lines; we only care about `data:`,
 * which may repeat across multiple lines (joined by "\n" per the spec).
 */
function popEvents(buffer: string): { events: string[]; remainder: string } {
  const events: string[] = [];
  // Normalize \r\n → \n so the splitter handles both.
  const normalized = buffer.replace(/\r\n/g, '\n');
  let rest = normalized;
  let idx = rest.indexOf('\n\n');
  while (idx >= 0) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const data = extractData(raw);
    if (data) events.push(data);
    idx = rest.indexOf('\n\n');
  }
  return { events, remainder: rest };
}

function extractData(rawEvent: string): string | null {
  const lines = rawEvent.split('\n');
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('data:')) {
      // Per spec, the value is everything after a single leading space.
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join('\n');
}

function buildRequestBody(messages: AIMessage[], tools: ToolSpec[]): GeminiRequest {
  const systemTexts: string[] = [];
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) systemTexts.push(m.content);
      continue;
    }
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.args } });
        }
      }
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
      continue;
    }
    if (m.role === 'tool') {
      // Gemini calls these "function" responses. The `name` must match the
      // most recent functionCall; we lift the tool name out of the matching
      // assistant turn by reading the call we replied to.
      const callName = findCallNameForResponse(messages, m.toolCallId);
      contents.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: callName ?? 'unknown',
              response: { content: safeParseJson(m.content) ?? m.content },
            },
          },
        ],
      });
    }
  }

  const body: GeminiRequest = { contents };
  if (systemTexts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemTexts.join('\n\n') }] };
  }
  if (tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: toGeminiSchema(t.jsonSchema),
        })),
      },
    ];
  }
  return body;
}

function findCallNameForResponse(messages: AIMessage[], toolCallId?: string): string | null {
  if (!toolCallId) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== 'assistant' || !m.toolCalls) continue;
    const hit = m.toolCalls.find((tc) => tc.id === toolCallId);
    if (hit) return hit.name;
  }
  return null;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function decodeResponse(json: GeminiResponse): AISendResult {
  const candidate = json.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  let text = '';
  const toolCalls: AIToolCall[] = [];
  for (const p of parts) {
    if ('text' in p && p.text) text += p.text;
    if ('functionCall' in p) {
      toolCalls.push({
        id: newId(),
        name: p.functionCall.name,
        args: p.functionCall.args ?? {},
      });
    }
  }
  const assistant: AIMessage = { role: 'assistant', content: text };
  if (toolCalls.length > 0) assistant.toolCalls = toolCalls;
  return {
    messages: [assistant],
    usage: {
      inputTokens: json.usageMetadata?.promptTokenCount,
      outputTokens: json.usageMetadata?.candidatesTokenCount,
    },
  };
}
