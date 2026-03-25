/**
 * TrainingPlanTab.tsx
 *
 * Coach-seitiger Plan-Tab in ClientDetailPage.
 * Features:
 * - Claude-Output importieren (Paste → Parse → Preview → Speichern)
 * - Aktiven Plan anzeigen (Wochenstruktur, Einheiten, Übungstabellen)
 * - Zwischen mehreren Plänen wechseln
 * - Plan deaktivieren
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, AlertTriangle, ChevronDown, ChevronUp,
  Dumbbell, Target, Calendar, Loader2, Trash2,
  CheckCircle, Info, ClipboardPaste
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { parsePlan, validateParsedPlan, type ParsedPlan, type ParsedWorkout } from '@/lib/planParser';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrainingPlan {
  id: string;
  name: string;
  goal: string | null;
  weeks_total: number | null;
  sessions_per_week: number | null;
  progression_notes: string | null;
  coaching_notes: string | null;
  nutrition_notes: string | null;
  is_active: boolean;
  start_date: string | null;
  created_at: string;
  workouts?: PlanWorkout[];
}

interface PlanWorkout {
  id: string;
  plan_id: string;
  week_number: number;
  week_label: string;
  day_label: string;
  notes: string | null;
  order_in_week: number;
  exercises?: PlanExercise[];
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
  order_in_workout: number;
}

interface TrainingPlanTabProps {
  clientId: string;
  clientName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupWorkoutsByWeek(workouts: PlanWorkout[]): Map<number, PlanWorkout[]> {
  const map = new Map<number, PlanWorkout[]>();
  for (const w of workouts) {
    if (!map.has(w.week_number)) map.set(w.week_number, []);
    map.get(w.week_number)!.push(w);
  }
  // Sort each week's workouts
  map.forEach(ws => ws.sort((a, b) => a.order_in_week - b.order_in_week));
  return map;
}

function formatRest(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
  }
  return `${seconds}s`;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

const ExerciseTable: React.FC<{ exercises: PlanExercise[] }> = ({ exercises }) => (
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/40 border-b border-border">
          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Übung</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground w-14">Sätze</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Wdh.</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Pause</th>
          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Hinweis</th>
        </tr>
      </thead>
      <tbody>
        {exercises.map((ex, i) => (
          <tr key={ex.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
            <td className="px-3 py-2 font-medium">{ex.name}</td>
            <td className="px-3 py-2 text-center tabular-nums">{ex.sets ?? '—'}</td>
            <td className="px-3 py-2 text-center tabular-nums">{ex.reps_target || '—'}</td>
            <td className="px-3 py-2 text-center text-muted-foreground text-xs">{formatRest(ex.rest_seconds)}</td>
            <td className="px-3 py-2 text-muted-foreground text-xs">{ex.notes || ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const WorkoutCard: React.FC<{ workout: PlanWorkout }> = ({ workout }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-medium text-sm">{workout.day_label}</span>
          {workout.exercises && (
            <span className="text-xs text-muted-foreground">
              · {workout.exercises.length} Übungen
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && workout.exercises && workout.exercises.length > 0 && (
        <div className="p-3">
          <ExerciseTable exercises={workout.exercises} />
          {workout.notes && (
            <p className="text-xs text-muted-foreground mt-2 italic">{workout.notes}</p>
          )}
        </div>
      )}
      {open && workout.exercises && workout.exercises.length === 0 && (
        <div className="px-4 py-3 text-sm text-muted-foreground">Keine Übungen erfasst.</div>
      )}
    </div>
  );
};

// ── Import Dialog ─────────────────────────────────────────────────────────────

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  clientId: string;
  trainerId: string;
}

const ImportDialog: React.FC<ImportDialogProps> = ({ open, onClose, onImported, clientId, trainerId }) => {
  const [markdown, setMarkdown] = useState('');
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [validation, setValidation] = useState<ReturnType<typeof validateParsedPlan> | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');

  const handleParse = () => {
    const result = parsePlan(markdown);
    if (!result) {
      toast.error('Kein gültiges Planformat erkannt. Stelle sicher, dass du den vollständigen Claude-Output eingefügt hast.');
      return;
    }
    const v = validateParsedPlan(result);
    setParsed(result);
    setValidation(v);
    setStep('preview');
  };

  const handleSave = async () => {
    if (!parsed) return;
    setSaving(true);

    try {
      // 1. Alle bisherigen aktiven Pläne deaktivieren
      await supabase
        .from('training_plans')
        .update({ is_active: false })
        .eq('client_id', clientId)
        .eq('trainer_id', trainerId)
        .eq('is_active', true);

      // 2. Neuen Plan anlegen
      const { data: planData, error: planError } = await supabase
        .from('training_plans')
        .insert({
          client_id: clientId,
          trainer_id: trainerId,
          name: parsed.name,
          goal: parsed.goal || null,
          weeks_total: parsed.weeks_total,
          sessions_per_week: parsed.sessions_per_week,
          progression_notes: parsed.progression_notes || null,
          coaching_notes: parsed.coaching_notes || null,
          nutrition_notes: parsed.nutrition_notes || null,
          source: 'claude_import',
          is_active: true,
        })
        .select()
        .single();

      if (planError || !planData) throw planError;

      // 3. Workouts + Exercises anlegen (sequenziell um FK zu respektieren)
      for (const workout of parsed.workouts) {
        const { data: workoutData, error: workoutError } = await supabase
          .from('plan_workouts')
          .insert({
            plan_id: planData.id,
            week_number: workout.week_number,
            week_label: workout.week_label,
            day_label: workout.day_label,
            notes: workout.notes || null,
            order_in_week: workout.order_in_week,
          })
          .select()
          .single();

        if (workoutError || !workoutData) throw workoutError;

        if (workout.exercises.length > 0) {
          const exerciseRows = workout.exercises.map(ex => ({
            workout_id: workoutData.id,
            name: ex.name,
            sets: ex.sets,
            reps_target: ex.reps_target || null,
            weight_target: ex.weight_target || null,
            rest_seconds: ex.rest_seconds,
            notes: ex.notes || null,
            order_in_workout: ex.order_in_workout,
          }));
          const { error: exError } = await supabase.from('plan_exercises').insert(exerciseRows);
          if (exError) throw exError;
        }
      }

      toast.success(`Plan "${parsed.name}" erfolgreich importiert`);
      onImported();
      onClose();
      setStep('paste');
      setMarkdown('');
      setParsed(null);
      setValidation(null);
    } catch (err) {
      console.error(err);
      toast.error('Fehler beim Speichern des Plans.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep('paste');
    setMarkdown('');
    setParsed(null);
    setValidation(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5" />
            {step === 'paste' ? 'Claude-Output einfügen' : 'Plan prüfen & speichern'}
          </DialogTitle>
        </DialogHeader>

        {step === 'paste' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm text-primary space-y-1">
              <p className="font-medium">So geht's:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs text-muted-foreground">
                <li>Exportiere das Erstgespräch über "Für Claude exportieren"</li>
                <li>Lade die .md-Datei in ein neues Claude-Gespräch hoch</li>
                <li>Claude generiert den strukturierten Trainingsplan</li>
                <li>Füge den kompletten Output hier ein</li>
              </ol>
            </div>
            <Textarea
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              placeholder="# Trainingsplan: Max Mustermann&#10;## Ziel: Muskelaufbau&#10;## Trainingstage pro Woche: 3&#10;&#10;## Woche 1–2: Fundament&#10;### Einheit A – Push&#10;| Übung | Sätze | Wdh. | Pause | Hinweis |&#10;..."
              rows={14}
              className="font-mono text-xs"
            />
            <Button
              onClick={handleParse}
              disabled={!markdown.trim()}
              className="w-full gap-2"
            >
              Plan analysieren →
            </Button>
          </div>
        )}

        {step === 'preview' && parsed && validation && (
          <div className="space-y-4">
            {/* Validation-Status */}
            <div className={`rounded-lg border px-3 py-2 ${validation.valid ? 'bg-success/5 border-success/20' : 'bg-warning/5 border-warning/20'}`}>
              <div className="flex items-center gap-2 mb-1">
                {validation.valid
                  ? <CheckCircle className="w-4 h-4 text-success" />
                  : <AlertTriangle className="w-4 h-4 text-warning" />}
                <span className="text-sm font-medium">
                  {validation.valid ? 'Plan erfolgreich erkannt' : 'Plan mit Warnungen'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {validation.stats.workouts} Einheiten · {validation.stats.exercises} Übungen · Wochen: {validation.stats.weeks.join(', ')}
              </p>
              {validation.warnings.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {validation.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-warning">⚠ {w}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Plan-Metadaten */}
            <div className="space-y-1">
              <p className="text-lg font-display font-bold">{parsed.name}</p>
              {parsed.goal && <p className="text-sm text-muted-foreground">🎯 {parsed.goal}</p>}
              <div className="flex gap-3 text-xs text-muted-foreground">
                {parsed.weeks_total && <span>📅 {parsed.weeks_total} Wochen</span>}
                {parsed.sessions_per_week && <span>🏋️ {parsed.sessions_per_week}× pro Woche</span>}
              </div>
            </div>

            {/* Workout-Vorschau */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {parsed.workouts.map((w, i) => (
                <div key={i} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium text-xs text-muted-foreground mb-1">
                    {w.week_label || `Woche ${w.week_number}`}
                  </p>
                  <p className="font-medium">{w.day_label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {w.exercises.length} Übungen: {w.exercises.slice(0, 3).map(e => e.name).join(', ')}
                    {w.exercises.length > 3 && ` +${w.exercises.length - 3} weitere`}
                  </p>
                </div>
              ))}
            </div>

            {/* Notizen-Vorschau */}
            {parsed.coaching_notes && (
              <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Coaching-Hinweise</p>
                <p className="line-clamp-3">{parsed.coaching_notes}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('paste')} className="flex-1">
                ← Zurück
              </Button>
              <Button onClick={handleSave} disabled={saving || !validation.valid} className="flex-1 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Wird gespeichert...' : 'Plan speichern'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const TrainingPlanTab: React.FC<TrainingPlanTabProps> = ({ clientId, clientName }) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const loadPlans = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: plansData } = await supabase
      .from('training_plans')
      .select('*')
      .eq('client_id', clientId)
      .eq('trainer_id', user.id)
      .order('created_at', { ascending: false });

    if (!plansData) { setLoading(false); return; }

    setPlans(plansData);
    const active = plansData.find(p => p.is_active) || null;

    if (active) {
      // Load workouts + exercises for active plan
      const { data: workoutsData } = await supabase
        .from('plan_workouts')
        .select('*')
        .eq('plan_id', active.id)
        .order('week_number')
        .order('order_in_week');

      if (workoutsData) {
        const workoutIds = workoutsData.map(w => w.id);
        const { data: exercisesData } = workoutIds.length > 0
          ? await supabase
              .from('plan_exercises')
              .select('*')
              .in('workout_id', workoutIds)
              .order('order_in_workout')
          : { data: [] };

        const workoutsWithExercises: PlanWorkout[] = workoutsData.map(w => ({
          ...w,
          exercises: (exercisesData || []).filter(e => e.workout_id === w.id),
        }));

        active.workouts = workoutsWithExercises;

        // Default: show first week
        const firstWeek = workoutsWithExercises[0]?.week_number ?? null;
        setSelectedWeek(prev => prev ?? firstWeek);
      }
    }

    setActivePlan(active);
    setLoading(false);
  }, [clientId, user]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const handleDeactivate = async (planId: string) => {
    if (!window.confirm('Plan wirklich deaktivieren?')) return;
    setDeactivating(true);
    await supabase.from('training_plans').update({ is_active: false }).eq('id', planId);
    toast.success('Plan deaktiviert');
    setDeactivating(false);
    setSelectedWeek(null);
    loadPlans();
  };

  const handleActivate = async (planId: string) => {
    // Deactivate others first
    await supabase.from('training_plans').update({ is_active: false }).eq('client_id', clientId);
    await supabase.from('training_plans').update({ is_active: true }).eq('id', planId);
    toast.success('Plan aktiviert');
    setSelectedWeek(null);
    loadPlans();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const weekMap = activePlan?.workouts ? groupWorkoutsByWeek(activePlan.workouts) : new Map();
  const weekNumbers = [...weekMap.keys()].sort((a, b) => a - b);
  const currentWeekWorkouts = selectedWeek !== null ? (weekMap.get(selectedWeek) || []) : [];
  const archivedPlans = plans.filter(p => !p.is_active);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold">Trainingsplan</h3>
          {activePlan && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {activePlan.name}
              {activePlan.weeks_total && ` · ${activePlan.weeks_total} Wochen`}
              {activePlan.sessions_per_week && ` · ${activePlan.sessions_per_week}×/Woche`}
            </p>
          )}
        </div>
        <Button size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
          <Plus className="w-4 h-4" /> Plan importieren
        </Button>
      </div>

      {/* Kein Plan */}
      {!activePlan && (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Dumbbell className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">Noch kein aktiver Trainingsplan für {clientName}.</p>
            <p className="text-xs text-muted-foreground">
              Exportiere das Erstgespräch, lasse Claude einen Plan generieren, und importiere ihn hier.
            </p>
            <Button size="sm" className="gap-2 mt-2" onClick={() => setImportOpen(true)}>
              <ClipboardPaste className="w-4 h-4" /> Plan importieren
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Aktiver Plan */}
      {activePlan && (
        <>
          {/* Plan-Meta-Cards */}
          <div className="grid sm:grid-cols-3 gap-3">
            {activePlan.goal && (
              <Card>
                <CardContent className="p-3 flex items-start gap-2">
                  <Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Ziel</p>
                    <p className="text-sm">{activePlan.goal}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {activePlan.start_date && (
              <Card>
                <CardContent className="p-3 flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Startdatum</p>
                    <p className="text-sm">{format(new Date(activePlan.start_date), 'd. MMM yyyy', { locale: de })}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-3 flex items-start gap-2">
                <Dumbbell className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Umfang</p>
                  <p className="text-sm">
                    {weekNumbers.length} Woche{weekNumbers.length !== 1 ? 'n' : ''} · {activePlan.workouts?.length || 0} Einheiten
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Wochen-Navigation */}
          {weekNumbers.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {weekNumbers.map(wn => {
                const label = weekMap.get(wn)?.[0]?.week_label;
                return (
                  <button
                    key={wn}
                    onClick={() => setSelectedWeek(wn)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedWeek === wn
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {label
                      ? label.replace(/^Woche\s*/i, 'W').split(':')[0]
                      : `Woche ${wn}`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Workouts der gewählten Woche */}
          {selectedWeek !== null && currentWeekWorkouts.length > 0 && (
            <div className="space-y-3">
              {(() => {
                const weekLabel = currentWeekWorkouts[0]?.week_label;
                return weekLabel ? (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {weekLabel}
                  </p>
                ) : null;
              })()}
              {currentWeekWorkouts.map(workout => (
                <WorkoutCard key={workout.id} workout={workout} />
              ))}
            </div>
          )}

          {/* Notizen */}
          {(activePlan.progression_notes || activePlan.coaching_notes) && (
            <div className="grid sm:grid-cols-2 gap-3">
              {activePlan.progression_notes && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Progressionslogik
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{activePlan.progression_notes}</p>
                  </CardContent>
                </Card>
              )}
              {activePlan.coaching_notes && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Coaching-Hinweise
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{activePlan.coaching_notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Plan deaktivieren */}
          <div className="flex justify-end pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive gap-1.5 text-xs"
              onClick={() => handleDeactivate(activePlan.id)}
              disabled={deactivating}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Plan deaktivieren
            </Button>
          </div>
        </>
      )}

      {/* Archivierte Pläne */}
      {archivedPlans.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchive(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showArchive ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {archivedPlans.length} archivierter Plan{archivedPlans.length > 1 ? 'e' : ''}
          </button>
          {showArchive && (
            <div className="mt-2 space-y-2">
              {archivedPlans.map(plan => (
                <Card key={plan.id} className="opacity-60">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Importiert {format(new Date(plan.created_at), 'd. MMM yyyy', { locale: de })}
                        {plan.weeks_total && ` · ${plan.weeks_total} Wochen`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleActivate(plan.id)}
                      className="text-xs"
                    >
                      Aktivieren
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Import Dialog */}
      {user && (
        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={loadPlans}
          clientId={clientId}
          trainerId={user.id}
        />
      )}
    </div>
  );
};

export default TrainingPlanTab;
