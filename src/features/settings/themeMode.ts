/**
 * Per-device color-scheme preference: System / Light / Dark.
 *
 * Stored in `localStorage` (not Dexie meta) so we can read it
 * synchronously before React renders — otherwise the app flashes the
 * default theme on every load while waiting for the IDB transaction to
 * resolve. localStorage's sync API is exactly the right tool for a UI
 * preference that has to be applied to `<html>` before paint.
 *
 * The MUI theme is configured with `colorSchemeSelector: 'data'`, so
 * setting `data-mui-color-scheme` on `<html>` is what actually flips
 * the look. When the user picks "System", we resolve via
 * `matchMedia('(prefers-color-scheme: dark)')` and listen for changes
 * so flipping the OS theme also flips the app live.
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedColorScheme = 'light' | 'dark';

const LS_KEY = 'spottr:themeMode';
const DOM_ATTR = 'data-mui-color-scheme';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getThemeMode(): ThemeMode {
  if (!hasLocalStorage()) return 'system';
  const v = window.localStorage.getItem(LS_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function resolveScheme(mode: ThemeMode): ResolvedColorScheme {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light';
}

// Pub-sub so any open <Settings> picker reflects an external change.
const listeners = new Set<(mode: ThemeMode) => void>();

export function subscribeThemeMode(cb: (mode: ThemeMode) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Lazily-installed listener for the OS scheme. We keep it live only
// while the user's preference is "system" — explicit light/dark
// preferences don't need it.
let detachMediaListener: (() => void) | null = null;

function ensureSystemListener(): void {
  if (detachMediaListener) return;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const mq = window.matchMedia(SYSTEM_QUERY);
  const handler = () => {
    // Only react if the user is still in 'system' mode by the time the
    // OS scheme changes — they may have flipped to explicit since the
    // listener was attached.
    if (getThemeMode() !== 'system') return;
    document.documentElement.setAttribute(DOM_ATTR, mq.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', handler);
  detachMediaListener = () => mq.removeEventListener('change', handler);
}

function teardownSystemListener(): void {
  detachMediaListener?.();
  detachMediaListener = null;
}

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveScheme(mode);
  document.documentElement.setAttribute(DOM_ATTR, resolved);
  if (mode === 'system') {
    ensureSystemListener();
  } else {
    teardownSystemListener();
  }
}

export function setThemeMode(mode: ThemeMode): void {
  if (hasLocalStorage()) window.localStorage.setItem(LS_KEY, mode);
  applyThemeMode(mode);
  for (const cb of listeners) cb(mode);
}

/* ----------------------------------------------------------------------- */
/* Test-only helpers                                                        */
/* ----------------------------------------------------------------------- */

export function _resetThemeModeForTest(): void {
  teardownSystemListener();
  listeners.clear();
  if (hasLocalStorage()) window.localStorage.removeItem(LS_KEY);
  if (typeof document !== 'undefined') document.documentElement.removeAttribute(DOM_ATTR);
}
