/**
 * Multi-series line chart for the Progress tab. Built on Recharts.
 *
 * Each line is keyed on a **variant** so the same family can plot multiple
 * versions (e.g. Bench Press Barbell + Bench Press Machine). Weight-tracked
 * variants share the left Y axis in the user's default units; bodyweight
 * variants plot on a separate right axis as reps, since their loggedWeight
 * is always zero. The legend tags reps-axis series with "(reps)" so the
 * legend reads cleanly even when both axes are in play.
 *
 * `connectNulls` keeps each variant's line continuous across days when
 * other variants had a session but this one didn't. Tapping a data point
 * opens a popover linking to the session detail view.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProgressChartData, ProgressSeries } from '@/features/progress/queries';
import { getDb } from '@/data/db';
import { sessionCalendarDate } from '@/features/session/queries';

export interface ProgressChartProps {
  data: ProgressChartData | undefined;
  height?: number;
}

interface PointDetail {
  date: string;
  variantId: string;
  legend: string;
  value: number;
  metric: 'weight' | 'reps';
  sessionId: string | null;
  workoutName: string | null;
}

export function ProgressChart({ data, height = 280 }: ProgressChartProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PointDetail | null>(null);

  if (data === undefined) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading chart…
      </Typography>
    );
  }
  if (data.rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No completed sets for the selected exercises yet.
      </Typography>
    );
  }

  const axisColor = theme.palette.text.secondary;
  const gridColor = theme.palette.divider;

  // Series palette is plate-color led (green, blue, red, yellow) for the
  // first four variants — those are the high-traffic IWF bumper-plate hues
  // and give the chart its identity. Overflow hues (purple/orange/cyan/brown)
  // cover the rare cases where someone tracks 5+ variants of the same lift.
  const SERIES_COLORS = [
    theme.palette.plates.green,
    theme.palette.plates.blue,
    theme.palette.plates.red,
    theme.palette.plates.yellow,
    '#BA68C8',
    '#FF8A65',
    '#4DD0E1',
    '#A1887F',
  ];

  const openPoint = (s: ProgressSeries, date: string | undefined) => {
    if (!date) return;
    const value = s.points.find((p) => p.date === date)?.value;
    if (value == null) return;
    void (async () => {
      const sessionId = await resolveSessionForPoint(s.variantId, date);
      let workoutName: string | null = null;
      if (sessionId) {
        const db = getDb();
        const session = await db.session.get(sessionId);
        const slot = session?.scheduleSlotId
          ? await db.scheduleSlot.get(session.scheduleSlotId)
          : null;
        const sdt = slot ? await db.splitDayType.get(slot.splitDayTypeId) : null;
        workoutName = sdt?.name ?? (session ? 'Ad-hoc workout' : null);
      }
      setDetail({
        date,
        variantId: s.variantId,
        legend: legendName(s),
        value,
        metric: s.metric,
        sessionId: sessionId ?? null,
        workoutName,
      });
    })();
  };

  // Recharts emits the active payload (= the row at the clicked X) on
  // LineChart.onClick. We pick the first non-null series value to identify
  // which exercise the user tapped near.
  const onChartClick = (state: unknown) => {
    const s = state as { activeLabel?: string; activePayload?: Array<{ dataKey: string }> };
    const date = s.activeLabel;
    const firstSeries = s.activePayload?.[0];
    if (!date || !firstSeries) return;
    const variantId = String(firstSeries.dataKey);
    const ser = data.series.find((x) => x.variantId === variantId);
    if (!ser) return;
    openPoint(ser, date);
  };

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data.rows}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          onClick={onChartClick}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="date"
            tick={{ fill: axisColor, fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            stroke={gridColor}
          />
          {data.hasWeight && (
            <YAxis
              yAxisId="weight"
              tick={{ fill: axisColor, fontSize: 11 }}
              label={{ value: data.units, angle: -90, position: 'insideLeft', fill: axisColor }}
              stroke={gridColor}
              width={48}
            />
          )}
          {data.hasReps && (
            <YAxis
              yAxisId="reps"
              orientation="right"
              tick={{ fill: axisColor, fontSize: 11 }}
              label={{ value: 'reps', angle: 90, position: 'insideRight', fill: axisColor }}
              stroke={gridColor}
              width={42}
              allowDecimals={false}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              color: theme.palette.text.primary,
              fontSize: 12,
            }}
            formatter={(value, _name, item) => {
              const key = String((item as { dataKey?: string }).dataKey ?? '');
              const s = data.series.find((x) => x.variantId === key);
              const unitLabel = s?.metric === 'reps' ? 'reps' : data.units;
              return [`${value as number} ${unitLabel}`, s ? legendName(s) : String(_name)];
            }}
            labelFormatter={(label) => String(label)}
          />
          <Legend
            wrapperStyle={{ color: axisColor, fontSize: 12 }}
            formatter={(value: string) => {
              const s = data.series.find((x) => x.variantId === value);
              return s ? legendName(s) : value;
            }}
          />
          {data.series.map((s, idx) => {
            const color = SERIES_COLORS[idx % SERIES_COLORS.length] ?? SERIES_COLORS[0]!;
            return (
              <Line
                key={s.variantId}
                type="monotone"
                dataKey={s.variantId}
                name={s.variantId}
                yAxisId={s.metric === 'reps' ? 'reps' : 'weight'}
                stroke={color}
                strokeWidth={2}
                {...(s.metric === 'reps' ? { strokeDasharray: '5 3' } : {})}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      <Dialog open={detail !== null} onClose={() => setDetail(null)} maxWidth="xs" fullWidth>
        {detail && (
          <>
            <DialogTitle>{detail.workoutName ?? 'Workout'}</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                {formatDate(detail.date)}
              </Typography>
              <Typography variant="body1" sx={{ mt: 1 }}>
                {detail.legend}: <strong>{detail.value}</strong>{' '}
                {detail.metric === 'reps' ? 'reps' : data.units}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetail(null)} variant="text">
                Close
              </Button>
              {detail.sessionId && (
                <Button
                  onClick={() => {
                    const sid = detail.sessionId!;
                    setDetail(null);
                    void navigate(`/session/${sid}`, { state: { origin: '/progress' } });
                  }}
                  variant="contained"
                >
                  Open workout
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

function legendName(s: ProgressSeries): string {
  const base = `${s.liftFamilyName} (${s.variantName})`;
  return s.metric === 'reps' ? `${base} (reps)` : base;
}

async function resolveSessionForPoint(variantId: string, date: string): Promise<string | null> {
  const db = getDb();
  const sessions = await db.session.where('state').equals('COMPLETED').toArray();
  const candidates = sessions.filter((s) => sessionCalendarDate(s) === date);
  for (const s of candidates) {
    const lifts = await db.sessionLift
      .where('sessionId')
      .equals(s.id)
      .filter((l) => l.variantId === variantId)
      .toArray();
    if (lifts.length > 0) return s.id;
  }
  return null;
}

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
      new Date(Number(y), Number(m) - 1, Number(d)),
    );
  } catch {
    return iso;
  }
}
