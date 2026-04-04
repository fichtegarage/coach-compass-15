/**
 * WorkoutLogger.tsx
 *
 * Kunden-seitiger Workout-Logger.
 *
 * Features:
 * - Bodyweight-Übungen: keine Gewichtsspalte
 * - Intelligente Gewichts-Vorausfüllung (Mesozyklus-aware)
 * - Übung überspringen
 * - Training jederzeit beenden (auch bei offenen Sätzen)
 * - Rest-Timer mit Circular Progress
 * - PR-Erkennung in Echtzeit
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { X, Check, Trophy, Loader2, SkipForward, Flag } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanExercise {
  id: string;
  name: string;
  sets: number | null;
  reps_target: string;
  rest_seconds: number | null;
  notes: string | null;
  alternative_name: string | null;
  is_bodyweight?: boolean;
}

interface PlanWorkout {
  id: string;
  day_label: string;
  week_number?: number;
  week_label?: string;
  order_in_week?: number;
  phase_type?: 'load' | 'deload' | 'test' | 'intro';
  cycle_number?: number;
  is_assessment?: boolean;
  exercises: PlanExercise[];
}

interface SetEntry {
  setNumber: number;
  reps: string;
  weight: string;
  logged: boolean;
  isPR: boolean;
}

interface ExerciseLog {
  exercise: PlanExercise;
  sets: SetEntry[];
  skipped: boolean;
  previousBest: { weight: number; reps: number } | null;
  suggestedWeight: string;
}

interface WorkoutLoggerProps {
  workout: PlanWorkout;
  clientId: string;
  planId?: string;
  sessionId?: string;
  onClose: () => void;
  onComplete: (summary: WorkoutSummary) => void;
}

export interface WorkoutSummary {
  duration: number;
  totalSets: number;
  totalVolume: number;
  prs: string[];
}

// ── Bodyweight Detection ──────────────────────────────────────────────────────

const BODYWEIGHT_NAMES = new Set([
  'bird dog', 'dead bug', 'plank', 'seitstütz', 'unterarmstütz',
  'seitlicher unterarmstütz', 'katze-kuh', 'mountain climbers',
  'upward dog', 'downward dog', 'hollow body', 'hollow body hold',
  'superman', 'kindpose', 'child pose', 'hüftbeuger-dehnung',
  'hip flexor stretch', 'inchworm', 'world greatest stretch',
  'pallof press', // meist mit Band/Kabel, aber kein klassisches Gewicht
  'band pull-apart', 'band pull-aparts', 'monster walks',
  'glute bridge bodyweight', 'wandsitzen', 'wall sit',
  'flutter kicks', 'leg raises', 'crunches', 'sit-ups',
]);

function isBodyweight(ex: PlanExercise): boolean {
  if (ex.is_bodyweight !== undefined) return ex.is_bodyweight;
  return BODYWEIGHT_NAMES.has(ex.name.toLowerCase());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepsTarget(repsTarget: string | null): string {
  if (!repsTarget) return '';
  const match = repsTarget.match(/^\d+/);
  return match ? match[0] : '';
}

// ── Smart Weight Prefill (Mesozyklus-aware) ───────────────────────────────────

async function calculateSmartWeight(
  exerciseName: string,
  clientId: string,
  currentLogId: string,
  phaseType: string | undefined,
): Promise<string> {
  // 1. Letzte workout_logs dieses Kunden (außer aktuellem)
  const { data: prevLogs } = await supabase
    .from('workout_logs')
    .select('id, plan_workout_id')
    .eq('client_id', clientId)
    .neq('id', currentLogId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(30);

  if (!prevLogs || prevLogs.length === 0) return '';

  const prevLogIds = prevLogs.map(l => l.id);

  // 2. Set-Logs für diese Übung
  const { data: prevSets } = await supabase
    .from('set_logs')
    .select('weight_kg, reps_done, workout_log_id, logged_at')
    .in('workout_log_id', prevLogIds)
    .eq('exercise_name', exerciseName)
    .order('logged_at', { ascending: false })
    .limit(15);

  if (!prevSets || prevSets.length === 0) return '';

  // 3. Phase-Info der vorherigen Workouts laden
  const prevWorkoutIds = prevLogs
    .filter(l => l.plan_workout_id)
    .map(l => l.plan_workout_id as string);

  const { data: prevWorkoutMeta } = prevWorkoutIds.length > 0
    ? await supabase
        .from('plan_workouts')
        .select('id, phase_type')
        .in('id', prevWorkoutIds)
    : { data: [] };

  const phaseByLogId = new Map<string, string>();
  for (const log of prevLogs) {
    const meta = prevWorkoutMeta?.find(m => m.id === log.plan_workout_id);
    phaseByLogId.set(log.id, meta?.phase_type || 'load');
  }

  const lastSet = prevSets[0];
  const lastWeight = Number(lastSet.weight_kg);
  const lastPhase = phaseByLogId.get(lastSet.workout_log_id) || 'load';
  const currentPhase = phaseType || 'load';

  // ── Deload-Woche: 65% des letzten Peaks ────────────────────────────────────
  if (currentPhase === 'deload') {
    const loadSets = prevSets.filter(s => {
      const p = phaseByLogId.get(s.workout_log_id);
      return !p || p === 'load';
    });
    const peak = loadSets.length > 0
      ? Math.max(...loadSets.map(s => Number(s.weight_kg)))
      : lastWeight;
    const suggestion = Math.round((peak * 0.65) / 2.5) * 2.5; // auf 2.5 runden
    return suggestion.toString();
  }

  // ── Test-Woche: letzter Peak ────────────────────────────────────────────────
  if (currentPhase === 'test') {
    const peak = Math.max(...prevSets.map(s => Number(s.weight_kg)));
    return peak.toString();
  }

  // ── Rückkehr aus Deload: +5% ────────────────────────────────────────────────
  if (lastPhase === 'deload' && (currentPhase === 'load' || !currentPhase)) {
    const suggestion = Math.round((lastWeight * 1.05) / 2.5) * 2.5;
    return suggestion.toString();
  }

  // ── Load-Woche: letztes Gewicht ─────────────────────────────────────────────
  return lastWeight % 1 === 0 ? lastWeight.toFixed(0) : lastWeight.toFixed(1);
}

// ── Rest Timer ────────────────────────────────────────────────────────────────

const RestTimer: React.FC<{ seconds: number; onDone: () => void }> = ({ seconds, onDone }) => {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone]);

  const pct = ((seconds - remaining) / seconds) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center px-6">
      <p className="text-white/60 text-sm mb-4 uppercase tracking-widest">Pause</p>
      <div className="relative w-40 h-40 mb-6">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="44" fill="none"
            stroke="hsl(20, 89%, 40%)" strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl font-bold text-white tabular-nums">{remaining}</span>
        </div>
      </div>
      <Button onClick={onDone} className="bg-white/20 hover:bg-white/30 text-white border-0 px-8" variant="outline">
        Überspringen
      </Button>
    </div>
  );
};

// ── Set Input Row ─────────────────────────────────────────────────────────────

const SetRow: React.FC<{
  set: SetEntry;
  isActive: boolean;
  onLog: (reps: string, weight: string) => void;
  targetReps: string;
  suggestedWeight: string;
  bodyweight: boolean;
}> = ({ set, isActive, onLog, targetReps, suggestedWeight, bodyweight }) => {
  const [reps, setReps] = useState(set.reps || targetReps);
  const [weight, setWeight] = useState(set.weight || suggestedWeight);

  // Wenn suggestedWeight sich ändert (nach async load), übernehmen
  useEffect(() => {
    if (!set.weight && suggestedWeight) setWeight(suggestedWeight);
  }, [suggestedWeight]);

  if (set.logged) {
    return (
      <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-primary/10 border border-primary/30">
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          {set.isPR ? <Trophy className="w-3.5 h-3.5 text-white" /> : <Check className="w-3.5 h-3.5 text-white" />}
        </div>
        <span className="text-sm text-slate-500">Satz {set.setNumber}</span>
        <span className="ml-auto text-sm font-semibold text-slate-700 tabular-nums">
          {set.reps} Wdh.{!bodyweight && ` × ${set.weight} kg`}
        </span>
        {set.isPR && (
          <span className="text-xs font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">PR 🏆</span>
        )}
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-slate-50 border border-slate-100 opacity-50">
        <div className="w-7 h-7 rounded-full border-2 border-slate-200 flex items-center justify-center flex-shrink-0">
          <span className="text-xs text-slate-400">{set.setNumber}</span>
        </div>
        <span className="text-sm text-slate-400">Satz {set.setNumber}</span>
      </div>
    );
  }

  return (
    <div className="py-3 px-4 rounded-xl bg-white border-2 border-primary shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-white">{set.setNumber}</span>
        </div>
        <span className="text-sm font-medium text-slate-700">Satz {set.setNumber}</span>
      </div>

      {/* Grid: 1 Spalte (Bodyweight) oder 2 Spalten */}
      <div className={`grid gap-3 mb-3 ${bodyweight ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {/* Gewicht – nur wenn nicht Bodyweight */}
        {!bodyweight && (
          <div>
            <p className="text-xs text-slate-400 mb-1">Gewicht (kg)</p>
            <input
              type="number" inputMode="decimal" value={weight}
              onChange={e => setWeight(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="0"
              className="w-full text-center text-2xl font-bold text-slate-900 bg-slate-50 rounded-xl py-3 border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="flex gap-1 mt-1.5">
              {['-5', '-2.5', '+2.5', '+5'].map(v => (
                <button key={v}
                  onClick={() => setWeight(w => {
                    const n = parseFloat(w || '0') + parseFloat(v);
                    return Math.max(0, n).toString();
                  })}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
                >{v}</button>
              ))}
            </div>
          </div>
        )}

        {/* Wiederholungen */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Wiederholungen</p>
          <input
            type="number" inputMode="numeric" value={reps}
            onChange={e => setReps(e.target.value)}
            onFocus={e => e.target.select()}
            placeholder={targetReps || '0'}
            className="w-full text-center text-2xl font-bold text-slate-900 bg-slate-50 rounded-xl py-3 border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1 mt-1.5">
            {['-2', '-1', '+1', '+2'].map(v => (
              <button key={v}
                onClick={() => setReps(r => {
                  const n = parseInt(r || '0') + parseInt(v);
                  return Math.max(0, n).toString();
                })}
                className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
              >{v}</button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => onLog(reps, bodyweight ? '0' : weight)}
        disabled={!reps || (!bodyweight && !weight)}
        className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base transition-colors active:scale-95"
      >
        Satz abschließen ✓
      </button>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({
  workout, clientId, planId, sessionId, onClose, onComplete,
}) => {
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restSeconds, setRestSeconds] = useState(90);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const startTimeRef = useRef<Date>(new Date());

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // workout_log anlegen
      const { data: logData } = await supabase
        .from('workout_logs')
        .insert({
          client_id: clientId,
          plan_workout_id: workout.id,
          session_id: sessionId || null,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!logData) { setInitializing(false); return; }
      setWorkoutLogId(logData.id);

      // Für jede Übung: previousBest + smartWeight laden
      const logs: ExerciseLog[] = await Promise.all(
        workout.exercises.map(async (ex) => {
          const bw = isBodyweight(ex);
          const setsCount = ex.sets || 3;
          const defaultReps = parseRepsTarget(ex.reps_target);

          // Letzten Satz laden (für previousBest-Anzeige)
          const { data: prevSets } = await supabase
            .from('set_logs')
            .select('weight_kg, reps_done, workout_log_id')
            .eq('exercise_name', ex.name)
            .in(
              'workout_log_id',
              (await supabase
                .from('workout_logs')
                .select('id')
                .eq('client_id', clientId)
                .neq('id', logData.id)
                .not('completed_at', 'is', null)
              ).data?.map(l => l.id) || []
            )
            .order('logged_at', { ascending: false })
            .limit(1);

          const prev = prevSets?.[0] ?? null;

          // Smart weight (nur wenn nicht Bodyweight)
          const suggestedWeight = bw
            ? '0'
            : await calculateSmartWeight(ex.name, clientId, logData.id, workout.phase_type);

          return {
            exercise: ex,
            skipped: false,
            previousBest: prev ? { weight: Number(prev.weight_kg), reps: prev.reps_done } : null,
            suggestedWeight,
            sets: Array.from({ length: setsCount }, (_, i) => ({
              setNumber: i + 1,
              reps: defaultReps,
              weight: bw ? '0' : suggestedWeight,
              logged: false,
              isPR: false,
            })),
          };
        })
      );

      setExerciseLogs(logs);
      setInitializing(false);
    };

    init();
  }, [workout, clientId, sessionId]);

  const currentLog = exerciseLogs[currentExerciseIndex];
  const activeSetIndex = currentLog?.sets.findIndex(s => !s.logged) ?? -1;

  // ── Satz loggen ────────────────────────────────────────────────────────────
  const handleLogSet = useCallback(async (reps: string, weight: string) => {
    if (!workoutLogId || !currentLog) return;
    setSaving(true);

    const setNumber = activeSetIndex + 1;
    const exercise = currentLog.exercise;

    const { data: setData } = await supabase
      .from('set_logs')
      .insert({
        workout_log_id: workoutLogId,
        plan_exercise_id: exercise.id,
        exercise_name: exercise.name,
        set_number: setNumber,
        reps_done: parseInt(reps),
        weight_kg: parseFloat(weight),
        logged_at: new Date().toISOString(),
      })
      .select()
      .single();

    const isPR = setData?.is_pr || false;

    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[currentExerciseIndex].sets];
      sets[activeSetIndex] = { ...sets[activeSetIndex], reps, weight, logged: true, isPR };
      // Nächsten Satz mit gleichen Werten vorausfüllen
      if (activeSetIndex + 1 < sets.length && !sets[activeSetIndex + 1].logged) {
        sets[activeSetIndex + 1] = { ...sets[activeSetIndex + 1], reps, weight };
      }
      next[currentExerciseIndex] = { ...next[currentExerciseIndex], sets };
      return next;
    });

    setSaving(false);

    const isLastSet = activeSetIndex === currentLog.sets.length - 1;
    if (!isLastSet) {
      setRestSeconds(exercise.rest_seconds || 90);
      setShowRestTimer(true);
    }
  }, [workoutLogId, currentLog, activeSetIndex, currentExerciseIndex]);

  // ── Übung überspringen ─────────────────────────────────────────────────────
  const handleSkipExercise = () => {
    setExerciseLogs(prev => {
      const next = [...prev];
      next[currentExerciseIndex] = { ...next[currentExerciseIndex], skipped: true };
      return next;
    });
    // Zur nächsten Übung wechseln
    const nextIdx = exerciseLogs.findIndex((l, i) => i > currentExerciseIndex && !l.skipped);
    if (nextIdx !== -1) setCurrentExerciseIndex(nextIdx);
  };

  // ── Training beenden ───────────────────────────────────────────────────────
  const handleFinish = async (force = false) => {
    const hasOpenSets = exerciseLogs.some(log =>
      !log.skipped && log.sets.some(s => !s.logged)
    );

    if (hasOpenSets && !force) {
      if (!window.confirm(
        'Es sind noch offene Sätze vorhanden. Training trotzdem beenden?\n\nBisher abgeschlossene Sätze werden gespeichert.'
      )) return;
    }

    if (!workoutLogId) return;

    const now = new Date();
    await supabase
      .from('workout_logs')
      .update({ completed_at: now.toISOString() })
      .eq('id', workoutLogId);

    // Zeiger vorrücken
    if (planId && workout.id) {
      const { data: nextWorkout } = await supabase
        .from('plan_workouts')
        .select('id, week_number')
        .eq('plan_id', planId)
        .or(`week_number.gt.${workout.week_number ?? 0},and(week_number.eq.${workout.week_number ?? 0},order_in_week.gt.${workout.order_in_week ?? 0})`)
        .order('week_number', { ascending: true })
        .order('order_in_week', { ascending: true })
        .limit(1)
        .maybeSingle();

      await supabase
        .from('training_plans')
        .update({ next_plan_workout_id: nextWorkout?.id ?? null })
        .eq('id', planId);

      // Plan-End-Alert
      const { data: planMeta } = await supabase
        .from('training_plans')
        .select('weeks_total')
        .eq('id', planId)
        .single();

      if (planMeta?.weeks_total && nextWorkout?.week_number === planMeta.weeks_total) {
        await supabase.from('plan_end_alerts').insert({
          client_id: clientId, plan_id: planId, alerted_at: now.toISOString(),
        }).catch(() => {});
      }
    }

    // Zusammenfassung
    const duration = Math.round((now.getTime() - startTimeRef.current.getTime()) / 60000);
    let totalSets = 0;
    let totalVolume = 0;
    const prs: string[] = [];

    exerciseLogs.forEach(log => {
      if (log.skipped) return;
      log.sets.forEach(s => {
        if (s.logged) {
          totalSets++;
          totalVolume += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
          if (s.isPR) prs.push(log.exercise.name);
        }
      });
    });

    onComplete({ duration, totalSets, totalVolume, prs });
  };

  const allDone = exerciseLogs.length > 0 &&
    exerciseLogs.every(log => log.skipped || log.sets.every(s => s.logged));

  const progress = exerciseLogs.length === 0 ? 0 :
    exerciseLogs.reduce((sum, log) => {
      if (log.skipped) return sum + log.sets.length;
      return sum + log.sets.filter(s => s.logged).length;
    }, 0) /
    exerciseLogs.reduce((sum, log) => sum + log.sets.length, 0);

  if (initializing) {
    return (
      <div className="fixed inset-0 bg-white z-40 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {showRestTimer && (
        <RestTimer seconds={restSeconds} onDone={() => setShowRestTimer(false)} />
      )}

      <div className="fixed inset-0 bg-slate-50 z-40 flex flex-col" style={{ fontFamily: "'Montserrat', sans-serif" }}>

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Training</p>
              <p className="text-base font-bold text-slate-900 leading-tight">{workout.day_label}</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Training beenden – immer sichtbar */}
              <button
                onClick={() => handleFinish(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
              >
                <Flag className="w-3.5 h-3.5" />
                {allDone ? 'Abschließen' : 'Beenden'}
              </button>
              {/* Abbrechen ohne speichern */}
              <button
                onClick={() => {
                  if (window.confirm('Abbrechen? Der bisherige Fortschritt wird trotzdem gespeichert.')) onClose();
                }}
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {/* Phase-Label */}
          {workout.phase_type && workout.phase_type !== 'load' && (
            <div className="mt-1.5">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${
                workout.phase_type === 'deload' ? 'bg-blue-100 text-blue-600'
                : workout.phase_type === 'test' ? 'bg-orange-100 text-orange-600'
                : 'bg-violet-100 text-violet-600'
              }`}>
                {workout.phase_type === 'deload' ? '🔄 Deload-Woche'
                  : workout.phase_type === 'test' ? '🎯 Test-Woche'
                  : 'Einführung'}
              </span>
            </div>
          )}
        </div>

        {/* Exercise Tabs */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0 bg-white border-b border-slate-100">
          {exerciseLogs.map((log, i) => {
            const loggedSets = log.sets.filter(s => s.logged).length;
            const totalSets = log.sets.length;
            const done = log.skipped || loggedSets === totalSets;
            const active = i === currentExerciseIndex;
            return (
              <button
                key={i}
                onClick={() => setCurrentExerciseIndex(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors relative ${
                  log.skipped
                    ? 'bg-slate-100 text-slate-400 line-through'
                    : active
                    ? 'bg-primary text-white'
                    : done
                    ? 'bg-primary/15 text-primary'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {log.exercise.name.split(' ')[0]}
                {!log.skipped && (
                  <span className="ml-1 opacity-70 tabular-nums">
                    {loggedSets}/{totalSets}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {currentLog && !currentLog.skipped && (
            <div className="space-y-3">
              {/* Übungs-Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{currentLog.exercise.name}</h2>
                  {currentLog.exercise.alternative_name && (
                    <p className="text-xs text-slate-400">{currentLog.exercise.alternative_name}</p>
                  )}
                  {currentLog.exercise.notes && (
                    <p className="text-xs text-slate-500 mt-1 italic">{currentLog.exercise.notes}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-primary tabular-nums">
                    {currentLog.exercise.sets} × {currentLog.exercise.reps_target}
                  </p>
                  {currentLog.exercise.rest_seconds && (
                    <p className="text-xs text-slate-400">{Math.floor(currentLog.exercise.rest_seconds / 60)}:{String(currentLog.exercise.rest_seconds % 60).padStart(2, '0')} Pause</p>
                  )}
                </div>
              </div>

              {/* previousBest + suggestedWeight Hinweis */}
              <div className="flex gap-2">
                {currentLog.previousBest && !isBodyweight(currentLog.exercise) && (
                  <div className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Letztes Mal</p>
                    <p className="text-sm font-bold text-slate-700 tabular-nums">
                      {currentLog.previousBest.weight}kg × {currentLog.previousBest.reps}
                    </p>
                  </div>
                )}
                {currentLog.suggestedWeight && currentLog.suggestedWeight !== '0' && !isBodyweight(currentLog.exercise) && (
                  <div className="flex-1 rounded-lg bg-primary/8 border border-primary/20 px-3 py-2 text-center">
                    <p className="text-[10px] text-primary/70 uppercase tracking-wide">
                      {workout.phase_type === 'deload' ? '🔄 Deload' : workout.phase_type === 'test' ? '🎯 Ziel' : '📈 Vorschlag'}
                    </p>
                    <p className="text-sm font-bold text-primary tabular-nums">{currentLog.suggestedWeight} kg</p>
                  </div>
                )}
                {isBodyweight(currentLog.exercise) && (
                  <div className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Körpergewicht</p>
                    <p className="text-sm font-bold text-slate-700">Kein Zusatzgewicht</p>
                  </div>
                )}
              </div>

              {/* Sätze */}
              <div className="space-y-2">
                {currentLog.sets.map((set, i) => (
                  <SetRow
                    key={i}
                    set={set}
                    isActive={i === activeSetIndex}
                    onLog={handleLogSet}
                    targetReps={parseRepsTarget(currentLog.exercise.reps_target)}
                    suggestedWeight={currentLog.suggestedWeight}
                    bodyweight={isBodyweight(currentLog.exercise)}
                  />
                ))}
              </div>

              {/* Übung überspringen */}
              {activeSetIndex !== -1 && (
                <button
                  onClick={handleSkipExercise}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  Übung überspringen
                </button>
              )}
            </div>
          )}

          {currentLog?.skipped && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <SkipForward className="w-8 h-8 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Übung übersprungen</p>
              <button
                onClick={() => {
                  setExerciseLogs(prev => {
                    const next = [...prev];
                    next[currentExerciseIndex] = { ...next[currentExerciseIndex], skipped: false };
                    return next;
                  });
                }}
                className="mt-3 text-xs text-primary hover:underline"
              >
                Doch machen
              </button>
            </div>
          )}
        </div>

        {/* Footer: Navigation */}
        <div className="bg-white border-t border-slate-200 px-4 py-3 flex gap-3 flex-shrink-0">
          <button
            onClick={() => setCurrentExerciseIndex(i => Math.max(0, i - 1))}
            disabled={currentExerciseIndex === 0}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm disabled:opacity-40 transition-colors hover:bg-slate-50"
          >
            ← Zurück
          </button>
          {currentExerciseIndex < exerciseLogs.length - 1 ? (
            <button
              onClick={() => setCurrentExerciseIndex(i => i + 1)}
              className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium text-sm transition-colors hover:bg-slate-200"
            >
              Weiter →
            </button>
          ) : (
            <button
              onClick={() => handleFinish(allDone)}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm transition-colors hover:bg-primary/90"
            >
              {allDone ? '🏁 Abschließen' : 'Beenden'}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default WorkoutLogger;
