/**
 * AdherenceWidget.tsx
 *
 * Zeigt wöchentliche Trainingsfrequenz der letzten 8 Wochen.
 * Balken = absolvierte Workouts pro Woche.
 * Gibt Adherence-Score als Prozentsatz aus (basierend auf Ziel aus Plan).
 */

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  startOfWeek, endOfWeek, subWeeks, format, isWithinInterval,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { CheckCircle, AlertTriangle, TrendingDown } from 'lucide-react';

interface WorkoutLog {
  id: string;
  started_at: string;
  completed_at: string | null;
}

interface AdherenceWidgetProps {
  workoutLogs: WorkoutLog[];
  targetPerWeek: number; // aus training_plan.sessions_per_week
}

// ── Daten aufbereiten ─────────────────────────────────────────────────────────

function buildWeeklyData(logs: WorkoutLog[], weeksBack = 8) {
  const completed = logs.filter(l => l.completed_at);
  const now = new Date();

  return Array.from({ length: weeksBack }, (_, i) => {
    const weekStart = startOfWeek(subWeeks(now, weeksBack - 1 - i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const label = format(weekStart, 'd. MMM', { locale: de });

    const count = completed.filter(l =>
      isWithinInterval(new Date(l.started_at), { start: weekStart, end: weekEnd })
    ).length;

    return { label, count, weekStart };
  });
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-0.5">{label}</p>
      <p>{payload[0].value} Workout{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const AdherenceWidget: React.FC<AdherenceWidgetProps> = ({ workoutLogs, targetPerWeek }) => {
  const data = useMemo(() => buildWeeklyData(workoutLogs), [workoutLogs]);

  const completedWeeks = data.filter(d => d.count > 0).length;
  const totalWorkouts = data.reduce((s, d) => s + d.count, 0);
  const targetTotal = targetPerWeek * data.length;
  const adherencePct = targetTotal > 0
    ? Math.min(100, Math.round((totalWorkouts / targetTotal) * 100))
    : null;

  const avgPerWeek = (totalWorkouts / data.length).toFixed(1);

  // Letzten 3 Wochen: Tendenz
  const last3 = data.slice(-3).reduce((s, d) => s + d.count, 0);
  const prev3 = data.slice(-6, -3).reduce((s, d) => s + d.count, 0);
  const trend = last3 >= prev3 ? 'up' : 'down';

  const getColor = (count: number) => {
    if (count === 0) return 'hsl(var(--muted))';
    if (targetPerWeek > 0 && count >= targetPerWeek) return '#10b981';
    if (count >= 1) return '#3b82f6';
    return 'hsl(var(--muted))';
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Trainingsfrequenz</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend === 'down' && last3 < prev3 && (
            <span className="flex items-center gap-1 text-amber-500">
              <TrendingDown className="w-3.5 h-3.5" /> Rückgang
            </span>
          )}
        </div>
      </div>

      {/* Stats-Zeile */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-muted/40 py-2">
          <p className="text-lg font-bold">{totalWorkouts}</p>
          <p className="text-[10px] text-muted-foreground">Workouts (8 Wo.)</p>
        </div>
        <div className="rounded-lg bg-muted/40 py-2">
          <p className="text-lg font-bold">{avgPerWeek}</p>
          <p className="text-[10px] text-muted-foreground">Ø pro Woche</p>
        </div>
        <div className={`rounded-lg py-2 ${
          adherencePct === null ? 'bg-muted/40' :
          adherencePct >= 80 ? 'bg-emerald-500/10' :
          adherencePct >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10'
        }`}>
          <p className={`text-lg font-bold ${
            adherencePct === null ? '' :
            adherencePct >= 80 ? 'text-emerald-600' :
            adherencePct >= 50 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {adherencePct !== null ? `${adherencePct}%` : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground">Adherence</p>
        </div>
      </div>

      {/* Balkendiagramm */}
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))' }} />
          {targetPerWeek > 0 && (
            <ReferenceLine
              y={targetPerWeek}
              stroke="#10b981"
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{ value: `Ziel: ${targetPerWeek}`, position: 'right', fontSize: 9, fill: '#10b981' }}
            />
          )}
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {data.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.count)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legende */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
          Ziel erreicht
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
          Trainiert
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-muted inline-block border border-border" />
          Keine Einheit
        </span>
      </div>
    </div>
  );
};

export default AdherenceWidget;
