// ============================================================
// DATEI: src/components/TrainingPlanTab.tsx
// ZWECK: Trainingsplan-Tab in der ClientDetailPage
//        – Plan anzeigen, importieren, KI-Builder starten
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parsePlan, validateParsedPlan, type ParsedPlan } from '@/lib/planParser';
import { matchAndAddExercises, getMatchingStats } from '@/lib/exerciseMatching';
import {
  loadClientDataForPrompt,
  generateSystemPrompt,
  generateUserPrompt,
  verifyPlanOwnership,
  type PlanConfig,
} from '@/lib/aiPlanGenerator';
import KIWorkoutBuilderModal from '@/components/KIWorkoutBuilderModal';
import ExerciseTimer, { getDefaultDurationSeconds } from '@/components/ExerciseTimer';
import WarmupCooldownBlock from '@/components/WarmupCooldownBlock';
import AssessmentGuide from '@/components/AssessmentGuide';
import PlanExerciseEditor from '@/components/PlanExerciseEditor';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TrainingPlan {
  id: string;
  client_id: string;
  trainer_id: string | null;
  name: string;
  goal: string | null;
  weeks_total: number | null;
  sessions_per_week: number | null;
  progression_notes: string | null;
  coaching_notes: string | null;
  nutrition_notes: string | null;
  source: string | null;
  is_active: boolean;
  start_date: string | null;
  created_at: string;
  next_plan_workout_id: string | null;
  total_cycles: number | null;
}

interface PlanWorkout {
  id: string;
  plan_id: string;
  week_number: number | null;
  week_label: string | null;
  day_label: string | null;
  notes: string | null;
  order_in_week: number | null;
  created_at: string;
  is_assessment: boolean | null;
  session_order: number | null;
  phase_type: string | null;
  cycle_number: number | null;
  status: string | null;
}

interface PlanExercise {
  id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps_target: string | null;
  weight_target: string | null;
  rest_seconds: number | null;
  notes: string | null;
  order_in_workout: number | null;
  alternative_name: string | null;
  exercise_id: string | null;
  is_bodyweight: boolean | null;
}

interface Props {
  client?: Record<string, any>; // vollstaendiges Client-Objekt (bevorzugt)
  clientId?: string;            // Fallback: nur die ID
  duoPartnerClientId?: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
  accumulation:    'bg-blue-900/40 text-blue-300 border-blue-700/50',
  intensification: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
  realization:     'bg-red-900/40 text-red-300 border-red-700/50',
  deload:          'bg-green-900/40 text-green-300 border-green-700/50',
};

const PHASE_LABELS: Record<string, string> = {
  accumulation:    'Akkumulation',
  intensification: 'Intensivierung',
  realization:     'Peak / Realisierung',
  deload:          'Deload',
};

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-900/30 border-green-700/40 text-green-400',
  skipped:   'bg-gray-800/40 border-gray-700/40 text-gray-500 line-through',
  planned:   'bg-gray-800/30 border-gray-700/30 text-gray-300',
};

