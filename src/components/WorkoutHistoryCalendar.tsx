/**
 * WorkoutHistoryCalendar.tsx
 *
 * Wiederverwendbarer Workout-Verlauf als Kalender.
 * mode="coach"  → mit Feedback-Funktionen in WorkoutLogCard
 * mode="client" → read-only (Phase #25c)
 */

import React, { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { de } from 'date-fns/locale';
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  startOfDay,
  isSameDay,
  subMonths, addMonths,
  subWeeks, addWeeks,
  format,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import 'react-day-picker/dist/style.css';

// ── Typen (minimal – nur was der Kalender selbst braucht) ─────────────────────

interface SetLog {
  id: string;
  exercise_name: string;
  set_number: number;
  reps_done: number;
  weight_kg: number;
  is_pr: boolean;
  logged_at: string;
  duration_seconds: number | null;
}

interface WorkoutFeedback {
  id: string;
  message: string;
  created_at: string;
}

export interface WorkoutLogForCalendar {
  id: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  rating: number | null;
  energy_level: number | null;
  logged_by: 'client' | 'coach' | 'assessment';
  plan_workouts: { day_label: string } | null;
  set_logs: SetLog[];
  feedback?: WorkoutFeedback | null;
}

interface WorkoutHistoryCalendarProps {
  workoutLogs: WorkoutLogForCalendar[];
  mode: 'coach' | 'client';
  trainerId?: string;
  onFeedbackSaved?: (logId: string, feedback: WorkoutFeedback) => void;
}

type ViewMode = 'month' | 'week';

// ── Helpers ───────────────────────────────────────────────────────────────────

function logsForDay(logs: WorkoutLogForCalendar[], day: Date): WorkoutLogForCalendar[] {
  return logs.filter(l => isSameDay(new Date(l.started_at), day));
}

function calcVolume(sets: SetLog[]): number {
  return sets.reduce(
    (sum, s) => sum + (Number(s.weight_kg) || 0) * (Number(s.reps_done) || 0),
    0,
  );
}

function calcDuration(log: WorkoutLogForCalendar): string {
  if (!log.completed_at) return '—';
  const mins = Math.round(
    (new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 60000,
  );
  return `${mins} Min.`;
}

// ── Inline-Karte (read-only, kompakt) ────────────────────────────────────────

const InlineWorkoutCard: React.FC<{ log: WorkoutLogForCalendar }> = ({ log }) => {
  const sets = log.set_logs || [];
  const volume = calcVolume(sets);
  const duration = calcDuration(log);
  const workoutName = log.plan_workouts?.day_label || 'Freies Training';
  const prCount = sets.filter(s => s.is_pr).length;

  // Übungen gruppieren
  const exerciseNames = [...new Set(sets.map(s => s.exercise_name))];

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{workoutName}</span>
          {log.logged_by === 'coach' && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/5 text-primary">
              🏋 mit Coach
            </span>
          )}
          {prCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-600">
              🏆 {prCount} PR{prCount > 1 ? 's' : ''}
            </span>
          )}
          {!log.completed_at && (
            <span className="text-xs text-muted-foreground">(abgebrochen)</span>
          )}
        </div>
      </div>

      {/* Stats-Zeile */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{sets.length} Sätze</span>
        <span>
          {volume >= 1000
            ? `${(volume / 1000).toFixed(1)}t`
            : `${Math.round(volume)}kg`} Volumen
        </span>
        <span>{duration}</span>
      </div>

      {/* Übungsliste */}
      {exerciseNames.length > 0 && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {exerciseNames.join(' · ')}
        </p>
      )}

      {/* Coach-Feedback (read-only Anzeige) */}
      {log.feedback && (
        <div className="rounded-md bg-primary/5 border border-primary/20 px-2.5 py-1.5">
          <p className="text-xs text-primary font-medium mb-0.5">💬 Feedback</p>
          <p className="text-xs text-foreground">{log.feedback.message}</p>
        </div>
      )}
    </div>
  );
};

// ── Hauptkomponente ───────────────────────────────────────────────────────────

