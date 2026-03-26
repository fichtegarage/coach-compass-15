/**
 * ClientPlanView.tsx
 *
 * Kunden-seitige Planansicht in BookingPage.
 * Read-only. Zeigt den aktiven Trainingsplan mit Wochen-Navigation.
 * Zugriff über client_id (kein Auth-Login des Kunden nötig –
 * Supabase-Abfrage läuft über anon key, RLS muss client_id erlauben).
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Dumbbell, ChevronDown, ChevronUp, Target, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanExercise {
  id: string;
  name: string;
  sets: number | null;
  reps_target: string | null;
  rest_seconds: number | null;
  notes: string | null;
  order_in_workout: number;
}

interface PlanWorkout {
  id: string;
  week_number: number;
  week_label: string;
  day_label: string;
  notes: string | null;
  order_in_week: number;
  exercises: PlanExercise[];
}

interface TrainingPlan {
  id: string;
  name: string;
  goal: string | null;
  weeks_total: number | null;
  sessions_per_week: number | null;
  progression_notes: string | null;
  workouts: PlanWorkout[];
}

interface ClientPlanViewProps {
  clientId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRest(seconds: number | null): string {
  if (!seconds) return '';
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
  }
  return `${seconds}s`;
}

function groupByWeek(workouts: PlanWorkout[]): Map<number, PlanWorkout[]> {
  const map = new Map<number, PlanWorkout[]>();
  for (const w of workouts) {
    if (!map.has(w.week_number)) map.set(w.week_number, []);
    map.get(w.week_number)!.push(w);
  }
  map.forEach(ws => ws.sort((a, b) => a.order_in_week - b.order_in_week));
  return map;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

const ExerciseRow: React.FC<{ exercise: PlanExercise; index: number }> = ({ exercise, index }) => (
  <div className={`px-4 py-3 ${index > 0 ? 'border-t border-slate-100' : ''}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900">{exercise.name}</p>
        {exercise.notes && (
          <p className="text-xs text-slate-400 mt-0.5 italic">{exercise.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-3 text-right flex-shrink-0">
        {exercise.sets && exercise.reps_target && (
          <div className="text-center">
            <p className="text-sm font-bold text-emerald-600 tabular-nums">
              {exercise.sets} × {exercise.reps_target}
            </p>
            <p className="text-[10px] text-slate-400">Sätze × Wdh.</p>
          </div>
        )}
        {exercise.rest_seconds && (
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500 tabular-nums">
              {formatRest(exercise.rest_seconds)}
            </p>
            <p className="text-[10px] text-slate-400">Pause</p>
          </div>
        )}
      </div>
    </div>
  </div>
);

const WorkoutBlock: React.FC<{ workout: PlanWorkout }> = ({ workout }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{workout.day_label}</p>
            <p className="text-xs text-slate-400">{workout.exercises.length} Übungen</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div>
          {workout.exercises.map((ex, i) => (
            <ExerciseRow key={ex.id} exercise={ex} index={i} />
          ))}
          {workout.exercises.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400">Keine Übungen hinterlegt.</p>
          )}
          {workout.notes && (
            <p className="px-4 py-2 pb-3 text-xs text-slate-400 italic border-t border-slate-100">
              {workout.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const ClientPlanView: React.FC<ClientPlanViewProps> = ({ clientId }) => {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Aktiven Plan laden
      const { data: planData } = await supabase
        .from('training_plans')
        .select('id, name, goal, weeks_total, sessions_per_week, progression_notes')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle();

      if (!planData) { setLoading(false); return; }

      // Workouts laden
      const { data: workoutsData } = await supabase
        .from('plan_workouts')
        .select('*')
        .eq('plan_id', planData.id)
        .order('week_number')
        .order('order_in_week');

      if (!workoutsData) { setLoading(false); return; }

      // Exercises laden
      const workoutIds = workoutsData.map(w => w.id);
      const { data: exercisesData } = workoutIds.length > 0
        ? await supabase
            .from('plan_exercises')
            .select('*')
            .in('workout_id', workoutIds)
            .order('order_in_workout')
        : { data: [] };

      const workoutsWithExercises: PlanWorkout[] = workoutsData.map(w => ({
        ...w,
        exercises: (exercisesData || []).filter(e => e.workout_id === w.id),
      }));

      setPlan({ ...planData, workouts: workoutsWithExercises });

      // Default: erste Woche
      const firstWeek = workoutsWithExercises[0]?.week_number ?? null;
      setSelectedWeek(firstWeek);
      setLoading(false);
    };

    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="py-10 text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
          <Dumbbell className="w-6 h-6 text-slate-300" />
        </div>
        <p className="text-sm font-medium text-slate-500">Noch kein Trainingsplan hinterlegt</p>
        <p className="text-xs text-slate-400">Dein Coach teilt deinen Plan sobald er fertig ist.</p>
      </div>
    );
  }

  const weekMap = groupByWeek(plan.workouts);
  const weekNumbers = [...weekMap.keys()].sort((a, b) => a - b);
  const currentWorkouts = selectedWeek !== null ? (weekMap.get(selectedWeek) || []) : [];
  const currentWeekLabel = currentWorkouts[0]?.week_label;

  return (
    <div className="space-y-5">

      {/* Plan-Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <p className="text-base font-bold text-slate-900">{plan.name}</p>
          {plan.goal && (
            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Target className="w-3.5 h-3.5 flex-shrink-0" />
              {plan.goal}
            </p>
          )}
        </div>
        <div className="flex gap-4 text-xs text-slate-400">
          {plan.weeks_total && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> {plan.weeks_total} Wochen
            </span>
          )}
          {plan.sessions_per_week && (
            <span className="flex items-center gap-1">
              <Dumbbell className="w-3.5 h-3.5" /> {plan.sessions_per_week}× pro Woche
            </span>
          )}
        </div>
      </div>

      {/* Wochen-Navigation */}
      {weekNumbers.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {weekNumbers.map(wn => {
            const label = weekMap.get(wn)?.[0]?.week_label;
            const short = label
              ? label.replace(/^Woche\s*/i, 'W').split(':')[0]
              : `W${wn}`;
            return (
              <button
                key={wn}
                onClick={() => setSelectedWeek(wn)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedWeek === wn
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {short}
              </button>
            );
          })}
        </div>
      )}

      {/* Wochen-Label */}
      {currentWeekLabel && (
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {currentWeekLabel}
        </p>
      )}

      {/* Workouts */}
      <div className="space-y-3">
        {currentWorkouts.map(workout => (
          <WorkoutBlock key={workout.id} workout={workout} />
        ))}
      </div>

      {/* Progressionslogik */}
      {plan.progression_notes && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Progressionslogik
          </p>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{plan.progression_notes}</p>
        </div>
      )}
    </div>
  );
};

export default ClientPlanView;
