import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useCompletedSessions, sessionMonthKey } from '@/features/history/queries';
import type { CompletedSessionView } from '@/features/history/queries';
import { parseLocalDate, todayLocalDateString } from '@/data/calendarDate';
import { useExportStatus } from '@/features/export/hooks';

type ViewMode = 'feed' | 'calendar';

/**
 * Browser back-navigation preserves component state for a freshly-mounted
 * History only if we restore it ourselves. sessionStorage outlives the
 * unmount that happens when the user opens a workout detail; useLayoutEffect
 * restores the scroll position before paint so there's no flash at the top.
 */
const VIEW_STORAGE_KEY = 'history:view';
const SCROLL_STORAGE_KEY = 'history:scrollTop';

function readStoredView(): ViewMode {
  try {
    const v = sessionStorage.getItem(VIEW_STORAGE_KEY);
    return v === 'calendar' ? 'calendar' : 'feed';
  } catch {
    return 'feed';
  }
}
function readStoredScroll(): number {
  try {
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function History() {
  const sessions = useCompletedSessions();
  const [view, setView] = useState<ViewMode>(() => readStoredView());
  const navigate = useNavigate();
  const status = useExportStatus();
  const lastExportRelative = status?.lastOk ? formatRelative(status.lastOk.timestamp) : null;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);

  // Persist view choice.
  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Track scroll position so the back nav can restore it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      try {
        sessionStorage.setItem(SCROLL_STORAGE_KEY, String(el.scrollTop));
      } catch {
        /* ignore */
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Restore scroll once content has rendered (sessions resolved). Run before
  // paint to avoid a flash at the top of the list.
  useLayoutEffect(() => {
    if (restoredRef.current) return;
    if (!sessions) return; // wait for data to render
    const el = scrollRef.current;
    if (!el) return;
    const target = readStoredScroll();
    if (target > 0) el.scrollTop = target;
    restoredRef.current = true;
  }, [sessions, view]);

  const openSession = (sessionId: string) =>
    navigate(`/session/${sessionId}`, { state: { origin: '/history' } });

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
      }}
    >
      {/* Fixed header */}
      <Box
        sx={{
          flexShrink: 0,
          px: 3,
          pt: 3,
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', columnGap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h1">History</Typography>
            {lastExportRelative && (
              <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.7 }}>
                last sync {lastExportRelative}
              </Typography>
            )}
          </Box>
          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            onChange={(_e, next: ViewMode | null) => {
              if (next) setView(next);
            }}
            aria-label="History view"
          >
            <ToggleButton value="feed">Feed</ToggleButton>
            <ToggleButton value="calendar">Calendar</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Box>

      {/* Scrollable body */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: 3,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {sessions === undefined && (
          <Typography variant="body2" color="text.secondary">
            Loading…
          </Typography>
        )}

        {sessions && sessions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No workouts logged yet. Start one when you're ready.
          </Typography>
        )}

        {sessions && sessions.length > 0 && view === 'feed' && (
          <FeedView sessions={sessions} onOpen={openSession} />
        )}
        {sessions && view === 'calendar' && (
          <CalendarView sessions={sessions ?? []} onOpen={openSession} />
        )}
      </Box>
    </Box>
  );
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface FeedViewProps {
  sessions: CompletedSessionView[];
  onOpen: (sessionId: string) => void;
}

