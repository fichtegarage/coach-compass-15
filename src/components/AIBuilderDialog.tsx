/**
 * AIBuilderDialog.tsx
 *
 * KI-Workout-Builder: Generiert direkt in der App einen Trainingsplan
 * via Claude (über den bestehenden /api/claude-proxy).
 *
 * Flow:
 *  1. Coach konfiguriert Wochen, Einheiten/Woche, Deload, Fokus
 *  2. Claude generiert den Plan als Markdown (Streaming-Anzeige)
 *  3. Coach sieht Vorschau mit Validierung
 *  4. Ein-Klick-Import speichert alles in die DB
 */

import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles, Loader2, ChevronRight, Check, AlertTriangle,
  RotateCcw, CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { parsePlan, validateParsedPlan } from '@/lib/planParser';
import { matchAndAddExercises, getMatchingStats } from '@/lib/exerciseMatching';
import { loadClientDataForPrompt, generateSystemPrompt, generateUserPrompt, type PlanConfig } from '@/lib/aiPlanGenerator';

interface AIBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  clientId: string;
  clientName: string;
}

type Step = 'config' | 'generating' | 'preview' | 'importing';

const AIBuilderDialog: React.FC<AIBuilderDialogProps> = ({
  open, onClose, onImported, clientId, clientName,
}) => {
  const { user } = useAuth();

  // Config
  const [weeks, setWeeks] = useState(8);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
  const [includeDeload, setIncludeDeload] = useState(true);
  const [focus, setFocus] = useState('');

  // State
  const [step, setStep] = useState<Step>('config');
  const [generatedMarkdown, setGeneratedMarkdown] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [validationResult, setValidationResult] = useState<ReturnType<typeof validateParsedPlan> | null>(null);
  const [error, setError] = useState('');

  const handleReset = () => {
    setStep('config');
    setGeneratedMarkdown('');
    setStreamedText('');
    setValidationResult(null);
    setError('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // ── Schritt 1 → 2: Generieren ────────────────────────────────────────────
  const handleGenerate = async () => {
    setStep('generating');
    setStreamedText('');
    setError('');

    try {
      const config: PlanConfig = { weeks, sessionsPerWeek, includeDeload, focus: focus.trim() || undefined };
      const data = await loadClientDataForPrompt(clientId);

      if (!data.client) {
        setError('Kundendaten konnten nicht geladen werden.');
        setStep('config');
        return;
      }

      const systemPrompt = generateSystemPrompt(data, config);
      const userPrompt = generateUserPrompt(clientName, config);

      // Claude via Proxy aufrufen
      const response = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API-Fehler: ${response.status} – ${errText.slice(0, 200)}`);
      }

      const result = await response.json();

      // Antwort aus dem Proxy-Format extrahieren
      const text = result?.content?.[0]?.text
        || result?.choices?.[0]?.message?.content
        || result?.text
        || '';

      if (!text) throw new Error('Keine Antwort von Claude erhalten.');

      // Streaming simulieren: Text zeichenweise aufbauen für UX
      setStreamedText('');
      let displayed = '';
      const chunkSize = 8;
      for (let i = 0; i < text.length; i += chunkSize) {
        displayed += text.slice(i, i + chunkSize);
        setStreamedText(displayed);
        // Kurze Pause für visuellen Streaming-Effekt
        if (i % 200 === 0) await new Promise(r => setTimeout(r, 10));
      }

      setGeneratedMarkdown(text);

      // Validierung
      const parsed = parsePlan(text);
      if (!parsed) {
        setError('Der generierte Plan konnte nicht verarbeitet werden. Bitte nochmal versuchen.');
        setStep('config');
        return;
      }

      const validation = validateParsedPlan(parsed);
      setValidationResult(validation);
      setStep('preview');

    } catch (err: any) {
      console.error('KI-Builder Fehler:', err);
      setError(err.message || 'Unbekannter Fehler beim Generieren.');
      setStep('config');
    }
  };

  // ── Schritt 3 → Import ───────────────────────────────────────────────────
  const handleImport = async () => {
    if (!user || !generatedMarkdown) return;
    setStep('importing');

    try {
      const parsed = parsePlan(generatedMarkdown);
      if (!parsed) throw new Error('Plan konnte nicht geparst werden.');

      // Übungs-Matching
      const allExerciseNames = parsed.workouts.flatMap(w => w.exercises.map(e => e.name));
      const matchResults = await matchAndAddExercises(allExerciseNames);
      const stats = getMatchingStats(matchResults);

      // Vorherigen aktiven Plan deaktivieren
      await supabase
        .from('training_plans')
        .update({ is_active: false })
        .eq('client_id', clientId)
        .eq('is_active', true);

      // Plan anlegen
      const { data: planData, error: planError } = await supabase
        .from('training_plans')
        .insert({
          client_id: clientId,
          trainer_id: user.id,
          name: parsed.name,
          goal: parsed.goal || null,
          weeks_total: parsed.weeks_total,
          sessions_per_week: parsed.sessions_per_week,
          total_cycles: parsed.total_cycles || 1,
          progression_notes: parsed.progression_notes || null,
          coaching_notes: parsed.coaching_notes || null,
          nutrition_notes: parsed.nutrition_notes || null,
          source: 'ai_builder',
          is_active: true,
        })
        .select()
        .single();

      if (planError || !planData) throw planError || new Error('Plan konnte nicht gespeichert werden.');

      // Workouts + Übungen speichern
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
            session_order: workout.session_order,
            phase_type: workout.phase_type,
            cycle_number: workout.cycle_number,
          })
          .select()
          .single();

        if (workoutError || !workoutData) throw workoutError;

        if (workout.exercises.length > 0) {
          const { error: exError } = await supabase.from('plan_exercises').insert(
            workout.exercises.map(ex => {
              const match = matchResults.get(ex.name);
              return {
                workout_id: workoutData.id,
                name: ex.name,
                sets: ex.sets,
                reps_target: ex.reps_target || null,
                weight_target: ex.weight_target || null,
                rest_seconds: ex.rest_seconds,
                notes: ex.notes || null,
                order_in_workout: ex.order_in_workout,
                exercise_id: match?.exerciseId || null,
              };
            })
          );
          if (exError) throw exError;
        }
      }

      let msg = `Plan "${parsed.name}" erstellt und importiert`;
      if (stats.added > 0) msg += ` · ${stats.added} neue Übung${stats.added > 1 ? 'en' : ''} zum Katalog`;
      toast.success(msg);

      onImported();
      handleClose();

    } catch (err: any) {
      console.error('Import-Fehler:', err);
      toast.error('Fehler beim Importieren: ' + (err.message || 'Unbekannt'));
      setStep('preview');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            KI-Trainingsplan für {clientName}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step: Config ── */}
        {step === 'config' && (
          <div className="space-y-6">
            {error && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5 text-sm text-muted-foreground">
              Claude erstellt den Plan auf Basis des Erstgesprächs, der Gesundheitsangaben,
              dem Equipment-Profil und dem Übungskatalog – vollständig formatiert und direkt importierbar.
            </div>

            {/* Wochen */}
            <div className="space-y-2">
              <Label>Dauer</Label>
              <div className="flex gap-2">
                {[4, 6, 8, 12, 16].map(w => (
                  <button
                    key={w}
                    onClick={() => setWeeks(w)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      weeks === w
                        ? 'bg-primary text-white border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                    }`}
                  >
                    {w}W
                  </button>
                ))}
              </div>
            </div>

            {/* Sessions pro Woche */}
            <div className="space-y-2">
              <Label>Trainingstage pro Woche</Label>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    onClick={() => setSessionsPerWeek(s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      sessionsPerWeek === s
                        ? 'bg-primary text-white border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>

            {/* Deload */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Deload-Woche einplanen</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Letzte Woche mit reduzierter Intensität (50–60%)
                </p>
              </div>
              <Switch checked={includeDeload} onCheckedChange={setIncludeDeload} />
            </div>

            {/* Fokus */}
            <div className="space-y-2">
              <Label>Spezifischer Fokus <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                value={focus}
                onChange={e => setFocus(e.target.value)}
                placeholder="z.B. Klimmzug-Progression, Bikini-Figur, Kraft-Ausdauer-Kombination"
              />
            </div>

            {/* Zusammenfassung */}
            <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-1 text-sm">
              <p className="font-medium">Planübersicht</p>
              <p className="text-muted-foreground">
                {weeks} Wochen · {sessionsPerWeek}× pro Woche
                {includeDeload && ' · mit Deload'}
                {focus && ` · Fokus: ${focus}`}
              </p>
              <p className="text-muted-foreground">= {weeks * sessionsPerWeek} Einheiten gesamt</p>
            </div>

            <Button onClick={handleGenerate} className="w-full gap-2" size="lg">
              <Sparkles className="w-4 h-4" />
              Plan generieren
            </Button>
          </div>
        )}

        {/* ── Step: Generating ── */}
        {step === 'generating' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Claude erstellt deinen Plan…</p>
                <p className="text-xs text-muted-foreground">Das dauert meist 15–30 Sekunden</p>
              </div>
            </div>

            {/* Streaming-Vorschau */}
            {streamedText && (
              <div className="rounded-xl border border-border bg-muted/20 p-3 max-h-80 overflow-y-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {streamedText}
                  <span className="animate-pulse">▌</span>
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === 'preview' && validationResult && (
          <div className="space-y-4">
            {/* Validierungs-Banner */}
            <div className={`rounded-lg border px-3 py-2.5 ${
              validationResult.valid
                ? 'bg-success/5 border-success/20'
                : 'bg-warning/5 border-warning/20'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {validationResult.valid
                  ? <CheckCircle className="w-4 h-4 text-success" />
                  : <AlertTriangle className="w-4 h-4 text-warning" />}
                <span className="text-sm font-medium">
                  {validationResult.valid ? 'Plan bereit zum Import' : 'Plan mit Hinweisen'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {validationResult.stats.workouts} Einheiten
                · {validationResult.stats.exercises} Übungen
                {validationResult.stats.phases.deload > 0 && ` · ${validationResult.stats.phases.deload}× Deload`}
                {validationResult.stats.phases.test > 0 && ` · ${validationResult.stats.phases.test}× Test`}
              </p>
              {validationResult.warnings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {validationResult.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-warning flex items-start gap-1.5">
                      <span className="flex-shrink-0">⚠</span> {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Markdown-Vorschau editierbar */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Du kannst den Plan hier noch anpassen, bevor du ihn importierst.
              </p>
              <Textarea
                value={generatedMarkdown}
                onChange={e => {
                  setGeneratedMarkdown(e.target.value);
                  const parsed = parsePlan(e.target.value);
                  if (parsed) setValidationResult(validateParsedPlan(parsed));
                }}
                rows={16}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={handleReset}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Neu generieren
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleImport}
                disabled={!validationResult.valid && validationResult.errors.length > 0}
              >
                <Check className="w-4 h-4" />
                Plan importieren
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Importing ── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Plan wird gespeichert…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AIBuilderDialog;
