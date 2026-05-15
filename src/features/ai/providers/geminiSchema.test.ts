import { describe, expect, it } from 'vitest';
import { toGeminiSchema } from '@/features/ai/providers/geminiSchema';
import type { ToolJsonSchema } from '@/features/ai/providers/types';

describe('toGeminiSchema', () => {
  it('passes top-level object through with description and required preserved', () => {
    const schema: ToolJsonSchema = {
      type: 'object',
      description: 'A tool',
      properties: {
        name: { type: 'string', description: 'The name' },
        count: { type: 'integer' },
      },
      required: ['name'],
    };
    expect(toGeminiSchema(schema)).toEqual({
      type: 'object',
      description: 'A tool',
      properties: {
        name: { type: 'string', description: 'The name' },
        count: { type: 'integer' },
      },
      required: ['name'],
    });
  });

  it('translates nested object properties recursively', () => {
    const schema: ToolJsonSchema = {
      type: 'object',
      properties: {
        bucket: {
          type: 'object',
          properties: {
            variantId: { type: 'string' },
            repMin: { type: 'integer' },
          },
          required: ['variantId'],
        },
      },
    };
    const out = toGeminiSchema(schema);
    expect(out.properties?.bucket).toEqual({
      type: 'object',
      properties: {
        variantId: { type: 'string' },
        repMin: { type: 'integer' },
      },
      required: ['variantId'],
    });
  });

  it('translates array item types', () => {
    const schema: ToolJsonSchema = {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };
    expect(toGeminiSchema(schema).properties?.ids).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('omits empty required arrays', () => {
    const schema: ToolJsonSchema = {
      type: 'object',
      properties: { x: { type: 'string' } },
      required: [],
    };
    const out = toGeminiSchema(schema);
    expect(out.required).toBeUndefined();
  });

  it('does not emit additionalProperties (Gemini rejects it)', () => {
    const schema: ToolJsonSchema = {
      type: 'object',
      properties: {},
      additionalProperties: false,
    };
    const out = toGeminiSchema(schema);
    expect('additionalProperties' in out).toBe(false);
  });

  it('passes enum values through on string and integer fields', () => {
    const schema: ToolJsonSchema = {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['short', 'long'] },
        n: { type: 'integer', enum: [1, 2, 3] },
      },
    };
    const out = toGeminiSchema(schema);
    expect(out.properties?.mode?.enum).toEqual(['short', 'long']);
    expect(out.properties?.n?.enum).toEqual([1, 2, 3]);
  });
});
