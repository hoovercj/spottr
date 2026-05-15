/**
 * Gemini provider for the AI chat. Hits Google AI Studio's
 * `generativelanguage.googleapis.com` Generative Language API directly from
 * the browser (Vertex AI is NOT supported — its CORS / auth model differs).
 *
 * One `send()` call = one model turn. The chat session orchestrator loops
 * over `send()` until the assistant returns text instead of tool calls, so
 * keeping this single-shot keeps the provider boundary clean.
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

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiTextPart[] };
  tools?: GeminiTool[];
}

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
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;
  readonly defaultModel: string;
  readonly #apiKey: string;
  readonly #model: string;

  constructor(opts: GeminiProviderOptions) {
    if (!opts.apiKey) throw new Error('GeminiProvider requires a non-empty apiKey');
    this.#apiKey = opts.apiKey;
    this.#model = opts.model ?? 'gemini-2.5-flash';
    this.defaultModel = this.#model;
  }

  async send(req: AISendRequest): Promise<AISendResult> {
    const body = buildRequestBody(req.messages, req.tools);
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
