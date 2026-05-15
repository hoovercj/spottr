/**
 * Translate our canonical JSON Schema into the subset Google's Gemini API
 * accepts on `FunctionDeclaration.parameters`. Gemini rejects `$ref`,
 * `oneOf`/`anyOf`, and `additionalProperties` — we strip all three and
 * pass through the rest unchanged. The canonical schemas in
 * `features/ai/tools/*` are written narrowly enough that this is a no-op
 * for them today, but the stripping keeps us safe as the catalog grows.
 */

import type { ToolJsonSchema, ToolPropertySchema } from '@/features/ai/providers/types';

export interface GeminiParameterSchema {
  type: string;
  description?: string;
  properties?: Record<string, GeminiParameterSchema>;
  required?: string[];
  items?: GeminiParameterSchema;
  enum?: ReadonlyArray<string | number>;
  format?: string;
}

export function toGeminiSchema(schema: ToolJsonSchema): GeminiParameterSchema {
  const out: GeminiParameterSchema = { type: 'object' };
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = translateProperty(v);
    }
  }
  if (schema.required && schema.required.length > 0) out.required = [...schema.required];
  return out;
}

function translateProperty(p: ToolPropertySchema): GeminiParameterSchema {
  const out: GeminiParameterSchema = { type: p.type };
  if (p.description) out.description = p.description;
  if (p.enum) out.enum = [...p.enum];
  if (p.format) out.format = p.format;
  if (p.items) out.items = translateProperty(p.items);
  if (p.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(p.properties)) {
      out.properties[k] = translateProperty(v);
    }
  }
  if (p.required && p.required.length > 0) out.required = [...p.required];
  return out;
}
