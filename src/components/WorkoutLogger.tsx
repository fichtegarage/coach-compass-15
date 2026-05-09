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
 * - Zusammenfasssung nach Abschluss
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
  is_timed: boolean;
  duration_seconds: number | null;
  weight_target: string | null;
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
  duration?: number;
  logged: boolean;
  isPR: boolean;
  syncStatus: 'synced' | 'pending' | 'error';
}

interface ExerciseLog {
     exercise: PlanExercise;
     sets: SetEntry[];
     previousBest: { weight: number; reps: number } | null;
     previousBestDuration?: number | null;
     progressionHint?: string;
     progressionTone?: 'info' | 'success' | 'warning' | 'neutral';
     progressionDuration?: number;
   }

interface WorkoutLoggerProps {
  workout: PlanWorkout;
  clientId: string;
  planId?: string;      // für Zeiger-Vorrücken nach Abschluss
  sessionId?: string;   // optional – verknüpft Log mit PT-Session
  mode?: 'client' | 'coach';  // NEU-28: Coach-Side-Logging via SessionsPage
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

// ── Hint-Anzeige Farb-Mapping ─────────────────────────────────────────────────
function hintToneClasses(tone: 'info' | 'success' | 'warning' | 'neutral' | undefined): string {
  switch (tone) {
    case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'warning': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'info':    return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'neutral':
    default:        return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

// ── Equipment-Inkremente & Algorithmus ────────────────────────────────────────
// Reale Gewichts-Schritte je nach Equipment (Studio-Realität):
//   Langhantel: kleinste Scheibe 1,25 kg/Seite → 2,5 kg-Schritte
//   SZ-Stange:  ebenfalls 2,5 kg-Schritte
//   Kabelzug/Maschine: typischer Stack 5 kg-Schritte
//   Kurzhanteln: 2 kg-Abstände
function inferEquipmentIncrement(exerciseName: string): number {
  const name = exerciseName.toLowerCase();
  if (/\b(kurzhantel|kh|dumbbell|db)\b/.test(name)) return 2;
  if (/\b(kabel|cable|kabelzug|seilzug|lat)\b/.test(name)) return 5;
  if (/\b(maschine|machine|gerät|geraet|stack)\b/.test(name)) return 5;
  // Default: Langhantel-Standard 2,5 kg (deckt LH, SZ-Stange, Kreuzheben, Kniebeuge etc.)
  return 2.5;
}

function roundDownToIncrement(weight: number, increment: number): number {
  if (weight <= 0 || increment <= 0) return 0;
  return Math.floor(weight / increment) * increment;
}

const TARGET_RPE = 8;
const REPS_CAP = 13;
const SETS_CAP = 6;

interface PrevSet {
  weight_kg: number;
  reps_done: number;
  rpe: number | null;
  duration_seconds: number | null;
}

interface ProgressionResult {
  recommendedReps: string;
  recommendedWeight: string;
  hint: string;
  hintTone: 'info' | 'success' | 'warning' | 'neutral';
}

function parseRepRange(repsTarget: string): { min: number; max: number } {
  if (!repsTarget) return { min: 8, max: REPS_CAP };
  // "12–15" (Unicode-Bindestrich) und "10-12" (ASCII-Bindestrich)
  const range = repsTarget.match(/^(\d+)\s*[–\-]\s*(\d+)/);
  if (range) return { min: parseInt(range[1]), max: parseInt(range[2]) };
  const single = repsTarget.match(/^(\d+)/);
  if (single) {
    const n = parseInt(single[1]);
    return { min: n, max: n };
  }
  return { min: 8, max: REPS_CAP };
}

/**
 * Liefert Pre-Fill-Empfehlung für die nächste Set-Eingabe.
 * Reine Funktion, keine DB-Calls. Reihenfolge der Regeln (erste passende gewinnt):
 *   1. Erste Begegnung mit Übung → Plan-Werte oder leer
 *   2. Deload-Phase            → letztes Gewicht × 0,8
 *   3. Pause ≥ 56 Tage          → Plan-Reset
 *   4. Pause ≥ 28 Tage          → letztes Gewicht × 0,8
 *   5. Pause ≥ 14 Tage          → letztes Gewicht × 0,9
 *   6. Kein RPE erfasst         → Heuristik anhand erreichter Wdh
 *   7. RPE-Schnitt ≤ 7         → progressieren (Caps: Wdh ≥ 13 oder Sätze ≥ 6 → Gewicht hoch)
 *   8. RPE-Schnitt = 8         → halten (Zielbereich)
 *   9. RPE-Schnitt ≥ 9         → halten + Warnung
 */
function computeProgression(
  prevSets: PrevSet[],
  planEx: { reps_target: string; weight_target: string | null; sets: number | null; name: string },
  phaseType: string | null,
  daysSinceLastWorkout: number | null
): ProgressionResult {
  const repRange = parseRepRange(planEx.reps_target);
  const planTargetReps = String(repRange.min);
  const planTargetWeight = planEx.weight_target?.match(/[\d.]+/)?.[0] ?? '';
  const increment = inferEquipmentIncrement(planEx.name);

  // Regel 1: Erste Begegnung
  if (prevSets.length === 0) {
    return {
      recommendedReps: planTargetReps,
      recommendedWeight: planTargetWeight,
      hint: '⭐ Erste Begegnung — trag deinen Startwert ein',
      hintTone: 'info',
    };
  }

  // Aggregate aus letzter Begegnung
  const lastWeight = Math.max(...prevSets.map(s => Number(s.weight_kg) || 0));
  const lastReps = Math.max(...prevSets.map(s => Number(s.reps_done) || 0));
  const rpeValues = prevSets.map(s => s.rpe).filter((r): r is number => r !== null);
  const avgRpe = rpeValues.length > 0
    ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length
    : null;
  const allRepsHit = prevSets.every(s => (Number(s.reps_done) || 0) >= repRange.min);

  // Regel 2: Deload-Phase
  if (phaseType === 'deload') {
    const reduced = roundDownToIncrement(lastWeight * 0.8, increment);
    return {
      recommendedReps: String(lastReps),
      recommendedWeight: String(reduced),
      hint: '🪶 Deload-Woche — bewusst leichter',
      hintTone: 'info',
    };
  }

  // Regeln 3-5: Pause-Erkennung
  if (daysSinceLastWorkout !== null) {
    if (daysSinceLastWorkout >= 56) {
      return {
        recommendedReps: planTargetReps,
        recommendedWeight: planTargetWeight,
        hint: '🌱 Längere Pause — sanfter Wiedereinstieg mit Plan-Werten',
        hintTone: 'info',
      };
    }
    if (daysSinceLastWorkout >= 28) {
      const reduced = roundDownToIncrement(lastWeight * 0.8, increment);
      return {
        recommendedReps: String(lastReps),
        recommendedWeight: String(reduced),
        hint: '🌱 Du hast pausiert — Gewicht angepasst (-20 %)',
        hintTone: 'info',
      };
    }
    if (daysSinceLastWorkout >= 14) {
      const reduced = roundDownToIncrement(lastWeight * 0.9, increment);
      return {
        recommendedReps: String(lastReps),
        recommendedWeight: String(reduced),
        hint: '🌱 Pause erkannt — leicht reduziert (-10 %)',
        hintTone: 'info',
      };
    }
  }

  // Regel 6: Kein RPE → Heuristik
  if (avgRpe === null) {
    if (allRepsHit) {
      return {
        recommendedReps: String(lastReps + 1),
        recommendedWeight: String(lastWeight),
        hint: '↗ Alle Wdh. geschafft — versuch +1 Wdh.',
        hintTone: 'success',
      };
    }
    return {
      recommendedReps: String(lastReps),
      recommendedWeight: String(lastWeight),
      hint: '🔁 Letztes Mal war nicht alles drin — gleiche Werte',
      hintTone: 'neutral',
    };
  }

  // Regel 7: RPE niedrig (≤ 7) → progressieren
  if (avgRpe <= 7) {
    const repsCap = lastReps >= REPS_CAP;
    const setsCap = (planEx.sets ?? 0) >= SETS_CAP;
    if (repsCap || setsCap) {
      const trigger = repsCap ? `${REPS_CAP} Wdh erreicht` : `${SETS_CAP} Sätze erreicht`;
      return {
        recommendedReps: planTargetReps,
        recommendedWeight: String(lastWeight + increment),
        hint: `💪 ${trigger} — +${increment} kg, Wdh zurück auf ${planTargetReps}`,
        hintTone: 'success',
      };
    }
    return {
      recommendedReps: String(lastReps + 1),
      recommendedWeight: String(lastWeight),
      hint: '↗ Letzte Session war locker — versuch +1 Wdh.',
      hintTone: 'success',
    };
  }

  // Regel 8: RPE = 8 → halten (Zielbereich)
  if (avgRpe === TARGET_RPE) {
    return {
      recommendedReps: String(lastReps),
      recommendedWeight: String(lastWeight),
      hint: '🎯 Genau richtig — gleiche Werte halten',
      hintTone: 'neutral',
    };
  }

  // Regel 9: RPE ≥ 9 → halten + Warnung
  return {
    recommendedReps: String(lastReps),
    recommendedWeight: String(lastWeight),
    hint: '⚠️ Letzte Session war hart — gleiche Werte, Form-Check',
    hintTone: 'warning',
  };
}
// ── Time-Based Progression ────────────────────────────────────────────────────
const TIMED_PROGRESSION_STEPS = [
  20, 30, 40, 45, 50, 53, 57, 60, 62, 65, 67, 70, 73, 76, 79, 82, 85, 88, 91, 95, 100, 105, 110, 115, 120,
];
function findTimedStepIndex(seconds: number): number {
  let closest = 0;
  let minDiff = Math.abs(TIMED_PROGRESSION_STEPS[0] - seconds);
  for (let i = 1; i < TIMED_PROGRESSION_STEPS.length; i++) {
    const diff = Math.abs(TIMED_PROGRESSION_STEPS[i] - seconds);
    if (diff < minDiff) { minDiff = diff; closest = i; }
  }
  return closest;
}
interface TimedProgressionResult {
  recommendedDuration: number;
  hint: string;
  hintTone: 'info' | 'success' | 'warning' | 'neutral';
}
function computeTimedProgression(
  prevSets: PrevSet[],
  planEx: { duration_seconds: number | null; name: string },
  daysSinceLastWorkout: number | null,
): TimedProgressionResult {
  const planTarget = planEx.duration_seconds ?? TIMED_PROGRESSION_STEPS[0];
  if (prevSets.length === 0) {
    return { recommendedDuration: planTarget, hint: '⭐ Erste Begegnung — starte mit diesem Zielwert', hintTone: 'info' };
  }
  const prevDurations = prevSets.map(s => s.duration_seconds ?? 0).filter(d => d > 0);
  const lastDuration = prevDurations.length > 0 ? Math.max(...prevDurations) : planTarget;
  const currentIdx = findTimedStepIndex(lastDuration);
  const rpeValues = prevSets.map(s => s.rpe).filter((r): r is number => r !== null);
  const avgRpe = rpeValues.length > 0 ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : null;
  const allHeld = prevDurations.length > 0 && prevDurations.every(d => d >= TIMED_PROGRESSION_STEPS[currentIdx]);
  if (daysSinceLastWorkout !== null && daysSinceLastWorkout >= 56) {
    return { recommendedDuration: TIMED_PROGRESSION_STEPS[0], hint: '🌱 Längere Pause — sanfter Wiedereinstieg', hintTone: 'info' };
  }
  if (daysSinceLastWorkout !== null && daysSinceLastWorkout >= 28) {
    const backIdx = Math.max(0, currentIdx - 1);
    return { recommendedDuration: TIMED_PROGRESSION_STEPS[backIdx], hint: `🌱 Pause erkannt — eine Stufe zurück (${TIMED_PROGRESSION_STEPS[backIdx]}s)`, hintTone: 'info' };
  }
  if (daysSinceLastWorkout !== null && daysSinceLastWorkout >= 14) {
    return { recommendedDuration: TIMED_PROGRESSION_STEPS[currentIdx], hint: `🌱 Kurze Pause — aktuelle Stufe halten (${TIMED_PROGRESSION_STEPS[currentIdx]}s)`, hintTone: 'info' };
  }
  if (avgRpe === null) {
    if (allHeld && currentIdx < TIMED_PROGRESSION_STEPS.length - 1) {
      const nextIdx = currentIdx + 1;
      return { recommendedDuration: TIMED_PROGRESSION_STEPS[nextIdx], hint: `↗ Alle Sätze gehalten — nächste Stufe: ${TIMED_PROGRESSION_STEPS[nextIdx]}s`, hintTone: 'success' };
    }
    return { recommendedDuration: TIMED_PROGRESSION_STEPS[currentIdx], hint: `🔁 Aktuelle Stufe halten: ${TIMED_PROGRESSION_STEPS[currentIdx]}s`, hintTone: 'neutral' };
  }
  if (avgRpe <= 7 && allHeld && currentIdx < TIMED_PROGRESSION_STEPS.length - 1) {
    const nextIdx = currentIdx + 1;
    return { recommendedDuration: TIMED_PROGRESSION_STEPS[nextIdx], hint: `💪 Locker gehalten — nächste Stufe: ${TIMED_PROGRESSION_STEPS[nextIdx]}s`, hintTone: 'success' };
  }
  if (avgRpe <= 8) {
    return { recommendedDuration: TIMED_PROGRESSION_STEPS[currentIdx], hint: `🎯 Zielbereich — ${TIMED_PROGRESSION_STEPS[currentIdx]}s halten`, hintTone: 'neutral' };
  }
  if (!allHeld) {
    return { recommendedDuration: TIMED_PROGRESSION_STEPS[currentIdx], hint: `⚠️ Nicht alle Sätze vollständig — ${TIMED_PROGRESSION_STEPS[currentIdx]}s Ziel`, hintTone: 'warning' };
  }
  return { recommendedDuration: TIMED_PROGRESSION_STEPS[currentIdx], hint: `⚠️ War sehr anstrengend — aktuelle Stufe halten`, hintTone: 'warning' };
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

// ── RPE Rating Modal ──────────────────────────────────────────────────────────
// Erscheint nach dem letzten Satz einer Übung. Designprinzip:
//   - RPE 8 visuell hervorgehoben (Zielbereich → Default-Pfad fürs Auge)
//   - Skip als kleiner Text-Link, erst nach 1,5s sichtbar (Friction-Nudge)
//   - Pro-Knopf-Label statt nackter Zahl
const RpeRatingModal: React.FC<{
  exerciseName: string;
  onSubmit: (rpe: number | null) => void;
}> = ({ exerciseName, onSubmit }) => {
  const [skipVisible, setSkipVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSkipVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const options: Array<{ rpe: number; label: string; isTarget?: boolean }> = [
    { rpe: 6,  label: 'Easy' },
    { rpe: 7,  label: 'Moderat' },
    { rpe: 8,  label: 'Genau richtig', isTarget: true },
    { rpe: 9,  label: 'Sehr hart' },
    { rpe: 10, label: 'Maximal' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">{exerciseName}</p>
        <h3 className="text-xl font-bold text-slate-900 mb-1">Wie hart war's?</h3>
        <p className="text-sm text-slate-500 mb-5">
          Hilft deinem Coach, deinen Plan an dich anzupassen 💪
        </p>

        <div className="grid grid-cols-5 gap-2 mb-2">
          {options.map(({ rpe, label, isTarget }) => (
            <button
              key={rpe}
              onClick={() => onSubmit(rpe)}
              className={
                isTarget
                  ? 'flex flex-col items-center justify-center py-4 rounded-2xl bg-primary text-white font-bold transition-transform active:scale-95 shadow-lg shadow-primary/30 ring-2 ring-primary/40 ring-offset-2 ring-offset-white'
                  : 'flex flex-col items-center justify-center py-4 rounded-2xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-transform active:scale-95'
              }
            >
              <span className={isTarget ? 'text-2xl leading-none' : 'text-xl leading-none'}>{rpe}</span>
            </button>
          ))}
        </div>

        {/* Labels-Reihe unter den Knöpfen, kompakt, mit Zielbereich-Markierung */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          {options.map(({ rpe, label, isTarget }) => (
            <div key={rpe} className="text-center">
              <p className={
                isTarget
                  ? 'text-[10px] font-bold text-primary leading-tight'
                  : 'text-[10px] text-slate-400 leading-tight'
              }>
                {label}
              </p>
              {isTarget && (
                <p className="text-[9px] text-primary/70 mt-0.5">🎯 Ziel</p>
              )}
            </div>
          ))}
        </div>

        {/* Skip — bewusst dezent, verzögert, rechts unten */}
        <div className="flex justify-end min-h-[20px]">
          {skipVisible && (
            <button
              onClick={() => onSubmit(null)}
              className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-opacity"
              style={{ animation: 'fadeIn 0.3s ease-in' }}
            >
              Überspringen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Set Input Row ─────────────────────────────────────────────────────────────

const SetRow: React.FC<{
  set: SetEntry;
  isActive: boolean;
  onLog: (reps: string, weight: string, durationSeconds?: number) => void;
  targetReps: string;
  previousWeight: string;
  isTimed?: boolean;
  targetDuration?: number;
  showWeightField?: boolean;
  onRetry?: () => void;
}> = ({ set, isActive, onLog, targetReps, previousWeight, isTimed, targetDuration, showWeightField, onRetry }) => {
  const [reps, setReps] = useState(set.reps || targetReps);
  const [weight, setWeight] = useState(set.weight || previousWeight);
  const [elapsed, setElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStopped, setTimerStopped] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);
  const handleTimerStart = () => setTimerRunning(true);
  const handleTimerStop = () => { setTimerRunning(false); setTimerStopped(true); };

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
          {set.duration !== undefined ? `${set.duration}s` : `${set.reps} × ${set.weight} kg`}
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

  // Active set – timed exercise
  if (isTimed) {
    return (
      <div className="py-3 px-4 rounded-xl bg-white border-2 border-primary shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{set.setNumber}</span>
          </div>
          <span className="text-sm font-medium text-slate-700">Satz {set.setNumber}</span>
          {targetDuration && (
            <span className="ml-auto text-xs text-slate-400">Ziel: {targetDuration}s</span>
          )}
        </div>
        <div className="text-center mb-4">
          <div className="text-6xl font-bold tabular-nums text-slate-900 mb-2">
            {formatDuration(elapsed)}
          </div>
          {targetDuration && (
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden mx-4">
              <div
                className={`h-full rounded-full transition-all ${elapsed >= targetDuration ? 'bg-emerald-500' : 'bg-primary'}`}
                style={{ width: `${Math.min(100, (elapsed / targetDuration) * 100)}%` }}
              />
            </div>
          )}
          {targetDuration && elapsed >= targetDuration && (
            <p className="text-xs font-medium text-emerald-600 mt-2">✓ Zielzeit erreicht!</p>
          )}
        </div>
        {showWeightField && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-1">Gewicht (kg)</p>
            <input
              type="number" inputMode="decimal" value={weight}
              onChange={e => setWeight(e.target.value)} onFocus={e => e.target.select()}
              placeholder="0"
              className="w-full text-center text-2xl font-bold text-slate-900 bg-slate-50 rounded-xl py-3 border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        )}
        {!timerStopped ? (
          <button
            onClick={timerRunning ? handleTimerStop : handleTimerStart}
            className={`w-full py-4 rounded-xl font-bold text-base transition-colors active:scale-95 text-white ${timerRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary/90'}`}
          >
            {timerRunning ? '■ Stopp' : '▶ Start'}
          </button>
        ) : (
          <button
            onClick={() => onLog('', weight, elapsed)}
            className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition-colors active:scale-95"
          >
            Satz abschließen ✓
          </button>
        )}
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

  const WorkoutLogger: React.FC<WorkoutLoggerProps> = ({ workout, clientId, planId, sessionId, mode = 'client', onClose, onComplete }) => {
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restSeconds, setRestSeconds] = useState(90);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const startTimeRef = useRef<Date>(new Date());
  const [pendingRpe, setPendingRpe] = useState<{
    setLogId: string | null;
    exerciseName: string;
    exIdx: number;
    isLastExercise: boolean;
  } | null>(null);

  // ── Init: workout_log anlegen + Algorithmus-Pre-Fill laden ────────────────
  useEffect(() => {
    const init = async () => {
      // 1. Neues workout_log anlegen
      const { data: logData, error: logErr } = await supabase
        .from('workout_logs')
        .insert({
          client_id: clientId,
          plan_workout_id: workout.id,
          session_id: sessionId || null,
          started_at: new Date().toISOString(),
          logged_by: mode,  // NEU-28: 'client' (Default) oder 'coach' (aus SessionsPage)
        })
        .select()
        .single();

      if (logErr || !logData) { setInitializing(false); return; }
      setWorkoutLogId(logData.id);

      // 2. phase_type des aktuellen Plan-Workouts laden (für Deload-Erkennung)
      const { data: planWorkoutMeta } = await supabase
        .from('plan_workouts')
        .select('phase_type')
        .eq('id', workout.id)
        .maybeSingle();
      const phaseType = planWorkoutMeta?.phase_type ?? null;

      // 3. Letztes abgeschlossenes workout_log dieser Kundin (für Pause-Berechnung)
      const { data: prevWorkout } = await supabase
        .from('workout_logs')
        .select('id, started_at')
        .eq('client_id', clientId)
        .neq('id', logData.id)
        .not('completed_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const daysSinceLastWorkout = prevWorkout?.started_at
        ? Math.floor((Date.now() - new Date(prevWorkout.started_at).getTime()) / 86400000)
        : null;

      // 4. ALLE set_logs aus dem letzten Workout (gefiltert auf relevante Übungen)
      const exerciseNames = workout.exercises.map(ex => ex.name);
      let prevSetsByExercise: Record<string, PrevSet[]> = {};
      if (prevWorkout?.id && exerciseNames.length > 0) {
        const { data: prevSets } = await supabase
          .from('set_logs')
          .select('exercise_name, weight_kg, reps_done, rpe, duration_seconds')
          .eq('workout_log_id', prevWorkout.id)
          .in('exercise_name', exerciseNames);

        (prevSets ?? []).forEach((s: any) => {
          const key = s.exercise_name as string;
          if (!prevSetsByExercise[key]) prevSetsByExercise[key] = [];
          prevSetsByExercise[key].push({
            weight_kg: Number(s.weight_kg) || 0,
            reps_done: Number(s.reps_done) || 0,
            rpe: s.rpe !== null && s.rpe !== undefined ? Number(s.rpe) : null,
            duration_seconds: s.duration_seconds !== null && s.duration_seconds !== undefined ? Number(s.duration_seconds) : null,
          });
        });
      }

      // 5. Pro Übung: Empfehlung berechnen, ExerciseLog bauen
      const logs: ExerciseLog[] = workout.exercises.map((ex) => {
        const prevForEx = prevSetsByExercise[ex.name] ?? [];
        const setsCount = ex.sets || 3;
        let progressionHint: string;
        let progressionTone: ExerciseLog['progressionTone'];
        let progressionDuration: number | undefined;
        let initReps: string;
        let initWeight: string;
        if (ex.is_timed) {
          const timedRec = computeTimedProgression(
            prevForEx,
            { duration_seconds: ex.duration_seconds, name: ex.name },
            daysSinceLastWorkout,
          );
          progressionHint = timedRec.hint;
          progressionTone = timedRec.hintTone;
          progressionDuration = timedRec.recommendedDuration;
          initReps = '';
          initWeight = ex.weight_target?.match(/[\d.]+/)?.[0] ?? '';
        } else {
          const recommendation = computeProgression(
            prevForEx,
            { reps_target: ex.reps_target, weight_target: ex.weight_target ?? null, sets: ex.sets, name: ex.name },
            phaseType,
            daysSinceLastWorkout,
          );
          progressionHint = recommendation.hint;
          progressionTone = recommendation.hintTone;
          initReps = recommendation.recommendedReps;
          initWeight = recommendation.recommendedWeight;
        }
        const prevDurations = prevForEx.map(s => s.duration_seconds ?? 0).filter(d => d > 0);
        const previousBestDuration = ex.is_timed && prevDurations.length > 0
          ? Math.max(...prevDurations)
          : null;
        const bestPrev = !ex.is_timed && prevForEx.length > 0
          ? prevForEx.reduce((best, s) =>
              (s.weight_kg > best.weight_kg ||
                (s.weight_kg === best.weight_kg && s.reps_done > best.reps_done))
                ? s : best, prevForEx[0])
          : null;
        return {
          exercise: ex,
          previousBest: bestPrev ? { weight: bestPrev.weight_kg, reps: bestPrev.reps_done } : null,
          previousBestDuration,
          progressionHint,
          progressionTone,
          progressionDuration,
          sets: Array.from({ length: setsCount }, (_, i) => ({
            setNumber: i + 1,
            reps: initReps,
            weight: initWeight,
            logged: false,
            isPR: false,
            syncStatus: 'synced' as const,
          })),
        };
      });

      setExerciseLogs(logs);
      setInitializing(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, clientId]);

  const currentLog = exerciseLogs[currentExerciseIndex];
  const activeSetIndex = currentLog?.sets.findIndex(s => !s.logged) ?? -1;

  const handleLogSet = useCallback(async (reps: string, weight: string, durationSeconds?: number) => {
    if (!workoutLogId || !currentLog) return;

    const exercise = currentLog.exercise;
    const loggedAt = new Date().toISOString();
    const capturedExIdx = currentExerciseIndex;
    const capturedSetIdx = activeSetIndex;

    // ── 1. Optimistic Update: Set sofort als pending anzeigen ─────────────────
    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[capturedExIdx].sets];
      sets[capturedSetIdx] = { ...sets[capturedSetIdx], reps, weight, duration: durationSeconds, logged: true, isPR: false, syncStatus: 'pending' };
      if (capturedSetIdx + 1 < sets.length && !sets[capturedSetIdx + 1].logged) {
        sets[capturedSetIdx + 1] = { ...sets[capturedSetIdx + 1], reps, weight };
      }
      next[capturedExIdx] = { ...next[capturedExIdx], sets };
      return next;
    });

    // ── 2. Rest-Timer sofort, ODER RPE-Modal beim letzten Satz ────────────────
    const isLastSet = capturedSetIdx === currentLog.sets.length - 1;
    const isLastExercise = capturedExIdx === exerciseLogs.length - 1;
    if (!isLastSet) {
      setRestSeconds(exercise.rest_seconds || 90);
      setShowRestTimer(true);
    }
    // Hinweis: pendingRpe wird unten gesetzt, sobald die DB-Antwort die set_log-ID liefert

    // ── 3. DB-Sync im Hintergrund mit Retry ───────────────────────────────────
    const { data: setData, error } = await withRetry(() =>
      supabase
        .from('set_logs')
        .insert({
            workout_log_id: workoutLogId,
            plan_exercise_id: exercise.id,
            exercise_name: exercise.name,
            set_number: capturedSetIdx + 1,
            reps_done: durationSeconds !== undefined ? null : (parseInt(reps) || null),
            weight_kg: parseFloat(weight) || null,
            duration_seconds: durationSeconds ?? null,
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

    // ── 4. RPE-Modal triggern, wenn das der letzte Satz war ───────────────────
    if (isLastSet) {
      setPendingRpe({
        setLogId: setData?.id ?? null,
        exerciseName: exercise.name,
        exIdx: capturedExIdx,
        isLastExercise,
      });
    }
  }, [workoutLogId, currentLog, activeSetIndex, currentExerciseIndex, exerciseLogs.length]);

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
          reps_done: set.duration !== undefined ? null : (parseInt(set.reps) || null),
          weight_kg: parseFloat(set.weight) || null,
          duration_seconds: set.duration ?? null,
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

  const handleRpeSubmit = useCallback(async (rpe: number | null) => {
    if (!pendingRpe) return;
    const { setLogId, exIdx, isLastExercise } = pendingRpe;

    // Modal sofort schließen — DB-Update läuft im Hintergrund
    setPendingRpe(null);

    // RPE in DB schreiben (nur wenn nicht übersprungen UND set_logs-ID vorhanden)
    if (rpe !== null && setLogId) {
      // Fire-and-forget; bei Fehler nur loggen, nicht den UX-Fluss blockieren
      supabase
        .from('set_logs')
        .update({ rpe })
        .eq('id', setLogId)
        .then(({ error }) => {
          if (error) console.warn('RPE-Update fehlgeschlagen:', error);
        });
    }

    // Auto-Advance zur nächsten Übung, außer es war die letzte
    if (!isLastExercise) {
      setCurrentExerciseIndex(exIdx + 1);
    }
  }, [pendingRpe]);
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
      {pendingRpe && (
        <RpeRatingModal
          exerciseName={pendingRpe.exerciseName}
          onSubmit={handleRpeSubmit}
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
                    {currentLog.exercise.sets} Sätze ·{' '}
                    {currentLog.exercise.is_timed
                      ? `${currentLog.progressionDuration ?? currentLog.exercise.duration_seconds ?? '?'}s halten`
                      : `${currentLog.exercise.reps_target} Wdh.`}
                    {currentLog.exercise.rest_seconds && ` · ${currentLog.exercise.rest_seconds}s Pause`}
                  </p>
                  {currentLog.exercise.is_timed
                    ? currentLog.previousBestDuration != null && (
                        <p className="text-xs text-slate-400 mt-1">
                          Letztes Mal: {currentLog.previousBestDuration}s
                        </p>
                      )
                    : currentLog.previousBest && (
                        <p className="text-xs text-slate-400 mt-1">
                          Letztes Mal: {currentLog.previousBest.weight}kg × {currentLog.previousBest.reps}
                        </p>
                      )
                  }
                  {currentLog.progressionHint && (
                    <div className={`inline-flex items-center mt-2 px-2.5 py-1 rounded-full border text-xs font-medium ${hintToneClasses(currentLog.progressionTone)}`}>
                      {currentLog.progressionHint}
                    </div>
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
                    key={`${currentLog.exercise.id}-${si}`}
                    set={set}
                    isActive={si === activeSetIndex}
                    targetReps={parseRepsTarget(currentLog.exercise.reps_target)}
                    previousWeight={currentLog.previousBest ? String(currentLog.previousBest.weight) : ''}
                    isTimed={currentLog.exercise.is_timed}
                    targetDuration={currentLog.progressionDuration ?? currentLog.exercise.duration_seconds ?? undefined}
                    showWeightField={!!currentLog.exercise.weight_target}
                    onLog={(reps, weight, dur) => handleLogSet(reps, weight, dur)}
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
