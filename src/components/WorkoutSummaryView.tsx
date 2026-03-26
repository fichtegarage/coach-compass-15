/**
 * WorkoutSummary.tsx
 *
 * Zusammenfassung nach Abschluss eines Workouts.
 * Zeigt Dauer, Sätze, Volumen und PRs.
 */

import React from 'react';
import { Trophy, Clock, Dumbbell, Zap } from 'lucide-react';

interface WorkoutSummary {
  duration: number;
  totalSets: number;
  totalVolume: number;
  prs: string[];
}

interface WorkoutSummaryProps {
  summary: WorkoutSummary;
  workoutName: string;
  onClose: () => void;
}

const WorkoutSummaryView: React.FC<WorkoutSummaryProps> = ({ summary, workoutName, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-slate-900"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      {/* Confetti-ähnlicher Header */}
      <div className="text-center mb-8">
        <p className="text-5xl mb-3">🎉</p>
        <h1 className="text-2xl font-bold text-white">Training abgeschlossen!</h1>
        <p className="text-slate-400 mt-1 text-sm">{workoutName}</p>
      </div>

      {/* Stats */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-4 text-center">
            <Clock className="w-5 h-5 text-slate-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white tabular-nums">{summary.duration}</p>
            <p className="text-xs text-slate-400">Minuten</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 text-center">
            <Dumbbell className="w-5 h-5 text-slate-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white tabular-nums">{summary.totalSets}</p>
            <p className="text-xs text-slate-400">Sätze</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white/10 p-4 text-center">
          <Zap className="w-5 h-5 text-slate-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-white tabular-nums">
            {summary.totalVolume >= 1000
              ? `${(summary.totalVolume / 1000).toFixed(1)}t`
              : `${Math.round(summary.totalVolume)}kg`}
          </p>
          <p className="text-xs text-slate-400">Gesamtvolumen</p>
        </div>

        {/* PRs */}
        {summary.prs.length > 0 && (
          <div className="rounded-2xl bg-amber-500/20 border border-amber-500/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-bold text-amber-400">
                {summary.prs.length} neuer Personal Record{summary.prs.length > 1 ? 's' : ''}!
              </p>
            </div>
            <ul className="space-y-0.5">
              {summary.prs.map((ex, i) => (
                <li key={i} className="text-sm text-amber-200">🏆 {ex}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full max-w-sm py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base transition-colors active:scale-95"
      >
        Fertig
      </button>
    </div>
  );
};

export default WorkoutSummaryView;
