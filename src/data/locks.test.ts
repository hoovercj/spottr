import { afterEach, describe, expect, it } from 'vitest';
import { withWriteLock } from '@/data/locks';

describe('withWriteLock', () => {
  afterEach(() => {
    delete (globalThis.navigator as { locks?: unknown }).locks;
  });

  it('propagates errors thrown inside the locked function', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/require-await
      withWriteLock('err-test', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('falls back to a direct invocation when navigator.locks is unavailable', async () => {
    expect((globalThis.navigator as { locks?: unknown }).locks).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/require-await
    const out = await withWriteLock('no-locks', async () => 42);
    expect(out).toBe(42);
  });

  it('serializes concurrent invocations when navigator.locks is present', async () => {
    // Minimal LockManager mock — exclusive lock per name, queued.
    const queues = new Map<string, Promise<unknown>>();
    (globalThis.navigator as { locks?: unknown }).locks = {
      request(
        name: string,
        _opts: unknown,
        cb: (lock: unknown) => Promise<unknown>,
      ): Promise<unknown> {
        const prev = queues.get(name) ?? Promise.resolve();
        const next = prev.then(() => cb({}));
        queues.set(
          name,
          next.catch(() => undefined),
        );
        return next;
      },
    };

    const order: string[] = [];
    const slow = async () => {
      order.push('slow-start');
      await new Promise((r) => setTimeout(r, 25));
      order.push('slow-end');
      return 'slow';
    };
    // eslint-disable-next-line @typescript-eslint/require-await
    const fast = async () => {
      order.push('fast-start');
      order.push('fast-end');
      return 'fast';
    };

    const a = withWriteLock('seq', slow);
    const b = withWriteLock('seq', fast);

    const [resA, resB] = await Promise.all([a, b]);
    expect(resA).toBe('slow');
    expect(resB).toBe('fast');
    expect(order).toEqual(['slow-start', 'slow-end', 'fast-start', 'fast-end']);
  });
});
