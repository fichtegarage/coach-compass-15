// ================================================================
// NEUE DATEI: src/components/WarmupCooldownBlock.tsx
// Zeigt Warm-Up / Cool-Down Übungen passend zu den Hauptmuskeln.
// Einbau in TrainingPlanTab: vor und nach der Hauptübungsliste.
// ================================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import ExerciseTimer, { getDefaultDurationSeconds } from '@/components/ExerciseTimer';

interface PlanExercise {
  name: string;
  exercise_id: string | null;
  is_timed?: boolean;
  duration_seconds?: number | null;
  exercise_slot?: string;
}

interface SuggestedExercise {
  id: string;
  name: string;
  name_de: string;
  muscle_groups: string[];
  is_timed: boolean;
  duration_seconds?: number;
}

interface Props {
  type: 'warmup' | 'cooldown';
  mainExercises: PlanExercise[]; // Die Hauptübungen des Workouts
  workoutId?: string;            // Falls Slot-Übungen direkt aus DB kommen sollen
}

// Mapping Muskelgruppe → verständliches Deutsch
const MUSCLE_LABELS: Record<string, string> = {
  quadriceps:       'Oberschenkel vorne',
  hamstrings:       'Oberschenkel hinten',
  glutes:           'Gesäß',
  chest:            'Brust',
  latissimus:       'Rücken (Breite)',
  rhomboids:        'Rücken (Mitte)',
  shoulders:        'Schultern',
  core:             'Core / Bauch',
  erector_spinae:   'Wirbelsäule',
  hip_flexors:      'Hüftbeuger',
  calves:           'Waden',
  triceps:          'Trizeps',
  biceps:           'Bizeps',
  anterior_deltoid: 'Vordere Schulter',
  lateral_deltoid:  'Seitliche Schulter',
  rear_deltoid:     'Hintere Schulter',
};

