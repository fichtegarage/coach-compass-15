import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  CheckCircle, ChevronRight, ChevronLeft, Loader2, X,
  ClipboardCheck, Flame, Activity, Dumbbell, Wind, MessageSquare,
  Weight, Ruler, Camera, Plus, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface AssessmentGuideV2Props {
  clientId: string;
  clientName: string;
  trainerId: string;
  onClose: () => void;
  onComplete: () => void;
}

type Stage = 
  | 'briefing'
  | 'body_measurements'
  | 'warmup'
  | 'fms'
  | 'movement_practice'
  | 'mini_workout'
  | 'cooldown'
  | 'checkout'
  | 'completed';

interface MovementScore {
  pattern: string;
  score: number; // 1-5
  notes: string;
}

interface BodyMeasurements {
  weight_kg: number | null;
  caliper_triceps_mm: number | null;
  caliper_suprailiac_mm: number | null;
  caliper_thigh_mm: number | null;
  photo_url: string | null;
}

interface CheckoutAnswers {
  feeling: string;
  challenges: string;
  needs: string;
  goals_still_relevant: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const STAGES: Stage[] = [
  'briefing',
  'body_measurements',
  'warmup',
  'fms',
  'movement_practice',
  'mini_workout',
  'cooldown',
  'checkout'
];

const STAGE_LABELS: Record<Stage, { icon: React.ReactNode; label: string }> = {
  briefing: { icon: <ClipboardCheck className="w-5 h-5" />, label: 'Briefing' },
  body_measurements: { icon: <Ruler className="w-5 h-5" />, label: 'Körpermaße' },
  warmup: { icon: <Flame className="w-5 h-5" />, label: 'Warm-Up' },
  fms: { icon: <Activity className="w-5 h-5" />, label: 'FMS' },
  movement_practice: { icon: <Dumbbell className="w-5 h-5" />, label: 'Bewegungspraxis' },
  mini_workout: { icon: <Dumbbell className="w-5 h-5" />, label: 'Mini-Workout' },
  cooldown: { icon: <Wind className="w-5 h-5" />, label: 'Cool-Down' },
  checkout: { icon: <MessageSquare className="w-5 h-5" />, label: 'Checkout' },
  completed: { icon: <CheckCircle className="w-5 h-5" />, label: 'Abgeschlossen' }
};

const MOVEMENT_PATTERNS = [
  { id: 'hip_hinge', name: 'Hip Hinge / Hüftbeuge', description: 'RDL-Bewegung, Hüfte nach hinten' },
  { id: 'squat', name: 'Squat / Kniebeuge', description: 'Bodyweight oder Goblet Squat' },
  { id: 'push', name: 'Push / Drücken', description: 'Wall Push-Up → Floor Push-Up' },
  { id: 'pull', name: 'Pull / Ziehen', description: 'Band-Rows oder Assisted Pull-Up' },
  { id: 'core', name: 'Core / Rumpfstabilität', description: 'Dead Bug oder Pallof Press' },
  { id: 'carry', name: 'Loaded Carry / Tragen', description: 'Farmer\'s Walk Basics' }
];

const FMS_TESTS = [
  { id: 'overhead_squat', name: 'Overhead Squat', description: 'Tiefe Kniebeuge mit Stab über Kopf' },
  { id: 'hurdle_step', name: 'Hurdle Step', description: 'Über Hürde steigen' },
  { id: 'inline_lunge', name: 'Inline Lunge', description: 'Ausfallschritt auf Linie' }
];

const CHECKOUT_QUESTIONS = [
  { id: 'feeling', question: 'Wie war das Training heute für dich?', placeholder: 'z.B. anstrengend aber gut...' },
  { id: 'challenges', question: 'Gab es Bewegungen die besonders herausfordernd waren?', placeholder: 'z.B. Hip Hinge war schwer zu spüren...' },
  { id: 'needs', question: 'Was brauchst du von mir als Coach?', placeholder: 'z.B. mehr Erklärungen, Videos...' },
  { id: 'goals_still_relevant', question: 'Sind deine Ziele noch aktuell oder hat sich etwas verändert?', placeholder: 'z.B. ja, alles gut...' }
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function AssessmentGuideV2({
  clientId,
  clientName,
  trainerId,
  onClose,
  onComplete
}: AssessmentGuideV2Props) {
  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<Stage>('briefing');
  const [stageData, setStageData] = useState<Record<string, any>>({});
  
  // Options
  const [includeMeasurements, setIncludeMeasurements] = useState(true);
  const [includeFMS, setIncludeFMS] = useState(false);
  
  // Body Measurements
  const [measurements, setMeasurements] = useState<BodyMeasurements>({
    weight_kg: null,
    caliper_triceps_mm: null,
    caliper_suprailiac_mm: null,
    caliper_thigh_mm: null,
    photo_url: null
  });
  
  // Movement Scores
  const [movementScores, setMovementScores] = useState<MovementScore[]>(
    MOVEMENT_PATTERNS.map(p => ({ pattern: p.id, score: 3, notes: '' }))
  );
  
  // FMS Scores
  const [fmsScores, setFmsScores] = useState<MovementScore[]>(
    FMS_TESTS.map(t => ({ pattern: t.id, score: 3, notes: '' }))
  );
  
  // Checkout
  const [checkoutAnswers, setCheckoutAnswers] = useState<CheckoutAnswers>({
    feeling: '',
    challenges: '',
    needs: '',
    goals_still_relevant: ''
  });
  
  const [coachNotes, setCoachNotes] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);

  // ── Load or Create Session ──────────────────────────────────────────────────

  useEffect(() => {
    loadOrCreateSession();
  }, []);

  async function loadOrCreateSession() {
    setLoading(true);
    
    try {
      // Check for existing incomplete session
      const { data: existingSession } = await supabase
        .from('assessment_sessions')
        .select('*')
        .eq('client_id', clientId)
        .is('completed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        // Resume existing session
        setSessionId(existingSession.id);
        setCurrentStage(existingSession.current_stage as Stage);
        setStageData(existingSession.stage_data || {});
        
        // Restore state from stage_data
        if (existingSession.stage_data?.measurements) {
          setMeasurements(existingSession.stage_data.measurements);
        }
        if (existingSession.movement_scores) {
          setMovementScores(existingSession.movement_scores);
        }
        if (existingSession.fms_scores) {
          setFmsScores(existingSession.fms_scores);
        }
        if (existingSession.checkout_answers) {
          setCheckoutAnswers(existingSession.checkout_answers);
        }
        if (existingSession.coach_notes) {
          setCoachNotes(existingSession.coach_notes);
        }
        
        toast.info('Assessment wird fortgesetzt');
      } else {
        // Create new session
        const { data: newSession, error } = await supabase
          .from('assessment_sessions')
          .insert({
            client_id: clientId,
            trainer_id: trainerId,
            current_stage: 'briefing',
            stage_data: {}
          })
          .select()
          .single();

        if (error) throw error;
        
        setSessionId(newSession.id);
        toast.success('Assessment gestartet');
      }
    } catch (error) {
      console.error('Session Load Error:', error);
      toast.error('Fehler beim Laden der Session');
    }
    
    setLoading(false);
  }

  // ── Save Progress ────────────────────────────────────────────────────────────

  async function saveProgress(newStage?: Stage) {
    if (!sessionId) return;
    
    setSaving(true);
    
    const updates: any = {
      current_stage: newStage || currentStage,
      stage_data: {
        ...stageData,
        measurements: measurements,
        includeMeasurements,
        includeFMS
      },
      movement_scores: movementScores,
      fms_scores: includeFMS ? fmsScores : [],
      checkout_answers: checkoutAnswers,
      coach_notes: coachNotes,
      strengths: strengths,
      focus_areas: focusAreas,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('assessment_sessions')
      .update(updates)
      .eq('id', sessionId);

    if (error) {
      console.error('Save Error:', error);
      toast.error('Fehler beim Speichern');
    }
    
    setSaving(false);
  }

  // ── Stage Navigation ─────────────────────────────────────────────────────────

  async function nextStage() {
    const currentIndex = STAGES.indexOf(currentStage);
    let nextIndex = currentIndex + 1;
    
    // Skip body_measurements if disabled
    if (STAGES[nextIndex] === 'body_measurements' && !includeMeasurements) {
      nextIndex++;
    }
    
    // Skip FMS if disabled
    if (STAGES[nextIndex] === 'fms' && !includeFMS) {
      nextIndex++;
    }
    
    if (nextIndex < STAGES.length) {
      const nextStage = STAGES[nextIndex];
      setCurrentStage(nextStage);
      await saveProgress(nextStage);
    }
  }

  async function prevStage() {
    const currentIndex = STAGES.indexOf(currentStage);
    let prevIndex = currentIndex - 1;
    
    // Skip FMS if disabled (when going back)
    if (STAGES[prevIndex] === 'fms' && !includeFMS) {
      prevIndex--;
    }
    
    // Skip body_measurements if disabled (when going back)
    if (STAGES[prevIndex] === 'body_measurements' && !includeMeasurements) {
      prevIndex--;
    }
    
    if (prevIndex >= 0) {
      const prevStage = STAGES[prevIndex];
      setCurrentStage(prevStage);
      await saveProgress(prevStage);
    }
  }

  // ── Complete Assessment ──────────────────────────────────────────────────────

  async function completeAssessment() {
    if (!sessionId) return;
    
    setSaving(true);
    
    try {
      // 1. Save body measurements if collected
      let bodyMeasurementId = null;
      if (includeMeasurements && (measurements.weight_kg || measurements.caliper_triceps_mm)) {
        const { data: metricData, error: metricError } = await supabase
          .from('client_metrics')
          .insert({
            client_id: clientId,
            weight_kg: measurements.weight_kg,
            caliper_triceps_mm: measurements.caliper_triceps_mm,
            caliper_suprailiac_mm: measurements.caliper_suprailiac_mm,
            caliper_thigh_mm: measurements.caliper_thigh_mm,
            recorded_at: new Date().toISOString(),
            notes: 'Assessment-Messung'
          })
          .select()
          .single();
        
        if (!metricError && metricData) {
          bodyMeasurementId = metricData.id;
        }
      }

      // 2. Complete session
      const { error: sessionError } = await supabase
        .from('assessment_sessions')
        .update({
          current_stage: 'completed',
          completed_at: new Date().toISOString(),
          body_measurement_id: bodyMeasurementId,
          movement_scores: movementScores,
          fms_scores: includeFMS ? fmsScores : [],
          checkout_answers: checkoutAnswers,
          coach_notes: coachNotes,
          strengths: strengths,
          focus_areas: focusAreas
        })
        .eq('id', sessionId);

      if (sessionError) throw sessionError;

      toast.success('Assessment abgeschlossen! 🎉');
      onComplete();
      onClose();
    } catch (error) {
      console.error('Complete Error:', error);
      toast.error('Fehler beim Abschließen');
    }
    
    setSaving(false);
  }

  // ── Render Loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-background rounded-2xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Lade Assessment...</p>
        </div>
      </div>
    );
  }

