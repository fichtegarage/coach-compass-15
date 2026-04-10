/**
 * AssessmentGuide.tsx
 *
 * Coach-seitiges Assessment + integrierter Workout-Logger.
 *
 * Tab 1 – Assessment: Bewegungsqualität, Tiefenfragen, Stärken/Fokus/Kontraindikationen
 * Tab 2 – Workout:   Coach loggt Übungen auf behalf des Kunden.
 *                    Assessment-Übungen (6 Bewegungsmuster) erscheinen immer als Präfix.
 *                    Am Ende: workout_log + set_logs werden mit client_id gespeichert
 *                    → Kunde sieht das Training in seiner History wie sein eigenes.
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2, Save, CheckCircle, ChevronDown, ChevronUp,
  Target, AlertTriangle, Lightbulb, Dumbbell, X, ClipboardList, Trophy
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

interface MovementScore {
  score: number;
  cues: string[];
  notes: string;
}

interface MovementAssessment {
  squat: MovementScore;
  hinge: MovementScore;
  push: MovementScore;
  pull: MovementScore;
  core: MovementScore;
  mobility: MovementScore;
}

interface DeepQuestions {
  motivation_detail: string;
  barriers: string;
  lifestyle_factors: string;
  recovery_capacity: string;
  training_preferences: string;
}

// Für den Coach-Logger
interface SetEntry {
  setNumber: number;
  weight: string;
  reps: string;
  logged: boolean;
  isPR: boolean;
}

interface ExerciseLog {
  exerciseId: string | null; // null für Assessment-Übungen
  name: string;
  setsTarget: number;
  repsTarget: string;
  sets: SetEntry[];
  patternId: string | null; // falls Assessment-Übung
  coachingCues: string[];
  notes: string;
}

// ── Konstanten: 6 Assessment-Übungen ──────────────────────────────────────────

const ASSESSMENT_EXERCISES: Omit<ExerciseLog, 'sets'>[] = [
  {
    exerciseId: null,
    name: 'Kniebeuge (Bodyweight)',
    setsTarget: 3,
    repsTarget: '8-10',
    patternId: 'squat',
    coachingCues: ['Knie nach außen', 'Brust hoch', 'Gewicht auf Fersen', 'Tiefe bewerten'],
    notes: 'Bewegungsanalyse: Tiefe, Knie-Tracking, Rückenposition, Butt Wink',
  },
  {
    exerciseId: null,
    name: 'Rumänisches Kreuzheben (leicht)',
    setsTarget: 3,
    repsTarget: '8-10',
    patternId: 'hinge',
    coachingCues: ['Hüfte nach hinten', 'Rücken gerade', 'Hamstrings spüren', 'Stange nah am Körper'],
    notes: 'Bewegungsanalyse: Hinge-Pattern, Hüftmobilität, Rückenposition',
  },
  {
    exerciseId: null,
    name: 'Liegestütz',
    setsTarget: 3,
    repsTarget: '8-10',
    patternId: 'push',
    coachingCues: ['Schulterblätter zusammen', 'Core anspannen', 'Volle ROM', 'Ellbogen-Winkel'],
    notes: 'Bewegungsanalyse: Push-Muster, Schulterblatt-Kontrolle, Core-Stabilität',
  },
  {
    exerciseId: null,
    name: 'TRX Rudern',
    setsTarget: 3,
    repsTarget: '8-10',
    patternId: 'pull',
    coachingCues: ['Schulterblätter initiieren', 'Ellbogen zum Körper', 'Volle Streckung', 'Lat-Aktivierung'],
    notes: 'Bewegungsanalyse: Zugmuster, Schulterblatt-Retraktion, Bizeps-Dominanz',
  },
  {
    exerciseId: null,
    name: 'Unterarmstütz (Plank)',
    setsTarget: 3,
    repsTarget: '30-60s',
    patternId: 'core',
    coachingCues: ['Becken neutral', 'Core aktivieren', 'Atmung gleichmäßig', 'Kein Hohlkreuz'],
    notes: 'Bewegungsanalyse: Anti-Extension, Rumpfstabilität, Beckenposition',
  },
  {
    exerciseId: null,
    name: 'Weltbeste Dehnung',
    setsTarget: 2,
    repsTarget: '5/Seite',
    patternId: 'mobility',
    coachingCues: ['Hüfte tief', 'Schulter öffnen', 'Brustwirbelsäule rotieren', 'Beide Seiten vergleichen'],
    notes: 'Bewegungsanalyse: Hüftmobilität, Schulter-ROM, thorakale Rotation',
  },
];

// ── Bewegungsmuster-Config ─────────────────────────────────────────────────────

const MOVEMENT_PATTERNS = [
  { id: 'squat',    name: 'Squat',    icon: '🦵', cues: ['Knie nach außen drücken','Brust hoch','Gewicht auf Fersen','Tiefe verbessern','Core-Stabilität','Butt Wink korrigieren'] },
  { id: 'hinge',    name: 'Hinge',    icon: '🏋️', cues: ['Hüfte nach hinten schieben','Rücken gerade halten','Hamstrings aktivieren','Neutraler Nacken','Stange nah am Körper'] },
  { id: 'push',     name: 'Push',     icon: '💪', cues: ['Schulterblätter zusammen','Ellbogen-Winkel korrigieren','Core anspannen','Volle Range of Motion','Handgelenk-Position'] },
  { id: 'pull',     name: 'Pull',     icon: '🔙', cues: ['Schulterblätter initiieren','Ellbogen zum Körper','Bizeps-Dominanz vermeiden','Volle Streckung','Lat-Aktivierung'] },
  { id: 'core',     name: 'Core',     icon: '🎯', cues: ['Anti-Extension verbessern','Anti-Rotation stärken','Beckenboden aktivieren','Atmung koordinieren','Hüftstabilität'] },
  { id: 'mobility', name: 'Mobilität',icon: '🧘', cues: ['Hüftbeuger dehnen','Schulter-Mobilität','Sprunggelenk-Mobilität','Thorakale Rotation','Hüft-Innenrotation'] },
];

const SCORE_LABELS = [
  { value: 1, label: 'Eingeschränkt',      color: 'bg-red-500' },
  { value: 2, label: 'Verbesserungswürdig',color: 'bg-orange-500' },
  { value: 3, label: 'Durchschnitt',       color: 'bg-yellow-500' },
  { value: 4, label: 'Gut',                color: 'bg-lime-500' },
  { value: 5, label: 'Ausgezeichnet',      color: 'bg-green-500' },
];

const DEEP_QUESTIONS = [
  { id: 'motivation_detail', label: 'Motivation & Ziel-Detail',   placeholder: 'Was genau will der Kunde erreichen? Warum jetzt?', prompts: ['Stell dir vor, du hast dein Ziel erreicht. Was ändert sich als erstes?','Wer würde die Veränderung als erstes bemerken?','Gibt es ein konkretes Ereignis, auf das du hinarbeitest?'] },
  { id: 'barriers',          label: 'Barrieren & Herausforderungen', placeholder: 'Was hat in der Vergangenheit nicht funktioniert?', prompts: ['Was hat dich bisher davon abgehalten?','Woran sind frühere Versuche gescheitert?','Was ist deine größte Sorge?'] },
  { id: 'lifestyle_factors', label: 'Lebensstil-Faktoren',         placeholder: 'Schlaf, Stress, Beruf, Familie, Zeitfenster...', prompts: ['Wie sieht ein typischer Tag aus?','Wie viel Schlaf bekommst du?','Wie würdest du dein Stresslevel einschätzen?'] },
  { id: 'recovery_capacity', label: 'Regenerationsfähigkeit',      placeholder: 'Wie schnell erholt sich der Kunde?', prompts: ['Wie fühlst du dich am Tag nach dem Training?','Hast du Schlafprobleme?','Wie gehst du mit Stress um?'] },
  { id: 'training_preferences', label: 'Trainings-Präferenzen',   placeholder: 'Lieblingsübungen, Abneigungen, Zeit, Equipment...', prompts: ['Welche Übungen machst du gerne?','Was möchtest du auf keinen Fall?','Wie viel Zeit pro Woche realistisch?'] },
];

// ── Component ──────────────────────────────────────────────────────────────────

const AssessmentGuide: React.FC<AssessmentGuideProps> = ({
  workoutId, clientId, clientName, onClose, onComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'assessment' | 'workout'>('assessment');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('movement');
  const [existingAssessmentId, setExistingAssessmentId] = useState<string | null>(null);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const startTimeRef = useRef<Date>(new Date());

  // ── Assessment State ───────────────────────────────────────────────────────
  const [movementScores, setMovementScores] = useState<MovementAssessment>({
    squat:    { score: 3, cues: [], notes: '' },
    hinge:    { score: 3, cues: [], notes: '' },
    push:     { score: 3, cues: [], notes: '' },
    pull:     { score: 3, cues: [], notes: '' },
    core:     { score: 3, cues: [], notes: '' },
    mobility: { score: 3, cues: [], notes: '' },
  });
  const [deepQuestions, setDeepQuestions] = useState({ motivation_detail: '', barriers: '', lifestyle_factors: '', recovery_capacity: '', training_preferences: '' });
  const [coachNotes, setCoachNotes] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [newStrength, setNewStrength] = useState('');
  const [newFocus, setNewFocus] = useState('');
  const [newContra, setNewContra] = useState('');

  // ── Workout Logger State ───────────────────────────────────────────────────
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // Bestehendes Assessment laden
      const { data: existing } = await supabase
        .from('assessment_results')
        .select('*')
        .eq('workout_id', workoutId)
        .maybeSingle();

      if (existing) {
        setExistingAssessmentId(existing.id);
        if (existing.movement_quality) setMovementScores(existing.movement_quality as MovementAssessment);
        if (existing.deep_questions)   setDeepQuestions(existing.deep_questions as any);
        setCoachNotes(existing.coach_notes || '');
        setStrengths(existing.identified_strengths || []);
        setFocusAreas(existing.focus_areas || []);
        setContraindications(existing.contraindications || []);
      }

      // Bestehenden workout_log für dieses Workout laden
      const { data: existingLog } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('plan_workout_id', workoutId)
        .eq('client_id', clientId)
        .is('completed_at', null)
        .maybeSingle();
      if (existingLog) setWorkoutLogId(existingLog.id);

      // Plan-Übungen laden
      const { data: planExercises } = await supabase
        .from('plan_exercises')
        .select('id, name, sets, reps_target, rest_seconds, notes, exercise_id')
        .eq('workout_id', workoutId)
        .order('order_in_workout');

      // Assessment-Übungen + Plan-Übungen zusammenführen
      const assessmentLogs: ExerciseLog[] = ASSESSMENT_EXERCISES.map(ex => ({
        ...ex,
        sets: Array.from({ length: ex.setsTarget }, (_, i) => ({
          setNumber: i + 1, weight: '', reps: ex.repsTarget, logged: false, isPR: false,
        })),
      }));

      const planLogs: ExerciseLog[] = (planExercises || []).map(ex => ({
        exerciseId: ex.exercise_id || null,
        name: ex.name,
        setsTarget: ex.sets || 3,
        repsTarget: ex.reps_target || '10',
        patternId: null,
        coachingCues: [],
        notes: ex.notes || '',
        sets: Array.from({ length: ex.sets || 3 }, (_, i) => ({
          setNumber: i + 1, weight: '', reps: ex.reps_target || '10', logged: false, isPR: false,
        })),
      }));

      setExerciseLogs([...assessmentLogs, ...planLogs]);
      setLoading(false);
    };
    load();
  }, [workoutId, clientId]);

  // ── Assessment Handlers ────────────────────────────────────────────────────

  const updateMovementScore = (pattern: string, field: keyof MovementScore, value: any) => {
    setMovementScores(prev => ({
      ...prev,
      [pattern]: { ...prev[pattern as keyof MovementAssessment], [field]: value },
    }));
  };

  const toggleCue = (pattern: string, cue: string) => {
    setMovementScores(prev => {
      const current = prev[pattern as keyof MovementAssessment];
      const newCues = current.cues.includes(cue)
        ? current.cues.filter(c => c !== cue)
        : [...current.cues, cue];
      return { ...prev, [pattern]: { ...current, cues: newCues } };
    });
  };

  const addItem = (type: 'strength' | 'focus' | 'contra') => {
    if (type === 'strength' && newStrength.trim()) { setStrengths(p => [...p, newStrength.trim()]); setNewStrength(''); }
    if (type === 'focus'    && newFocus.trim())    { setFocusAreas(p => [...p, newFocus.trim()]);   setNewFocus(''); }
    if (type === 'contra'   && newContra.trim())   { setContraindications(p => [...p, newContra.trim()]); setNewContra(''); }
  };

  const removeItem = (type: 'strength' | 'focus' | 'contra', i: number) => {
    if (type === 'strength') setStrengths(p => p.filter((_, j) => j !== i));
    if (type === 'focus')    setFocusAreas(p => p.filter((_, j) => j !== i));
    if (type === 'contra')   setContraindications(p => p.filter((_, j) => j !== i));
  };

  // ── Workout Logger Handlers ────────────────────────────────────────────────

  const handleLogSet = async (exerciseIndex: number, setIndex: number, weight: string, reps: string) => {
    if (!weight || !reps) return;

    // workout_log anlegen falls noch nicht vorhanden
    let logId = workoutLogId;
    if (!logId) {
      const { data: newLog } = await supabase
        .from('workout_logs')
        .insert({
          client_id: clientId,
          plan_workout_id: workoutId,
          started_at: startTimeRef.current.toISOString(),
        })
        .select()
        .single();
      if (newLog) { logId = newLog.id; setWorkoutLogId(newLog.id); }
    }

    if (!logId) return;

    const ex = exerciseLogs[exerciseIndex];

    // set_log speichern
    await supabase.from('set_logs').insert({
      workout_log_id: logId,
      exercise_name: ex.name,
      exercise_id: ex.exerciseId || null,
      set_number: setIndex + 1,
      reps_done: parseInt(reps) || 0,
      weight_kg: parseFloat(weight) || 0,
      logged_at: new Date().toISOString(),
    });

    // Lokalen State updaten
    setExerciseLogs(prev => {
      const next = [...prev];
      const sets = [...next[exerciseIndex].sets];
      sets[setIndex] = { ...sets[setIndex], weight, reps, logged: true };
      // Nächsten Satz vorausfüllen
      if (setIndex + 1 < sets.length && !sets[setIndex + 1].logged) {
        sets[setIndex + 1] = { ...sets[setIndex + 1], weight, reps };
      }
      next[exerciseIndex] = { ...next[exerciseIndex], sets };
      return next;
    });

    // Wenn alle Sätze dieser Übung fertig → zur nächsten
    const updatedSets = exerciseLogs[exerciseIndex].sets.map((s, i) =>
      i === setIndex ? { ...s, logged: true } : s
    );
    const allLogged = updatedSets.every(s => s.logged);
    if (allLogged && exerciseIndex < exerciseLogs.length - 1) {
      setTimeout(() => setActiveExerciseIndex(exerciseIndex + 1), 400);
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveAssessment = async () => {
    const assessmentData = {
      workout_id: workoutId,
      client_id: clientId,
      movement_quality: movementScores,
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

    // workout_log abschließen
    if (workoutLogId) {
      await supabase
        .from('workout_logs')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', workoutLogId);
    }

    // workout + assessment als abgeschlossen markieren
    await supabase
      .from('plan_workouts')
      .update({ is_assessment: true, status: 'completed' })
      .eq('id', workoutId);

    // assessments-Tabelle updaten (für ClientPlanView)
    await supabase.from('assessments').upsert({
      client_id: clientId,
      squat_score:    movementScores.squat.score,
      hinge_score:    movementScores.hinge.score,
      push_score:     movementScores.push.score,
      pull_score:     movementScores.pull.score,
      stability_score: movementScores.core.score,
      focus_points:   focusAreas.join(', '),
      strengths:      strengths.join(', '),
    }, { onConflict: 'client_id' }).catch(() => {});

    setSaving(false);
    toast.success('Assessment + Workout abgeschlossen!');
    onComplete();
  };

  // ── Workout-Logger: SetRow ─────────────────────────────────────────────────

  const SetRow: React.FC<{
    set: SetEntry;
    isActive: boolean;
    targetReps: string;
    onLog: (weight: string, reps: string) => void;
  }> = ({ set, isActive, targetReps, onLog }) => {
    const [w, setW] = useState(set.weight);
    const [r, setR] = useState(set.reps || targetReps);

    if (set.logged) {
      return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
          <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-3.5 h-3.5 text-white" />
          </span>
          <span className="text-muted-foreground">Satz {set.setNumber}</span>
          <span className="ml-auto font-semibold tabular-nums">
            {set.weight ? `${set.weight} kg × ${set.reps}` : `${set.reps}`}
          </span>
        </div>
      );
    }

    if (!isActive) {
      return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/40 text-sm opacity-50">
          <span className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
            {set.setNumber}
          </span>
          <span className="text-muted-foreground">Satz {set.setNumber}</span>
        </div>
      );
    }

    return (
      <div className="p-3 rounded-lg border-2 border-primary bg-card space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Satz {set.setNumber}</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Gewicht (kg)</p>
            <input
              type="number" inputMode="decimal" value={w}
              onChange={e => setW(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="0"
              className="w-full text-center text-xl font-bold rounded-lg py-2 border border-border focus:outline-none focus:border-primary bg-background"
            />
            <div className="flex gap-1 mt-1">
              {['-2.5', '+2.5', '+5'].map(v => (
                <button key={v} onClick={() => setW(prev => Math.max(0, parseFloat(prev || '0') + parseFloat(v)).toString())}
                  className="flex-1 text-xs py-1 rounded bg-muted hover:bg-muted/80 font-medium">{v}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Wiederholungen</p>
            <input
              type="text" inputMode="text" value={r}
              onChange={e => setR(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder={targetReps}
              className="w-full text-center text-xl font-bold rounded-lg py-2 border border-border focus:outline-none focus:border-primary bg-background"
            />
            <div className="flex gap-1 mt-1">
              {['-1', '+1', '+2'].map(v => (
                <button key={v} onClick={() => {
                  const n = parseInt(r || '0') + parseInt(v);
                  setR(Math.max(0, n).toString());
                }} className="flex-1 text-xs py-1 rounded bg-muted hover:bg-muted/80 font-medium">{v}</button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={() => onLog(w, r)}
          disabled={!r}
          className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-bold text-sm active:scale-95 transition-all"
        >
          Satz abschließen ✓
        </button>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentEx = exerciseLogs[activeExerciseIndex];
  const activeSetIndex = currentEx?.sets.findIndex(s => !s.logged) ?? -1;
  const totalSets = exerciseLogs.reduce((s, l) => s + l.sets.length, 0);
  const loggedSets = exerciseLogs.reduce((s, l) => s + l.sets.filter(x => x.logged).length, 0);
  const progressPct = totalSets > 0 ? (loggedSets / totalSets) * 100 : 0;

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

      {/* Tab-Navigation */}
      <div className="flex border-b border-border bg-card flex-shrink-0">
        <button
          onClick={() => setActiveTab('assessment')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'assessment'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Assessment
        </button>
        <button
          onClick={() => setActiveTab('workout')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'workout'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Dumbbell className="w-4 h-4" />
          Workout
          {loggedSets > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
              {loggedSets}/{totalSets}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ══ ASSESSMENT TAB ══ */}
        {activeTab === 'assessment' && (
          <div className="p-4 space-y-4">

            {/* Bewegungsqualität */}
            <Card>
              <CardHeader className="cursor-pointer py-3" onClick={() => setExpandedSection(s => s === 'movement' ? null : 'movement')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Dumbbell className="w-5 h-5 text-primary" />
                    Bewegungsqualität
                  </CardTitle>
                  {expandedSection === 'movement' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </CardHeader>
              {expandedSection === 'movement' && (
                <CardContent className="space-y-5">
                  {MOVEMENT_PATTERNS.map(pattern => {
                    const score = movementScores[pattern.id as keyof MovementAssessment];
                    return (
                      <div key={pattern.id} className="space-y-3 pb-4 border-b border-border last:border-0">
                        <p className="font-medium flex items-center gap-2">
                          <span className="text-lg">{pattern.icon}</span>
                          {pattern.name}
                        </p>
                        <div className="flex gap-1">
                          {SCORE_LABELS.map(({ value, color }) => (
                            <button key={value} onClick={() => updateMovementScore(pattern.id, 'score', value)}
                              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${score.score === value ? `${color} text-white` : 'bg-muted text-muted-foreground'}`}>
                              {value}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-center text-muted-foreground">{SCORE_LABELS.find(s => s.value === score.score)?.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {pattern.cues.map(cue => (
                            <button key={cue} onClick={() => toggleCue(pattern.id, cue)}
                              className={`px-2 py-1 rounded-full text-xs transition-colors ${score.cues.includes(cue) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                              {cue}
                            </button>
                          ))}
                        </div>
                        <Textarea placeholder="Notizen..." value={score.notes} onChange={e => updateMovementScore(pattern.id, 'notes', e.target.value)} className="text-sm" rows={2} />
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>

            {/* Tiefenfragen */}
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
                      <Textarea placeholder={q.placeholder} value={deepQuestions[q.id as keyof typeof deepQuestions]}
                        onChange={e => setDeepQuestions(prev => ({ ...prev, [q.id]: e.target.value }))} rows={3} />
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Stärken & Fokus */}
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
                            {item}
                            <button onClick={() => removeItem(type, i)}>×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem(type)} className="text-sm" placeholder="Hinzufügen..." />
                        <Button size="sm" onClick={() => addItem(type)}>+</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Coach-Notizen */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">📝 Allgemeine Notizen</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea placeholder="Beobachtungen, Eindrücke, nächste Schritte..." value={coachNotes} onChange={e => setCoachNotes(e.target.value)} rows={4} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══ WORKOUT TAB ══ */}
        {activeTab === 'workout' && (
          <div className="flex flex-col h-full">
            {/* Fortschrittsbalken */}
            <div className="px-4 py-2 bg-card border-b border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{loggedSets} / {totalSets} Sätze</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            {/* Übungs-Navigation */}
            <div className="flex gap-2 px-4 py-2 overflow-x-auto flex-shrink-0 border-b border-border">
              {exerciseLogs.map((log, i) => {
                const done = log.sets.every(s => s.logged);
                const isAssessmentEx = i < ASSESSMENT_EXERCISES.length;
                return (
                  <button key={i} onClick={() => setActiveExerciseIndex(i)}
                    className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      i === activeExerciseIndex ? 'bg-primary text-primary-foreground'
                      : done ? 'bg-primary/20 text-primary'
                      : isAssessmentEx ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : 'bg-muted text-muted-foreground'
                    }`}>
                    {log.name.split(' ')[0]}
                    {done && ' ✓'}
                  </button>
                );
              })}
            </div>

            {/* Aktive Übung */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {currentEx && (
                <>
                  {/* Header */}
                  <div>
                    {activeExerciseIndex < ASSESSMENT_EXERCISES.length && (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full mb-1 inline-block">
                        Assessment-Übung
                      </span>
                    )}
                    <h2 className="text-xl font-bold">{currentEx.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {currentEx.setsTarget} Sätze · {currentEx.repsTarget} Wdh.
                    </p>
                  </div>

                  {/* Coaching Cues (nur bei Assessment-Übungen) */}
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

                  {/* Plan-Hinweis */}
                  {currentEx.notes && (
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2">
                      <p className="text-xs text-blue-700">💡 {currentEx.notes}</p>
                    </div>
                  )}

                  {/* Sets */}
                  <div className="space-y-2">
                    {currentEx.sets.map((set, si) => (
                      <SetRow
                        key={si}
                        set={set}
                        isActive={si === activeSetIndex}
                        targetReps={currentEx.repsTarget}
                        onLog={(w, r) => handleLogSet(activeExerciseIndex, si, w, r)}
                      />
                    ))}
                  </div>

                  {/* Übungs-Navigation */}
                  <div className="flex gap-2 pt-2">
                    {activeExerciseIndex > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setActiveExerciseIndex(i => i - 1)} className="flex-1">
                        ← Zurück
                      </Button>
                    )}
                    {activeExerciseIndex < exerciseLogs.length - 1 && (
                      <Button variant="outline" size="sm" onClick={() => setActiveExerciseIndex(i => i + 1)} className="flex-1">
                        Nächste →
                      </Button>
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
