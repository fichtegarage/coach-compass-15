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
  <div className={`px-4 py-3 ${index > 0 ? 'border-t border-slate-100' : ''}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900">{exercise.name}</p>
        {exercise.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{exercise.notes}</p>}
      </div>
      <div className="flex items-center gap-3 text-right flex-shrink-0">
        {exercise.sets && exercise.reps_target && (
          <div className="text-center">
            <p className="text-sm font-bold text-primary tabular-nums">
              {exercise.sets} × {exercise.reps_target}
            </p>
            <p className="text-[10px] text-slate-400">Sätze × Wdh.</p>
          </div>
        )}
        {exercise.rest_seconds && (
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500 tabular-nums">{formatRest(exercise.rest_seconds)}</p>
            <p className="text-[10px] text-slate-400">Pause</p>
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
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{workout.day_label}</p>
            <p className="text-xs text-slate-400">{workout.exercises.length} Übungen</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div>
          {workout.exercises.map((ex, i) => <ExerciseRow key={ex.id} exercise={ex} index={i} />)}
          {workout.exercises.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400">Keine Übungen hinterlegt.</p>
          )}
          {workout.notes && (
            <p className="px-4 py-2 pb-3 text-xs text-slate-400 italic border-t border-slate-100">{workout.notes}</p>
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
    <div className={`rounded-xl border bg-white overflow-hidden ${prCount > 0 ? 'border-amber-200' : 'border-slate-200'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 truncate">{workoutName}</p>
              {prCount > 0 && <span className="text-xs font-bold text-amber-500">🏆 {prCount} PR{prCount > 1 ? 's' : ''}</span>}
              {log.feedback && <span className="text-xs text-primary font-medium">💬 Feedback</span>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {format(new Date(log.started_at), "EEE, d. MMM · HH:mm", { locale: de })} Uhr
              {mins !== null && ` · ${mins} Min.`}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-slate-700 tabular-nums">
              {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
            </p>
            <p className="text-[10px] text-slate-400">{sets.length} Sätze</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
        </div>
      </button>
      {open && sets.length > 0 && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-2 space-y-3">
          {[...exerciseGroups.entries()].map(([name, exSets]) => (
            <div key={name}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{name}</p>
              <div className="space-y-1">
                {exSets.map(s => (
                  <div key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="text-slate-400 text-xs w-12">Satz {s.set_number}</span>
                    <span className="font-medium text-slate-800 tabular-nums">{Number(s.weight_kg)}kg × {s.reps_done}</span>
                    {s.is_pr && <span className="text-xs text-amber-500 font-bold ml-auto">🏆 PR</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Coach-Feedback anzeigen */}
          {log.feedback && (
            <div className="rounded-xl bg-primary/10 border border-primary/30 px-3 py-2.5">
              <p className="text-xs font-semibold text-primary mb-1">💬 Feedback von Jakob</p>
              <p className="text-sm text-slate-800">{log.feedback.message}</p>
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
        .select('id, name, goal, weeks_total, sessions_per_week, progression_notes, next_plan_workout_id')
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
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
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
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <Dumbbell className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">Noch kein Trainingsplan hinterlegt</p>
              <p className="text-xs text-slate-400">Dein Coach teilt deinen Plan sobald er fertig ist.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Nächstes Training Karte ── */}
              {nextWorkout && (
                <div className={`rounded-2xl p-4 space-y-3 shadow-sm ${
                  nextWorkout.is_assessment && nextWorkout.status !== 'completed'
                    ? 'bg-slate-800'
                    : 'bg-primary'
                }`}>
                  <div>
                    <p className="text-primary-foreground/80 text-xs font-semibold uppercase tracking-wide">
                      {nextWorkout.is_assessment ? 'Assessment mit Coach' : 'Nächstes Training'}
                    </p>
                    <p className="text-white text-xl font-bold mt-0.5">{nextWorkout.day_label}</p>
                    <p className="text-primary-foreground/80 text-sm">
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveWorkout(nextWorkout)}
                        className="flex-1 bg-white text-primary font-bold py-3 rounded-xl text-sm active:scale-95 transition-all"
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
                          className="bg-white/20 text-white text-xs rounded-xl px-3 border border-white/30 focus:outline-none"
                        >
                          {plan.workouts.map(w => (
                            <option key={w.id} value={w.id} className="text-slate-900">
                              {w.is_assessment ? '📋 ' : ''}{w.week_label ? w.week_label.split(':')[0] : `W${w.week_number}`} · {w.day_label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Plan-Header */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <p className="text-base font-bold text-slate-900">{plan.name}</p>
                {plan.goal && (
                  <p className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 flex-shrink-0" /> {plan.goal}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-slate-400">
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
                          selectedWeek === wn ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentWeekLabel && (
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{currentWeekLabel}</p>
              )}

              <div className="space-y-3">
                {currentWorkouts.map(workout => (
                  <div key={workout.id} className="space-y-2">
                    <WorkoutBlock workout={workout} />
                    <button
                      onClick={() => setActiveWorkout(workout)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 active:scale-95 text-white font-semibold text-sm transition-all"
                    >
                      <Play className="w-4 h-4" /> {workout.day_label} starten
                    </button>
                  </div>
                ))}
              </div>

              {plan.progression_notes && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Progressionslogik</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{plan.progression_notes}</p>
                </div>
              )}
            </div>
          )
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          workoutLogs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Dumbbell className="w-10 h-10 text-slate-200 mx-auto" />
              <p className="text-sm text-slate-500">Noch keine Workouts geloggt.</p>
              <p className="text-xs text-slate-400">Starte dein erstes Training über „Mein Plan".</p>
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
              <Trophy className="w-10 h-10 text-slate-200 mx-auto" />
              <p className="text-sm text-slate-500">Noch keine Personal Records.</p>
              <p className="text-xs text-slate-400">Trainiere und setze deinen ersten PR!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {prs.map((pr, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{pr.exercise_name}</p>
                    <p className="text-xs text-slate-400">{format(new Date(pr.achieved_at), "d. MMM yyyy", { locale: de })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-primary tabular-nums">
                      {Number(pr.weight_kg)}kg × {pr.reps}
                    </p>
                    <p className="text-[10px] text-slate-400">🏆 Persönlicher Rekord</p>
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

export default ClientPlanView;  order_in_week: number;
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
  <div className={`px-4 py-3 ${index > 0 ? 'border-t border-slate-100' : ''}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900">{exercise.name}</p>
        {exercise.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{exercise.notes}</p>}
      </div>
      <div className="flex items-center gap-3 text-right flex-shrink-0">
        {exercise.sets && exercise.reps_target && (
          <div className="text-center">
            <p className="text-sm font-bold text-primary tabular-nums">
              {exercise.sets} × {exercise.reps_target}
            </p>
            <p className="text-[10px] text-slate-400">Sätze × Wdh.</p>
          </div>
        )}
        {exercise.rest_seconds && (
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500 tabular-nums">{formatRest(exercise.rest_seconds)}</p>
            <p className="text-[10px] text-slate-400">Pause</p>
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
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Dumbbell className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{workout.day_label}</p>
            <p className="text-xs text-slate-400">{workout.exercises.length} Übungen</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div>
          {workout.exercises.map((ex, i) => <ExerciseRow key={ex.id} exercise={ex} index={i} />)}
          {workout.exercises.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400">Keine Übungen hinterlegt.</p>
          )}
          {workout.notes && (
            <p className="px-4 py-2 pb-3 text-xs text-slate-400 italic border-t border-slate-100">{workout.notes}</p>
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
    <div className={`rounded-xl border bg-white overflow-hidden ${prCount > 0 ? 'border-amber-200' : 'border-slate-200'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 truncate">{workoutName}</p>
              {prCount > 0 && <span className="text-xs font-bold text-amber-500">🏆 {prCount} PR{prCount > 1 ? 's' : ''}</span>}
              {log.feedback && <span className="text-xs text-primary font-medium">💬 Feedback</span>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {format(new Date(log.started_at), "EEE, d. MMM · HH:mm", { locale: de })} Uhr
              {mins !== null && ` · ${mins} Min.`}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-slate-700 tabular-nums">
              {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
            </p>
            <p className="text-[10px] text-slate-400">{sets.length} Sätze</p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
        </div>
      </button>
      {open && sets.length > 0 && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-2 space-y-3">
          {[...exerciseGroups.entries()].map(([name, exSets]) => (
            <div key={name}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{name}</p>
              <div className="space-y-1">
                {exSets.map(s => (
                  <div key={s.id} className="flex items-center gap-3 text-sm">
                    <span className="text-slate-400 text-xs w-12">Satz {s.set_number}</span>
                    <span className="font-medium text-slate-800 tabular-nums">{Number(s.weight_kg)}kg × {s.reps_done}</span>
                    {s.is_pr && <span className="text-xs text-amber-500 font-bold ml-auto">🏆 PR</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Coach-Feedback anzeigen */}
          {log.feedback && (
            <div className="rounded-xl bg-primary/10 border border-primary/30 px-3 py-2.5">
              <p className="text-xs font-semibold text-primary mb-1">💬 Feedback von Jakob</p>
              <p className="text-sm text-slate-800">{log.feedback.message}</p>
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
        .select('id, name, goal, weeks_total, sessions_per_week, progression_notes, next_plan_workout_id')
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
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
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
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                <Dumbbell className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">Noch kein Trainingsplan hinterlegt</p>
              <p className="text-xs text-slate-400">Dein Coach teilt deinen Plan sobald er fertig ist.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── Nächstes Training Karte ── */}
              {nextWorkout && (
                <div className="rounded-2xl bg-primary p-4 space-y-3 shadow-sm">
                  <div>
                    <p className="text-primary-foreground/80 text-xs font-semibold uppercase tracking-wide">Nächstes Training</p>
                    <p className="text-white text-xl font-bold mt-0.5">{nextWorkout.day_label}</p>
                    <p className="text-primary-foreground/80 text-sm">
                      {nextWorkout.week_label && `${nextWorkout.week_label} · `}
                      {nextWorkout.exercises?.length || 0} Übungen
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveWorkout(nextWorkout)}
                      className="flex-1 bg-white text-primary font-bold py-3 rounded-xl text-sm active:scale-95 transition-all"
                    >
                      ▶ Jetzt starten
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
                        className="bg-primary text-white text-xs rounded-xl px-3 border border-primary/50 focus:outline-none"
                      >
                        {plan.workouts.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.week_label ? w.week_label.split(':')[0] : `W${w.week_number}`} · {w.day_label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}
              {/* Plan-Header */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <p className="text-base font-bold text-slate-900">{plan.name}</p>
                {plan.goal && (
                  <p className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 flex-shrink-0" /> {plan.goal}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-slate-400">
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
                          selectedWeek === wn ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentWeekLabel && (
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{currentWeekLabel}</p>
              )}

              <div className="space-y-3">
                {currentWorkouts.map(workout => (
                  <div key={workout.id} className="space-y-2">
                    <WorkoutBlock workout={workout} />
                    <button
                      onClick={() => setActiveWorkout(workout)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 active:scale-95 text-white font-semibold text-sm transition-all"
                    >
                      <Play className="w-4 h-4" /> {workout.day_label} starten
                    </button>
                  </div>
                ))}
              </div>

              {plan.progression_notes && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Progressionslogik</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{plan.progression_notes}</p>
                </div>
              )}
            </div>
          )
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          workoutLogs.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Dumbbell className="w-10 h-10 text-slate-200 mx-auto" />
              <p className="text-sm text-slate-500">Noch keine Workouts geloggt.</p>
              <p className="text-xs text-slate-400">Starte dein erstes Training über „Mein Plan".</p>
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
              <Trophy className="w-10 h-10 text-slate-200 mx-auto" />
              <p className="text-sm text-slate-500">Noch keine Personal Records.</p>
              <p className="text-xs text-slate-400">Trainiere und setze deinen ersten PR!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {prs.map((pr, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{pr.exercise_name}</p>
                    <p className="text-xs text-slate-400">{format(new Date(pr.achieved_at), "d. MMM yyyy", { locale: de })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-primary tabular-nums">
                      {Number(pr.weight_kg)}kg × {pr.reps}
                    </p>
                    <p className="text-[10px] text-slate-400">🏆 Persönlicher Rekord</p>
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