  // ── Render Main ──────────────────────────────────────────────────────────────

  const currentIndex = STAGES.indexOf(currentStage);
  const progress = ((currentIndex + 1) / STAGES.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-background rounded-2xl shadow-2xl border border-border flex flex-col max-h-[90vh]">
        
        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold font-display">Assessment</h2>
              <p className="text-sm text-muted-foreground mt-1">{clientName}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{STAGE_LABELS[currentStage].label}</span>
              <span>{currentIndex + 1} / {STAGES.length}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStage === 'briefing' && (
            <BriefingStage 
              clientName={clientName}
              includeMeasurements={includeMeasurements}
              setIncludeMeasurements={setIncludeMeasurements}
              includeFMS={includeFMS}
              setIncludeFMS={setIncludeFMS}
            />
          )}

          {currentStage === 'body_measurements' && (
            <BodyMeasurementsStage
              measurements={measurements}
              setMeasurements={setMeasurements}
            />
          )}

          {currentStage === 'warmup' && (
            <WarmupStage />
          )}

          {currentStage === 'fms' && (
            <FMSStage
              scores={fmsScores}
              setScores={setFmsScores}
            />
          )}

          {currentStage === 'movement_practice' && (
            <MovementPracticeStage
              scores={movementScores}
              setScores={setMovementScores}
            />
          )}

