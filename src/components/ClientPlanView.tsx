/**
 * ClientPlanView.tsx
 *
 * Kunden-seitige Plan- und Workout-Ansicht.
 * Drei Tabs: Plan | Verlauf | PRs
 *
 * Assessment-Integration:
 * - Wenn nächstes Workout is_assessment=true und noch nicht abgeschlossen:
 *   → Kein Start-Button, stattdessen "Session mit Coach"-Karte
 * - Nach Abschluss des Assessments:
 *   → Ergebniskarte mit Stärken, Fokuspunkten und Messwerten
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, Dumbbell, ChevronDown, ChevronUp,
  Target, Calendar, Play, Trophy, Star,
  ClipboardCheck, CheckCircle
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

interface AssessmentMeasurements {
  squat_score?: number;
  hinge_score?: number;
  shoulder_left_cm?: string;
  shoulder_right_cm?: string;
  pushup_reps?: string;
  plank_seconds?: string;
  balance_left_seconds?: string;
  balance_right_seconds?: string;
  forward_fold_cm?: string;
}

interface AssessmentResult {
  id: string;
  completed_at: string | null;
  identified_strengths: string[];
  focus_areas: string[];
  contraindications: string[];
  measurements: AssessmentMeasurements | null;
  coach_notes: string | null;
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

function scoreLabel(score: number): string {
  return ['', 'Eingeschränkt', 'Verbesserungswürdig', 'Durchschnitt', 'Gut', 'Ausgezeichnet'][score] || '';
}

function scoreColor(score: number): string {
  return ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-lime-400', 'text-green-400'][score] || '';
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
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${workout.is_assessment ? 'bg-amber-500/20' : 'bg-orange-500/20'}`}>
            {workout.is_assessment
              ? <ClipboardCheck className="w-3.5 h-3.5 text-amber-400" />
              : <Dumbbell className="w-3.5 h-3.5 text-orange-400" />
            }
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{workout.day_label}</p>
            <p className="text-xs text-slate-400">
              {workout.is_assessment ? 'Assessment mit Coach' : `${workout.exercises.length} Übungen`}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && (
        <div>
          {workout.is_assessment ? (
            <div className="px-4 py-3 text-sm text-slate-400 italic">
              Diese Einheit findet gemeinsam mit deinem Coach statt.
            </div>
          ) : (
            <>
              {workout.exercises.map((ex, i) => <ExerciseRow key={ex.id} exercise={ex} index={i} />)}
              {workout.exercises.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-500">Keine Übungen hinterlegt.</p>
              )}
            </>
          )}
          {workout.notes && (
            <p className="px-4 py-2 pb-3 text-xs text-slate-500 italic border-t border-slate-700">{workout.notes}</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Assessment Ergebniskarte ──────────────────────────────────────────────────

const AssessmentResultCard: React.FC<{ result: AssessmentResult }> = ({ result }) => {
  const [open, setOpen] = useState(false);
  const m = result.measurements;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Assessment abgeschlossen</p>
            <p className="text-xs text-slate-400">
              {result.completed_at ? format(new Date(result.completed_at), "d. MMM yyyy", { locale: de }) : ''}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="border-t border-amber-500/20 px-4 pb-4 pt-3 space-y-4">
          {/* Stärken */}
          {result.identified_strengths?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">✅ Deine Stärken</p>
              <div className="flex flex-wrap gap-1.5">
                {result.identified_strengths.map((s, i) => (
                  <span key={i} className="text-xs bg-green-500/10 text-green-300 border border-green-500/20 px-2.5 py-1 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fokuspunkte */}
          {result.focus_areas?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-2">🎯 Fokus im Training</p>
              <div className="flex flex-wrap gap-1.5">
                {result.focus_areas.map((f, i) => (
                  <span key={i} className="text-xs bg-orange-500/10 text-orange-300 border border-orange-500/20 px-2.5 py-1 rounded-full">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Messwerte */}
          {m && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">📊 Deine Messwerte</p>
              <div className="space-y-1.5">
                {m.squat_score && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">🦵 Kniebeuge</span>
                    <span className={`font-semibold ${scoreColor(m.squat_score)}`}>{scoreLabel(m.squat_score)}</span>
                  </div>
                )}
                {m.hinge_score && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">🏋️ Hip Hinge</span>
                    <span className={`font-semibold ${scoreColor(m.hinge_score)}`}>{scoreLabel(m.hinge_score)}</span>
                  </div>
                )}
                {(m.shoulder_left_cm || m.shoulder_right_cm) && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">🙌 Schulter-Mobilität</span>
                    <span className="font-semibold text-slate-300">
                      {m.shoulder_left_cm ? `L: ${m.shoulder_left_cm} cm` : ''}{m.shoulder_left_cm && m.shoulder_right_cm ? ' · ' : ''}{m.shoulder_right_cm ? `R: ${m.shoulder_right_cm} cm` : ''}
                    </span>
                  </div>
                )}
                {m.pushup_reps && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">💪 Push-up Test</span>
                    <span className="font-semibold text-slate-300">{m.pushup_reps} Wdh.</span>
                  </div>
                )}
                {m.plank_seconds && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">⏱ Plank</span>
                    <span className="font-semibold text-slate-300">{m.plank_seconds} Sek.</span>
                  </div>
                )}
                {(m.balance_left_seconds || m.balance_right_seconds) && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">🦶 Einbeiniger Stand</span>
                    <span className="font-semibold text-slate-300">
                      {m.balance_left_seconds ? `L: ${m.balance_left_seconds}s` : ''}{m.balance_left_seconds && m.balance_right_seconds ? ' · ' : ''}{m.balance_right_seconds ? `R: ${m.balance_right_seconds}s` : ''}
                    </span>
                  </div>
                )}
                {m.forward_fold_cm && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">🤸 Vorwärtsbeugen</span>
                    <span className="font-semibold text-slate-300">{m.forward_fold_cm} cm</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coach-Notizen */}
          {result.coach_notes && (
            <div className="rounded-lg bg-slate-700/50 px-3 py-2">
              <p className="text-xs font-semibold text-slate-400 mb-1">📝 Notiz von Jakob</p>
              <p className="text-sm text-slate-300">{result.coach_notes}</p>
            </div>
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
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('plan');
  const [activeWorkout, setActiveWorkout] = useState<PlanWorkout | null>(null);
  const [completedSummary, setCompletedSummary] = useState<WorkoutSummary | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

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

          if (planData.next_plan_workout_id) {
            const found = workoutsWithEx.find(w => w.id === planData.next_plan_workout_id);
            setNextWorkout(found ?? workoutsWithEx[0] ?? null);
          } else {
            setNextWorkout(workoutsWithEx[0] ?? null);
          }
        }
      }

      // Assessment-Ergebnisse laden (abgeschlossen)
      const { data: assessmentData } = await supabase
        .from('assessment_results')
        .select('id, completed_at, identified_strengths, focus_areas, contraindications, measurements, coach_notes')
        .eq('client_id', clientId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setAssessmentResult(assessmentData ?? null);

      // Workout-Logs
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

  // Ist das nächste Workout ein Assessment?
  const nextIsAssessment = nextWorkout?.is_assessment === true;
  const assessmentDone = nextIsAssessment && nextWorkout?.status === 'completed';

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
              <p className="text-slate-400 text-sm">Noch kein Trainingsplan vorhanden.</p>
              <p className="text-slate-500 text-xs">Jakob erstellt deinen Plan nach dem Assessment.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Assessment-Ergebniskarte (wenn abgeschlossen) */}
              {assessmentResult && (
                <AssessmentResultCard result={assessmentResult} />
              )}

              {/* Nächstes Training */}
              {nextWorkout && (
                <div className={`rounded-xl border overflow-hidden ${
                  nextIsAssessment
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-orange-500/30 bg-orange-500/5'
                }`}>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        nextIsAssessment ? 'bg-amber-500/20' : 'bg-orange-500/20'
                      }`}>
                        {nextIsAssessment
                          ? <ClipboardCheck className="w-3.5 h-3.5 text-amber-400" />
                          : <Play className="w-3.5 h-3.5 text-orange-400" />
                        }
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          {nextIsAssessment ? 'Assessment-Session' : 'Nächstes Training'}
                        </p>
                        <p className="text-base font-bold text-white">{nextWorkout.day_label}</p>
                        {nextWorkout.week_label && (
                          <p className="text-xs text-slate-400">{nextWorkout.week_label}</p>
                        )}
                      </div>
                    </div>

                    {/* Start-Button oder Assessment-Hinweis */}
                    {nextIsAssessment ? (
                      <div className="text-right">
                        <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg block">
                          Mit Coach
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveWorkout(nextWorkout)}
                        className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 active:scale-95 transition-all text-white font-bold px-4 py-2.5 rounded-xl text-sm"
                      >
                        <Play className="w-4 h-4" />
                        Starten
                      </button>
                    )}
                  </div>

                  {/* Assessment-Erklärung */}
                  {nextIsAssessment && !assessmentDone && (
                    <div className="px-4 pb-3 pt-0">
                      <div className="rounded-lg bg-slate-800/50 px-3 py-2.5 space-y-2">
                        <p className="text-xs text-slate-300 font-medium">Was passiert beim Assessment?</p>
                        <ul className="text-xs text-slate-400 space-y-1">
                          <li>• Jakob führt mit dir 7 Bewegungstests durch</li>
                          <li>• Kraft, Mobilität und Stabilität werden gemessen</li>
                          <li>• Auf Basis der Ergebnisse wird dein Trainingsplan erstellt</li>
                        </ul>
                        <p className="text-xs text-slate-500 italic">Diese Einheit startest du nicht selbst – Jakob loggt alles für dich.</p>
                      </div>
                    </div>
                  )}

                  {/* Übungsvorschau (nur wenn kein Assessment) */}
                  {!nextIsAssessment && nextWorkout.exercises.length > 0 && (
                    <div className="border-t border-orange-500/10 px-4 pb-3 pt-2">
                      <div className="flex flex-wrap gap-1.5">
                        {nextWorkout.exercises.slice(0, 5).map(ex => (
                          <span key={ex.id} className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-md">
                            {ex.name}
                          </span>
                        ))}
                        {nextWorkout.exercises.length > 5 && (
                          <span className="text-xs text-slate-500">+{nextWorkout.exercises.length - 5} weitere</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Wochenauswahl */}
              {weekNumbers.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {weekNumbers.map(wn => {
                    const label = weekMap.get(wn)?.[0]?.week_label;
                    return (
                      <button
                        key={wn}
                        onClick={() => setSelectedWeek(wn)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          selectedWeek === wn
                            ? 'bg-slate-700 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        {label ? label.replace(/^Woche\s*/i, 'W').split(':')[0] : `W${wn}`}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Wochen-Workouts */}
              {currentWorkouts.length > 0 && (
                <div className="space-y-3">
                  {currentWeekLabel && (
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{currentWeekLabel}</p>
                  )}
                  {currentWorkouts.map(workout => (
                    <WorkoutBlock key={workout.id} workout={workout} />
                  ))}
                </div>
              )}

              {/* Plan-Info */}
              {plan.goal && (
                <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 flex items-start gap-3">
                  <Target className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Dein Ziel</p>
                    <p className="text-sm text-slate-300 mt-0.5">{plan.goal}</p>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ── VERLAUF TAB ── */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {completedLogs.length === 0 ? (
              <div className="py-10 text-center">
                <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Noch keine abgeschlossenen Trainings.</p>
              </div>
            ) : (
              completedLogs.map(log => <WorkoutLogCard key={log.id} log={log} />)
            )}
          </div>
        )}

        {/* ── PRs TAB ── */}
        {activeTab === 'prs' && (
          <div className="space-y-3">
            {prs.length === 0 ? (
              <div className="py-10 text-center">
                <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Noch keine persönlichen Rekorde.</p>
                <p className="text-slate-500 text-xs mt-1">PRs werden automatisch erkannt.</p>
              </div>
            ) : (
              prs.map((pr, i) => (
                <div key={i} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{pr.exercise_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {format(new Date(pr.achieved_at), "d. MMM yyyy", { locale: de })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-400 tabular-nums">
                      {pr.weight_kg} kg × {pr.reps}
                    </p>
                    <p className="text-[10px] text-slate-500">Persönlicher Rekord 🏆</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </>
  );
};

export default ClientPlanView;
