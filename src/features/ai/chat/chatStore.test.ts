import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDbForTest, getDb } from '@/data/db';
import {
  _flushChatStorePersistForTest,
  _resetChatStoreForTest,
  useChatStore,
} from '@/features/ai/chat/chatStore';
import type { AIMessage } from '@/features/ai/providers/types';

const PERSIST_KEY = 'ai:conversation';

describe('chatStore persistence', () => {
  beforeEach(() => {
    _resetDbForTest(`wb-test-${Math.random().toString(36).slice(2)}`);
    _resetChatStoreForTest();
  });

  afterEach(async () => {
    _resetChatStoreForTest();
    await getDb().delete();
  });

  it('hydrates from an empty meta row', async () => {
    await useChatStore.getState().hydrate();
    expect(useChatStore.getState().isHydrated).toBe(true);
    expect(useChatStore.getState().messages).toEqual([]);
  });

  it('hydrates from a stored conversation', async () => {
    const stored: AIMessage[] = [
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a1', role: 'assistant', content: 'hello' },
    ];
    await getDb().meta.put({ key: PERSIST_KEY, value: stored });
    await useChatStore.getState().hydrate();
    expect(useChatStore.getState().messages).toEqual(stored);
  });

  it('persists messages on change after hydration', async () => {
    await useChatStore.getState().hydrate();
    const messages: AIMessage[] = [
      { id: 'u1', role: 'user', content: 'first turn' },
    ];
    useChatStore.setState({ messages });
    // The persistence subscriber debounces; flush it explicitly.
    await _flushChatStorePersistForTest();
    const row = await getDb().meta.get(PERSIST_KEY);
    expect(row?.value).toEqual(messages);
  });

  it('does NOT persist while not yet hydrated (avoids clobbering stored data with empty defaults)', async () => {
    // Seed storage. If a mutation arrived BEFORE hydrate finishes, the
    // subscriber must not write the empty initial state over the top.
    const stored: AIMessage[] = [{ id: 'u1', role: 'user', content: 'kept' }];
    await getDb().meta.put({ key: PERSIST_KEY, value: stored });
    // Force a setState before hydrate.
    useChatStore.setState({ messages: [] });
    await _flushChatStorePersistForTest();
    const row = await getDb().meta.get(PERSIST_KEY);
    expect(row?.value).toEqual(stored);
  });

  it('reset() clears both the store and the stored meta row', async () => {
    await useChatStore.getState().hydrate();
    useChatStore.setState({
      messages: [{ id: 'u1', role: 'user', content: 'gone soon' }],
    });
    await _flushChatStorePersistForTest();
    expect((await getDb().meta.get(PERSIST_KEY))?.value).toBeDefined();

    await useChatStore.getState().reset();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(await getDb().meta.get(PERSIST_KEY)).toBeUndefined();
  });

  it('persisted messages survive an in-memory store reset', async () => {
    // Simulates: app loads, conversation grows, page reloads → new
    // store instance must rehydrate the same conversation.
    await useChatStore.getState().hydrate();
    const messages: AIMessage[] = [
      { id: 'u1', role: 'user', content: 'hello' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'fake_tool', args: { x: 1 } }],
      },
      { id: 't1', role: 'tool', toolCallId: 'call-1', content: '{"ok":true}' },
    ];
    useChatStore.setState({ messages });
    await _flushChatStorePersistForTest();

    // Wipe the in-memory store (simulate fresh module load) but keep
    // IndexedDB intact.
    _resetChatStoreForTest();
    expect(useChatStore.getState().messages).toEqual([]);

    await useChatStore.getState().hydrate();
    expect(useChatStore.getState().messages).toEqual(messages);
  });
});
