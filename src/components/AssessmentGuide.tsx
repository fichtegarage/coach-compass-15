/**
 * AssessmentGuide.tsx
 *
 * Coach-seitiges Assessment + integrierter Workout-Logger.
 *
 * Tab 1 – Assessment: 7 standardisierte Übungen mit Messungen + Tiefenfragen
 * Tab 2 – Workout:   Coach loggt Übungen auf behalf des Kunden
 *
 * Assessment-Übungen:
 * 1. Kniebeuge          → Bewegungsqualität (Score 1–5)
 * 2. Hip Hinge          → Bewegungsqualität (Score 1–5)
 * 3. Schulter-Mobilität → Abstand Hände in cm (li. + re.)
 * 4. Push-up Test       → Max. saubere Wiederholungen
 * 5. Plank              → Sekunden
 * 6. Einbeiniger Stand  → Sekunden (li. + re.)
 * 7. Vorwärtsbeugen     → Abstand Fingerkuppen–Boden in cm
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2, Save, CheckCircle, ChevronDown, ChevronUp,
  Target, Lightbulb, Dumbbell, X, ClipboardList, Timer,
  Ruler, Activity,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssessmentGuideProps {
  workoutId: string;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onComplete: () => void;
}

// Messwerte für die 7 Assessment-Übungen
interface AssessmentMeasurements {
  squat_score:            number;   // 1–5
  squat_notes:            string;
  hinge_score:            number;   // 1–5
  hinge_notes:            string;
  shoulder_left_cm:       string;   // Abstand Hände links (cm, + = gut, - = schlecht)
  shoulder_right_cm:      string;
  shoulder_notes:         string;
  pushup_reps:            string;   // Anzahl
  pushup_notes:           string;
  plank_seconds:          string;   // Sekunden
  plank_notes:            string;
  balance_left_seconds:   string;   // Sekunden links
  balance_right_seconds:  string;   // Sekunden rechts
  balance_notes:          string;
  forward_fold_cm:        string;   // cm (+) = Hände über Boden, (-) = Hände unter Boden
  forward_fold_notes:     string;
}

interface DeepQuestions {
  motivation_detail:    string;
  barriers:             string;
  lifestyle_factors:    string;
  recovery_capacity:    string;
  training_preferences: string;
}

// Für den Coach-Logger
interface SetEntry {
  setNumber: number;
  weight: string;
  reps: string;
  logged: boolean;
}

interface ExerciseLog {
  exerciseId: string | null;
  name: string;
  setsTarget: number;
  repsTarget: string;
  patternId: string | null;
  coachingCues: string[];
  measurementHint?: string; // Hinweis was gemessen wird
  notes: string;
  sets: SetEntry[];
}

// ── Assessment-Übungen für den Workout-Logger-Tab ─────────────────────────────

const ASSESSMENT_EXERCISES_LOG: Omit<ExerciseLog, 'sets'>[] = [
  {
    exerciseId: null,
    name: 'Kniebeuge (Bodyweight)',
    setsTarget: 3,
    repsTarget: '8-10',
    patternId: 'squat',
    coachingCues: ['Knie nach außen drücken', 'Brust hoch', 'Tiefe bewerten', 'Butt Wink beobachten'],
    measurementHint: 'Score im Assessment-Tab vergeben',
    notes: 'Bewegungsanalyse: Tiefe, Knie-Tracking, Rückenposition',
  },
  {
    exerciseId: null,
    name: 'Hip Hinge (leichtes RDL)',
    setsTarget: 3,
    repsTarget: '8-10',
    patternId: 'hinge',
    coachingCues: ['Hüfte nach hinten', 'Rücken gerade', 'Hamstrings spüren', 'Stange nah am Körper'],
    measurementHint: 'Score im Assessment-Tab vergeben',
    notes: 'Bewegungsanalyse: Hinge-Pattern, Hüftmobilität, Rückenposition',
  },
  {
    exerciseId: null,
    name: 'Schulter-Mobilitätstest',
    setsTarget: 1,
    repsTarget: '3/Seite',
    patternId: 'mobility',
    coachingCues: ['Arm hinter Kopf', 'Anderer Arm hinter Rücken', 'Abstand Hände messen', 'Beide Seiten vergleichen'],
    measurementHint: '→ Messung in cm im Assessment-Tab eintragen',
    notes: 'Abstand der Hände: positiv = Hände überlappen, negativ = Lücke',
  },
  {
    exerciseId: null,
    name: 'Push-up Test',
    setsTarget: 1,
    repsTarget: 'Max.',
    patternId: 'push',
    coachingCues: ['Körper gerade halten', 'Volle ROM', 'Tempo kontrollieren', 'Zählen bis Technik bricht'],
    measurementHint: '→ Anzahl sauberer Wdh. im Assessment-Tab eintragen',
    notes: 'Maximale saubere Wiederholungen – bei Technikverfall abbrechen',
  },
  {
    exerciseId: null,
    name: 'Plank (Unterarmstütz)',
    setsTarget: 1,
    repsTarget: 'Max. Zeit',
    patternId: 'core',
    coachingCues: ['Becken neutral', 'Core aktivieren', 'Gleichmäßige Atmung', 'Kein Hohlkreuz'],
    measurementHint: '→ Sekunden im Assessment-Tab eintragen',
    notes: 'Zeit stoppen bis Hüfte sinkt oder Technik bricht',
  },
  {
    exerciseId: null,
    name: 'Einbeiniger Stand',
    setsTarget: 1,
    repsTarget: 'Max. Zeit/Seite',
    patternId: 'core',
    coachingCues: ['Augen geradeaus', 'Standbein leicht gebeugt', 'Hüfte gerade', 'Beide Seiten vergleichen'],
    measurementHint: '→ Sekunden pro Seite im Assessment-Tab eintragen',
    notes: 'Zeit bis Aufsetzen oder Auslenkung > 45°. Augen offen.',
  },
  {
    exerciseId: null,
    name: 'Vorwärtsbeugen stehend',
    setsTarget: 1,
    repsTarget: '3 Versuche',
    patternId: 'mobility',
    coachingCues: ['Beine gerade', 'Langsam absenken', 'Abstand messen', 'Rückenform beobachten'],
    measurementHint: '→ Abstand Fingerkuppen–Boden in cm im Assessment-Tab eintragen',
    notes: 'Positiv (+) = Hände unter dem Boden, Negativ (-) = Lücke zum Boden',
  },
];

// ── Score-Labels ──────────────────────────────────────────────────────────────

const SCORE_LABELS = [
  { value: 1, label: 'Eingeschränkt',       color: 'bg-red-500' },
  { value: 2, label: 'Verbesserungswürdig', color: 'bg-orange-500' },
  { value: 3, label: 'Durchschnitt',        color: 'bg-yellow-500' },
  { value: 4, label: 'Gut',                 color: 'bg-lime-500' },
  { value: 5, label: 'Ausgezeichnet',       color: 'bg-green-500' },
];

// ── Tiefenfragen ──────────────────────────────────────────────────────────────

const DEEP_QUESTIONS = [
  { id: 'motivation_detail', label: 'Motivation & Ziel-Detail', placeholder: 'Was genau will der Kunde erreichen? Warum jetzt?',
    prompts: ['Stell dir vor, du hast dein Ziel erreicht. Was ändert sich als erstes?', 'Wer würde die Veränderung als erstes bemerken?', 'Gibt es ein konkretes Ereignis, auf das du hinarbeitest?'] },
  { id: 'barriers', label: 'Barrieren & Herausforderungen', placeholder: 'Was hat in der Vergangenheit nicht funktioniert?',
    prompts: ['Was hat dich bisher davon abgehalten?', 'Woran sind frühere Versuche gescheitert?', 'Was ist deine größte Sorge?'] },
  { id: 'lifestyle_factors', label: 'Lebensstil-Faktoren', placeholder: 'Schlaf, Stress, Beruf, Familie, Zeitfenster...',
    prompts: ['Wie sieht ein typischer Tag aus?', 'Wie viel Schlaf bekommst du?', 'Wie würdest du dein Stresslevel einschätzen?'] },
  { id: 'recovery_capacity', label: 'Regenerationsfähigkeit', placeholder: 'Wie schnell erholt sich der Kunde?',
    prompts: ['Wie fühlst du dich am Tag nach dem Training?', 'Hast du Schlafprobleme?', 'Wie gehst du mit Stress um?'] },
  { id: 'training_preferences', label: 'Trainings-Präferenzen', placeholder: 'Lieblingsübungen, Abneigungen, Zeit, Equipment...',
    prompts: ['Welche Übungen machst du gerne?', 'Was möchtest du auf keinen Fall?', 'Wie viel Zeit pro Woche realistisch?'] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const ScoreButtons: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="space-y-1">
    <div className="flex gap-1">
      {SCORE_LABELS.map(({ value: v, color }) => (
        <button key={v} onClick={() => onChange(v)}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${value === v ? `${color} text-white` : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
          {v}
        </button>
      ))}
    </div>
    <p className="text-xs text-center text-muted-foreground">
      {SCORE_LABELS.find(s => s.value === value)?.label}
    </p>
  </div>
);

const MeasurementInput: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  unit: string; hint?: string; inputMode?: 'numeric' | 'decimal';
}> = ({ label, value, onChange, unit, hint, inputMode = 'numeric' }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-foreground">{label}</label>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    <div className="flex items-center gap-2">
      <input
        type="number" inputMode={inputMode} value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => e.target.select()}
        className="w-28 text-center text-xl font-bold rounded-lg py-2 px-3 border border-border focus:outline-none focus:border-primary bg-background"
        placeholder="—"
      />
      <span className="text-sm text-muted-foreground font-medium">{unit}</span>
    </div>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const AssessmentGuide: React.FC<AssessmentGuideProps> = ({
  workoutId, clientId, clientName, onClose, onComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'assessment' | 'workout'>('assessment');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('measurements');
  const [existingAssessmentId, setExistingAssessmentId] = useState<string | null>(null);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const startTimeRef = useRef<Date>(new Date());

  // ── Messungen ──────────────────────────────────────────────────────────────
  const [measurements, setMeasurements] = useState<AssessmentMeasurements>({
    squat_score: 3, squat_notes: '',
    hinge_score: 3, hinge_notes: '',
    shoulder_left_cm: '', shoulder_right_cm: '', shoulder_notes: '',
    pushup_reps: '', pushup_notes: '',
    plank_seconds: '', plank_notes: '',
    balance_left_seconds: '', balance_right_seconds: '', balance_notes: '',
    forward_fold_cm: '', forward_fold_notes: '',
  });

  const setM = (key: keyof AssessmentMeasurements, val: string | number) =>
    setMeasurements(prev => ({ ...prev, [key]: val }));

  // ── Tiefenfragen + Notizen ─────────────────────────────────────────────────
  const [deepQuestions, setDeepQuestions] = useState({
    motivation_detail: '', barriers: '', lifestyle_factors: '',
    recovery_capacity: '', training_preferences: '',
  });
  const [coachNotes, setCoachNotes] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [newStrength, setNewStrength] = useState('');
  const [newFocus, setNewFocus] = useState('');
  const [newContra, setNewContra] = useState('');

  // ── Workout Logger ─────────────────────────────────────────────────────────
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: existing } = await supabase
        .from('assessment_results').select('*').eq('workout_id', workoutId).maybeSingle();

      if (existing) {
        setExistingAssessmentId(existing.id);
        if (existing.measurements) setMeasurements({ ...measurements, ...existing.measurements as AssessmentMeasurements });
        if (existing.deep_questions) setDeepQuestions(existing.deep_questions as any);
        setCoachNotes(existing.coach_notes || '');
        setStrengths(existing.identified_strengths || []);
        setFocusAreas(existing.focus_areas || []);
        setContraindications(existing.contraindications || []);
      }

      const { data: existingLog } = await supabase.from('workout_logs')
        .select('id').eq('plan_workout_id', workoutId).eq('client_id', clientId).is('completed_at', null).maybeSingle();
      if (existingLog) setWorkoutLogId(existingLog.id);

      // Plan-Übungen laden
      const { data: planExercises } = await supabase.from('plan_exercises')
        .select('id, name, sets, reps_target, rest_seconds, notes, exercise_id')
        .eq('workout_id', workoutId).order('order_in_workout');

      const assessmentLogs: ExerciseLog[] = ASSESSMENT_EXERCISES_LOG.map(ex => ({
        ...ex,
        sets: Array.from({ length: ex.setsTarget }, (_, i) => ({
          setNumber: i + 1, weight: '', reps: ex.repsTarget, logged: false,
        })),
      }));

      const planLogs: ExerciseLog[] = (planExercises || []).map(ex => ({
        exerciseId: ex.exercise_id || null, name: ex.name,
        setsTarget: ex.sets || 3, repsTarget: ex.reps_target || '10',
        patternId: null, coachingCues: [], notes: ex.notes || '',
        sets: Array.from({ length: ex.sets || 3 }, (_, i) => ({
          setNumber: i + 1, weight: '', reps: ex.reps_target || '10', logged: false,
        })),
      }));

      setExerciseLogs([...assessmentLogs, ...planLogs]);
      setLoading(false);
    };
    load();
  }, [workoutId, clientId]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const addItem = (type: 'strength' | 'focus' | 'contra') => {
    if (type === 'strength' && newStrength.trim()) { setStrengths(p => [...p, newStrength.trim()]); setNewStrength(''); }
    if (type === 'focus' && newFocus.trim()) { setFocusAreas(p => [...p, newFocus.trim()]); setNewFocus(''); }
    if (type === 'contra' && newContra.trim()) { setContraindications(p => [...p, newContra.trim()]); setNewContra(''); }
  };

  const removeItem = (type: 'strength' | 'focus' | 'contra', i: number) => {
    if (type === 'strength') setStrengths(p => p.filter((_, j) => j !== i));
    if (type === 'focus') setFocusAreas(p => p.filter((_, j) => j !== i));
    if (type === 'contra') setContraindications(p => p.filter((_, j) => j !== i));
  };

  const handleLogSet = async (exerciseIndex: number, setIndex: number, weight: string, reps: string) => {
    if (!reps) return;

    let logId = workoutLogId;
    if (!logId) {
      const { data: newLog } = await supabase.from('workout_logs').insert({
        client_id: clientId, plan_workout_id: workoutId,
        started_at: startTimeRef.current.toISOString(),
      }).select().single();
      if (newLog) { logId = newLog.id; setWorkoutLogId(newLog.id); }
    }
    if (!logId) return;

    const ex = exerciseLogs[exerciseIndex];
    await supabase.from('set_logs').insert({
      workout_log_id: logId, exercise_name: ex.name,
      exercise_id: ex.exerciseId || null,
      set_number: setIndex + 1,
      reps_done: parseInt(reps) || 0,
      weight_kg: parseFloat(weight) || 0,
      logged_at: new Date().toISOString(),
    });

    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[exerciseIndex].sets];
      sets[setIndex] = { ...sets[setIndex], weight, reps, logged: true };
      if (setIndex + 1 < sets.length && !sets[setIndex + 1].logged) {
        sets[setIndex + 1] = { ...sets[setIndex + 1], weight, reps };
      }
      next[exerciseIndex] = { ...next[exerciseIndex], sets };
      return next;
    });

    const allLogged = exerciseLogs[exerciseIndex].sets.map((s, i) => i === setIndex ? true : s.logged).every(Boolean);
    if (allLogged && exerciseIndex < exerciseLogs.length - 1) {
      setTimeout(() => setActiveExerciseIndex(exerciseIndex + 1), 400);
    }
  };

  const saveAssessment = async () => {
    const assessmentData = {
      workout_id: workoutId, client_id: clientId,
      measurements,
      // movement_quality rückwärtskompatibel befüllen aus Scores
      movement_quality: {
        squat:    { score: measurements.squat_score,  notes: measurements.squat_notes,  cues: [] },
        hinge:    { score: measurements.hinge_score,  notes: measurements.hinge_notes,  cues: [] },
        push:     { score: 3, notes: measurements.pushup_notes,     cues: [] },
        pull:     { score: 3, notes: '',              cues: [] },
        core:     { score: 3, notes: measurements.plank_notes,      cues: [] },
        mobility: { score: 3, notes: measurements.shoulder_notes,   cues: [] },
      },
      deep_questions: deepQuestions,
      coach_notes: coachNotes,
      identified_strengths: strengths,
      focus_areas: focusAreas,
      contraindications,
      updated_at: new Date().toISOString(),
    };

    if (existingAssessmentId) {
      await supabase.from('assessment_results').update(assessmentData).eq('id', existingAssessmentId);
    } else {
      const { data } = await supabase.from('assessment_results').insert(assessmentData).select().single();
      if (data) setExistingAssessmentId(data.id);
    }
  };

  const handleInterimSave = async () => {
    setSaving(true);
    await saveAssessment();
    await supabase.from('plan_workouts').update({ is_assessment: true, status: 'in_progress' }).eq('id', workoutId);
    setSaving(false);
    toast.success('Zwischenstand gespeichert');
  };

  const handleComplete = async () => {
    setSaving(true);
    await saveAssessment();

    if (workoutLogId) {
      await supabase.from('workout_logs').update({ completed_at: new Date().toISOString() }).eq('id', workoutLogId);
    }

    await supabase.from('plan_workouts').update({ is_assessment: true, status: 'completed' }).eq('id', workoutId);

    await supabase.from('assessments').upsert({
      client_id: clientId,
      squat_score:    measurements.squat_score,
      hinge_score:    measurements.hinge_score,
      push_score:     3,
      pull_score:     3,
      stability_score: 3,
      focus_points:   focusAreas.join(', '),
      strengths:      strengths.join(', '),
    }, { onConflict: 'client_id' }).catch(() => {});

    setSaving(false);
    toast.success('Assessment abgeschlossen!');
    onComplete();
  };

  // ── SetRow ─────────────────────────────────────────────────────────────────
  const SetRow: React.FC<{
    set: SetEntry; isActive: boolean; targetReps: string;
    onLog: (weight: string, reps: string) => void;
  }> = ({ set, isActive, targetReps, onLog }) => {
    const [w, setW] = useState(set.weight);
    const [r, setR] = useState(set.reps || targetReps);

    if (set.logged) return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
        <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-muted-foreground">Satz {set.setNumber}</span>
        <span className="ml-auto font-semibold">{set.weight ? `${set.weight} kg × ${set.reps}` : set.reps}</span>
      </div>
    );

    if (!isActive) return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/40 text-sm opacity-50">
        <span className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center text-xs text-muted-foreground">{set.setNumber}</span>
        <span className="text-muted-foreground">Satz {set.setNumber}</span>
      </div>
    );

    return (
      <div className="p-3 rounded-lg border-2 border-primary bg-card space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Satz {set.setNumber}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Gewicht (kg)</p>
            <input type="number" inputMode="decimal" value={w} onChange={e => setW(e.target.value)} onFocus={e => e.target.select()} placeholder="0"
              className="w-full text-center text-xl font-bold rounded-lg py-2 border border-border focus:outline-none focus:border-primary bg-background" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Wdh. / Sek.</p>
            <input type="text" value={r} onChange={e => setR(e.target.value)} onFocus={e => e.target.select()} placeholder={targetReps}
              className="w-full text-center text-xl font-bold rounded-lg py-2 border border-border focus:outline-none focus:border-primary bg-background" />
          </div>
        </div>
        <button onClick={() => onLog(w, r)} disabled={!r}
          className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-bold text-sm active:scale-95 transition-all">
          Satz abschließen ✓
        </button>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const currentEx = exerciseLogs[activeExerciseIndex];
  const activeSetIndex = currentEx?.sets.findIndex(s => !s.logged) ?? -1;
  const totalSets = exerciseLogs.reduce((s, l) => s + l.sets.length, 0);
  const loggedSets = exerciseLogs.reduce((s, l) => s + l.sets.filter(x => x.logged).length, 0);

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Assessment</p>
          <p className="text-lg font-bold">{clientName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleInterimSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="ml-1">Speichern</span>
          </Button>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card flex-shrink-0">
        {[
          { id: 'assessment', icon: <ClipboardList className="w-4 h-4" />, label: 'Assessment' },
          { id: 'workout',    icon: <Dumbbell className="w-4 h-4" />,      label: `Workout${loggedSets > 0 ? ` (${loggedSets}/${totalSets})` : ''}` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === tab.id ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ══ ASSESSMENT TAB ══ */}
        {activeTab === 'assessment' && (
          <div className="p-4 space-y-4">

            {/* 1. Messungen */}
            <Card>
              <CardHeader className="cursor-pointer py-3" onClick={() => setExpandedSection(s => s === 'measurements' ? null : 'measurements')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Ruler className="w-5 h-5 text-primary" />
                    Messwerte
                  </CardTitle>
                  {expandedSection === 'measurements' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {expandedSection === 'measurements' && (
                <CardContent className="space-y-6">

                  {/* Kniebeuge */}
                  <div className="space-y-2 pb-4 border-b border-border">
                    <p className="font-semibold flex items-center gap-2">🦵 Kniebeuge (Bodyweight)</p>
                    <ScoreButtons value={measurements.squat_score} onChange={v => setM('squat_score', v)} />
                    <Textarea placeholder="Beobachtungen: Tiefe, Knie-Tracking, Butt Wink..." rows={2}
                      value={measurements.squat_notes} onChange={e => setM('squat_notes', e.target.value)} />
                  </div>

                  {/* Hip Hinge */}
                  <div className="space-y-2 pb-4 border-b border-border">
                    <p className="font-semibold flex items-center gap-2">🏋️ Hip Hinge</p>
                    <ScoreButtons value={measurements.hinge_score} onChange={v => setM('hinge_score', v)} />
                    <Textarea placeholder="Beobachtungen: Hinge-Pattern, Rückenposition, Hamstring-Aktivierung..." rows={2}
                      value={measurements.hinge_notes} onChange={e => setM('hinge_notes', e.target.value)} />
                  </div>

                  {/* Schulter-Mobilitätstest */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold flex items-center gap-2">🙌 Schulter-Mobilitätstest</p>
                    <p className="text-xs text-muted-foreground">Arm hinter Kopf + anderer Arm hinter Rücken → Abstand der Hände messen.<br/>
                      <span className="text-green-600 font-medium">Positiv (+)</span> = Hände überlappen &nbsp;|&nbsp;
                      <span className="text-red-600 font-medium">Negativ (-)</span> = Lücke zwischen den Händen
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <MeasurementInput label="Linke Seite" value={measurements.shoulder_left_cm}
                        onChange={v => setM('shoulder_left_cm', v)} unit="cm" inputMode="decimal" />
                      <MeasurementInput label="Rechte Seite" value={measurements.shoulder_right_cm}
                        onChange={v => setM('shoulder_right_cm', v)} unit="cm" inputMode="decimal" />
                    </div>
                    <Textarea placeholder="Asymmetrien, Einschränkungen..." rows={2}
                      value={measurements.shoulder_notes} onChange={e => setM('shoulder_notes', e.target.value)} />
                  </div>

                  {/* Push-up Test */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold flex items-center gap-2">💪 Push-up Test</p>
                    <p className="text-xs text-muted-foreground">Maximale saubere Wiederholungen. Abbrechen wenn Technik bricht.</p>
                    <MeasurementInput label="Wiederholungen" value={measurements.pushup_reps}
                      onChange={v => setM('pushup_reps', v)} unit="Wdh."
                      hint="Nur saubere Wdh. zählen (Körper gerade, volle ROM)" />
                    <Textarea placeholder="Beobachtungen: Schulterblatt-Kontrolle, Core-Stabilität..." rows={2}
                      value={measurements.pushup_notes} onChange={e => setM('pushup_notes', e.target.value)} />
                  </div>

                  {/* Plank */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold flex items-center gap-2"><Timer className="w-4 h-4" /> Plank</p>
                    <MeasurementInput label="Haltezeit" value={measurements.plank_seconds}
                      onChange={v => setM('plank_seconds', v)} unit="Sek."
                      hint="Abbrechen wenn Hüfte sinkt oder Technik bricht" />
                    <Textarea placeholder="Beobachtungen: Beckenposition, Atemkontrolle..." rows={2}
                      value={measurements.plank_notes} onChange={e => setM('plank_notes', e.target.value)} />
                  </div>

                  {/* Einbeiniger Stand */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold flex items-center gap-2">🦶 Einbeiniger Stand</p>
                    <p className="text-xs text-muted-foreground">Augen offen, Standbein leicht gebeugt. Zeit bis Aufsetzen oder starke Auslenkung.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <MeasurementInput label="Links" value={measurements.balance_left_seconds}
                        onChange={v => setM('balance_left_seconds', v)} unit="Sek." />
                      <MeasurementInput label="Rechts" value={measurements.balance_right_seconds}
                        onChange={v => setM('balance_right_seconds', v)} unit="Sek." />
                    </div>
                    <Textarea placeholder="Asymmetrien, Kompensationsmuster..." rows={2}
                      value={measurements.balance_notes} onChange={e => setM('balance_notes', e.target.value)} />
                  </div>

                  {/* Vorwärtsbeugen */}
                  <div className="space-y-3">
                    <p className="font-semibold flex items-center gap-2">🤸 Vorwärtsbeugen stehend</p>
                    <p className="text-xs text-muted-foreground">
                      Beine gestreckt, langsam beugen.<br/>
                      <span className="text-green-600 font-medium">Positiv (+)</span> = Finger unter Bodenniveau &nbsp;|&nbsp;
                      <span className="text-red-600 font-medium">Negativ (-)</span> = Finger oberhalb Boden
                    </p>
                    <MeasurementInput label="Abstand Fingerkuppen–Boden" value={measurements.forward_fold_cm}
                      onChange={v => setM('forward_fold_cm', v)} unit="cm" inputMode="decimal" />
                    <Textarea placeholder="Beobachtungen: Rückenform, Hamstring-Spannung..." rows={2}
                      value={measurements.forward_fold_notes} onChange={e => setM('forward_fold_notes', e.target.value)} />
                  </div>

                </CardContent>
              )}
            </Card>

            {/* 2. Tiefenfragen */}
            <Card>
              <CardHeader className="cursor-pointer py-3" onClick={() => setExpandedSection(s => s === 'questions' ? null : 'questions')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lightbulb className="w-5 h-5 text-primary" />
                    Tiefenfragen
                  </CardTitle>
                  {expandedSection === 'questions' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {expandedSection === 'questions' && (
                <CardContent className="space-y-4">
                  {DEEP_QUESTIONS.map(q => (
                    <div key={q.id} className="space-y-2">
                      <label className="text-sm font-medium">{q.label}</label>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {q.prompts.map((p, i) => <p key={i}>💬 „{p}"</p>)}
                      </div>
                      <Textarea placeholder={q.placeholder} rows={3}
                        value={deepQuestions[q.id as keyof typeof deepQuestions]}
                        onChange={e => setDeepQuestions(prev => ({ ...prev, [q.id]: e.target.value }))} />
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* 3. Stärken, Fokus, Kontraindikationen */}
            <Card>
              <CardHeader className="cursor-pointer py-3" onClick={() => setExpandedSection(s => s === 'strengths' ? null : 'strengths')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Target className="w-5 h-5 text-primary" />
                    Stärken, Fokus & Kontraindikationen
                  </CardTitle>
                  {expandedSection === 'strengths' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {expandedSection === 'strengths' && (
                <CardContent className="space-y-4">
                  {[
                    { type: 'strength' as const, label: '✅ Stärken', color: 'green', items: strengths, val: newStrength, setVal: setNewStrength },
                    { type: 'focus' as const,    label: '🎯 Fokuspunkte', color: 'orange', items: focusAreas, val: newFocus, setVal: setNewFocus },
                    { type: 'contra' as const,   label: '⚠️ Kontraindikationen', color: 'red', items: contraindications, val: newContra, setVal: setNewContra },
                  ].map(({ type, label, color, items, val, setVal }) => (
                    <div key={type}>
                      <p className={`text-sm font-medium text-${color}-600 mb-2`}>{label}</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {items.map((item, i) => (
                          <span key={i} className={`bg-${color}-100 text-${color}-800 px-2 py-1 rounded-full text-xs flex items-center gap-1`}>
                            {item}<button onClick={() => removeItem(type, i)}>×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input value={val} onChange={e => setVal(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addItem(type)} className="text-sm" placeholder="Hinzufügen..." />
                        <Button size="sm" onClick={() => addItem(type)}>+</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* 4. Notizen */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">📝 Allgemeine Notizen</CardTitle></CardHeader>
              <CardContent>
                <Textarea placeholder="Beobachtungen, Eindrücke, nächste Schritte..." value={coachNotes}
                  onChange={e => setCoachNotes(e.target.value)} rows={4} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ WORKOUT TAB ══ */}
        {activeTab === 'workout' && (
          <div className="flex flex-col h-full">
            {/* Fortschritt */}
            <div className="px-4 py-2 bg-card border-b border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{loggedSets} / {totalSets} Sätze</span>
                <span>{totalSets > 0 ? Math.round((loggedSets / totalSets) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${totalSets > 0 ? (loggedSets / totalSets) * 100 : 0}%` }} />
              </div>
            </div>

            {/* Navigation */}
            <div className="flex gap-2 px-4 py-2 overflow-x-auto flex-shrink-0 border-b border-border">
              {exerciseLogs.map((log, i) => {
                const done = log.sets.every(s => s.logged);
                const isAssEx = i < ASSESSMENT_EXERCISES_LOG.length;
                return (
                  <button key={i} onClick={() => setActiveExerciseIndex(i)}
                    className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      i === activeExerciseIndex ? 'bg-primary text-primary-foreground'
                      : done ? 'bg-primary/20 text-primary'
                      : isAssEx ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : 'bg-muted text-muted-foreground'
                    }`}>
                    {log.name.split(' ')[0]}{done && ' ✓'}
                  </button>
                );
              })}
            </div>

            {/* Aktive Übung */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentEx && (
                <>
                  <div>
                    {activeExerciseIndex < ASSESSMENT_EXERCISES_LOG.length && (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full mb-1 inline-block">
                        Assessment-Übung
                      </span>
                    )}
                    <h2 className="text-xl font-bold">{currentEx.name}</h2>
                    <p className="text-sm text-muted-foreground">{currentEx.setsTarget} Sätze · {currentEx.repsTarget}</p>
                  </div>

                  {/* Coaching Cues */}
                  {currentEx.coachingCues.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-700 mb-1.5">🎯 Coaching Cues</p>
                      <div className="flex flex-wrap gap-1.5">
                        {currentEx.coachingCues.map(cue => (
                          <span key={cue} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{cue}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mess-Hinweis */}
                  {currentEx.measurementHint && (
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
                      <Ruler className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <p className="text-xs text-blue-700 font-medium">{currentEx.measurementHint}</p>
                    </div>
                  )}

                  {/* Plan-Hinweis */}
                  {currentEx.notes && (
                    <div className="rounded-xl bg-muted/50 border border-border px-3 py-2">
                      <p className="text-xs text-muted-foreground">💡 {currentEx.notes}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {currentEx.sets.map((set, si) => (
                      <SetRow key={si} set={set} isActive={si === activeSetIndex}
                        targetReps={currentEx.repsTarget}
                        onLog={(w, r) => handleLogSet(activeExerciseIndex, si, w, r)} />
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    {activeExerciseIndex > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setActiveExerciseIndex(i => i - 1)} className="flex-1">← Zurück</Button>
                    )}
                    {activeExerciseIndex < exerciseLogs.length - 1 && (
                      <Button variant="outline" size="sm" onClick={() => setActiveExerciseIndex(i => i + 1)} className="flex-1">Nächste →</Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-card border-t border-border px-4 py-3 flex gap-2 flex-shrink-0">
        <Button variant="outline" onClick={handleInterimSave} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
          Zwischenspeichern
        </Button>
        <Button onClick={handleComplete} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
          Abschließen
        </Button>
      </div>
    </div>
  );
};

export default AssessmentGuide;
