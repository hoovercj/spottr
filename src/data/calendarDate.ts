/**
 * YYYY-MM-DD local-time date helpers. The app deliberately uses local-time
 * date strings (not UTC) for the routine-week view so that a Monday-night
 * workout doesn't drift to Tuesday in negative-UTC time zones.
 */

/** YYYY-MM-DD for the supplied Date in the user's local time zone. */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns the YYYY-MM-DD of "today" in the user's local time. */
export function todayLocalDateString(): string {
  return toLocalDateString(new Date());
}

/** Parses a YYYY-MM-DD string into a local-time Date at 00:00. */
export function parseLocalDate(date: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Invalid YYYY-MM-DD string: ${date}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whole-day difference (b - a) treating both as local-time YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const da = parseLocalDate(a).getTime();
  const db = parseLocalDate(b).getTime();
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

/** Adds `n` days (may be negative) to a YYYY-MM-DD, returning a new YYYY-MM-DD. */
export function addDays(date: string, n: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + n);
  return toLocalDateString(d);
}

/**
 * Returns the most recent Monday on-or-before the given date as YYYY-MM-DD.
 * Used to seed `Program.anchorDate` for the default PPL routine.
 */
export function mostRecentMonday(date: Date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): Sunday=0, Monday=1, ..., Saturday=6.
  const dow = local.getDay();
  const offset = dow === 0 ? 6 : dow - 1; // days since Monday
  local.setDate(local.getDate() - offset);
  return toLocalDateString(local);
}

/** Three-letter abbreviated weekday label (Mon, Tue, ...) for a YYYY-MM-DD. */
export function shortDayLabel(date: string): string {
  return parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' });
}
