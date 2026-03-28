/**
 * VolumeChart.tsx
 *
 * Zeigt Volumen-Progression pro Übung über Zeit.
 * Volumen = Gewicht × Wiederholungen pro Einheit (alle Sätze summiert).
 * Verwendet Recharts LineChart.
 */

import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { TrendingUp } from 'lucide-react';

interface SetLog {
  exercise_name: string;
  weight_kg: number;
  reps_done: number;
  logged_at: string;
}

interface WorkoutLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  set_logs: SetLog[];
}

interface VolumeChartProps {
  workoutLogs: WorkoutLog[];
}

// ── Farben pro Übung ──────────────────────────────────────────────────────────
const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
];

// ── Daten aufbereiten ─────────────────────────────────────────────────────────
function buildChartData(logs: WorkoutLog[], selectedExercise: string) {
  const completed = logs.filter(l => l.completed_at);

  return completed
    .map(log => {
      const sets = (log.set_logs || []).filter(
        s => s.exercise_name === selectedExercise
      );
      if (sets.length === 0) return null;

      const volume = sets.reduce(
        (sum, s) => sum + (Number(s.weight_kg) || 0) * (Number(s.reps_done) || 0),
        0
      );
      const maxWeight = Math.max(...sets.map(s => Number(s.weight_kg) || 0));

      return {
        date: format(new Date(log.started_at), 'd. MMM', { locale: de }),
        dateRaw: log.started_at,
        volume: Math.round(volume),
        maxWeight,
        sets: sets.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a!.dateRaw).getTime() - new Date(b!.dateRaw).getTime())
    .slice(-12); // letzte 12 Einheiten
}

function getAllExercises(logs: WorkoutLog[]): string[] {
  const names = new Set<string>();
  logs.forEach(log =>
    (log.set_logs || []).forEach(s => names.add(s.exercise_name))
  );
  return [...names].sort();
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}{p.dataKey === 'volume' ? 'kg' : 'kg'}</span>
        </p>
      ))}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const VolumeChart: React.FC<VolumeChartProps> = ({ workoutLogs }) => {
  const exercises = getAllExercises(workoutLogs);
  const [selectedExercise, setSelectedExercise] = useState<string>(exercises[0] || '');
  const [metric, setMetric] = useState<'volume' | 'maxWeight'>('volume');

  if (exercises.length === 0) return null;

  const data = buildChartData(workoutLogs, selectedExercise);

  if (data.length < 2) {
    return (
      <div className="rounded-xl border border-border p-4 text-center">
        <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          Mindestens 2 Workouts mit der gleichen Übung nötig für Progressionsdiagramm.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-primary" /> Progression
        </p>
        <div className="flex gap-2 flex-wrap">
          {/* Übung wählen */}
          <select
            value={selectedExercise}
            onChange={e => setSelectedExercise(e.target.value)}
            className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {exercises.map(ex => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
          {/* Metrik wählen */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setMetric('volume')}
              className={`px-2 py-1 transition-colors ${metric === 'volume' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >
              Volumen
            </button>
            <button
              onClick={() => setMetric('maxWeight')}
              className={`px-2 py-1 transition-colors ${metric === 'maxWeight' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
            >
              Max. Gewicht
            </button>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${v}kg`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey={metric}
            name={metric === 'volume' ? 'Volumen' : 'Max. Gewicht'}
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4, fill: '#10b981' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Mini-Stats */}
      {data.length >= 2 && (() => {
        const first = data[0]![metric as 'volume' | 'maxWeight'] as number;
        const last = data[data.length - 1]![metric as 'volume' | 'maxWeight'] as number;
        const diff = last - first;
        const pct = first > 0 ? ((diff / first) * 100).toFixed(0) : '0';
        return (
          <div className="flex gap-4 pt-1 text-xs text-muted-foreground border-t border-border">
            <span>Start: <strong className="text-foreground">{first}kg</strong></span>
            <span>Aktuell: <strong className="text-foreground">{last}kg</strong></span>
            <span className={`ml-auto font-semibold ${diff >= 0 ? 'text-primary' : 'text-red-500'}`}>
              {diff >= 0 ? '+' : ''}{diff}kg ({pct}%)
            </span>
          </div>
        );
      })()}
    </div>
  );
};

export default VolumeChart;