export default function WarmupCooldownBlock({ type, mainExercises, workoutId }: Props) {
  const [suggested, setSuggested] = useState<SuggestedExercise[]>([]);
  const [loading, setLoading]     = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTimer, setActiveTimer] = useState<string | null>(null);

  const isWarmup = type === 'warmup';
  const label    = isWarmup ? 'Aufwärmen' : 'Abkühlen';
  const emoji    = isWarmup ? '🔥' : '❄️';
  const color    = isWarmup ? 'text-orange-300 border-orange-700/40 bg-orange-900/20'
                            : 'text-blue-300 border-blue-700/40 bg-blue-900/20';
  const tagColor = isWarmup ? 'bg-orange-900/30 text-orange-300' : 'bg-blue-900/30 text-blue-300';

  useEffect(() => {
    loadSuggestions();
  }, [mainExercises.length, workoutId]);

  async function loadSuggestions() {
    setLoading(true);

    // 1. Wenn Workout bereits slot-Übungen hat, diese direkt laden
    if (workoutId) {
      const { data: slotExercises } = await supabase
        .from('plan_exercises')
        .select('id, name, exercise_id, is_timed, duration_seconds')
        .eq('workout_id', workoutId)
        .eq('exercise_slot', type)
        .order('order_in_workout');

      if (slotExercises && slotExercises.length > 0) {
        setSuggested(slotExercises.map(e => ({
          id: e.id,
          name: e.name,
          name_de: e.name,
          muscle_groups: [],
          is_timed: e.is_timed ?? false,
          duration_seconds: e.duration_seconds ?? getDefaultDurationSeconds(e.name),
        })));
        setLoading(false);
        return;
      }
    }

    // 2. Sonst: Übungen aus der exercises-DB basierend auf trainierten Muskeln vorschlagen
    // Alle Muskelgruppen der Hauptübungen sammeln
    const exerciseIds = mainExercises
      .filter(e => e.exercise_id)
      .map(e => e.exercise_id!);

    let trainedMuscles: string[] = [];
    if (exerciseIds.length > 0) {
      const { data: mainData } = await supabase
        .from('exercises')
        .select('muscle_groups, muscle_secondary')
        .in('id', exerciseIds);

      if (mainData) {
        mainData.forEach(ex => {
          trainedMuscles.push(...(ex.muscle_groups ?? []));
          trainedMuscles.push(...(ex.muscle_secondary ?? []));
        });
      }
    }
    trainedMuscles = [...new Set(trainedMuscles)];

    // Passende Warm-Up / Cool-Down Übungen laden
    const suitableCol = isWarmup ? 'warmup_suitable' : 'cooldown_suitable';
    const { data: candidates } = await supabase
      .from('exercises')
      .select('id, name, name_de, muscle_groups, is_timed')
      .eq(suitableCol, true)
      .limit(20);

    if (!candidates) { setLoading(false); return; }

    // Übungen nach Relevanz sortieren (mehr gemeinsame Muskeln = weiter oben)
    const scored = candidates.map(ex => {
      const overlap = (ex.muscle_groups ?? []).filter(m => trainedMuscles.includes(m)).length;
      return { ...ex, score: overlap };
    });
    scored.sort((a, b) => b.score - a.score);

    // 3–4 Übungen auswählen
    const selected = scored.slice(0, isWarmup ? 4 : 3);
    setSuggested(selected.map(ex => ({
      id: ex.id,
      name: ex.name,
      name_de: ex.name_de || ex.name,
      muscle_groups: ex.muscle_groups ?? [],
      is_timed: ex.is_timed ?? false,
      duration_seconds: getDefaultDurationSeconds(ex.name),
    })));
    setLoading(false);
  }

  if (loading) {
    return (
      <div className={`rounded-xl border p-3 ${color} flex items-center gap-2 text-sm`}>
        <span>{emoji}</span>
        <span>{label} wird geladen …</span>
      </div>
    );
  }

  if (suggested.length === 0) return null;

  return (
    <div className={`rounded-xl border ${color} overflow-hidden`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span>{emoji}</span>
          <span className="font-medium text-sm">{label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${tagColor}`}>
            {suggested.length} Übungen
          </span>
        </div>
        <svg
          className={`w-4 h-4 opacity-60 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Exercise list */}
      {!collapsed && (
        <div className="border-t border-current/10 px-4 pb-4 pt-3 space-y-3">
          {suggested.map((ex, idx) => (
            <div key={ex.id} className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-xs opacity-50 pt-0.5 w-4 shrink-0">{idx + 1}.</span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{ex.name_de}</span>
                    {ex.muscle_groups.length > 0 && (
                      <p className="text-xs opacity-60 mt-0.5">
                        {ex.muscle_groups
                          .slice(0, 2)
                          .map(m => MUSCLE_LABELS[m] ?? m)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Timer oder Reps-Angabe */}
                {ex.is_timed ? (
                  activeTimer === ex.id ? (
                    <div className="shrink-0">
                      <ExerciseTimer
                        durationSeconds={ex.duration_seconds ?? 30}
                        exerciseName={ex.name_de}
                        compact
                        onComplete={() => setActiveTimer(null)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setActiveTimer(ex.id)}
                      className={`shrink-0 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        isWarmup
                          ? 'border-orange-600/50 text-orange-300 hover:bg-orange-900/30'
                          : 'border-blue-600/50 text-blue-300 hover:bg-blue-900/30'
                      }`}
                    >
                      ▶ {ex.duration_seconds ?? 30}s
                    </button>
                  )
                ) : (
                  <span className="text-xs opacity-60 shrink-0">
                    {isWarmup ? '1–2 × 10' : '1 × 30–60 s'}
                  </span>
                )}
              </div>

              {/* Expanded Timer (full) */}
              {activeTimer === ex.id && ex.is_timed && (
                <div className="mt-2 rounded-lg bg-black/20 border border-current/10">
                  <ExerciseTimer
                    durationSeconds={ex.duration_seconds ?? 30}
                    exerciseName={ex.name_de}
                    onComplete={() => setActiveTimer(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
