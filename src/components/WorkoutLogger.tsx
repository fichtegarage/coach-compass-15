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
}

interface ExerciseLog {
  exercise: PlanExercise;
  sets: SetEntry[];
  previousBest: { weight: number; reps: number } | null;
}

interface WorkoutLoggerProps {
  workout: PlanWorkout;
  clientId: string;
  sessionId?: string;  // optional – verknüpft Log mit PT-Session
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
            stroke="#10b981" strokeWidth="8"
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
}> = ({ set, isActive, onLog, targetReps, previousWeight }) => {
  const [reps, setReps] = useState(set.reps || targetReps);
  const [weight, setWeight] = useState(set.weight || previousWeight);

  if (set.logged) {
    return (
      <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-emerald-50 border border-emerald-200">
        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
          {set.isPR
            ? <Trophy className="w-3.5 h-3.5 text-white" />
            : <Check className="w-3.5 h-3.5 text-white" />}
        </div>
        <span className="text-sm text-slate-500">Satz {set.setNumber}</span>
        <span className="ml-auto text-sm font-semibold text-slate-700 tabular-nums">
          {set.reps} × {set.weight} kg
        </span>
        {set.isPR && (
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
    <div className="py-3 px-4 rounded-xl bg-white border-2 border-emerald-500 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
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
            placeholder="0"
            className="w-full text-center text-2xl font-bold text-slate-900 bg-slate-50 rounded-xl py-3 border border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
            placeholder={targetReps || '0'}
            className="w-full text-center text-2xl font-bold text-slate-900 bg-slate-50 rounded-xl py-3 border border-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
        className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base transition-colors active:scale-95"
      >
        Satz abschließen ✓
      </button>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({ workout, clientId, sessionId, onClose, onComplete }) => {
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
    setSaving(true);

    const setNumber = activeSetIndex + 1;
    const exercise = currentLog.exercise;

    // Satz in DB speichern
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

    // Lokalen State updaten
    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[currentExerciseIndex].sets];
      sets[activeSetIndex] = { ...sets[activeSetIndex], reps, weight, logged: true, isPR };
      next[currentExerciseIndex] = { ...next[currentExerciseIndex], sets };
      return next;
    });

    setSaving(false);

    // Rest-Timer starten wenn Pause definiert und nicht letzter Satz
    const isLastSet = activeSetIndex === currentLog.sets.length - 1;
    if (!isLastSet && exercise.rest_seconds) {
      setRestSeconds(exercise.rest_seconds);
      setShowRestTimer(true);
    }
  }, [workoutLogId, currentLog, activeSetIndex, currentExerciseIndex]);

  const handleFinish = async () => {
    if (!workoutLogId) return;

    // workout_log abschließen
    const now = new Date();
    await supabase
      .from('workout_logs')
      .update({ completed_at: now.toISOString() })
      .eq('id', workoutLogId);

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
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
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
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
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
            return (
              <button
                key={i}
                onClick={() => setCurrentExerciseIndex(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-emerald-500 text-white'
                    : done
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
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
              className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-lg transition-colors active:scale-95"
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
                className="text-emerald-600 font-medium"
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