const WorkoutHistoryCalendar: React.FC<WorkoutHistoryCalendarProps> = ({
  workoutLogs,
  mode,
  onFeedbackSaved,
  trainerId,
}) => {
  const today = startOfDay(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(today);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Tage mit Workouts (für Modifier)
  const workoutDays = workoutLogs.map(l => startOfDay(new Date(l.started_at)));

  // Sichtbarer Bereich je nach View-Modus
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const fromDate = viewMode === 'month' ? monthStart : weekStart;
  const toDate = viewMode === 'month' ? monthEnd : weekEnd;

  // Navigation
  const goBack = () =>
    setCurrentDate(d => viewMode === 'month' ? subMonths(d, 1) : subWeeks(d, 1));
  const goForward = () =>
    setCurrentDate(d => viewMode === 'month' ? addMonths(d, 1) : addWeeks(d, 1));

  // Navigationslabel
  const navLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: de })
    : `${format(weekStart, 'd. MMM', { locale: de })} – ${format(weekEnd, 'd. MMM yyyy', { locale: de })}`;

  // Selektierter Tag: Workouts anzeigen
  const selectedLogs = selectedDay ? logsForDay(workoutLogs, selectedDay) : [];

  const handleDayClick = (day: Date) => {
    const hasWorkout = workoutDays.some(d => isSameDay(d, day));
    if (!hasWorkout) return;
    setSelectedDay(prev => (prev && isSameDay(prev, day) ? null : day));
  };

  return (
    <div className="space-y-3">

      {/* Toggle + Navigation */}
      <div className="flex items-center justify-between gap-2">
        {/* Monat/Woche Toggle */}
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          <button
            onClick={() => { setViewMode('month'); setSelectedDay(null); }}
            className={`px-3 py-1.5 font-medium transition-colors ${
              viewMode === 'month'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            Monat
          </button>
          <button
            onClick={() => { setViewMode('week'); setSelectedDay(null); }}
            className={`px-3 py-1.5 font-medium transition-colors border-l border-border ${
              viewMode === 'week'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            Woche
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center">{navLabel}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Kalender */}
      <div className="rounded-lg border border-border bg-card p-3">
        <DayPicker
          mode="single"
          selected={selectedDay ?? undefined}
          onDayClick={handleDayClick}
          month={viewMode === 'month' ? monthStart : weekStart}
          fromDate={fromDate}
          toDate={toDate}
          locale={de}
          weekStartsOn={1}
          showOutsideDays={viewMode === 'month'}
          modifiers={{ hasWorkout: workoutDays }}
          modifiersClassNames={{ hasWorkout: 'rdp-day_has_workout' }}
          styles={{
            months: { width: '100%' },
            month: { width: '100%' },
            table: { width: '100%' },
          }}
          classNames={{
            day_selected: 'rdp-day_selected',
            day_today: 'rdp-day_today',
          }}
        />
      </div>

      {/* Inline-Aufklappen: Workouts des gewählten Tags */}
      {selectedDay && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {format(selectedDay, "EEEE, d. MMMM", { locale: de })}
          </p>
          {selectedLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kein Workout an diesem Tag.</p>
          ) : (
            selectedLogs.map(log => (
              <InlineWorkoutCard key={log.id} log={log} />
            ))
          )}
        </div>
      )}

      {/* Leerzustand */}
      {workoutLogs.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">Noch keine Workouts geloggt.</p>
        </div>
      )}

      {/* CSS für Workout-Marker */}
      <style>{`
        .rdp-day_has_workout {
          position: relative;
        }
        .rdp-day_has_workout::after {
          content: '';
          position: absolute;
          bottom: 3px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background-color: hsl(var(--primary));
        }
        .rdp-day_selected:not(.rdp-day_has_workout) {
          background-color: transparent !important;
          color: inherit !important;
          font-weight: inherit !important;
        }
        .rdp-day_selected.rdp-day_has_workout {
          background-color: hsl(var(--primary) / 0.12) !important;
          color: hsl(var(--primary)) !important;
          font-weight: 600;
          border-radius: 6px;
        }
        .rdp-day_has_workout:not(.rdp-day_selected) {
          cursor: pointer;
        }
        .rdp-day_has_workout:not(.rdp-day_selected):hover {
          background-color: hsl(var(--muted));
          border-radius: 6px;
        }
      `}</style>
    </div>
  );
};

export default WorkoutHistoryCalendar;