function formatDate(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function TrainingPlanTab({ client: clientProp, clientId: clientIdProp, duoPartnerClientId }: Props) {

  // ── Client-Resolver: akzeptiert client-Objekt ODER clientId-String ─────────
  // Damit funktioniert die Komponente egal wie das Parent sie einbindet.
  const client = clientProp ?? null;
  const resolvedClientId: string | undefined =
    clientProp?.id ?? clientProp?.client_id ?? clientIdProp ?? undefined;

  // ── State ──────────────────────────────────────────────────────────────────

  const [activePlan, setActivePlan]           = useState<TrainingPlan | null>(null);
  const [allPlans, setAllPlans]               = useState<TrainingPlan[]>([]);
  const [workouts, setWorkouts]               = useState<PlanWorkout[]>([]);
  const [exercises, setExercises]             = useState<Record<string, PlanExercise[]>>({});
  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMarkdown, setImportMarkdown]   = useState('');
  const [importLoading, setImportLoading]     = useState(false);
  const [importError, setImportError]         = useState<string | null>(null);
  const [importSuccess, setImportSuccess]     = useState(false);

  // KI Builder
  const [showKIBuilder, setShowKIBuilder]     = useState(false);

  // Plan history
  const [showHistory, setShowHistory]         = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchPlans = useCallback(async () => {
    if (!resolvedClientId) {
      // Kein Client bekannt → kein Spinner, nichts laden
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Alle Pläne des Kunden laden
      const { data: plans, error: plansError } = await supabase
        .from('training_plans')
        .select('*')
        .eq('client_id', resolvedClientId)
        .order('created_at', { ascending: false });

      if (plansError) throw plansError;

      setAllPlans(plans ?? []);
      const active = plans?.find(p => p.is_active) ?? plans?.[0] ?? null;
      setActivePlan(active);

      if (active) {
        await fetchWorkouts(active.id);
      }
    } catch (e: any) {
      setError(e.message ?? 'Fehler beim Laden des Plans.');
    } finally {
      setLoading(false);
    }
  }, [resolvedClientId]);

  const fetchWorkouts = async (planId: string) => {
    const { data, error } = await supabase
      .from('plan_workouts')
      .select('*')
      .eq('plan_id', planId)
      .order('cycle_number', { ascending: true })
      .order('session_order', { ascending: true });

    if (error) throw error;
    setWorkouts(data ?? []);
  };

  const fetchExercisesForWorkout = async (workoutId: string) => {
    if (exercises[workoutId]) return; // already loaded
    const { data, error } = await supabase
      .from('plan_exercises')
      .select('*')
      .eq('workout_id', workoutId)
      .order('order_in_workout', { ascending: true });

    if (error) return;
    setExercises(prev => ({ ...prev, [workoutId]: data ?? [] }));
  };

  useEffect(() => { if (resolvedClientId) fetchPlans(); }, [fetchPlans, resolvedClientId]);

  // ── Toggle workout expand ──────────────────────────────────────────────────

  const handleWorkoutExpand = async (workoutId: string) => {
    const next = expandedWorkout === workoutId ? null : workoutId;
    setExpandedWorkout(next);
    if (next) await fetchExercisesForWorkout(next);
  };

  // ── Switch active plan ─────────────────────────────────────────────────────

  const handleSetActivePlan = async (plan: TrainingPlan) => {
    try {
      // Alle deaktivieren, neuen aktivieren
      await supabase
        .from('training_plans')
        .update({ is_active: false })
        .eq('client_id', resolvedClientId!);
      await supabase
        .from('training_plans')
        .update({ is_active: true })
        .eq('id', plan.id);
      await fetchPlans();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Delete plan ────────────────────────────────────────────────────────────

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Plan wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) return;
    try {
      await supabase.from('training_plans').delete().eq('id', planId);
      await fetchPlans();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Import markdown plan ───────────────────────────────────────────────────

  const handleImport = async (markdown: string) => {
    if (!markdown.trim()) {
      setImportError('Bitte einen Plan als Markdown einfügen.');
      return;
    }

    setImportLoading(true);
    setImportError(null);
    setImportSuccess(false);

    try {
      // 1. Alias-Check (wenn Plan vom KI-Builder kommt)
      const hasAlias = markdown.includes('CLIENT_ID:');
      if (hasAlias && !verifyPlanOwnership(markdown, resolvedClientId!)) {
        throw new Error(
          'Dieser Plan gehört nicht zu diesem Kunden (Alias-Mismatch). ' +
          'Stelle sicher, dass du den richtigen Plan für diesen Kunden einfügst.'
        );
      }

      // 2. Plan parsen
      const parsed: ParsedPlan = parsePlan(markdown);
      const validation = validateParsedPlan(parsed);
      if (!validation.valid) {
        throw new Error(`Ungültiges Plan-Format: ${validation.errors.join(', ')}`);
      }

      // 3. Übungen matchen
      const matched = await matchAndAddExercises(parsed);
      const stats = getMatchingStats(matched);

      // 4. Plan in Datenbank speichern
      const { data: planData, error: planError } = await supabase
        .from('training_plans')
        .insert({
          client_id: resolvedClientId!,
          name: parsed.name ?? 'Importierter Plan',
          goal: parsed.goal ?? null,
          weeks_total: parsed.weeksTotal ?? null,
          sessions_per_week: parsed.sessionsPerWeek ?? null,
          progression_notes: parsed.progressionNotes ?? null,
          coaching_notes: parsed.coachingNotes ?? null,
          source: hasAlias ? 'ki_generated' : 'manual_import',
          is_active: true,
        })
        .select()
        .single();

      if (planError) throw planError;

      // Alle anderen Pläne deaktivieren
      await supabase
        .from('training_plans')
        .update({ is_active: false })
        .eq('client_id', resolvedClientId!)
        .neq('id', planData.id);

      // 5. Workouts einfügen
      for (const workout of matched.workouts) {
        const { data: workoutData, error: workoutError } = await supabase
          .from('plan_workouts')
          .insert({
            plan_id: planData.id,
            week_number: workout.weekNumber ?? null,
            week_label: workout.weekLabel ?? null,
            day_label: workout.dayLabel ?? null,
            notes: workout.notes ?? null,
            order_in_week: workout.orderInWeek ?? null,
            session_order: workout.sessionOrder ?? null,
            phase_type: workout.phaseType ?? null,
            cycle_number: workout.cycleNumber ?? 1,
            is_assessment: workout.isAssessment ?? false,
            status: 'planned',
          })
          .select()
          .single();

        if (workoutError) throw workoutError;

        // 6. Exercises einfügen
        if (workout.exercises?.length) {
          const exerciseRows = workout.exercises.map((ex: any, idx: number) => ({
            workout_id: workoutData.id,
            name: ex.name,
            alternative_name: ex.alternativeName ?? null,
            exercise_id: ex.exerciseId ?? null,
            sets: ex.sets ?? null,
            reps_target: ex.repsTarget ?? null,
            weight_target: ex.weightTarget ?? null,
            rest_seconds: ex.restSeconds ?? null,
            notes: ex.notes ?? null,
            order_in_workout: idx + 1,
            is_bodyweight: ex.isBodyweight ?? false,
          }));
          const { error: exError } = await supabase
            .from('plan_exercises')
            .insert(exerciseRows);
          if (exError) throw exError;
        }
      }

      setImportSuccess(true);
      setImportMarkdown('');

      // Stats-Meldung
      if (stats.unmatched > 0) {
        console.warn(
          `Import abgeschlossen. ${stats.matched}/${stats.total} Übungen erkannt. ` +
          `${stats.unmatched} unbekannte Übungen wurden als Text gespeichert.`
        );
      }

      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(false);
        fetchPlans();
      }, 1500);

    } catch (e: any) {
      setImportError(e.message ?? 'Unbekannter Fehler beim Importieren.');
    } finally {
      setImportLoading(false);
    }
  };

  // ── KI Builder callback ────────────────────────────────────────────────────

  const handlePlanGenerated = (markdown: string) => {
    // Direkt importieren ohne manuelles Einfügen
    handleImport(markdown);
  };

  // ── Group workouts by cycle ────────────────────────────────────────────────

  const workoutsByCycle = workouts.reduce<Record<number, PlanWorkout[]>>((acc, w) => {
    const cycle = w.cycle_number ?? 1;
    if (!acc[cycle]) acc[cycle] = [];
    acc[cycle].push(w);
    return acc;
  }, {});

  const currentNextId = activePlan?.next_plan_workout_id;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-gray-400 text-sm">Plan wird geladen …</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg bg-red-900/30 border border-red-700/50 p-4 text-red-300 text-sm">
          <span className="text-lg mt-0.5">⚠️</span>
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* ── Action Bar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {/* KI Builder Button */}
          <button
            onClick={() => setShowKIBuilder(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-md shadow-indigo-900/40 active:scale-95"
          >
            <span>🤖</span>
            KI-Plan erstellen
          </button>

          {/* Manual Import Button */}
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-all active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Plan importieren
          </button>
        </div>

        {/* Plan history toggle */}
        {allPlans.length > 1 && (
          <button
            onClick={() => setShowHistory(h => !h)}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            {showHistory ? 'Verlauf ausblenden' : `${allPlans.length} Pläne ▾`}
          </button>
        )}
      </div>

      {/* ── Plan History ── */}
      {showHistory && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 divide-y divide-gray-700/50 overflow-hidden">
          <div className="px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wider bg-gray-800/80">
            Alle Pläne
          </div>
          {allPlans.map(plan => (
            <div
              key={plan.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
                plan.is_active ? 'bg-indigo-900/20' : 'hover:bg-gray-700/30'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {plan.is_active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/40 text-indigo-300 border border-indigo-700/50 shrink-0">
                    aktiv
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{plan.name}</p>
                  <p className="text-gray-400 text-xs">
                    {formatDate(plan.created_at)}
                    {plan.goal ? ` · ${plan.goal}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!plan.is_active && (
                  <button
                    onClick={() => handleSetActivePlan(plan)}
                    className="text-xs px-3 py-1 rounded-lg border border-gray-600 text-gray-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
                  >
                    Aktivieren
                  </button>
                )}
                <button
                  onClick={() => handleDeletePlan(plan.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1"
                  title="Plan löschen"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── No Plan State ── */}
      {!activePlan && !loading && (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/20 p-10 text-center">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-white font-medium mb-1">Noch kein Trainingsplan vorhanden</p>
          <p className="text-gray-400 text-sm mb-6">
            Erstelle einen Plan mit der KI oder importiere ein Markdown-Dokument.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowKIBuilder(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all"
            >
              🤖 KI-Plan erstellen
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-all"
            >
              Plan importieren
            </button>
          </div>
          {/* Assessment Guide als Fallback */}
          <div className="mt-8">
            <AssessmentGuide client={client} />
          </div>
        </div>
      )}

      {/* ── Active Plan ── */}
      {activePlan && (
        <div className="space-y-4">

          {/* Plan Header */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-white font-semibold text-lg leading-tight">{activePlan.name}</h3>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {activePlan.goal && (
                    <span className="text-sm text-gray-300">🎯 {activePlan.goal}</span>
                  )}
                  {activePlan.sessions_per_week && (
                    <span className="text-sm text-gray-400">{activePlan.sessions_per_week}×/Woche</span>
                  )}
                  {activePlan.weeks_total && (
                    <span className="text-sm text-gray-400">{activePlan.weeks_total} Wochen</span>
                  )}
                  {activePlan.start_date && (
                    <span className="text-sm text-gray-400">Start: {formatDate(activePlan.start_date)}</span>
                  )}
                  {activePlan.source === 'ki_generated' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-700/50">
                      🤖 KI-generiert
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                {workouts.length} Sessions
              </div>
            </div>

            {/* Notes */}
            {activePlan.coaching_notes && (
              <div className="mt-4 rounded-lg bg-gray-700/30 border border-gray-600/30 px-4 py-3 text-sm text-gray-300">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Coaching-Hinweise</span>
                <p className="mt-1">{activePlan.coaching_notes}</p>
              </div>
            )}
            {activePlan.progression_notes && (
              <div className="mt-2 rounded-lg bg-gray-700/30 border border-gray-600/30 px-4 py-3 text-sm text-gray-300">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Progression</span>
                <p className="mt-1">{activePlan.progression_notes}</p>
              </div>
            )}
          </div>

          {/* Workout List – grouped by cycle */}
          {Object.keys(workoutsByCycle).length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Keine Sessions im Plan vorhanden.
            </div>
          ) : (
            Object.entries(workoutsByCycle)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([cycleNum, cycleWorkouts]) => (
                <div key={cycleNum} className="space-y-2">

                  {/* Cycle Header */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-700/50" />
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wider px-2">
                      {cycleWorkouts[0]?.week_label ?? `Woche ${cycleNum}`}
                    </span>
                    {cycleWorkouts[0]?.phase_type && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${PHASE_COLORS[cycleWorkouts[0].phase_type] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                        {PHASE_LABELS[cycleWorkouts[0].phase_type] ?? cycleWorkouts[0].phase_type}
                      </span>
                    )}
                    <div className="h-px flex-1 bg-gray-700/50" />
                  </div>

                  {/* Workouts */}
                  {cycleWorkouts.map(workout => {
                    const isExpanded = expandedWorkout === workout.id;
                    const isNext = workout.id === currentNextId;
                    const exList = exercises[workout.id] ?? [];
                    const statusStyle = STATUS_STYLES[workout.status ?? 'planned'];

                    return (
                      <div
                        key={workout.id}
                        className={`rounded-xl border transition-all duration-200 overflow-hidden ${statusStyle} ${
                          isNext ? 'ring-2 ring-indigo-500/50' : ''
                        }`}
                      >
                        {/* Workout Header – clickable */}
                        <button
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                          onClick={() => handleWorkoutExpand(workout.id)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Status icon */}
                            <span className="text-lg shrink-0">
                              {workout.status === 'completed' ? '✅' :
                               workout.status === 'skipped'   ? '⏭️' :
                               workout.is_assessment          ? '🧪' : '🏋️'}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">
                                  {workout.day_label ?? `Session ${workout.session_order ?? ''}`}
                                </span>
                                {isNext && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-600/40 text-indigo-300 border border-indigo-700/50 shrink-0">
                                    Nächste
                                  </span>
                                )}
                                {workout.is_assessment && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/50 shrink-0">
                                    Assessment
                                  </span>
                                )}
                              </div>
                              {workout.notes && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate">{workout.notes}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {isExpanded && exList.length > 0 && (
                              <span className="text-xs text-gray-400">{exList.length} Übungen</span>
                            )}
                            <svg
                              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                          {/* Expanded: Exercise list + Edit button */}
                          {isExpanded && (
                            <div className="border-t border-current/10 px-4 pb-4 pt-3 space-y-3">
                              {exList.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">Keine Übungen hinterlegt.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {exList.map((ex, idx) => (
                                    <div key={ex.id} className="flex items-start gap-3 text-sm">
                                      <span className="text-gray-500 w-4 shrink-0 pt-0.5 text-xs">{idx + 1}.</span>
                                      <div className="min-w-0 flex-1">
                                        <span className="text-gray-200">{ex.name}</span>
                                        {ex.alternative_name && (
                                          <span className="text-gray-500 ml-1 text-xs">/ {ex.alternative_name}</span>
                                        )}
                                        <span className="text-gray-400 ml-2 text-xs">
                                          {[
                                            ex.sets ? `${ex.sets} Sätze` : null,
                                            ex.is_timed
                                              ? null  // Zeiten werden per Timer angezeigt
                                              : ex.reps_target ? `${ex.reps_target} Wdh.` : null,
                                            ex.weight_target ? `@ ${ex.weight_target}` : null,
                                          ].filter(Boolean).join(' · ')}
                                        </span>
                                            {ex.is_timed && (
                                              <ExerciseTimer
                                                durationSeconds={ex.duration_seconds ?? getDefaultDurationSeconds(ex.name)}
                                                exerciseName={ex.name}
                                                compact
                                              />
                                            )}
                                      {ex.notes && (
                                        <p className="text-xs text-gray-500 mt-0.5">{ex.notes}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Edit button → PlanExerciseEditor */}
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => setSelectedWorkoutId(
                                  selectedWorkoutId === workout.id ? null : workout.id
                                )}
                                className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors"
                              >
                                {selectedWorkoutId === workout.id ? 'Schließen' : '✏️ Bearbeiten'}
                              </button>
                            </div>

                            {/* Inline PlanExerciseEditor */}
                            {selectedWorkoutId === workout.id && (
                              <div className="mt-3 rounded-lg border border-gray-600/50 bg-gray-800/50 p-3">
                                <PlanExerciseEditor
                                  workoutId={workout.id}
                                  onUpdate={() => {
                                    // Exercises neu laden
                                    setExercises(prev => {
                                      const next = { ...prev };
                                      delete next[workout.id];
                                      return next;
                                    });
                                    fetchExercisesForWorkout(workout.id);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
          )}
        </div>
      )}

      {/* ── Import Modal ── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl flex flex-col rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
              <div>
                <h2 className="text-white font-semibold">Plan importieren</h2>
                <p className="text-gray-400 text-xs mt-0.5">Markdown-Plan aus Claude einfügen</p>
              </div>
              <button onClick={() => { setShowImportModal(false); setImportError(null); setImportMarkdown(''); }}
                className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {importSuccess ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <span className="text-4xl">✅</span>
                  <p className="text-white font-medium">Plan erfolgreich importiert!</p>
                  <p className="text-gray-400 text-sm">Wird automatisch geladen …</p>
                </div>
              ) : (
                <>
                  {importError && (
                    <div className="rounded-lg bg-red-900/30 border border-red-700/50 p-3 text-red-300 text-sm">
                      {importError}
                    </div>
                  )}
                  <div>
                    <label className="text-gray-300 text-sm font-medium block mb-2">
                      Markdown einfügen
                    </label>
                    <textarea
                      value={importMarkdown}
                      onChange={e => setImportMarkdown(e.target.value)}
                      placeholder={'# Trainingsplan\nCLIENT_ID: CLIENT_XXXXXXXX\n…'}
                      rows={12}
                      className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-xs font-mono px-3 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {!importSuccess && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700 bg-gray-800">
                <button
                  onClick={() => { setShowImportModal(false); setImportError(null); setImportMarkdown(''); }}
                  className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => handleImport(importMarkdown)}
                  disabled={importLoading || !importMarkdown.trim()}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all"
                >
                  {importLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Importiere …
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Importieren
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KI Workout Builder Modal ── */}
      {showKIBuilder && (
        <KIWorkoutBuilderModal
          client={client ?? { id: resolvedClientId }}
          duoPartnerClientId={duoPartnerClientId}
          onPlanGenerated={(markdown) => {
            setShowKIBuilder(false);
            handleImport(markdown);
          }}
          onClose={() => setShowKIBuilder(false)}
        />
      )}

    </div>
  );
}
