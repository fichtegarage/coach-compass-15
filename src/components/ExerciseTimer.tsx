// ================================================================
// NEUE DATEI: src/components/ExerciseTimer.tsx
// Countdown-Timer für zeitbasierte Übungen (z.B. Plank, Side Plank)
// Einbindung: überall wo plan_exercises angezeigt werden
// ================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  durationSeconds: number;    // Gesamtdauer in Sekunden
  exerciseName?: string;      // z.B. "Plank" – wird im Alert verwendet
  compact?: boolean;          // true = kleine Version für Listen
  onComplete?: () => void;    // Callback wenn Timer abgelaufen
}

export default function ExerciseTimer({
  durationSeconds,
  exerciseName = 'Übung',
  compact = false,
  onComplete,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [running, setRunning]         = useState(false);
  const [finished, setFinished]       = useState(false);
  const intervalRef                   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Aufräumen beim Unmount
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const start = useCallback(() => {
    if (finished) return;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          setFinished(true);
          onComplete?.();
          // Vibration wenn unterstützt
          if ('vibrate' in navigator) navigator.vibrate([300, 100, 300]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [finished, onComplete]);

  const pause = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const reset = useCallback(() => {
    pause();
    setSecondsLeft(durationSeconds);
    setFinished(false);
  }, [durationSeconds, pause]);

  const toggle = () => (running ? pause() : start());

  // Fortschritt für SVG-Ring (0–1)
  const progress = secondsLeft / durationSeconds;

  // Zeit formatieren: mm:ss
  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Farbe je nach Restzeit
  const ringColor =
    progress > 0.5 ? '#6366f1'   // indigo – genug Zeit
    : progress > 0.25 ? '#f59e0b' // amber – wenig Zeit
    : '#ef4444';                   // rot – fast vorbei

  // ── Kompakte Version (für Listen/Workouts) ─────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {/* Kleine Uhr-Anzeige */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-mono transition-colors ${
            finished
              ? 'bg-green-900/30 border-green-700/50 text-green-400'
              : running
              ? 'bg-indigo-900/30 border-indigo-700/50 text-indigo-300'
              : 'bg-gray-800 border-gray-600 text-gray-300'
          }`}
        >
          <span className="text-xs">{finished ? '✓' : '⏱'}</span>
          <span>{finished ? 'Fertig!' : fmt(secondsLeft)}</span>
        </div>

        {/* Steuer-Buttons */}
        {!finished ? (
          <button
            onClick={toggle}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
              running
                ? 'border-amber-600 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50'
                : 'border-indigo-600 bg-indigo-900/30 text-indigo-300 hover:bg-indigo-900/50'
            }`}
          >
            {running ? '⏸' : '▶'}
          </button>
        ) : (
          <button
            onClick={reset}
            className="text-xs px-2 py-1 rounded-lg border border-gray-600 text-gray-400 hover:text-white transition-colors"
          >
            ↺
          </button>
        )}
      </div>
    );
  }

  // ── Vollversion (Modal / Workout-Screen) ──────────────────────
  const RADIUS  = 54;
  const CIRCUM  = 2 * Math.PI * RADIUS;
  const dashOff = CIRCUM * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-5 p-6">
      {/* Ring-Timer */}
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Hintergrund-Ring */}
          <circle cx="60" cy="60" r={RADIUS}
            fill="none" stroke="#374151" strokeWidth="8" />
          {/* Fortschritts-Ring */}
          <circle cx="60" cy="60" r={RADIUS}
            fill="none"
            stroke={finished ? '#22c55e' : ringColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUM}
            strokeDashoffset={dashOff}
            style={{ transition: running ? 'stroke-dashoffset 1s linear' : 'none' }}
          />
        </svg>
        {/* Zeitanzeige in der Mitte */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {finished ? (
            <span className="text-3xl">✅</span>
          ) : (
            <>
              <span className="text-2xl font-mono font-bold text-white">
                {fmt(secondsLeft)}
              </span>
              <span className="text-xs text-gray-400 mt-0.5">
                von {fmt(durationSeconds)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Übungsname */}
      <p className={`text-sm font-medium ${finished ? 'text-green-400' : 'text-gray-200'}`}>
        {finished ? `${exerciseName} – geschafft!` : exerciseName}
      </p>

      {/* Buttons */}
      <div className="flex items-center gap-3">
        {!finished ? (
          <>
            <button
              onClick={toggle}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all active:scale-95 ${
                running
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {running ? (
                <><span>⏸</span> Pause</>
              ) : secondsLeft < durationSeconds ? (
                <><span>▶</span> Weiter</>
              ) : (
                <><span>▶</span> Start</>
              )}
            </button>
            {secondsLeft < durationSeconds && (
              <button onClick={reset}
                className="px-4 py-2.5 rounded-xl border border-gray-600 text-gray-400 hover:text-white text-sm transition-colors">
                ↺ Reset
              </button>
            )}
          </>
        ) : (
          <button onClick={reset}
            className="px-5 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:text-white text-sm transition-colors">
            ↺ Nochmal
          </button>
        )}
      </div>
    </div>
  );
}

// ── Hilfs-Funktion: Standard-Dauer einer bekannten Übung ─────────
// Gibt eine sinnvolle Default-Dauer zurück wenn keine gesetzt ist
export function getDefaultDurationSeconds(exerciseName: string): number {
  const defaults: Record<string, number> = {
    'Plank':             60,
    'Side Plank':        30,
    'Dead Bug':          45,
    'Bird Dog':          45,
    'Cat-Cow':           60,
    'Farmers Walk':      40,
    'Mountain Climber':  30,
    'Pallof Press':      30,
    'Worlds Greatest Stretch': 60,
    'Hip Flexor Stretch': 45,
  };
  return defaults[exerciseName] ?? 30;
}