function FeedView({ sessions, onOpen }: FeedViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, CompletedSessionView[]>();
    for (const s of sessions) {
      const key = sessionMonthKey(s);
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [sessions]);

  return (
    <Stack spacing={2}>
      {groups.map(([monthKey, items]) => (
        <Stack key={monthKey} spacing={0.5}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {formatMonth(monthKey)}
          </Typography>
          <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
            {items.map((s) => (
              <FeedRow key={s.session.id} view={s} onOpen={onOpen} />
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

interface FeedRowProps {
  view: CompletedSessionView;
  onOpen: (sessionId: string) => void;
}

function FeedRow({ view, onOpen }: FeedRowProps) {
  const dayLabel = parseLocalDate(view.calendarDate).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(view.session.id)}
      aria-label={`${view.splitDayTypeName} on ${dayLabel}, ${view.completionPercent}% complete`}
      sx={{
        all: 'unset',
        cursor: 'pointer',
        py: 1.25,
        px: 0.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        minHeight: 52,
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      <Stack spacing={0}>
        <Typography variant="body1">{view.splitDayTypeName}</Typography>
        <Typography variant="caption" color="text.secondary">
          {dayLabel} · {view.locationName}
        </Typography>
      </Stack>
      <Typography
        variant="body2"
        color={view.completionPercent >= 100 ? 'primary.main' : 'text.secondary'}
        className="numeric-cell"
        sx={{ minWidth: 48, textAlign: 'right' }}
      >
        {view.completionPercent}%
      </Typography>
    </Box>
  );
}

interface CalendarViewProps {
  sessions: CompletedSessionView[];
  onOpen: (sessionId: string) => void;
}

function CalendarView({ sessions, onOpen }: CalendarViewProps) {
  const months = useMemo(() => {
    const today = todayLocalDateString();
    const todayMonth = today.slice(0, 7);
    const earliest =
      sessions.length > 0
        ? sessions[sessions.length - 1]!.calendarDate.slice(0, 7)
        : addMonths(todayMonth, -5);
    const list: string[] = [];
    let cursor = todayMonth;
    while (cursor >= earliest) {
      list.push(cursor);
      cursor = addMonths(cursor, -1);
    }
    return list;
  }, [sessions]);

  const byDate = useMemo(() => {
    const m = new Map<string, CompletedSessionView>();
    for (const s of sessions) {
      if (!m.has(s.calendarDate)) m.set(s.calendarDate, s);
    }
    return m;
  }, [sessions]);

  return (
    <Stack spacing={3}>
      {months.map((monthKey) => (
        <MonthCalendar key={monthKey} monthKey={monthKey} byDate={byDate} onOpen={onOpen} />
      ))}
    </Stack>
  );
}

interface MonthCalendarProps {
  monthKey: string;
  byDate: Map<string, CompletedSessionView>;
  onOpen: (sessionId: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MonthCalendar({ monthKey, byDate, onOpen }: MonthCalendarProps) {
  const days = useMemo(() => monthCalendarCells(monthKey), [monthKey]);
  const today = todayLocalDateString();

  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {formatMonth(monthKey)}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 0.5,
        }}
      >
        {WEEKDAYS.map((label) => (
          <Typography
            key={label}
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: 'center', py: 0.5 }}
          >
            {label}
          </Typography>
        ))}
        {days.map((cell, idx) => {
          if (cell === null) return <Box key={`pad-${idx}`} sx={{ minHeight: 40 }} />;
          const completed = byDate.get(cell);
          const isToday = cell === today;
          return (
            <Box
              key={cell}
              component={completed ? 'button' : 'div'}
              type={completed ? 'button' : undefined}
              onClick={completed ? () => onOpen(completed.session.id) : undefined}
              aria-label={
                completed
                  ? `${formatDate(cell)} — ${completed.splitDayTypeName}, ${completed.completionPercent}%`
                  : formatDate(cell)
              }
              sx={{
                all: 'unset',
                cursor: completed ? 'pointer' : 'default',
                minHeight: 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: isToday ? '1px solid' : '1px solid transparent',
                borderColor: isToday ? 'primary.main' : 'transparent',
                borderRadius: 1,
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 1,
                },
              }}
            >
              <Typography variant="body2" className="numeric-cell">
                {cell.slice(8, 10).replace(/^0/, '')}
              </Typography>
              {completed && (
                <Box
                  aria-hidden
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'primary.main',
                    mt: 0.25,
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}

function monthCalendarCells(monthKey: string): Array<string | null> {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const first = new Date(year, month - 1, 1);
  const dow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < dow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dd = String(day).padStart(2, '0');
    cells.push(`${monthKey}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function addMonths(monthKey: string, delta: number): string {
  const [yearStr, monthStr] = monthKey.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr) + delta;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parseLocalDate(iso));
  } catch {
    return iso;
  }
}

function formatMonth(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const d = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d);
}
