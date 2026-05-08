/**
 * WorkoutLogger.tsx
 *
 * Kunden-seitiger Workout-Logger.
 * Aufgerufen aus ClientPlanView wenn Kunde auf "Training starten" tippt.
 *
 * UX-Prinzipien:
 * - Große Tipp-Flächen (Gym-tauglich, eine Hand)
 * - Letzter Wert wird automatisch vorausgefüllt
 * - Rest-Timer startet automatisch nach jedem Satz
 * - SUPERSET-SUPPORT: Timer nur nach letzter Übung im Superset
 * - PR-Erkennung in Echtzeit (🏆)
 * - Zusammenfassung nach Abschluss
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Check, Trophy, Timer, Loader2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanExercise {
  id: string;
  name: string;
  sets: number | null;
  reps_target: string;
  rest_seconds: number | null;
  notes: string | null;
  alternative_name: string | null;
  superset_label: string | null;
  superset_order: number;
}

interface PlanWorkout {
  id: string;
  day_label: string;
  exercises: PlanExercise[];
}

interface SetEntry {
  setNumber: number;
  reps: string;
  weight: string;
  logged: boolean;
  isPR: boolean;
  syncStatus: 'synced' | 'pending' | 'error';
}

interface ExerciseLog {
  exercise: PlanExercise;
  sets: SetEntry[];
  previousBest: { weight: number; reps: number } | null;
}

interface WorkoutLoggerProps {
  workout: PlanWorkout;
  clientId: string;
  planId?: string;      // für Zeiger-Vorrücken nach Abschluss
  sessionId?: string;   // optional – verknüpft Log mit PT-Session
  onClose: () => void;
  onComplete: (summary: WorkoutSummary) => void;
}

interface WorkoutSummary {
  duration: number; // minutes
  totalSets: number;
  totalVolume: number; // kg
  prs: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepsTarget(repsTarget: string): string {
  // "8-10" → "8", "AMRAP" → "", "5" → "5"
  if (!repsTarget) return '';
  const match = repsTarget.match(/^\d+/);
  return match ? match[0] : '';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function withRetry(
  fn: () => Promise<{ data: any; error: any }>,
  maxAttempts = 3
): Promise<{ data: any; error: any }> {
  let last: { data: any; error: any } = { data: null, error: new Error('not started') };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    last = await fn();
    if (!last.error) return last;
  }
  return last;
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
      {/* Circular progress */}
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
      <Button
        onClick={onDone}
        className="bg-white/20 hover:bg-white/30 text-white border-0 px-8"
        variant="outline"
      >
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
  previousWeight: string;
  onRetry?: () => void;
}> = ({ set, isActive, onLog, targetReps, previousWeight, onRetry }) => {
  const [reps, setReps] = useState(set.reps || targetReps);
  const [weight, setWeight] = useState(set.weight || previousWeight);

  if (set.logged) {
    const isError = set.syncStatus === 'error';
    const isPending = set.syncStatus === 'pending';
    return (
      <div className={`flex items-center gap-3 py-3 px-4 rounded-xl border ${
        isError
          ? 'bg-red-50 border-red-300'
          : 'bg-primary/10 border-primary/30'
      }`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
          isError ? 'bg-red-400' : 'bg-primary'
        }`}>
          {isPending
            ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            : isError
            ? <span className="text-white text-xs font-bold">!</span>
            : set.isPR
            ? <Trophy className="w-3.5 h-3.5 text-white" />
            : <Check className="w-3.5 h-3.5 text-white" />}
        </div>
        <span className="text-sm text-slate-500">Satz {set.setNumber}</span>
        <span className="ml-auto text-sm font-semibold text-slate-700 tabular-nums">
          {set.reps} × {set.weight} kg
        </span>
        {isError && (
          <button
            onClick={onRetry}
            className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full border border-red-300 hover:bg-red-200"
          >
            ↻ Wiederholen
          </button>
        )}
        {!isError && set.isPR && (
          <span className="text-xs font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            PR 🏆
          </span>
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

  // Active set – large inputs
  return (
    <div className="py-3 px-4 rounded-xl bg-white border-2 border-primary shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-white">{set.setNumber}</span>
        </div>
        <span className="text-sm font-medium text-slate-700">Satz {set.setNumber}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Weight */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Gewicht (kg)</p>
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            onFocus={e => e.target.select()}
            placeholder="0"
            className="w-full text-center text-2xl font-bold text-slate-900 bg-slate-50 rounded-xl py-3 border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {/* Quick +/- */}
          <div className="flex gap-1 mt-1.5">
            {['-5', '-2.5', '+2.5', '+5'].map(v => (
              <button
                key={v}
                onClick={() => setWeight(w => {
                  const n = parseFloat(w || '0') + parseFloat(v);
                  return Math.max(0, n).toString();
                })}
                className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {/* Reps */}
        <div>
          <p className="text-xs text-slate-400 mb-1">Wiederholungen</p>
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={e => setReps(e.target.value)}
            onFocus={e => e.target.select()}
            placeholder={targetReps || '0'}
            className="w-full text-center text-2xl font-bold text-slate-900 bg-slate-50 rounded-xl py-3 border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-1 mt-1.5">
            {['-2', '-1', '+1', '+2'].map(v => (
              <button
                key={v}
                onClick={() => setReps(r => {
                  const n = parseInt(r || '0') + parseInt(v);
                  return Math.max(0, n).toString();
                })}
                className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={() => onLog(reps, weight)}
        disabled={!reps || !weight}
        className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base transition-colors active:scale-95"
      >
        Satz abschließen ✓
      </button>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({ workout, clientId, planId, sessionId, onClose, onComplete }) => {
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restSeconds, setRestSeconds] = useState(90);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const startTimeRef = useRef<Date>(new Date());

  // ── Init: workout_log anlegen + previousBest laden ────────────────────────
  useEffect(() => {
    const init = async () => {
      // 1. workout_log erstellen
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

      // 2. Für jede Übung: letzten besten Satz laden
      const logs: ExerciseLog[] = await Promise.all(
        workout.exercises.map(async (ex) => {
          const { data: prevSets } = await supabase
            .from('set_logs')
            .select('weight_kg, reps_done')
            .eq('exercise_name', ex.name)
            .in(
              'workout_log_id',
              (await supabase
                .from('workout_logs')
                .select('id')
                .eq('client_id', clientId)
                .neq('id', logData.id)
              ).data?.map(l => l.id) || []
            )
            .order('logged_at', { ascending: false })
            .limit(1);

          const prev = prevSets?.[0] ?? null;

          const setsCount = ex.sets || 3;
          const defaultReps = parseRepsTarget(ex.reps_target);
          const defaultWeight = prev ? String(prev.weight_kg) : '';

          return {
            exercise: ex,
            previousBest: prev ? { weight: prev.weight_kg, reps: prev.reps_done } : null,
            sets: Array.from({ length: setsCount }, (_, i) => ({
              setNumber: i + 1,
              reps: defaultReps,
              weight: defaultWeight,
              logged: false,
              isPR: false,
              syncStatus: 'synced' as const,
            })),
          };
        })
      );

      setExerciseLogs(logs);
      setInitializing(false);
    };

    init();
  }, [workout, clientId]);

  const currentLog = exerciseLogs[currentExerciseIndex];
  const activeSetIndex = currentLog?.sets.findIndex(s => !s.logged) ?? -1;

  const handleLogSet = useCallback(async (reps: string, weight: string) => {
    if (!workoutLogId || !currentLog) return;

    const exercise = currentLog.exercise;
    const loggedAt = new Date().toISOString();
    const capturedExIdx = currentExerciseIndex;
    const capturedSetIdx = activeSetIndex;

    // ── 1. Optimistic Update: Set sofort als pending anzeigen ─────────────────
    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[capturedExIdx].sets];
      sets[capturedSetIdx] = { ...sets[capturedSetIdx], reps, weight, logged: true, isPR: false, syncStatus: 'pending' };
      if (capturedSetIdx + 1 < sets.length && !sets[capturedSetIdx + 1].logged) {
        sets[capturedSetIdx + 1] = { ...sets[capturedSetIdx + 1], reps, weight };
      }
      next[capturedExIdx] = { ...next[capturedExIdx], sets };
      return next;
    });

    // ── 2. Rest-Timer sofort (nicht auf DB warten) ────────────────────────────
    const isLastSet = capturedSetIdx === currentLog.sets.length - 1;
    if (!isLastSet) {
      setRestSeconds(exercise.rest_seconds || 90);
      setShowRestTimer(true);
    }

    // ── 3. DB-Sync im Hintergrund mit Retry ───────────────────────────────────
    const { data: setData, error } = await withRetry(() =>
      supabase
        .from('set_logs')
        .insert({
          workout_log_id: workoutLogId,
          plan_exercise_id: exercise.id,
          exercise_name: exercise.name,
          set_number: capturedSetIdx + 1,
          reps_done: parseInt(reps),
          weight_kg: parseFloat(weight),
          logged_at: loggedAt,
        })
        .select()
        .single()
    );

    const isPR = setData?.is_pr || false;
    const newStatus: SetEntry['syncStatus'] = error ? 'error' : 'synced';

    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[capturedExIdx].sets];
      sets[capturedSetIdx] = { ...sets[capturedSetIdx], isPR, syncStatus: newStatus };
      next[capturedExIdx] = { ...next[capturedExIdx], sets };
      return next;
    });
  }, [workoutLogId, currentLog, activeSetIndex, currentExerciseIndex]);

  const handleRetrySync = useCallback(async (exIdx: number, setIdx: number) => {
    if (!workoutLogId) return;
    const log = exerciseLogs[exIdx];
    const set = log?.sets[setIdx];
    if (!set) return;

    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[exIdx].sets];
      sets[setIdx] = { ...sets[setIdx], syncStatus: 'pending' };
      next[exIdx] = { ...next[exIdx], sets };
      return next;
    });

    const { data: setData, error } = await withRetry(() =>
      supabase
        .from('set_logs')
        .insert({
          workout_log_id: workoutLogId,
          plan_exercise_id: log.exercise.id,
          exercise_name: log.exercise.name,
          set_number: set.setNumber,
          reps_done: parseInt(set.reps),
          weight_kg: parseFloat(set.weight),
          logged_at: new Date().toISOString(),
        })
        .select()
        .single()
    );

    const isPR = setData?.is_pr || false;
    const newStatus: SetEntry['syncStatus'] = error ? 'error' : 'synced';

    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[exIdx].sets];
      sets[setIdx] = { ...sets[setIdx], isPR, syncStatus: newStatus };
      next[exIdx] = { ...next[exIdx], sets };
      return next;
    });
  }, [workoutLogId, exerciseLogs]);

  const handleFinish = async () => {
    if (!workoutLogId) return;

    const now = new Date();
    await supabase
      .from('workout_logs')
      .update({ completed_at: now.toISOString() })
      .eq('id', workoutLogId);

    // ── Zeiger vorrücken ──────────────────────────────────────────────────────
    if (planId && workout.id) {
      // Nächstes Workout ermitteln
      const { data: nextWorkout } = await supabase
        .from('plan_workouts')
        .select('id, week_number, week_label, day_label')
        .eq('plan_id', planId)
        .or(`week_number.gt.${workout.week_number ?? 0},and(week_number.eq.${workout.week_number ?? 0},order_in_week.gt.${workout.order_in_week ?? 0})`)
        .order('week_number', { ascending: true })
        .order('order_in_week', { ascending: true })
        .limit(1)
        .maybeSingle();

      // Maximale Woche im Plan ermitteln
      const { data: planMeta } = await supabase
        .from('training_plans')
        .select('weeks_total')
        .eq('id', planId)
        .single();

      const maxWeek = planMeta?.weeks_total ?? null;
      const nextId = nextWorkout?.id ?? null;
      const nextWeek = nextWorkout?.week_number ?? null;

      // Zeiger updaten
      await supabase
        .from('training_plans')
        .update({ next_plan_workout_id: nextId })
        .eq('id', planId);

      // Notification an Trainer: wenn nächste Woche = letzte Woche UND Paket läuft noch
      if (maxWeek && nextWeek === maxWeek) {
        // Paket-Laufzeit prüfen
        const { data: clientData } = await supabase
          .from('clients')
        .select('full_name, user_id, packages(end_date)')
          .eq('id', clientId)
          .maybeSingle();

        const endDate = (clientData?.packages as any)?.[0]?.end_date
          ?? (clientData?.packages as any)?.end_date
          ?? null;

        const hasTimeLeft = endDate
          ? new Date(endDate) > new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // > 2 Wochen
          : true;

        if (hasTimeLeft) {
          await supabase.from('coach_alerts').insert({
            trainer_id: clientData?.user_id,
            client_id: clientId,
            alert_type: 'plan_end',
            priority: 'high',
            title: 'Plan-Ende naht',
            message: `⚠️ ${clientData?.full_name ?? 'Unbekannte Kundin'} erreicht die letzte Woche des Trainingsplans. Bitte neuen Plan vorbereiten.`,
          });
          await supabase.from('plan_end_alerts').insert({
            client_id: clientId,
            plan_id: planId,
            alerted_at: now.toISOString(),
          }).catch(() => {}); // Tabelle existiert noch nicht → ignorieren bis Migration
        }
      }
    }

    // Zusammenfassung berechnen
    const duration = Math.round((now.getTime() - startTimeRef.current.getTime()) / 60000);
    let totalSets = 0;
    let totalVolume = 0;
    const prs: string[] = [];

    exerciseLogs.forEach(log => {
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

  const allDone = exerciseLogs.length > 0 && exerciseLogs.every(log => log.sets.every(s => s.logged));
  const progress = exerciseLogs.length === 0 ? 0
    : exerciseLogs.reduce((sum, log) => sum + log.sets.filter(s => s.logged).length, 0) /
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
        <RestTimer
          seconds={restSeconds}
          onDone={() => setShowRestTimer(false)}
        />
      )}

      <div className="fixed inset-0 bg-slate-50 z-40 flex flex-col" style={{ fontFamily: "'Montserrat', sans-serif" }}>

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Training</p>
              <p className="text-base font-bold text-slate-900 leading-tight">{workout.day_label}</p>
            </div>
            <button
              onClick={() => {
                if (window.confirm('Training abbrechen? Der bisherige Fortschritt wird gespeichert.')) {
                  onClose();
                }
              }}
              className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Exercise Navigation */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0 bg-white border-b border-slate-100">
          {exerciseLogs.map((log, i) => {
            const loggedSets = log.sets.filter(s => s.logged).length;
            const totalSets = log.sets.length;
            const done = loggedSets === totalSets;
            const active = i === currentExerciseIndex;
            
            // Superset-Label anzeigen
            const supersetLabel = log.exercise.superset_label 
              ? `${log.exercise.superset_label}${log.exercise.superset_order}`
              : null;
            
            return (
              <button
                key={i}
                onClick={() => setCurrentExerciseIndex(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary text-white'
                    : done
                    ? 'bg-primary/20 text-primary'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {supersetLabel && <span className="font-bold mr-1">{supersetLabel}</span>}
                {log.exercise.name.split(' ')[0]}
                {done && ' ✓'}
                {!done && active && ` ${loggedSets}/${totalSets}`}
              </button>
            );
          })}
        </div>

        {/* Current Exercise */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {currentLog && (
            <>
              {/* Exercise Header */}
              <div className="flex items-start justify-between">
                <div>
                  {/* Superset-Badge */}
                  {currentLog.exercise.superset_label && (
                    <div className="inline-flex items-center gap-1.5 mb-1.5 px-2 py-0.5 rounded-full bg-blue-100 border border-blue-300">
                      <span className="text-xs font-bold text-blue-700">
                        {currentLog.exercise.superset_label}{currentLog.exercise.superset_order}
                      </span>
                      {exerciseLogs[currentExerciseIndex + 1]?.exercise?.superset_label === currentLog.exercise.superset_label && (
                        <span className="text-xs text-blue-600">
                          ↔ {exerciseLogs[currentExerciseIndex + 1].exercise.superset_label}{exerciseLogs[currentExerciseIndex + 1].exercise.superset_order}
                        </span>
                      )}
                    </div>
                  )}
                  
                  <h2 className="text-xl font-bold text-slate-900">{currentLog.exercise.name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {currentLog.exercise.sets} Sätze · {currentLog.exercise.reps_target} Wdh.
                    {currentLog.exercise.rest_seconds && ` · ${currentLog.exercise.rest_seconds}s Pause`}
                  </p>
                  {currentLog.previousBest && (
                    <p className="text-xs text-slate-400 mt-1">
                      Letztes Mal: {currentLog.previousBest.weight}kg × {currentLog.previousBest.reps}
                    </p>
                  )}
                  {/* Ersatzübung */}
                  {currentLog.exercise.alternative_name && !currentLog.sets.some(s => s.logged) && (
                    <button
                      onClick={() => {
                        setExerciseLogs(prev => {
                          const next = [...prev];
                          const log = { ...next[currentExerciseIndex] };
                          log.exercise = {
                            ...log.exercise,
                            name: log.exercise.alternative_name!,
                            alternative_name: log.exercise.name,
                          };
                          next[currentExerciseIndex] = log;
                          return next;
                        });
                      }}
                      className="mt-1.5 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      ⇄ Ersetzen durch: {currentLog.exercise.alternative_name}
                    </button>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentExerciseIndex(i => Math.max(0, i - 1))}
                    disabled={currentExerciseIndex === 0}
                    className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    onClick={() => setCurrentExerciseIndex(i => Math.min(exerciseLogs.length - 1, i + 1))}
                    disabled={currentExerciseIndex === exerciseLogs.length - 1}
                    className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>

              {currentLog.exercise.notes && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                  <p className="text-xs text-blue-600">💡 {currentLog.exercise.notes}</p>
                </div>
              )}

              {/* Sets */}
              <div className="space-y-2">
                {currentLog.sets.map((set, si) => (
                  <SetRow
                    key={si}
                    set={set}
                    isActive={si === activeSetIndex}
                    targetReps={parseRepsTarget(currentLog.exercise.reps_target)}
                    previousWeight={currentLog.previousBest ? String(currentLog.previousBest.weight) : ''}
                    onLog={(reps, weight) => handleLogSet(reps, weight)}
                    onRetry={() => handleRetrySync(currentExerciseIndex, si)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-4 py-3 flex-shrink-0 safe-area-bottom">
          {allDone ? (
            <button
              onClick={handleFinish}
              className="w-full py-4 rounded-2xl bg-primary hover:bg-primary/90 text-white font-bold text-lg transition-colors active:scale-95"
            >
              Training abschließen 🎉
            </button>
          ) : (
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>
                {exerciseLogs.reduce((s, l) => s + l.sets.filter(x => x.logged).length, 0)} /
                {exerciseLogs.reduce((s, l) => s + l.sets.length, 0)} Sätze
              </span>
              {saving && <span className="flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Speichert...</span>}
              <button
                onClick={() => {
                  const next = exerciseLogs.findIndex((l, i) => i > currentExerciseIndex && !l.sets.every(s => s.logged));
                  if (next !== -1) setCurrentExerciseIndex(next);
                }}
                className="text-primary font-medium"
              >
                Nächste Übung →
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default WorkoutLogger;
