/**
 * AssessmentGuide.tsx
 *
 * Coach-seitiges Assessment + integrierter Workout-Logger für gecoachte Sessions.
 *
 * Tab 1 – Assessment: Messwerte für 7 Übungen, Tiefenfragen, Stärken/Fokus
 * Tab 2 – Training:   Coach loggt Übungen für den Kunden (workout_log + set_logs)
 *
 * WICHTIG: coach_notes wird NUR in assessment_results gespeichert, NICHT in workout_logs.
 * workout_logs enthält nur: client_id, plan_workout_id, started_at, completed_at
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2, Save, CheckCircle, ChevronDown, ChevronUp,
  Target, Lightbulb, Dumbbell, X, ClipboardList, Timer, Ruler, Check,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Typen ─────────────────────────────────────────────────────────────────────

interface AssessmentGuideProps {
  workoutId: string;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onComplete: () => void;
}

interface AssessmentMeasurements {
  squat_score:           number;
  squat_notes:           string;
  hinge_score:           number;
  hinge_notes:           string;
  shoulder_left_cm:      string;
  shoulder_right_cm:     string;
  shoulder_notes:        string;
  pushup_reps:           string;
  pushup_notes:          string;
  plank_seconds:         string;
  plank_notes:           string;
  balance_left_seconds:  string;
  balance_right_seconds: string;
  balance_notes:         string;
  forward_fold_cm:       string;
  forward_fold_notes:    string;
}

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
  isAssessmentExercise: boolean;
  cues: string[];
  measurementHint: string;
  sets: SetEntry[];
}

// ── Assessment-Übungen (für den Workout-Logger-Tab) ───────────────────────────

const ASSESSMENT_EXERCISE_LIST: Omit<ExerciseLog, 'sets'>[] = [
  { exerciseId: null, name: 'Kniebeuge (Bodyweight)', setsTarget: 3, repsTarget: '8-10', isAssessmentExercise: true,
    cues: ['Knie nach außen', 'Brust hoch', 'Tiefe bewerten', 'Butt Wink'], measurementHint: 'Score im Assessment-Tab eintragen' },
  { exerciseId: null, name: 'Hip Hinge (leichtes RDL)', setsTarget: 3, repsTarget: '8-10', isAssessmentExercise: true,
    cues: ['Hüfte nach hinten', 'Rücken gerade', 'Hamstrings spüren'], measurementHint: 'Score im Assessment-Tab eintragen' },
  { exerciseId: null, name: 'Schulter-Mobilitätstest', setsTarget: 1, repsTarget: '3/Seite', isAssessmentExercise: true,
    cues: ['Arm hinter Kopf', 'Anderer Arm hinter Rücken', 'Abstand messen'], measurementHint: '→ cm links + rechts im Assessment-Tab eintragen' },
  { exerciseId: null, name: 'Push-up Test', setsTarget: 1, repsTarget: 'Max.', isAssessmentExercise: true,
    cues: ['Körper gerade', 'Volle ROM', 'Bis Technik bricht zählen'], measurementHint: '→ Anzahl sauberer Wdh. im Assessment-Tab eintragen' },
  { exerciseId: null, name: 'Plank (Unterarmstütz)', setsTarget: 1, repsTarget: 'Max. Zeit', isAssessmentExercise: true,
    cues: ['Becken neutral', 'Core aktivieren', 'Zeit stoppen'], measurementHint: '→ Sekunden im Assessment-Tab eintragen' },
  { exerciseId: null, name: 'Einbeiniger Stand', setsTarget: 1, repsTarget: 'Max. Zeit/Seite', isAssessmentExercise: true,
    cues: ['Augen gerade', 'Standbein leicht gebeugt', 'Beide Seiten vergleichen'], measurementHint: '→ Sekunden li. + re. im Assessment-Tab eintragen' },
  { exerciseId: null, name: 'Vorwärtsbeugen stehend', setsTarget: 1, repsTarget: '3 Versuche', isAssessmentExercise: true,
    cues: ['Beine gerade', 'Langsam absenken', 'Abstand messen'], measurementHint: '→ Abstand Fingerkuppen–Boden in cm im Assessment-Tab eintragen' },
];

const SCORE_LABELS = [
  { value: 1, label: 'Eingeschränkt',       color: 'bg-red-500' },
  { value: 2, label: 'Verbesserungswürdig', color: 'bg-orange-500' },
  { value: 3, label: 'Durchschnitt',        color: 'bg-yellow-500' },
  { value: 4, label: 'Gut',                 color: 'bg-lime-500' },
  { value: 5, label: 'Ausgezeichnet',       color: 'bg-green-500' },
];

const DEEP_QUESTIONS = [
  { id: 'motivation_detail', label: 'Motivation & Ziel-Detail',
    prompts: ['Stell dir vor, du hast dein Ziel erreicht – was ändert sich als erstes?', 'Gibt es ein konkretes Ereignis, auf das du hinarbeitest?'] },
  { id: 'barriers', label: 'Barrieren & Herausforderungen',
    prompts: ['Was hat dich bisher davon abgehalten?', 'Woran sind frühere Versuche gescheitert?'] },
  { id: 'lifestyle_factors', label: 'Lebensstil-Faktoren',
    prompts: ['Wie sieht ein typischer Tag aus?', 'Schlaf, Stress, Beruf?'] },
  { id: 'recovery_capacity', label: 'Regeneration',
    prompts: ['Wie fühlst du dich am Tag nach dem Training?', 'Schlafqualität?'] },
  { id: 'training_preferences', label: 'Trainings-Präferenzen',
    prompts: ['Welche Übungen magst du?', 'Was willst du auf keinen Fall?'] },
];

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const ScoreButtons: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="flex gap-1">
    {SCORE_LABELS.map(({ value: v, color, label }) => (
      <button key={v} onClick={() => onChange(v)} title={label}
        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${value === v ? `${color} text-white` : 'bg-muted text-muted-foreground'}`}>
        {v}
      </button>
    ))}
  </div>
);

const MeasurementInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; unit: string; hint?: string }> =
  ({ label, value, onChange, unit, hint }) => (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex items-center gap-2">
        <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
          onFocus={e => e.target.select()} placeholder="—"
          className="w-28 text-center text-xl font-bold rounded-lg py-2 px-3 border border-border focus:outline-none focus:border-primary bg-background" />
        <span className="text-sm text-muted-foreground font-medium">{unit}</span>
      </div>
    </div>
  );

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

const AssessmentGuide: React.FC<AssessmentGuideProps> = ({ workoutId, clientId, clientName, onClose, onComplete }) => {
  const [activeTab, setActiveTab] = useState<'assessment' | 'training'>('assessment');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('measurements');
  const [existingAssessmentId, setExistingAssessmentId] = useState<string | null>(null);

  // ── Assessment-State ───────────────────────────────────────────────────────
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

  // ── Workout-Logger-State ───────────────────────────────────────────────────
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [trainingStarted, setTrainingStarted] = useState(false);
  const startTimeRef = useRef<Date>(new Date());

  // ── Laden ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // Bestehendes Assessment laden
      const { data: existing } = await supabase
        .from('assessment_results').select('*').eq('workout_id', workoutId).maybeSingle();
      if (existing) {
        setExistingAssessmentId(existing.id);
        if (existing.measurements) setMeasurements({ ...measurements, ...(existing.measurements as AssessmentMeasurements) });
        if (existing.deep_questions) setDeepQuestions(existing.deep_questions as typeof deepQuestions);
        setCoachNotes(existing.coach_notes || '');
        setStrengths(existing.identified_strengths || []);
        setFocusAreas(existing.focus_areas || []);
        setContraindications(existing.contraindications || []);
      }

      // Bestehendes workout_log prüfen
      const { data: existingLog } = await supabase.from('workout_logs')
        .select('id').eq('plan_workout_id', workoutId).eq('client_id', clientId).is('completed_at', null).maybeSingle();
      if (existingLog) { setWorkoutLogId(existingLog.id); setTrainingStarted(true); }

      // Plan-Übungen laden
      const { data: planExercises } = await supabase.from('plan_exercises')
        .select('id, name, sets, reps_target, notes, exercise_id')
        .eq('workout_id', workoutId).order('order_in_workout');

      const makeSet = (num: number, reps: string): SetEntry => ({ setNumber: num, weight: '', reps, logged: false });

      const assessmentLogs: ExerciseLog[] = ASSESSMENT_EXERCISE_LIST.map(ex => ({
        ...ex, sets: Array.from({ length: ex.setsTarget }, (_, i) => makeSet(i + 1, ex.repsTarget)),
      }));

      const planLogs: ExerciseLog[] = (planExercises || []).map(ex => ({
        exerciseId: ex.exercise_id || null, name: ex.name, setsTarget: ex.sets || 3,
        repsTarget: ex.reps_target || '10', isAssessmentExercise: false, cues: [], measurementHint: '',
        sets: Array.from({ length: ex.sets || 3 }, (_, i) => makeSet(i + 1, ex.reps_target || '10')),
      }));

      setExerciseLogs([...assessmentLogs, ...planLogs]);
      setLoading(false);
    };
    load();
  }, [workoutId, clientId]);

  // ── Assessment speichern ───────────────────────────────────────────────────
  const saveAssessment = async (): Promise<boolean> => {
    const data = {
      workout_id: workoutId,
      client_id: clientId,
      measurements,                       // → assessment_results.measurements (jsonb)
      movement_quality: {                 // rückwärtskompatibel
        squat:    { score: measurements.squat_score,  cues: [], notes: measurements.squat_notes },
        hinge:    { score: measurements.hinge_score,  cues: [], notes: measurements.hinge_notes },
        push:     { score: 3, cues: [], notes: measurements.pushup_notes },
        pull:     { score: 3, cues: [], notes: '' },
        core:     { score: 3, cues: [], notes: measurements.plank_notes },
        mobility: { score: 3, cues: [], notes: measurements.shoulder_notes },
      },
      deep_questions: deepQuestions,
      coach_notes: coachNotes,            // → assessment_results.coach_notes (text)
      identified_strengths: strengths,
      focus_areas: focusAreas,
      contraindications,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existingAssessmentId) {
      ({ error } = await supabase.from('assessment_results').update(data).eq('id', existingAssessmentId));
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('assessment_results').insert(data).select().single();
      error = insertError;
      if (inserted) setExistingAssessmentId(inserted.id);
    }
    return !error;
  };

  const handleInterimSave = async () => {
    setSaving(true);
    const ok = await saveAssessment();
    await supabase.from('plan_workouts').update({ is_assessment: true, status: 'in_progress' }).eq('id', workoutId);
    setSaving(false);
    toast[ok ? 'success' : 'error'](ok ? 'Zwischenstand gespeichert' : 'Fehler beim Speichern');
  };

  const handleComplete = async () => {
    setSaving(true);
    const ok = await saveAssessment();
    if (!ok) { toast.error('Fehler beim Speichern'); setSaving(false); return; }

    // workout_log abschließen falls vorhanden
    if (workoutLogId) {
      await supabase.from('workout_logs').update({ completed_at: new Date().toISOString() }).eq('id', workoutLogId);
    }

    // Assessment als abgeschlossen markieren
    await supabase.from('plan_workouts')
      .update({ is_assessment: true, status: 'completed' })
      .eq('id', workoutId);

    // clients.assessment_completed_at setzen
    await supabase.from('clients').update({ assessment_completed_at: new Date().toISOString() }).eq('id', clientId);

    // next_plan_workout_id vorrücken
    try {
      const { data: cur } = await supabase.from('plan_workouts').select('plan_id').eq('id', workoutId).single();
      if (cur) {
        const { data: all } = await supabase.from('plan_workouts')
          .select('id, session_order').eq('plan_id', cur.plan_id)
          .order('session_order', { ascending: true, nullsFirst: false });
        if (all && all.length > 1) {
          const idx = all.findIndex(w => w.id === workoutId);
          const next = idx >= 0 && idx + 1 < all.length ? all[idx + 1] : null;
          if (next) await supabase.from('training_plans').update({ next_plan_workout_id: next.id }).eq('id', cur.plan_id);
        }
      }
    } catch { /* optional */ }

    setSaving(false);
    toast.success('Assessment abgeschlossen! 🎉');
    onComplete();
  };

  // ── Training starten (Coach-Logger) ───────────────────────────────────────
  const handleStartTraining = async () => {
    if (workoutLogId) { setTrainingStarted(true); return; }
    // workout_log anlegen – NUR die erlaubten Spalten
    const { data: newLog } = await supabase.from('workout_logs').insert({
      client_id: clientId,
      plan_workout_id: workoutId,
      started_at: startTimeRef.current.toISOString(),
    }).select().single();
    if (newLog) { setWorkoutLogId(newLog.id); setTrainingStarted(true); }
  };

  // ── Satz loggen ────────────────────────────────────────────────────────────
  const handleLogSet = async (exerciseIndex: number, setIndex: number, weight: string, reps: string) => {
    if (!reps || !workoutLogId) return;
    const ex = exerciseLogs[exerciseIndex];

    await supabase.from('set_logs').insert({
      workout_log_id: workoutLogId,
      exercise_name: ex.name,
      exercise_id: ex.exerciseId || null,
      set_number: setIndex + 1,
      reps_done: Number(reps) || 0,
      weight_kg: Number(weight) || 0,
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

    const allLogged = exerciseLogs[exerciseIndex].sets.map((s, i) => i === setIndex || s.logged).every(Boolean);
    if (allLogged && exerciseIndex < exerciseLogs.length - 1) {
      setTimeout(() => setActiveExerciseIndex(exerciseIndex + 1), 300);
    }
  };

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────
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

  if (loading) return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const currentEx = exerciseLogs[activeExerciseIndex];
  const activeSetIndex = currentEx?.sets.findIndex(s => !s.logged) ?? -1;
  const totalSets = exerciseLogs.reduce((n, l) => n + l.sets.length, 0);
  const loggedSets = exerciseLogs.reduce((n, l) => n + l.sets.filter(s => s.logged).length, 0);

  // ── SetRow ─────────────────────────────────────────────────────────────────
  const SetRow: React.FC<{ set: SetEntry; isActive: boolean; onLog: (w: string, r: string) => void }> = ({ set, isActive, onLog }) => {
    const [w, setW] = useState(set.weight);
    const [r, setR] = useState(set.reps);

    if (set.logged) return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
        <Check className="w-4 h-4 text-primary" />
        <span className="text-muted-foreground">Satz {set.setNumber}</span>
        <span className="ml-auto font-semibold">{set.weight ? `${set.weight} kg × ${set.reps}` : set.reps}</span>
      </div>
    );

    if (!isActive) return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/40 text-sm opacity-50">
        <span className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center text-xs">{set.setNumber}</span>
        <span className="text-muted-foreground">Satz {set.setNumber}</span>
      </div>
    );

    return (
      <div className="p-3 rounded-lg border-2 border-primary bg-card space-y-2">
        <p className="text-xs text-muted-foreground font-medium">Satz {set.setNumber}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Gewicht (kg)</p>
            <input type="number" inputMode="decimal" value={w} onChange={e => setW(e.target.value)}
              onFocus={e => e.target.select()} placeholder="0"
              className="w-full text-center text-xl font-bold rounded-lg py-2 border border-border focus:outline-none focus:border-primary bg-background" />
            <div className="flex gap-1 mt-1">
              {['-2.5','+2.5','+5'].map(v => (
                <button key={v} onClick={() => setW(prev => Math.max(0, parseFloat(prev||'0') + parseFloat(v)).toString())}
                  className="flex-1 text-xs py-1 rounded bg-muted hover:bg-muted/80">{v}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Wdh. / Sek.</p>
            <input type="text" value={r} onChange={e => setR(e.target.value)}
              onFocus={e => e.target.select()} placeholder={set.reps}
              className="w-full text-center text-xl font-bold rounded-lg py-2 border border-border focus:outline-none focus:border-primary bg-background" />
            <div className="flex gap-1 mt-1">
              {['-1','+1','+2'].map(v => (
                <button key={v} onClick={() => setR(prev => Math.max(0, parseInt(prev||'0') + parseInt(v)).toString())}
                  className="flex-1 text-xs py-1 rounded bg-muted hover:bg-muted/80">{v}</button>
              ))}
            </div>
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
        <button onClick={() => setActiveTab('assessment')}
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'assessment' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}>
          <ClipboardList className="w-4 h-4" />Assessment
        </button>
        <button onClick={() => setActiveTab('training')}
          className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'training' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}>
          <Dumbbell className="w-4 h-4" />Training
          {loggedSets > 0 && <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5">{loggedSets}/{totalSets}</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ══ ASSESSMENT TAB ══ */}
        {activeTab === 'assessment' && (
          <div className="p-4 space-y-4">

            {/* Messwerte */}
            <Card>
              <CardHeader className="cursor-pointer py-3" onClick={() => setExpandedSection(s => s === 'measurements' ? null : 'measurements')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Ruler className="w-5 h-5 text-primary" />Messwerte</CardTitle>
                  {expandedSection === 'measurements' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {expandedSection === 'measurements' && (
                <CardContent className="space-y-6">

                  {/* Kniebeuge */}
                  <div className="space-y-2 pb-4 border-b border-border">
                    <p className="font-semibold">🦵 Kniebeuge (Bodyweight)</p>
                    <ScoreButtons value={measurements.squat_score} onChange={v => setM('squat_score', v)} />
                    <p className="text-xs text-center text-muted-foreground">{SCORE_LABELS.find(s => s.value === measurements.squat_score)?.label}</p>
                    <Textarea placeholder="Beobachtungen: Tiefe, Knie-Tracking, Butt Wink..." rows={2}
                      value={measurements.squat_notes} onChange={e => setM('squat_notes', e.target.value)} />
                  </div>

                  {/* Hip Hinge */}
                  <div className="space-y-2 pb-4 border-b border-border">
                    <p className="font-semibold">🏋️ Hip Hinge</p>
                    <ScoreButtons value={measurements.hinge_score} onChange={v => setM('hinge_score', v)} />
                    <p className="text-xs text-center text-muted-foreground">{SCORE_LABELS.find(s => s.value === measurements.hinge_score)?.label}</p>
                    <Textarea placeholder="Beobachtungen: Hinge-Pattern, Rückenposition..." rows={2}
                      value={measurements.hinge_notes} onChange={e => setM('hinge_notes', e.target.value)} />
                  </div>

                  {/* Schulter-Mobilität */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold">🙌 Schulter-Mobilitätstest</p>
                    <p className="text-xs text-muted-foreground">Arm hinter Kopf + anderer Arm hinter Rücken → Abstand messen.<br/>
                      <span className="text-green-600">Positiv (+)</span> = Überlappung &nbsp;|&nbsp;
                      <span className="text-red-600">Negativ (−)</span> = Lücke
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <MeasurementInput label="Links" value={measurements.shoulder_left_cm} onChange={v => setM('shoulder_left_cm', v)} unit="cm" />
                      <MeasurementInput label="Rechts" value={measurements.shoulder_right_cm} onChange={v => setM('shoulder_right_cm', v)} unit="cm" />
                    </div>
                    <Textarea placeholder="Asymmetrien, Einschränkungen..." rows={2}
                      value={measurements.shoulder_notes} onChange={e => setM('shoulder_notes', e.target.value)} />
                  </div>

                  {/* Push-up */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold">💪 Push-up Test</p>
                    <MeasurementInput label="Wiederholungen" value={measurements.pushup_reps} onChange={v => setM('pushup_reps', v)} unit="Wdh."
                      hint="Saubere Wdh. bis Technik bricht" />
                    <Textarea placeholder="Schulterblatt-Kontrolle, Core-Stabilität..." rows={2}
                      value={measurements.pushup_notes} onChange={e => setM('pushup_notes', e.target.value)} />
                  </div>

                  {/* Plank */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold flex items-center gap-1"><Timer className="w-4 h-4" />Plank</p>
                    <MeasurementInput label="Haltezeit" value={measurements.plank_seconds} onChange={v => setM('plank_seconds', v)} unit="Sek." hint="Bis Hüfte sinkt" />
                    <Textarea placeholder="Beckenposition, Atemkontrolle..." rows={2}
                      value={measurements.plank_notes} onChange={e => setM('plank_notes', e.target.value)} />
                  </div>

                  {/* Einbeiniger Stand */}
                  <div className="space-y-3 pb-4 border-b border-border">
                    <p className="font-semibold">🦶 Einbeiniger Stand</p>
                    <div className="grid grid-cols-2 gap-4">
                      <MeasurementInput label="Links" value={measurements.balance_left_seconds} onChange={v => setM('balance_left_seconds', v)} unit="Sek." />
                      <MeasurementInput label="Rechts" value={measurements.balance_right_seconds} onChange={v => setM('balance_right_seconds', v)} unit="Sek." />
                    </div>
                    <Textarea placeholder="Asymmetrien, Kompensationsmuster..." rows={2}
                      value={measurements.balance_notes} onChange={e => setM('balance_notes', e.target.value)} />
                  </div>

                  {/* Vorwärtsbeugen */}
                  <div className="space-y-3">
                    <p className="font-semibold">🤸 Vorwärtsbeugen stehend</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-green-600">Positiv (+)</span> = Finger unter Boden &nbsp;|&nbsp;
                      <span className="text-red-600">Negativ (−)</span> = Finger über Boden
                    </p>
                    <MeasurementInput label="Abstand Fingerkuppen–Boden" value={measurements.forward_fold_cm} onChange={v => setM('forward_fold_cm', v)} unit="cm" />
                    <Textarea placeholder="Hamstring-Spannung, Rückenform..." rows={2}
                      value={measurements.forward_fold_notes} onChange={e => setM('forward_fold_notes', e.target.value)} />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Tiefenfragen */}
            <Card>
              <CardHeader className="cursor-pointer py-3" onClick={() => setExpandedSection(s => s === 'questions' ? null : 'questions')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="w-5 h-5 text-primary" />Tiefenfragen</CardTitle>
                  {expandedSection === 'questions' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {expandedSection === 'questions' && (
                <CardContent className="space-y-4">
                  {DEEP_QUESTIONS.map(q => (
                    <div key={q.id} className="space-y-2">
                      <label className="text-sm font-medium">{q.label}</label>
                      <div className="text-xs text-muted-foreground space-y-0.5">{q.prompts.map((p, i) => <p key={i}>💬 „{p}"</p>)}</div>
                      <Textarea rows={3} value={deepQuestions[q.id as keyof typeof deepQuestions]}
                        onChange={e => setDeepQuestions(prev => ({ ...prev, [q.id]: e.target.value }))} />
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Stärken, Fokus, Kontraindikationen */}
            <Card>
              <CardHeader className="cursor-pointer py-3" onClick={() => setExpandedSection(s => s === 'strengths' ? null : 'strengths')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Target className="w-5 h-5 text-primary" />Stärken, Fokus & Kontra</CardTitle>
                  {expandedSection === 'strengths' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {expandedSection === 'strengths' && (
                <CardContent className="space-y-4">
                  {[
                    { type: 'strength' as const, label: '✅ Stärken', color: 'green', items: strengths, val: newStrength, setVal: setNewStrength },
                    { type: 'focus' as const, label: '🎯 Fokuspunkte', color: 'orange', items: focusAreas, val: newFocus, setVal: setNewFocus },
                    { type: 'contra' as const, label: '⚠️ Kontraindikationen', color: 'red', items: contraindications, val: newContra, setVal: setNewContra },
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
                        <Input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem(type)}
                          className="text-sm" placeholder="Hinzufügen..." />
                        <Button size="sm" onClick={() => addItem(type)}>+</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Notizen */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">📝 Allgemeine Notizen</CardTitle></CardHeader>
              <CardContent>
                <Textarea placeholder="Beobachtungen, Eindrücke, nächste Schritte..." value={coachNotes}
                  onChange={e => setCoachNotes(e.target.value)} rows={4} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ TRAINING TAB ══ */}
        {activeTab === 'training' && (
          <div className="flex flex-col h-full">
            {!trainingStarted ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                <Dumbbell className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-center text-muted-foreground text-sm">Hier loggst du das Training für den Kunden.</p>
                <p className="text-center text-xs text-muted-foreground">Du kannst das Assessment-Tab parallel nutzen, um Messwerte einzutragen.</p>
                <Button onClick={handleStartTraining} className="gap-2 mt-2">
                  <Dumbbell className="w-4 h-4" />Training starten
                </Button>
              </div>
            ) : (
              <>
                {/* Fortschrittsbalken */}
                <div className="px-4 py-2 bg-card border-b border-border">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{loggedSets} / {totalSets} Sätze geloggt</span>
                    <span>{totalSets > 0 ? Math.round((loggedSets / totalSets) * 100) : 0}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totalSets > 0 ? (loggedSets / totalSets) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Übungs-Navigation */}
                <div className="flex gap-2 px-4 py-2 overflow-x-auto flex-shrink-0 border-b border-border">
                  {exerciseLogs.map((log, i) => {
                    const done = log.sets.every(s => s.logged);
                    return (
                      <button key={i} onClick={() => setActiveExerciseIndex(i)}
                        className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          i === activeExerciseIndex ? 'bg-primary text-primary-foreground'
                          : done ? 'bg-primary/20 text-primary'
                          : log.isAssessmentExercise ? 'bg-amber-100 text-amber-700 border border-amber-200'
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
                        {currentEx.isAssessmentExercise && (
                          <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full mb-1 inline-block">
                            Assessment-Übung
                          </span>
                        )}
                        <h2 className="text-xl font-bold">{currentEx.name}</h2>
                        <p className="text-sm text-muted-foreground">{currentEx.setsTarget} Sätze · {currentEx.repsTarget}</p>
                      </div>

                      {currentEx.cues.length > 0 && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                          <p className="text-xs font-semibold text-amber-700 mb-1.5">🎯 Coaching Cues</p>
                          <div className="flex flex-wrap gap-1.5">
                            {currentEx.cues.map(cue => (
                              <span key={cue} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{cue}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentEx.measurementHint && (
                        <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
                          <Ruler className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <p className="text-xs text-blue-700 font-medium">{currentEx.measurementHint}</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        {currentEx.sets.map((set, si) => (
                          <SetRow key={si} set={set} isActive={si === activeSetIndex}
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
              </>
            )}
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