          {currentStage === 'mini_workout' && (
            <MiniWorkoutStage clientId={clientId} />
          )}

          {currentStage === 'cooldown' && (
            <CooldownStage />
          )}

          {currentStage === 'checkout' && (
            <CheckoutStage
              answers={checkoutAnswers}
              setAnswers={setCheckoutAnswers}
              coachNotes={coachNotes}
              setCoachNotes={setCoachNotes}
              strengths={strengths}
              setStrengths={setStrengths}
              focusAreas={focusAreas}
              setFocusAreas={setFocusAreas}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 border-t border-border p-6 flex items-center justify-between bg-muted/20">
          <Button
            variant="outline"
            onClick={prevStage}
            disabled={currentIndex === 0 || saving}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Zurück
          </Button>

          {currentStage === 'checkout' ? (
            <Button
              onClick={completeAssessment}
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Assessment abschließen
            </Button>
          ) : (
            <Button
              onClick={nextStage}
              disabled={saving}
              className="gap-2"
            >
              Weiter
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STAGE COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// ─── Briefing ─────────────────────────────────────────────────────────────────

function BriefingStage({
  clientName,
  includeMeasurements,
  setIncludeMeasurements,
  includeFMS,
  setIncludeFMS
}: {
  clientName: string;
  includeMeasurements: boolean;
  setIncludeMeasurements: (v: boolean) => void;
  includeFMS: boolean;
  setIncludeFMS: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <ClipboardCheck className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">Willkommen zum Assessment!</h3>
        <p className="text-muted-foreground">
          Hallo {clientName}, heute machen wir ein vollständiges Assessment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Was machen wir heute?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-3">
              <Ruler className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Körpermaße (optional)</p>
                <p className="text-muted-foreground">Gewicht, Caliper-Messung, Foto</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Flame className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Warm-Up</p>
                <p className="text-muted-foreground">Mobilisation & Aktivierung</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Activity className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">FMS & Bewegungspraxis (optional)</p>
                <p className="text-muted-foreground">Grundbewegungen testen & einüben</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Dumbbell className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Mini-Workout</p>
                <p className="text-muted-foreground">Kurzes Training aus deinem Plan</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Wind className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Cool-Down</p>
                <p className="text-muted-foreground">Dehnung & Entspannung</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Checkout</p>
                <p className="text-muted-foreground">Feedback & offene Fragen</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Optionen für heute</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Körpermaße aufnehmen</p>
              <p className="text-xs text-muted-foreground">Gewicht, Caliper, Foto</p>
            </div>
            <Switch
              checked={includeMeasurements}
              onCheckedChange={setIncludeMeasurements}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">FMS-Assessment durchführen</p>
              <p className="text-xs text-muted-foreground">Functional Movement Screen (verkürzt)</p>
            </div>
            <Switch
              checked={includeFMS}
              onCheckedChange={setIncludeFMS}
            />
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        <p>⏱ Geplante Dauer: ca. 45-60 Minuten</p>
      </div>
    </div>
  );
}

// ─── Body Measurements ────────────────────────────────────────────────────────

function BodyMeasurementsStage({
  measurements,
  setMeasurements
}: {
  measurements: BodyMeasurements;
  setMeasurements: (m: BodyMeasurements) => void;
}) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <Ruler className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">Körpermaße</h3>
        <p className="text-muted-foreground">Optional - nur wenn du magst!</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Weight className="w-5 h-5" />
            Gewicht
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              step="0.1"
              placeholder="z.B. 75.5"
              value={measurements.weight_kg || ''}
              onChange={e => setMeasurements({ ...measurements, weight_kg: parseFloat(e.target.value) || null })}
              className="max-w-xs"
            />
            <span className="text-sm text-muted-foreground">kg</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Caliper-Messung (3-Falten)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Trizeps (Rückseite Oberarm)</Label>
            <div className="flex items-center gap-3 mt-1">
              <Input
                type="number"
                step="0.1"
                placeholder="z.B. 12.5"
                value={measurements.caliper_triceps_mm || ''}
                onChange={e => setMeasurements({ ...measurements, caliper_triceps_mm: parseFloat(e.target.value) || null })}
                className="max-w-xs"
              />
              <span className="text-sm text-muted-foreground">mm</span>
            </div>
          </div>

          <div>
            <Label className="text-sm">Suprailiac (Beckenkamm)</Label>
            <div className="flex items-center gap-3 mt-1">
              <Input
                type="number"
                step="0.1"
                placeholder="z.B. 15.0"
                value={measurements.caliper_suprailiac_mm || ''}
                onChange={e => setMeasurements({ ...measurements, caliper_suprailiac_mm: parseFloat(e.target.value) || null })}
                className="max-w-xs"
              />
              <span className="text-sm text-muted-foreground">mm</span>
            </div>
          </div>

          <div>
            <Label className="text-sm">Oberschenkel (Vorderseite)</Label>
            <div className="flex items-center gap-3 mt-1">
              <Input
                type="number"
                step="0.1"
                placeholder="z.B. 18.0"
                value={measurements.caliper_thigh_mm || ''}
                onChange={e => setMeasurements({ ...measurements, caliper_thigh_mm: parseFloat(e.target.value) || null })}
                className="max-w-xs"
              />
              <span className="text-sm text-muted-foreground">mm</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Foto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Fortschrittsfoto wird in separater Funktion hochgeladen
          </p>
          <Button variant="outline" size="sm" className="gap-2">
            <Camera className="w-4 h-4" />
            Foto aufnehmen
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground">
        <p>💡 Tipp: Alle Felder sind optional - nur eingeben was gemessen wurde</p>
      </div>
    </div>
  );
}

// ─── Warm-Up ──────────────────────────────────────────────────────────────────

function WarmupStage() {
  const exercises = [
    'Cat-Cow: 10 Wiederholungen',
    'Schulterkreisen: 10/Richtung',
    'Hüftkreisen: 10/Seite',
    'Weltbeste Dehnung: 5/Seite',
    'Glute Bridge: 15 Wiederholungen'
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <Flame className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">Warm-Up</h3>
        <p className="text-muted-foreground">Mobilisation & Aktivierung</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          {exercises.map((ex, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {i + 1}
              </div>
              <p className="text-sm">{ex}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        <p>✓ Checke jede Übung ab wenn durchgeführt</p>
      </div>
    </div>
  );
}

// ─── FMS ──────────────────────────────────────────────────────────────────────

function FMSStage({
  scores,
  setScores
}: {
  scores: MovementScore[];
  setScores: (s: MovementScore[]) => void;
}) {
  function updateScore(index: number, field: keyof MovementScore, value: any) {
    const updated = [...scores];
    updated[index] = { ...updated[index], [field]: value };
    setScores(updated);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <Activity className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">FMS Assessment</h3>
        <p className="text-muted-foreground">Functional Movement Screen (verkürzt)</p>
      </div>

      <div className="space-y-4">
        {FMS_TESTS.map((test, i) => (
          <Card key={test.id}>
            <CardHeader>
              <CardTitle className="text-base">{test.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{test.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block">Score (1-5)</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(score => (
                    <button
                      key={score}
                      onClick={() => updateScore(i, 'score', score)}
                      className={`w-12 h-12 rounded-lg border-2 font-semibold transition-all ${
                        scores[i].score === score
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm">Notizen</Label>
                <Textarea
                  placeholder="z.B. Links besser als rechts..."
                  value={scores[i].notes}
                  onChange={e => updateScore(i, 'notes', e.target.value)}
                  rows={2}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Movement Practice ────────────────────────────────────────────────────────

function MovementPracticeStage({
  scores,
  setScores
}: {
  scores: MovementScore[];
  setScores: (s: MovementScore[]) => void;
}) {
  function updateScore(index: number, field: keyof MovementScore, value: any) {
    const updated = [...scores];
    updated[index] = { ...updated[index], [field]: value };
    setScores(updated);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <Dumbbell className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">Bewegungspraxis</h3>
        <p className="text-muted-foreground">Grundbewegungen einüben & bewerten</p>
      </div>

      <div className="space-y-4">
        {MOVEMENT_PATTERNS.map((pattern, i) => (
          <Card key={pattern.id}>
            <CardHeader>
              <CardTitle className="text-base">{pattern.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{pattern.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block">Bewegungsqualität (1-5)</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(score => (
                    <button
                      key={score}
                      onClick={() => updateScore(i, 'score', score)}
                      className={`w-12 h-12 rounded-lg border-2 font-semibold transition-all ${
                        scores[i].score === score
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  1 = sehr schwierig · 3 = okay · 5 = sehr gut
                </p>
              </div>
              <div>
                <Label className="text-sm">Coaching-Hinweise</Label>
                <Textarea
                  placeholder="z.B. Hüfte geht zu wenig nach hinten..."
                  value={scores[i].notes}
                  onChange={e => updateScore(i, 'notes', e.target.value)}
                  rows={2}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Mini-Workout ─────────────────────────────────────────────────────────────

function MiniWorkoutStage({ clientId }: { clientId: string }) {
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkoutFromPlan();
  }, []);

  async function loadWorkoutFromPlan() {
    setLoading(true);
    
    try {
      // Get active plan (check both client_id and duo_partner_id)
      const { data: plans } = await supabase
        .from('training_plans')
        .select('id, next_plan_workout_id')
        .or(`client_id.eq.${clientId},duo_partner_id.eq.${clientId}`)
        .eq('is_active', true)
        .limit(1);

      const plan = plans?.[0];
      if (!plan) {
        setExercises([]);
        setLoading(false);
        return;
      }

      // If no next_plan_workout_id is set, get the first workout
      let workoutId = plan.next_plan_workout_id;
      
      if (!workoutId) {
        const { data: firstWorkout } = await supabase
          .from('plan_workouts')
          .select('id')
          .eq('plan_id', plan.id)
          .order('week_number')
          .order('order_in_week')
          .limit(1)
          .single();
        
        workoutId = firstWorkout?.id;
      }

      if (!workoutId) {
        setExercises([]);
        setLoading(false);
        return;
      }

      // Get workout exercises (only main exercises, limit to 5)
      const { data: exercises } = await supabase
        .from('plan_exercises')
        .select('*')
        .eq('workout_id', workoutId)
        .or('exercise_slot.eq.main,exercise_slot.is.null')
        .order('order_in_workout')
        .limit(5);

      setExercises(exercises || []);
    } catch (error) {
      console.error('Load Workout Error:', error);
    }
    
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Lade Workout...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <Dumbbell className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">Mini-Workout</h3>
        <p className="text-muted-foreground">Aus deinem aktuellen Trainingsplan</p>
      </div>

      {exercises.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Kein aktiver Trainingsplan gefunden</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {exercises.map((ex, i) => (
              <div key={ex.id} className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{ex.name}</p>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    {ex.sets} × {ex.reps_target}
                  </span>
                </div>
                {ex.notes && (
                  <p className="text-xs text-muted-foreground">{ex.notes}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="text-center text-sm text-muted-foreground">
        <p>💪 Führe diese Übungen mit leichtem Gewicht durch</p>
      </div>
    </div>
  );
}

// ─── Cooldown ─────────────────────────────────────────────────────────────────

function CooldownStage() {
  const exercises = [
    'Weltbeste Dehnung: 5/Seite',
    'Child\'s Pose: 60 Sekunden',
    'Hüftbeuger-Dehnung: 30 Sek./Seite',
    'Hamstring-Dehnung: 30 Sek./Seite',
    'Thorakale Rotation: 10/Seite'
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <Wind className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">Cool-Down</h3>
        <p className="text-muted-foreground">Dehnung & Entspannung</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          {exercises.map((ex, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {i + 1}
              </div>
              <p className="text-sm">{ex}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        <p>🧘 Nimm dir Zeit für jede Dehnung</p>
      </div>
    </div>
  );
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

function CheckoutStage({
  answers,
  setAnswers,
  coachNotes,
  setCoachNotes,
  strengths,
  setStrengths,
  focusAreas,
  setFocusAreas
}: {
  answers: CheckoutAnswers;
  setAnswers: (a: CheckoutAnswers) => void;
  coachNotes: string;
  setCoachNotes: (n: string) => void;
  strengths: string[];
  setStrengths: (s: string[]) => void;
  focusAreas: string[];
  setFocusAreas: (f: string[]) => void;
}) {
  const [newStrength, setNewStrength] = useState('');
  const [newFocus, setNewFocus] = useState('');

  function addStrength() {
    if (newStrength.trim()) {
      setStrengths([...strengths, newStrength.trim()]);
      setNewStrength('');
    }
  }

  function addFocus() {
    if (newFocus.trim()) {
      setFocusAreas([...focusAreas, newFocus.trim()]);
      setNewFocus('');
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <MessageSquare className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-2xl font-bold font-display">Checkout</h3>
        <p className="text-muted-foreground">Feedback & Zusammenfassung</p>
      </div>

      {/* Client Questions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fragen an dich</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {CHECKOUT_QUESTIONS.map((q) => (
            <div key={q.id}>
              <Label className="text-sm mb-2 block">{q.question}</Label>
              <Textarea
                placeholder={q.placeholder}
                value={answers[q.id as keyof CheckoutAnswers]}
                onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                rows={3}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Coach Assessment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Coach-Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Strengths */}
          <div>
            <Label className="text-sm mb-2 block">Stärken</Label>
            <div className="space-y-2">
              {strengths.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm flex-1 bg-green-50 text-green-700 px-3 py-2 rounded-lg">{s}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStrengths(strengths.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="z.B. Gute Kniebeuge"
                  value={newStrength}
                  onChange={e => setNewStrength(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStrength()}
                />
                <Button onClick={addStrength} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </Button>
              </div>
            </div>
          </div>

          {/* Focus Areas */}
          <div>
            <Label className="text-sm mb-2 block">Fokus-Bereiche</Label>
            <div className="space-y-2">
              {focusAreas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm flex-1 bg-amber-50 text-amber-700 px-3 py-2 rounded-lg">{f}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFocusAreas(focusAreas.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="z.B. Hip Hinge Pattern"
                  value={newFocus}
                  onChange={e => setNewFocus(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFocus()}
                />
                <Button onClick={addFocus} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Hinzufügen
                </Button>
              </div>
            </div>
          </div>

          {/* Coach Notes */}
          <div>
            <Label className="text-sm mb-2 block">Coach-Notizen</Label>
            <Textarea
              placeholder="Zusammenfassung, Beobachtungen, nächste Schritte..."
              value={coachNotes}
              onChange={e => setCoachNotes(e.target.value)}
              rows={6}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
