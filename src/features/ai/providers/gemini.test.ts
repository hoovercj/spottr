import { describe, expect, it } from 'vitest';
import { parseSseStream } from '@/features/ai/providers/gemini';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('parseSseStream', () => {
  it('yields one event per `data:` block separated by blank lines', async () => {
    const events = await collect(
      parseSseStream(streamFrom([`data: {"a":1}\n\ndata: {"b":2}\n\n`])),
    );
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('handles events split across read chunks', async () => {
    const events = await collect(
      parseSseStream(streamFrom(['data: {"piece":"on', 'e"}\n', '\ndata: {"piece":"two"}\n\n'])),
    );
    expect(events).toEqual(['{"piece":"one"}', '{"piece":"two"}']);
  });

  it('handles \\r\\n line endings the same as \\n', async () => {
    const events = await collect(
      parseSseStream(streamFrom([`data: {"x":1}\r\n\r\ndata: {"y":2}\r\n\r\n`])),
    );
    expect(events).toEqual(['{"x":1}', '{"y":2}']);
  });

  it('joins multi-line data blocks with newlines per SSE spec', async () => {
    const events = await collect(
      parseSseStream(streamFrom([`data: line one\ndata: line two\n\n`])),
    );
    expect(events).toEqual(['line one\nline two']);
  });

  it('ignores comment lines (starting with `:`)', async () => {
    const events = await collect(parseSseStream(streamFrom([`: keep-alive\n\ndata: {"a":1}\n\n`])));
    expect(events).toEqual(['{"a":1}']);
  });

  it('flushes a final event that lacks a trailing blank line on stream end', async () => {
    // Some SSE providers don't bother with the terminator on the last
    // event. We force-close the buffer on EOF so nothing is lost.
    const events = await collect(parseSseStream(streamFrom([`data: {"final":true}\n`])));
    expect(events).toEqual(['{"final":true}']);
  });

  it('preserves UTF-8 multibyte sequences split across chunks', async () => {
    const enc = new TextEncoder();
    const heart = enc.encode('❤'); // 3 bytes
    const first = new Uint8Array([...enc.encode('data: {"t":"'), heart[0]!]);
    const second = new Uint8Array([heart[1]!, heart[2]!, ...enc.encode('"}\n\n')]);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(first);
        controller.enqueue(second);
        controller.close();
      },
    });
    const events = await collect(parseSseStream(stream));
    expect(events).toEqual(['{"t":"❤"}']);
  });
});
