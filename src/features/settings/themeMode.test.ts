import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetThemeModeForTest,
  applyThemeMode,
  getThemeMode,
  resolveScheme,
  setThemeMode,
  subscribeThemeMode,
} from '@/features/settings/themeMode';

const DOM_ATTR = 'data-mui-color-scheme';

function mockPrefersDark(prefersDark: boolean): {
  setPrefersDark: (next: boolean) => void;
  fireChange: () => void;
  restore: () => void;
} {
  let value = prefersDark;
  const handlers = new Set<(e: { matches: boolean }) => void>();
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => {
    if (!query.includes('prefers-color-scheme: dark')) {
      // Defer non-theme queries to a noop stub so unrelated callers
      // don't crash inside this test file.
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    }
    return {
      get matches() {
        return value;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, h: (e: { matches: boolean }) => void) => {
        handlers.add(h);
      },
      removeEventListener: (_: string, h: (e: { matches: boolean }) => void) => {
        handlers.delete(h);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
  return {
    setPrefersDark: (next: boolean) => {
      value = next;
    },
    fireChange: () => {
      for (const h of handlers) h({ matches: value });
    },
    restore: () => {
      window.matchMedia = original;
    },
  };
}

describe('themeMode', () => {
  let mq: ReturnType<typeof mockPrefersDark> | null = null;

  beforeEach(() => {
    _resetThemeModeForTest();
  });

  afterEach(() => {
    mq?.restore();
    mq = null;
    _resetThemeModeForTest();
  });

  it('defaults to "system" when nothing is stored', () => {
    expect(getThemeMode()).toBe('system');
  });

  it('round-trips a stored preference', () => {
    setThemeMode('dark');
    expect(getThemeMode()).toBe('dark');
    setThemeMode('light');
    expect(getThemeMode()).toBe('light');
    setThemeMode('system');
    expect(getThemeMode()).toBe('system');
  });

  it('ignores stale/unknown values in localStorage and falls back to "system"', () => {
    window.localStorage.setItem('spottr:themeMode', 'rainbow');
    expect(getThemeMode()).toBe('system');
  });

  it('resolveScheme returns the explicit value for light/dark', () => {
    expect(resolveScheme('light')).toBe('light');
    expect(resolveScheme('dark')).toBe('dark');
  });

  it('resolveScheme reads prefers-color-scheme for "system"', () => {
    mq = mockPrefersDark(true);
    expect(resolveScheme('system')).toBe('dark');
    mq.setPrefersDark(false);
    expect(resolveScheme('system')).toBe('light');
  });

  it('applyThemeMode writes the chosen scheme to <html data-mui-color-scheme>', () => {
    applyThemeMode('light');
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('light');
    applyThemeMode('dark');
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('dark');
  });

  it('applyThemeMode("system") writes the resolved scheme AND listens for OS changes', () => {
    mq = mockPrefersDark(false);
    applyThemeMode('system');
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('light');

    // OS flips to dark — attribute should follow.
    mq.setPrefersDark(true);
    mq.fireChange();
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('dark');
  });

  it('explicit light/dark stops following the OS', () => {
    mq = mockPrefersDark(true);
    setThemeMode('light');
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('light');
    // OS dark notification should NOT flip back.
    mq.fireChange();
    expect(document.documentElement.getAttribute(DOM_ATTR)).toBe('light');
  });

  it('subscribers fire when the mode changes via setThemeMode', () => {
    const seen: string[] = [];
    const unsub = subscribeThemeMode((m) => seen.push(m));
    setThemeMode('dark');
    setThemeMode('light');
    unsub();
    setThemeMode('system'); // no longer observed
    expect(seen).toEqual(['dark', 'light']);
  });
});
