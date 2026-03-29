/**
 * ClientPlanView.tsx
 *
 * Kunden-seitige Plan- und Workout-Ansicht.
 * Drei Tabs: Plan | Verlauf | PRs
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, Dumbbell, ChevronDown, ChevronUp,
  Target, Calendar, Play, Trophy, Star
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import WorkoutLogger from '@/components/WorkoutLogger';
import WorkoutSummaryView from '@/components/WorkoutSummaryView';

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
  is_assessment?: boolean;
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  session_order?: number;
  phase_type?: 'load' | 'deload' | 'test' | 'intro';
  cycle_number?: number;
}

interface TrainingPlan {
  id: string;
  name: string;
  goal: string | null;
  weeks_total: number | null;
  sessions_per_week: number | null;
  total_cycles?: number;
  progression_notes: string | null;
  workouts: PlanWorkout[];
}

interface SetLog {
  id: string;
  exercise_name: string;
  set_number: number;
  reps_done: number;
  weight_kg: number;
  is_pr: boolean;
  logged_at: string;
}

interface WorkoutLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  plan_workouts: { day_label: string } | null;
  set_logs: SetLog[];
  feedback?: { message: string; created_at: string } | null;
}

interface PersonalRecord {
  exercise_name: string;
  weight_kg: number;
  reps: number;
  achieved_at: string;
}

interface WorkoutSummary {
  duration: number;
  totalSets: number;
  totalVolume: number;
  prs: string[];
}

interface ClientPlanViewProps {
  clientId: string;
}

type ActiveTab = 'plan' | 'history' | 'prs';

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

function groupSetsByExercise(sets: SetLog[]): Map<string, SetLog[]> {
  const map = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (!map.has(s.exercise_name)) map.set(s.exercise_name, []);
    map.get(s.exercise_name)!.push(s);
  }
  return map;
}

// ── Plan: Exercise Row ────────────────────────────────────────────────────────

const ExerciseRow: React.FC<{ exercise: PlanExercise; index: number }> = ({ exercise, index }) => (
  <div className={`px-4 py-3 ${index > 0 ? 'border-t border-slate-700' : ''}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{exercise.name}</p>
        {exercise.notes && <p className="text-xs text-slate-500 mt-0.5 italic">{exercise.notes}</p>}
      </div>
      <div className="flex items-center gap-3 text-right flex-shrink-0">
        {exercise.sets && exercise.reps_target && (
          <div className="text-center">
            <p className="text-sm font-bold text-orange-400 tabular-nums">
              {exercise.sets} × {exercise.reps_target}
            </p>
            <p className="text-[10px] text-slate-500">Sätze × Wdh.</p>
          </div>
        )}
        {exercise.rest_seconds && (
          <div className="text-center">
            <p className="text-sm font-medium text-slate-400 tabular-nums">{formatRest(exercise.rest_seconds)}</p>
            <p className="text-[10px] text-slate-500">Pause</p>
          </div>
        )}
      </div>
    </div>
  </div>
);

// ── Plan: Workout Block ───────────────────────────────────────────────────────

const WorkoutBlock: React.FC<{ workout: PlanWorkout }> = ({ workout }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{workout.day_label}</p>
            <p className="text-xs text-slate-400">{workout.exercises.length} Übungen</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && (
        <div>
          {workout.exercises.map((ex, i) => <ExerciseRow key={ex.id} exercise={ex} index={i} />)}
          {workout.exercises.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Keine Übungen hinterlegt.</p>
          )}
          {workout.notes && (
            <p className="px-4 py-2 pb-3 text-xs text-slate-500 italic border-t border-slate-700">{workout.notes}</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── History: Workout Log Card ─────────────────────────────────────────────────

const WorkoutLogCard: React.FC<{ log: WorkoutLog }> = ({ log }) => {
  const [open, setOpen] = useState(false);
  const sets = log.set_logs || [];
  const volume = sets.reduce((s, x) => s + (Number(x.weight_kg) || 0) * (Number(x.reps_done) || 0), 0);
  const prCount = sets.filter(s => s.is_pr).length;
  const exerciseGroups = groupSetsByExercise(sets);
  const workoutName = log.plan_workouts?.day_label || 'Freies Training';
  const mins = log.completed_at
    ? Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 60000)
    : null;

  return (
    <div className={`rounded-xl border bg-slate-800 overflow-hidden ${prCount > 0 ? 'border-amber-500/30' : 'border-slate-700'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">{workoutName}</p>
              {prCount > 0 && <span className="text-xs font-bold text-amber-400">🏆 {prCount} PR{prCount > 1 ? 's' : ''}</span>}
              {log.feedback && <span className="text-xs text-orange-400 font-medium">💬 Feedback</span>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {format(new Date(log.started_at), "EEE, d. MMM · HH:mm", { locale: de })} Uhr
              {mins !== null && ` · ${mins} Min.`}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-slate-300 tabular-nums">
              {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
            </p>
            <p className="text-[10px] text-slate-500">{sets.length} Sätze</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        </div>
      </button>
      {open && sets.length > 0 && (
        <div className="border-t border-slate-700 px-4 pb-3 pt-2 space-y-3">
          {[...exerciseGroups.entries()].map(([name, exSets]) => (
            <div key={name}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{name}</p>
              <div className="space-y-1">
                {exSets.map(s => (
                  <div key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="text-slate-500 text-xs w-12">Satz {s.set_number}</span>
                    <span className="font-medium text-slate-300 tabular-nums">{Number(s.weight_kg)}kg × {s.reps_done}</span>
                    {s.is_pr && <span className="text-xs text-amber-400 font-bold ml-auto">🏆 PR</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Coach-Feedback anzeigen */}
          {log.feedback && (
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 px-3 py-2.5">
              <p className="text-xs font-semibold text-orange-400 mb-1">💬 Feedback von Jakob</p>
              <p className="text-sm text-slate-300">{log.feedback.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const ClientPlanView: React.FC<ClientPlanViewProps> = ({ clientId }) => {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [nextWorkout, setNextWorkout] = useState<PlanWorkout | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('plan');
  const [activeWorkout, setActiveWorkout] = useState<PlanWorkout | null>(null);
  const [completedSummary, setCompletedSummary] = useState<WorkoutSummary | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Plan inkl. next_plan_workout_id
      const { data: planData } = await supabase
        .from('training_plans')
        .select('id, name, goal, weeks_total, sessions_per_week, total_cycles, progression_notes, next_plan_workout_id')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle();

      if (planData) {
        const { data: workoutsData } = await supabase
          .from('plan_workouts')
          .select('*')
          .eq('plan_id', planData.id)
          .order('week_number')
          .order('order_in_week');

        if (workoutsData) {
          const workoutIds = workoutsData.map(w => w.id);
          const { data: exercisesData } = workoutIds.length > 0
            ? await supabase.from('plan_exercises').select('*').in('workout_id', workoutIds).order('order_in_workout')
            : { data: [] };

          const workoutsWithEx: PlanWorkout[] = workoutsData.map(w => ({
            ...w,
            exercises: (exercisesData || []).filter(e => e.workout_id === w.id),
          }));
          setPlan({ ...planData, workouts: workoutsWithEx });
          setSelectedWeek(workoutsWithEx[0]?.week_number ?? null);

          // Nächstes Workout ermitteln
          if (planData.next_plan_workout_id) {
            const found = workoutsWithEx.find(w => w.id === planData.next_plan_workout_id);
            setNextWorkout(found ?? workoutsWithEx[0] ?? null);
          } else {
            // Noch kein Zeiger gesetzt → erstes Workout
            setNextWorkout(workoutsWithEx[0] ?? null);
          }
        }
      }

      // Workout-Logs mit nested set_logs
      const { data: logsData } = await supabase
        .from('workout_logs')
        .select(`
          id, started_at, completed_at,
          plan_workouts ( day_label ),
          set_logs ( id, exercise_name, set_number, reps_done, weight_kg, is_pr, logged_at )
        `)
        .eq('client_id', clientId)
        .order('started_at', { ascending: false })
        .limit(30);

      const logIds = (logsData || []).map(l => l.id);
      const { data: feedbackData } = logIds.length > 0
        ? await supabase.from('workout_feedback').select('workout_log_id, message, created_at').in('workout_log_id', logIds)
        : { data: [] };

      const normalisedLogs: WorkoutLog[] = (logsData || []).map(log => ({
        ...log,
        plan_workouts: Array.isArray(log.plan_workouts) ? (log.plan_workouts[0] ?? null) : log.plan_workouts,
        set_logs: ((log.set_logs as SetLog[]) || []).sort(
          (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
        ),
        feedback: (feedbackData || []).find(f => f.workout_log_id === log.id) ?? null,
      }));
      setWorkoutLogs(normalisedLogs);

      // PRs
      const { data: prsData } = await supabase
        .from('personal_records')
        .select('exercise_name, weight_kg, reps, achieved_at')
        .eq('client_id', clientId)
        .order('exercise_name');
      setPrs(prsData || []);

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

  const weekMap = plan ? groupByWeek(plan.workouts) : new Map();
  const weekNumbers = [...weekMap.keys()].sort((a, b) => a - b);
  const currentWorkouts = selectedWeek !== null ? (weekMap.get(selectedWeek) || []) : [];
  const currentWeekLabel = currentWorkouts[0]?.week_label;
  const completedLogs = workoutLogs.filter(l => l.completed_at);

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'plan', label: 'Mein Plan' },
    { id: 'history', label: `Verlauf${completedLogs.length > 0 ? ` (${completedLogs.length})` : ''}` },
    { id: 'prs', label: `PRs ${prs.length > 0 ? '🏆' : ''}` },
  ];

  return (
    <>
      {activeWorkout && (
        <WorkoutLogger
          workout={activeWorkout}
          clientId={clientId}
          planId={plan?.id}
          onClose={() => setActiveWorkout(null)}
          onComplete={(summary) => { setActiveWorkout(null); setCompletedSummary(summary); }}
        />
      )}
      {completedSummary && (
        <WorkoutSummaryView
          summary={completedSummary}
          workoutName={completedSummary.prs.length > 0 ? '🏆 Stark!' : 'Gut gemacht!'}
          onClose={() => { setCompletedSummary(null); window.location.reload(); }}
        />
      )}

      <div className="space-y-4">

        {/* Tab-Navigation */}
        <div className="flex gap-1 bg-slate-700/50 rounded-xl p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── PLAN TAB ── */}
        {activeTab === 'plan' && (
          !plan ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center mx-auto">
                <Dumbbell className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-400">Noch kein Trainingsplan hinterlegt</p>
              <p className="text-xs text-slate-500">Dein Coach teilt deinen Plan sobald er fertig ist.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Nächstes Training Karte ── */}
              {nextWorkout && (
                <div className={`rounded-2xl p-4 space-y-3 shadow-sm ${
                  nextWorkout.is_assessment && nextWorkout.status !== 'completed'
                    ? 'bg-slate-800'
                    : nextWorkout.phase_type === 'deload'
                    ? 'bg-blue-600'
                    : nextWorkout.phase_type === 'test'
                    ? 'bg-amber-600'
                    : 'bg-orange-600'
                }`}>
                  {/* Fortschrittsanzeige */}
                  {nextWorkout.session_order && plan.workouts && plan.workouts.length > 1 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/80 font-medium">
                          Session {nextWorkout.session_order} von {plan.workouts.length}
                        </span>
                        {nextWorkout.phase_type && nextWorkout.phase_type !== 'load' && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            nextWorkout.phase_type === 'deload' ? 'bg-white/20 text-white' :
                            nextWorkout.phase_type === 'test' ? 'bg-white/20 text-white' :
                            'bg-white/20 text-white'
                          }`}>
                            {nextWorkout.phase_type === 'deload' && '🔄 Deload'}
                            {nextWorkout.phase_type === 'test' && '📊 Test'}
                            {nextWorkout.phase_type === 'intro' && '🎯 Intro'}
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-white/80 rounded-full transition-all duration-500"
                          style={{ width: `${(nextWorkout.session_order / plan.workouts.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-white/80 text-xs font-semibold uppercase tracking-wide">
                      {nextWorkout.is_assessment ? 'Assessment mit Coach' : 
                       nextWorkout.phase_type === 'deload' ? 'Deload-Woche' :
                       nextWorkout.phase_type === 'test' ? 'Test-Woche' :
                       'Nächstes Training'}
                    </p>
                    <p className="text-white text-xl font-bold mt-0.5">{nextWorkout.day_label}</p>
                    <p className="text-white/80 text-sm">
                      {nextWorkout.week_label && `${nextWorkout.week_label} · `}
                      {nextWorkout.is_assessment
                        ? 'Bewegungsanalyse & Zielsetzung'
                        : `${nextWorkout.exercises?.length || 0} Übungen`
                      }
                    </p>
                  </div>

                  {/* Assessment: Info statt Start-Button */}
                  {nextWorkout.is_assessment && nextWorkout.status !== 'completed' ? (
                    <div className="bg-white/10 rounded-xl px-4 py-3 space-y-2">
                      <p className="text-white/90 text-sm font-medium">
                        🎯 Session mit deinem Coach
                      </p>
                      <p className="text-white/70 text-xs">
                        In dieser Einheit analysieren wir gemeinsam deine Bewegungsqualität, 
                        besprechen deine Ziele im Detail und legen die Grundlage für deinen 
                        individuellen Trainingsplan.
                      </p>
                      {nextWorkout.status === 'in_progress' && (
                        <p className="text-amber-300 text-xs font-medium mt-2">
                          ⏳ Assessment läuft...
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2 min-w-0">
                      <button
                        onClick={() => setActiveWorkout(nextWorkout)}
                        className="flex-1 min-w-0 bg-white text-primary font-bold py-3 rounded-xl text-sm active:scale-95 transition-all"
                      >
                        {nextWorkout.is_assessment && nextWorkout.status === 'completed'
                          ? '📋 Assessment ansehen'
                          : '▶ Jetzt starten'
                        }
                      </button>
                      {/* Workout wechseln */}
                      {plan.workouts && plan.workouts.length > 1 && (
                        <select
                          value={nextWorkout.id}
                          onChange={async e => {
                            const selected = plan.workouts!.find(w => w.id === e.target.value);
                            if (!selected) return;
                            setNextWorkout(selected);
                            await supabase
                              .from('training_plans')
                              .update({ next_plan_workout_id: selected.id })
                              .eq('id', plan.id);
                          }}
                          className="bg-white/20 text-white text-xs rounded-xl px-2 py-3 border border-white/30 focus:outline-none max-w-[100px] sm:max-w-[140px] truncate flex-shrink-0"
                        >
                          {plan.workouts.map(w => (
                            <option key={w.id} value={w.id} className="text-slate-900">
                              {w.is_assessment ? '📋 ' : ''}W{w.week_number} · {w.day_label.length > 12 ? w.day_label.substring(0, 12) + '…' : w.day_label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Plan-Header */}
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-2">
                <p className="text-base font-bold text-white">{plan.name}</p>
                {plan.goal && (
                  <p className="text-sm text-slate-400 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 flex-shrink-0" /> {plan.goal}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-slate-500">
                  {plan.weeks_total && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {plan.weeks_total} Wochen</span>}
                  {plan.sessions_per_week && <span className="flex items-center gap-1"><Dumbbell className="w-3.5 h-3.5" /> {plan.sessions_per_week}× pro Woche</span>}
                </div>
              </div>

              {/* Wochen-Navigation */}
              {weekNumbers.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {weekNumbers.map(wn => {
                    const label = weekMap.get(wn)?.[0]?.week_label;
                    const short = label ? label.replace(/^Woche\s*/i, 'W').split(':')[0] : `W${wn}`;
                    return (
                      <button
                        key={wn}
                        onClick={() => setSelectedWeek(wn)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          selectedWeek === wn ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentWeekLabel && (
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{currentWeekLabel}</p>
              )}

              <div className="space-y-3">
                {currentWorkouts.map(workout => (
                  <div key={workout.id} className="space-y-2">
                    <WorkoutBlock workout={workout} />
                    <button
                      onClick={() => setActiveWorkout(workout)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-semibold text-sm transition-all"
                    >
                      <Play className="w-4 h-4" /> {workout.day_label} starten
                    </button>
                  </div>
                ))}
              </div>

              {plan.progression_notes && (
                <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Progressionslogik</p>
                  <p className="text-sm text-slate-400 whitespace-pre-wrap">{plan.progression_notes}</p>
                </div>
              )}
            </div>
          )
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          workoutLogs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Dumbbell className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">Noch keine Workouts geloggt.</p>
              <p className="text-xs text-slate-500">Starte dein erstes Training über „Mein Plan".</p>
            </div>
          ) : (
            <div className="space-y-2">
              {workoutLogs.map(log => <WorkoutLogCard key={log.id} log={log} />)}
            </div>
          )
        )}

        {/* ── PR-BOARD TAB ── */}
        {activeTab === 'prs' && (
          prs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Trophy className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400">Noch keine Personal Records.</p>
              <p className="text-xs text-slate-500">Trainiere und setze deinen ersten PR!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {prs.map((pr, i) => (
                <div key={i} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{pr.exercise_name}</p>
                    <p className="text-xs text-slate-500">{format(new Date(pr.achieved_at), "d. MMM yyyy", { locale: de })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-orange-400 tabular-nums">
                      {Number(pr.weight_kg)}kg × {pr.reps}
                    </p>
                    <p className="text-[10px] text-slate-500">🏆 Persönlicher Rekord</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

      </div>
    </>
  );
};

export default ClientPlanView;
