import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Plus, AlertTriangle, ChevronDown, ChevronUp,
  Dumbbell, Target, Calendar, Loader2, Trash2,
  CheckCircle, ClipboardPaste, Pencil, Check, X, ClipboardCheck,
  Sparkles, Wand2, Flame, Wind,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { parsePlan, validateParsedPlan, type ParsedPlan } from '@/lib/planParser';
import { matchAndAddExercises, getMatchingStats } from '@/lib/exerciseMatching';
import { loadClientDataForPrompt, generateSystemPrompt, generateUserPrompt, type PlanConfig } from '@/lib/aiPlanGenerator';
import AssessmentGuide from '@/components/AssessmentGuide';
import PlanExerciseEditor from '@/components/PlanExerciseEditor';

// ── Warm-Up / Cool-Down Defaults ──────────────────────────────────────────────

const WARMUP_BY_PATTERN: Record<string, { name: string; reps: string }[]> = {
  squat: [
    { name: 'Hüftkreisen', reps: '10/Seite' },
    { name: 'Goblet Squat (leicht)', reps: '10' },
    { name: 'Sprunggelenk-Mobilisation', reps: '10/Seite' },
  ],
  hinge: [
    { name: 'Cat-Cow', reps: '10' },
    { name: 'Hip Hinge Drill (ohne Gewicht)', reps: '10' },
    { name: 'Glute Bridge', reps: '15' },
  ],
  push: [
    { name: 'Schulterkreisen', reps: '10/Richtung' },
    { name: 'Band Pull-Apart', reps: '15' },
    { name: 'Wall Slides', reps: '10' },
  ],
  pull: [
    { name: 'Schulterkreisen', reps: '10/Richtung' },
    { name: 'Thorakale Rotation', reps: '10/Seite' },
    { name: 'Dead Hang', reps: '20–30 Sek.' },
  ],
  core: [
    { name: 'Dead Bug', reps: '8/Seite' },
    { name: 'Bird Dog', reps: '8/Seite' },
    { name: 'Plank', reps: '30 Sek.' },
  ],
  upper: [
    { name: 'Schulterkreisen', reps: '10/Richtung' },
    { name: 'Band Pull-Apart', reps: '15' },
    { name: 'Thorakale Rotation', reps: '10/Seite' },
  ],
  lower: [
    { name: 'Hüftkreisen', reps: '10/Seite' },
    { name: 'Glute Bridge', reps: '15' },
    { name: 'Sprunggelenk-Mobilisation', reps: '10/Seite' },
  ],
  general: [
    { name: '5 Min. Fahrrad/Laufen (leicht)', reps: '5 Min.' },
    { name: 'Weltbeste Dehnung', reps: '5/Seite' },
    { name: 'Schulterkreisen', reps: '10/Richtung' },
  ],
};

const COOLDOWN_BY_PATTERN: Record<string, { name: string; reps: string }[]> = {
  squat: [
    { name: 'Hüftbeuger-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Quad-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Child\'s Pose', reps: '60 Sek.' },
  ],
  hinge: [
    { name: 'Hamstring-Dehnung liegend', reps: '30 Sek./Seite' },
    { name: 'Piriformis-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Child\'s Pose', reps: '60 Sek.' },
  ],
  push: [
    { name: 'Brust-Dehnung am Rahmen', reps: '30 Sek./Seite' },
    { name: 'Schulter-Quer-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Trizeps-Dehnung', reps: '30 Sek./Seite' },
  ],
  pull: [
    { name: 'Lat-Dehnung am Gerät', reps: '30 Sek./Seite' },
    { name: 'Bizeps-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Brust-Öffner', reps: '60 Sek.' },
  ],
  core: [
    { name: 'Cobra-Stretch', reps: '30 Sek.' },
    { name: 'Seitliche Dehnung', reps: '30 Sek./Seite' },
    { name: 'Child\'s Pose', reps: '60 Sek.' },
  ],
  upper: [
    { name: 'Brust-Dehnung am Rahmen', reps: '30 Sek./Seite' },
    { name: 'Schulter-Quer-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Lat-Dehnung', reps: '30 Sek./Seite' },
  ],
  lower: [
    { name: 'Hüftbeuger-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Hamstring-Dehnung', reps: '30 Sek./Seite' },
    { name: 'Pigeon Pose', reps: '60 Sek./Seite' },
  ],
  general: [
    { name: 'Weltbeste Dehnung', reps: '5/Seite' },
    { name: 'Child\'s Pose', reps: '60 Sek.' },
    { name: 'Thorakale Rotation', reps: '10/Seite' },
  ],
};

/** Erkennt das dominante Bewegungsmuster anhand der Übungsnamen */
function detectPattern(exercises: PlanExercise[]): string {
  const names = exercises.map(e => e.name.toLowerCase()).join(' ');
  const score: Record<string, number> = { squat: 0, hinge: 0, push: 0, pull: 0, core: 0 };

  if (/squat|kniebeuge|leg press|lunge|ausfallschritt|bulgar/.test(names)) score.squat += 2;
  if (/deadlift|kreuzheben|rdl|hip hinge|good morning|swing/.test(names)) score.hinge += 2;
  if (/press|bankdrücken|overhead|push-?up|liegestütz|dips|chest/.test(names)) score.push += 2;
  if (/row|rudern|pull.?up|klimmzug|lat|chin|curl/.test(names)) score.pull += 2;
  if (/plank|crunch|sit.?up|core|ab|rumpf/.test(names)) score.core += 2;

  const dominant = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const top = dominant[0];
  const second = dominant[1];

  if (top[1] === 0) return 'general';

  // Erkennt Upper/Lower-Body-Days
  const hasUpper = (score.push > 0 || score.pull > 0);
  const hasLower = (score.squat > 0 || score.hinge > 0);
  if (hasUpper && hasLower) return 'general';
  if (hasUpper && !hasLower) return 'upper';
  if (hasLower && !hasUpper) return 'lower';

  return top[0];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrainingPlan {
  id: string; name: string; goal: string | null; weeks_total: number | null;
  sessions_per_week: number | null; progression_notes: string | null;
  coaching_notes: string | null; nutrition_notes: string | null;
  is_active: boolean; start_date: string | null; created_at: string;
  next_plan_workout_id?: string | null;
  workouts?: PlanWorkout[];
}

interface PlanWorkout {
  id: string; plan_id: string; week_number: number; week_label: string;
  day_label: string; notes: string | null; order_in_week: number;
  exercises?: PlanExercise[];
  is_assessment?: boolean;
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  session_order?: number;
}

interface PlanExercise {
  id: string; workout_id: string; name: string; sets: number | null;
  reps_target: string | null; weight_target: string | null;
  rest_seconds: number | null; notes: string | null;
  alternative_name: string | null; order_in_workout: number;
  exercise_slot?: string | null; // 'warmup' | 'cooldown' | 'main' | null
}

interface TrainingPlanTabProps { clientId: string; clientName: string; }

function groupWorkoutsByWeek(workouts: PlanWorkout[]): Map<number, PlanWorkout[]> {
  const map = new Map<number, PlanWorkout[]>();
  for (const w of workouts) {
    if (!map.has(w.week_number)) map.set(w.week_number, []);
    map.get(w.week_number)!.push(w);
  }
  map.forEach(ws => ws.sort((a, b) => a.order_in_week - b.order_in_week));
  return map;
}

function formatRest(seconds: number | null): string {
  if (!seconds) return '—';
  if (seconds >= 60) { const m = Math.floor(seconds / 60); const s = seconds % 60; return s > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`; }
  return `${seconds}s`;
}

// ── ExerciseRow ───────────────────────────────────────────────────────────────

const ExerciseRow: React.FC<{
  exercise: PlanExercise; index: number;
  onAlternativeSaved: (exerciseId: string, value: string) => void;
}> = ({ exercise, index, onAlternativeSaved }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(exercise.alternative_name || '');
  const [saving, setSaving] = useState(false);
 
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('plan_exercises').update({ alternative_name: value.trim() || null }).eq('id', exercise.id);
    if (error) { toast.error('Konnte nicht gespeichert werden.'); }
    else { onAlternativeSaved(exercise.id, value.trim()); toast.success('Ersatzübung gespeichert.'); }
    setSaving(false); setEditing(false);
  };
 
  const handleCancel = () => { setValue(exercise.alternative_name || ''); setEditing(false); };
 
  const supersetLabel = (exercise as any).superset_label 
    ? `${(exercise as any).superset_label}${(exercise as any).superset_order || 1}`
    : null;
 
  return (
    <tr className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {supersetLabel && (
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-100 border border-blue-300 flex items-center justify-center">
              <span className="text-xs font-bold text-blue-700">{supersetLabel}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{exercise.name}</p>
            {editing ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Input value={value} onChange={e => setValue(e.target.value)} placeholder="z.B. Kurzhantel-Bankdrücken" className="h-7 text-xs" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }} />
                <button onClick={handleSave} disabled={saving} className="text-primary hover:text-primary flex-shrink-0">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground hover:text-primary transition-colors group">
                {exercise.alternative_name ? (
                  <><span className="text-blue-500">⇄ {exercise.alternative_name}</span><Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-1" /></>
                ) : (
                  <span className="opacity-0 group-hover:opacity-60 transition-opacity italic">+ Ersatzübung hinterlegen</span>
                )}
              </button>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-sm">{exercise.sets ?? '—'}</td>
      <td className="px-3 py-2 text-center tabular-nums text-sm">{exercise.reps_target || '—'}</td>
      <td className="px-3 py-2 text-center text-muted-foreground text-xs">{formatRest(exercise.rest_seconds)}</td>
      <td className="px-3 py-2 text-muted-foreground text-xs">{exercise.notes || ''}</td>
    </tr>
  );
};

// ── ExerciseTable ─────────────────────────────────────────────────────────────

const ExerciseTable: React.FC<{
  exercises: PlanExercise[];
  onExerciseUpdated: (exerciseId: string, alternativeName: string) => void;
  onDelete?: (exerciseId: string) => void;
  compact?: boolean;
  colorClass?: string;
}> = ({ exercises, onExerciseUpdated, onDelete, compact, colorClass }) => (
  <div className={`overflow-x-auto rounded-lg border ${colorClass || 'border-border'}`}>
    <table className="w-full text-sm">
      <thead>
        <tr className={`border-b ${colorClass ? colorClass.replace('border-', 'bg-').replace('/30', '/10') : 'bg-muted/40 border-border'}`}>
          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Übung</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground w-14">Sätze</th>
          <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Wdh.</th>
          {!compact && <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Pause</th>}
          {!compact && <th className="text-left px-3 py-2 font-medium text-muted-foreground">Hinweis</th>}
          {onDelete && <th className="w-8" />}
        </tr>
      </thead>
      <tbody>
        {exercises.map((ex, i) => (
          <ExerciseRow key={ex.id} exercise={ex} index={i}
            onAlternativeSaved={onExerciseUpdated}
            onDelete={onDelete}
            compact={compact} />
        ))}
      </tbody>
    </table>
  </div>
);

// ── WarmupCooldownSection ─────────────────────────────────────────────────────

const WarmupCooldownSection: React.FC<{
  slot: 'warmup' | 'cooldown';
  exercises: PlanExercise[];
  workoutId: string;
  mainExercises: PlanExercise[];
  onRefresh: () => void;
  onExerciseUpdated: (id: string, alt: string) => void;
}> = ({ slot, exercises, workoutId, mainExercises, onRefresh, onExerciseUpdated }) => {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newReps, setNewReps] = useState('');
  const [generating, setGenerating] = useState(false);

  const isWarmup = slot === 'warmup';
  const label = isWarmup ? 'Warm-Up' : 'Cool-Down';
  const icon = isWarmup ? <Flame className="w-3.5 h-3.5" /> : <Wind className="w-3.5 h-3.5" />;
  const colorClass = isWarmup ? 'border-amber-200/70' : 'border-blue-200/70';
  const headerColor = isWarmup
    ? 'text-amber-700 bg-amber-50 border-amber-200/50'
    : 'text-blue-700 bg-blue-50 border-blue-200/50';

  const handleGenerate = async () => {
    setLoading(true);
    setStep('generating');
    
    try {
      const config: PlanConfig = { 
        weeks, 
        sessionsPerWeek, 
        includeDeload, 
        focus: focus || undefined,
        isDuoPlan,
        duoPartnerId: duoPartnerId || undefined,
      };
      
      const data = await loadClientDataForPrompt(clientId);
      
      if (!data.client) {
        toast.error('Kundendaten nicht gefunden');
        setStep('config');
        setLoading(false);
        return;
      }
      
      // Bei Duo-Plan: Partner-Daten auch laden
      let partnerData = null;
      let partnerName = '';
      if (isDuoPlan && duoPartnerId) {
        partnerData = await loadClientDataForPrompt(duoPartnerId);
        partnerName = partnerData.client?.full_name || 'Partner';
      }
      
      const systemPrompt = generateSystemPrompt(data, config, partnerData);
      const userPrompt = generateUserPrompt(clientName, config, partnerName);
      
      // Claude API aufrufen
      const response = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: systemPrompt + '\n\n' + userPrompt }
          ],
          max_tokens: 8000,
        }),
      });
      
      if (!response.ok) {
        throw new Error('API-Fehler');
      }
      
      const result = await response.json();
      const markdown = result.content?.[0]?.text || '';
      
      if (!markdown) {
        throw new Error('Keine Antwort von Claude');
      }
      
      setGeneratedMarkdown(markdown);
      
      // Plan parsen
      const parsedPlan = parsePlan(markdown);
      if (!parsedPlan || parsedPlan.workouts.length === 0) {
        toast.error('Plan konnte nicht geparst werden. Versuche es erneut.');
        setStep('config');
        setLoading(false);
        return;
      }
      
      setParsed(parsedPlan);
      setValidation(validateParsedPlan(parsedPlan));
      setStep('preview');
    } catch (err) {
      console.error('KI-Plan Fehler:', err);
      toast.error('Fehler bei der Plan-Generierung');
      setStep('config');
    }
    
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const maxOrder = mainExercises.reduce((m, e) => Math.max(m, e.order_in_workout), 0);
    await supabase.from('plan_exercises').insert({
      workout_id: workoutId,
      name: newName.trim(),
      sets: 1,
      reps_target: newReps.trim() || null,
      exercise_slot: slot,
      order_in_workout: isWarmup ? -999 : maxOrder + 999,
    });
    setNewName(''); setNewReps(''); setAdding(false);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('plan_exercises').delete().eq('id', id);
    onRefresh();
  };

  return (
    <div className={`rounded-lg border overflow-hidden ${isWarmup ? 'border-amber-200/50' : 'border-blue-200/50'}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide ${headerColor}`}
      >
        <span className="flex items-center gap-1.5">{icon}{label} ({exercises.length} Übungen)</span>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); handleGenerate(); }}
            disabled={generating}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
              isWarmup ? 'border-amber-300 hover:bg-amber-100' : 'border-blue-300 hover:bg-blue-100'
            }`}
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin inline" /> : '⚡ Auto'}
          </button>
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {open && (
        <div className={`p-2 space-y-2 ${isWarmup ? 'bg-amber-50/30' : 'bg-blue-50/30'}`}>
          {exercises.length > 0 ? (
            <ExerciseTable
              exercises={exercises}
              onExerciseUpdated={onExerciseUpdated}
              onDelete={handleDelete}
              compact
              colorClass={colorClass}
            />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2 italic">
              Noch keine Übungen · „Auto" für Vorschlag klicken
            </p>
          )}

          {adding ? (
            <div className="flex gap-2 items-center">
              <Input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Übungsname" className="h-7 text-xs flex-1"
                onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus />
              <Input value={newReps} onChange={e => setNewReps(e.target.value)}
                placeholder="Wdh./Zeit" className="h-7 text-xs w-28"
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              <button onClick={handleAdd} className="text-primary"><Check className="w-4 h-4" /></button>
              <button onClick={() => setAdding(false)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className={`text-xs flex items-center gap-1 ${isWarmup ? 'text-amber-600 hover:text-amber-700' : 'text-blue-600 hover:text-blue-700'}`}
            >
              <Plus className="w-3 h-3" /> Übung hinzufügen
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── WorkoutCard ───────────────────────────────────────────────────────────────

const WorkoutCard: React.FC<{
  workout: PlanWorkout;
  onExerciseUpdated: (exerciseId: string, alternativeName: string) => void;
  onToggleAssessment: (workoutId: string, isAssessment: boolean) => void;
  onOpenAssessment: (workout: PlanWorkout) => void;
  onWorkoutUpdated: () => void;
  clientName: string;
  catalogExercises?: { id: string; name_de: string }[];
}> = ({ workout, onExerciseUpdated, onToggleAssessment, onOpenAssessment, onWorkoutUpdated, clientName, catalogExercises }) => {
  const [open, setOpen] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const allExercises = workout.exercises || [];

  // Nach Slot aufteilen
  const warmupExercises = allExercises.filter(e => e.exercise_slot === 'warmup');
  const cooldownExercises = allExercises.filter(e => e.exercise_slot === 'cooldown');
  const mainExercises = allExercises.filter(e => !e.exercise_slot || e.exercise_slot === 'main' || e.exercise_slot === 'main');

  // Übungen die mit "Warm-Up:" oder "Cool-Down:" beginnen (Legacy)
  const legacyWarmup = mainExercises.filter(e =>
    /^warm.?up:/i.test(e.name) || /^aufwärm/i.test(e.name)
  );
  const legacyCooldown = mainExercises.filter(e =>
    /^cool.?down:/i.test(e.name) || /^abkühl/i.test(e.name) || /^dehnung:/i.test(e.name)
  );
  const trueMain = mainExercises.filter(e =>
    !legacyWarmup.includes(e) && !legacyCooldown.includes(e)
  );

  // Alle Warm-Up zusammenführen (slot + legacy)
  const allWarmup = [...warmupExercises, ...legacyWarmup];
  const allCooldown = [...cooldownExercises, ...legacyCooldown];

  const handleToggleAssessment = async () => {
    setToggling(true);
    await onToggleAssessment(workout.id, !workout.is_assessment);
    setToggling(false);
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${
      workout.is_assessment ? 'border-primary/50 bg-primary/5' : 'border-border'
    }`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          {workout.is_assessment
            ? <ClipboardCheck className="w-4 h-4 text-primary flex-shrink-0" />
            : <Dumbbell className="w-4 h-4 text-primary flex-shrink-0" />}
          <span className="font-medium text-sm">{workout.day_label}</span>
          {workout.is_assessment && (
            <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">ASSESSMENT</span>
          )}
          {workout.status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-success" />}
          {!workout.is_assessment && (
            <span className="text-xs text-muted-foreground">· {trueMain.length} Übungen{allWarmup.length > 0 ? `, ${allWarmup.length} WU` : ''}{allCooldown.length > 0 ? `, ${allCooldown.length} CD` : ''}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="p-3 space-y-3">
          {/* Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleAssessment}
              disabled={toggling}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                workout.is_assessment
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {toggling ? <Loader2 className="w-3 h-3 animate-spin" /> : <ClipboardCheck className="w-3 h-3" />}
              {workout.is_assessment ? 'Assessment ✓' : 'Als Assessment markieren'}
            </button>
            {workout.is_assessment && (
              <Button size="sm" variant="outline" onClick={() => onOpenAssessment(workout)} className="text-xs h-7 gap-1.5">
                <ClipboardCheck className="w-3 h-3" />
                {workout.status === 'completed' ? 'Assessment ansehen' : 'Assessment durchführen'}
              </Button>
            )}
            {!workout.is_assessment && (
              <Button size="sm" variant={editMode ? "default" : "outline"}
                onClick={() => setEditMode(!editMode)} className="text-xs h-7 gap-1.5 ml-auto">
                <Pencil className="w-3 h-3" />{editMode ? 'Fertig' : 'Bearbeiten'}
              </Button>
            )}
          </div>

          {/* Assessment-Info */}
          {workout.is_assessment && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Assessment-Übungen (immer)</p>
              <div className="overflow-x-auto rounded-lg border border-amber-200 bg-amber-50/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-100/60 border-b border-amber-200">
                      <th className="text-left px-3 py-1.5 font-medium text-amber-700 text-xs">Übung</th>
                      <th className="text-center px-2 py-1.5 font-medium text-amber-700 text-xs w-14">Sätze</th>
                      <th className="text-center px-2 py-1.5 font-medium text-amber-700 text-xs w-16">Wdh.</th>
                      <th className="text-left px-2 py-1.5 font-medium text-amber-700 text-xs">Muster</th>
                      <th className="text-left px-2 py-1.5 font-medium text-amber-700 text-xs">Messgröße</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Kniebeuge (Bodyweight)', sets: 3, reps: '8–10', pattern: 'Squat', measure: 'Score 1–5' },
                      { name: 'Hip Hinge (leichtes RDL)', sets: 3, reps: '8–10', pattern: 'Hinge', measure: 'Score 1–5' },
                      { name: 'Schulter-Mobilitätstest', sets: 1, reps: '3/Seite', pattern: 'Mobilität', measure: '± cm (li/re)' },
                      { name: 'Push-up Test', sets: 1, reps: 'Max.', pattern: 'Push', measure: 'Anz. Wdh.' },
                      { name: 'Plank', sets: 1, reps: 'Max. Zeit', pattern: 'Core', measure: 'Sek.' },
                      { name: 'Einbeiniger Stand', sets: 1, reps: 'Max. Zeit', pattern: 'Balance', measure: 'Sek. (li/re)' },
                      { name: 'Vorwärtsbeugen stehend', sets: 1, reps: '3 Versuche', pattern: 'Mobilität', measure: '± cm' },
                    ].map((ex, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-amber-50/30'}>
                        <td className="px-3 py-1.5 font-medium text-sm">{ex.name}</td>
                        <td className="px-2 py-1.5 text-center text-sm">{ex.sets}</td>
                        <td className="px-2 py-1.5 text-center text-sm">{ex.reps}</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{ex.pattern}</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground font-medium">{(ex as any).measure}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {trueMain.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">+ Plan-Übungen</p>
                  <ExerciseTable exercises={trueMain} onExerciseUpdated={onExerciseUpdated} />
                </div>
              )}
            </div>
          )}

          {/* Normales Workout mit Warm-Up / Main / Cool-Down */}
          {!workout.is_assessment && (
            <div className="space-y-2">
              {/* Warm-Up */}
              <WarmupCooldownSection
                slot="warmup"
                exercises={allWarmup}
                workoutId={workout.id}
                mainExercises={trueMain}
                onRefresh={onWorkoutUpdated}
                onExerciseUpdated={onExerciseUpdated}
              />

              {/* Hauptteil */}
              {editMode ? (
                <PlanExerciseEditor
                  exercises={trueMain}
                  workoutId={workout.id}
                  onUpdate={onWorkoutUpdated}
                  catalogExercises={catalogExercises}
                />
              ) : trueMain.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Hauptteil</p>
                  <ExerciseTable exercises={trueMain} onExerciseUpdated={onExerciseUpdated} />
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Keine Übungen. <button onClick={() => setEditMode(true)} className="text-primary underline">Jetzt hinzufügen</button>
                </div>
              )}

              {/* Cool-Down */}
              <WarmupCooldownSection
                slot="cooldown"
                exercises={allCooldown}
                workoutId={workout.id}
                mainExercises={trueMain}
                onRefresh={onWorkoutUpdated}
                onExerciseUpdated={onExerciseUpdated}
              />
            </div>
          )}

          {workout.notes && <p className="text-xs text-muted-foreground italic">{workout.notes}</p>}
        </div>
      )}
    </div>
  );
};

// ── ImportDialog ──────────────────────────────────────────────────────────────

interface ImportDialogProps { open: boolean; onClose: () => void; onImported: () => void; clientId: string; trainerId: string; }

const ImportDialog: React.FC<ImportDialogProps> = ({ open, onClose, onImported, clientId, trainerId }) => {
  const [markdown, setMarkdown] = useState('');
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [validation, setValidation] = useState<ReturnType<typeof validateParsedPlan> | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');

  const handleParse = () => {
    const result = parsePlan(markdown);
    if (!result) { toast.error('Kein gültiges Planformat erkannt.'); return; }
    const v = validateParsedPlan(result);
    setParsed(result); setValidation(v); setStep('preview');
  };

  const handleSave = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      const allExerciseNames = parsed.workouts.flatMap(w => w.exercises.map(e => e.name));
      const matchResults = await matchAndAddExercises(allExerciseNames);
      const stats = getMatchingStats(matchResults);
      await supabase.from('training_plans').update({ is_active: false }).or(`client_id.eq.${clientId},second_client_id.eq.${clientId}`).eq('trainer_id', trainerId).eq('is_active', true);
      const { data: planData, error: planError } = await supabase.from('training_plans').insert({
        client_id: clientId, trainer_id: trainerId, name: parsed.name, goal: parsed.goal || null,
        weeks_total: parsed.weeks_total, sessions_per_week: parsed.sessions_per_week,
        total_cycles: parsed.total_cycles || 1,
        progression_notes: parsed.progression_notes || null, coaching_notes: parsed.coaching_notes || null,
        nutrition_notes: parsed.nutrition_notes || null, source: 'claude_import', is_active: true,
      }).select().single();
      if (planError || !planData) throw planError;

      for (const workout of parsed.workouts) {
        const { data: workoutData, error: workoutError } = await supabase.from('plan_workouts').insert({
          plan_id: planData.id, week_number: workout.week_number, week_label: workout.week_label,
          day_label: workout.day_label, notes: workout.notes || null, order_in_week: workout.order_in_week,
          session_order: workout.session_order, phase_type: workout.phase_type, cycle_number: workout.cycle_number,
        }).select().single();
        if (workoutError || !workoutData) throw workoutError;
        if (workout.exercises.length > 0) {
          const { error: exError } = await supabase.from('plan_exercises').insert(
            workout.exercises.map(ex => {
              const match = matchResults.get(ex.name);
              // Warm-Up/Cool-Down aus dem Import automatisch dem richtigen Slot zuweisen
              let slot: string | null = null;
              if (/^warm.?up:/i.test(ex.name)) slot = 'warmup';
              else if (/^cool.?down:/i.test(ex.name)) slot = 'cooldown';
              return {
                workout_id: workoutData.id, name: ex.name, sets: ex.sets,
                reps_target: ex.reps_target || null, weight_target: ex.weight_target || null,
                rest_seconds: ex.rest_seconds, notes: ex.notes || null, order_in_workout: ex.order_in_workout,
                exercise_id: match?.exerciseId || null,
                exercise_slot: slot,
              };
            })
          );
          if (exError) throw exError;
        }
      }
      let message = `Plan "${parsed.name}" erfolgreich importiert`;
      if (stats.added > 0) message += ` · ${stats.added} neue Übung${stats.added > 1 ? 'en' : ''} zum Katalog hinzugefügt`;
      toast.success(message);
      onImported(); onClose();
      setStep('paste'); setMarkdown(''); setParsed(null); setValidation(null);
    } catch (err) { console.error(err); toast.error('Fehler beim Speichern des Plans.'); }
    finally { setSaving(false); }
  };

  const handleClose = () => { setStep('paste'); setMarkdown(''); setParsed(null); setValidation(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5" />
            {step === 'paste' ? 'Claude-Output einfügen' : 'Plan prüfen & speichern'}
          </DialogTitle>
        </DialogHeader>
        {step === 'paste' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm space-y-1">
              <p className="font-medium text-primary">So geht's:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-xs text-muted-foreground">
                <li>Exportiere das Erstgespräch über "Für Claude exportieren"</li>
                <li>Lade die .md-Datei in ein neues Claude-Gespräch hoch</li>
                <li>Claude generiert den strukturierten Trainingsplan</li>
                <li>Füge den kompletten Output hier ein</li>
              </ol>
            </div>
            <Textarea value={markdown} onChange={e => setMarkdown(e.target.value)} placeholder="# Trainingsplan: Max Mustermann..." rows={14} className="font-mono text-xs" />
            <Button onClick={handleParse} disabled={!markdown.trim()} className="w-full">Plan analysieren →</Button>
          </div>
        )}
        {step === 'preview' && parsed && validation && (
          <div className="space-y-4">
            <div className={`rounded-lg border px-3 py-2 ${validation.valid ? 'bg-success/5 border-success/20' : 'bg-warning/5 border-warning/20'}`}>
              <div className="flex items-center gap-2 mb-1">
                {validation.valid ? <CheckCircle className="w-4 h-4 text-success" /> : <AlertTriangle className="w-4 h-4 text-warning" />}
                <span className="text-sm font-medium">{validation.valid ? 'Plan erfolgreich erkannt' : 'Plan mit Warnungen'}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {validation.stats.workouts} Einheiten · {validation.stats.exercises} Übungen
                {validation.stats.cycles > 1 && ` · ${validation.stats.cycles} Zyklen`}
              </p>
              {validation.warnings.map((w, i) => <p key={i} className="text-xs text-warning mt-1">⚠ {w}</p>)}
            </div>
            <div>
              <p className="text-lg font-display font-bold">{parsed.name}</p>
              {parsed.goal && <p className="text-sm text-muted-foreground">🎯 {parsed.goal}</p>}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {parsed.workouts.map((w, i) => (
                <div key={i} className={`rounded-lg border p-3 text-sm ${w.phase_type === 'deload' ? 'border-blue-200 bg-blue-50/50' : w.phase_type === 'test' ? 'border-amber-200 bg-amber-50/50' : 'border-border'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-xs text-muted-foreground">{w.week_label || `Woche ${w.week_number}`}</span>
                    {w.phase_type === 'deload' && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">DELOAD</span>}
                    {w.phase_type === 'test' && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">TEST</span>}
                    {w.phase_type === 'intro' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">INTRO</span>}
                  </div>
                  <p className="font-medium">{w.day_label} <span className="text-xs text-muted-foreground font-normal">#{w.session_order}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {w.exercises.length} Übungen: {w.exercises.slice(0, 3).map(e => e.name).join(', ')}
                    {w.exercises.length > 3 && ` +${w.exercises.length - 3} weitere`}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('paste')} className="flex-1">← Zurück</Button>
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

// ── AIBuilderDialog ───────────────────────────────────────────────────────────

interface AIBuilderDialogProps {
  open: boolean; onClose: () => void; onImported: () => void;
  clientId: string; clientName: string; trainerId: string;
}

const AIBuilderDialog: React.FC<AIBuilderDialogProps> = ({ open, onClose, onImported, clientId, clientName, trainerId }) => {
  const [step, setStep] = useState<'config' | 'generating' | 'preview'>('config');
  // Duo-Plan States
  const [isDuoPlan, setIsDuoPlan] = useState(false);
  const [duoPartnerId, setDuoPartnerId] = useState<string | null>(null);
  const [allClients, setAllClients] = useState<Array<{ id: string; full_name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weeks, setWeeks] = useState(4);
  const [sessionsPerWeek, setSessions] = useState(3);
  const [includeDeload, setIncludeDeload] = useState(true);
  const [focus, setFocus] = useState('');
  const [generatedMarkdown, setGeneratedMarkdown] = useState('');
  const [parsed, setParsed] = useState<ParsedPlan | null>(null);
  const [validation, setValidation] = useState<ReturnType<typeof validateParsedPlan> | null>(null);
  // Lade alle Clients für Duo-Partner Auswahl
  useEffect(() => {
    if (!open) return;
    
    const loadClients = async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', trainerId)
        .eq('status', 'Active')
        .order('full_name');
      
      setAllClients(data || []);
    };
    
    loadClients();
  }, [open, trainerId]);

  const handleGenerate = async () => {
    setLoading(true); setStep('generating');
    try {
      const config: PlanConfig = { weeks, sessionsPerWeek, includeDeload, focus: focus || undefined };
      const data = await loadClientDataForPrompt(clientId);
      if (!data.client) { toast.error('Kundendaten nicht gefunden'); setStep('config'); setLoading(false); return; }
      const systemPrompt = generateSystemPrompt(data, config);
      const userPrompt = generateUserPrompt(clientName, config);
      const response = await fetch('/api/claude-proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: systemPrompt + '\n\n' + userPrompt }], max_tokens: 8000 }),
      });
      if (!response.ok) throw new Error('API-Fehler');
      const result = await response.json();
      const markdown = result.content?.[0]?.text || '';
      if (!markdown) throw new Error('Keine Antwort von Claude');
      setGeneratedMarkdown(markdown);
      const parsedPlan = parsePlan(markdown);
      if (!parsedPlan || parsedPlan.workouts.length === 0) {
        toast.error('Plan konnte nicht geparst werden. Versuche es erneut.'); setStep('config'); setLoading(false); return;
      }
      setParsed(parsedPlan); setValidation(validateParsedPlan(parsedPlan)); setStep('preview');
    } catch (err) { console.error('KI-Plan Fehler:', err); toast.error('Fehler bei der Plan-Generierung'); setStep('config'); }
    setLoading(false);
  };

  const handleImport = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      const allExerciseNames = parsed.workouts.flatMap(w => w.exercises.map(e => e.name));
      const matchResults = await matchAndAddExercises(allExerciseNames);
      const stats = getMatchingStats(matchResults);
      await supabase.from('training_plans').update({ is_active: false }).or(`client_id.eq.${clientId},second_client_id.eq.${clientId}`).eq('trainer_id', trainerId).eq('is_active', true);
      const { data: planData, error: planError } = await supabase.from('training_plans').insert({
        client_id: clientId, 
        trainer_id: trainerId, 
        name: parsed.name, 
        goal: parsed.goal || null,
        weeks_total: parsed.weeks_total, 
        sessions_per_week: parsed.sessions_per_week,
        total_cycles: parsed.total_cycles || 1,
        progression_notes: parsed.progression_notes || null, 
        coaching_notes: parsed.coaching_notes || null,
        nutrition_notes: parsed.nutrition_notes || null, 
        source: isDuoPlan ? 'ai_generated_duo' : 'ai_generated', 
        is_active: true,
        is_duo_plan: isDuoPlan,
        duo_partner_id: isDuoPlan ? duoPartnerId : null,
        duo_plan_name: isDuoPlan && duoPartnerId 
          ? `Duo: ${clientName} & ${allClients.find(c => c.id === duoPartnerId)?.full_name}` 
          : null,
      }).select().single();
      if (planError || !planData) throw planError;
      for (const workout of parsed.workouts) {
        const { data: workoutData, error: workoutError } = await supabase.from('plan_workouts').insert({
          plan_id: planData.id, week_number: workout.week_number, week_label: workout.week_label,
          day_label: workout.day_label, notes: workout.notes || null, order_in_week: workout.order_in_week,
          session_order: workout.session_order, phase_type: workout.phase_type, cycle_number: workout.cycle_number,
        }).select().single();
        if (workoutError || !workoutData) throw workoutError;
        if (workout.exercises.length > 0) {
          const { error: exError } = await supabase.from('plan_exercises').insert(
            workout.exercises.map(ex => {
              const match = matchResults.get(ex.name);
              let slot: string | null = null;
              if (/^warm.?up:/i.test(ex.name)) slot = 'warmup';
              else if (/^cool.?down:/i.test(ex.name)) slot = 'cooldown';
              return {
                workout_id: workoutData.id, name: ex.name, sets: ex.sets,
                reps_target: ex.reps_target || null, weight_target: ex.weight_target || null,
                rest_seconds: ex.rest_seconds, notes: ex.notes || null, order_in_workout: ex.order_in_workout,
                exercise_id: match?.exerciseId || null, exercise_slot: slot,
              };
            })
          );
          if (exError) throw exError;
        }
      }
  // Bei Duo-Plan: Gespiegelten Plan für Partner erstellen
      if (isDuoPlan && duoPartnerId && planData) {
        const partnerName = allClients.find(c => c.id === duoPartnerId)?.full_name || 'Partner';
        
        const { data: partnerPlanData, error: partnerPlanError } = await supabase.from('training_plans').insert({
          client_id: duoPartnerId,
          trainer_id: trainerId,
          name: parsed.name,
          goal: parsed.goal || null,
          weeks_total: parsed.weeks_total,
          sessions_per_week: parsed.sessions_per_week,
          total_cycles: parsed.total_cycles || 1,
          progression_notes: parsed.progression_notes || null,
          coaching_notes: parsed.coaching_notes || null,
          nutrition_notes: parsed.nutrition_notes || null,
          source: 'ai_generated_duo',
          is_active: true,
          is_duo_plan: true,
          duo_partner_id: clientId,
          duo_plan_name: `Duo: ${partnerName} & ${clientName}`,
        }).select().single();
        
        if (partnerPlanError || !partnerPlanData) {
          console.error('Partner-Plan Fehler:', partnerPlanError);
        } else {
          // Workouts für Partner kopieren
          for (const workout of parsed.workouts) {
            const { data: partnerWorkoutData, error: partnerWorkoutError } = await supabase.from('plan_workouts').insert({
              plan_id: partnerPlanData.id,
              week_number: workout.week_number,
              week_label: workout.week_label,
              day_label: workout.day_label,
              notes: workout.notes || null,
              order_in_week: workout.order_in_week,
              session_order: workout.session_order,
              phase_type: workout.phase_type,
              cycle_number: workout.cycle_number,
            }).select().single();
            
            if (partnerWorkoutError || !partnerWorkoutData) continue;
            
            if (workout.exercises.length > 0) {
              await supabase.from('plan_exercises').insert(
                workout.exercises.map(ex => {
                  const match = matchResults.get(ex.name);
                  return {
                    workout_id: partnerWorkoutData.id,
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
            }
          }
        }
      }
      let message = isDuoPlan 
        ? `Duo-Plan "${parsed.name}" für beide Partner erstellt!` 
        : `Plan "${parsed.name}" erstellt!`;
      if (stats.added > 0) message += ` ${stats.added} neue Übung${stats.added > 1 ? 'en' : ''} hinzugefügt.`;
      toast.success(message);
      onImported(); handleClose();
    } catch (err) { console.error('Import-Fehler:', err); toast.error('Fehler beim Speichern des Plans'); }
    setSaving(false);
  };

  const handleClose = () => {
    setStep('config');
    setGeneratedMarkdown('');
    setParsed(null);
    setValidation(null);
    setIsDuoPlan(false);
    setDuoPartnerId(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />KI-Workout-Builder
          </DialogTitle>
        </DialogHeader>
        {step === 'config' && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">Erstelle automatisch einen Trainingsplan für <strong>{clientName}</strong>.</p>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Wochen</Label>
                  <Select value={String(weeks)} onValueChange={v => setWeeks(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3,4,6,8,12].map(n => <SelectItem key={n} value={String(n)}>{n} Wochen</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Einheiten/Woche</Label>
                  <Select value={String(sessionsPerWeek)} onValueChange={v => setSessions(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}×/Woche</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fokus (optional)</Label>
                <Input value={focus} onChange={e => setFocus(e.target.value)} placeholder="z.B. Oberkörper, Fettabbau, Kraft..." />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">Deload-Woche</p>
                  <p className="text-xs text-muted-foreground">Reduzierte Intensität am Ende</p>
                </div>
                <Switch checked={includeDeload} onCheckedChange={setIncludeDeload} />
              </div>
              {/* DUO-PLAN OPTION */}
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm flex items-center gap-2">
                      🤝 Duo-Plan
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Gemeinsamer Plan für zwei Partner
                    </p>
                  </div>
                  <Switch 
                    checked={isDuoPlan} 
                    onCheckedChange={(checked) => {
                      setIsDuoPlan(checked);
                      if (!checked) setDuoPartnerId(null);
                    }} 
                  />
                </div>

                {isDuoPlan && (
                  <div className="space-y-2">
                    <Label className="text-xs">Partner wählen</Label>
                    <Select 
                      value={duoPartnerId || ''} 
                      onValueChange={setDuoPartnerId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Partner auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allClients
                          .filter(c => c.id !== clientId)
                          .map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.full_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {duoPartnerId && (
                      <p className="text-xs text-muted-foreground">
                        ✓ Plan wird für {clientName} und{' '}
                        {allClients.find(c => c.id === duoPartnerId)?.full_name} erstellt
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button 
              onClick={handleGenerate} 
              disabled={loading || (isDuoPlan && !duoPartnerId)} 
              className="w-full gap-2"
            >
              <Wand2 className="w-4 h-4" />
              {isDuoPlan ? 'Duo-Plan generieren' : 'Plan generieren'}
            </Button>
          </div>
        )}
        {step === 'generating' && (
          <div className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Plan wird erstellt...</p>
              <p className="text-sm text-muted-foreground">Das dauert etwa 10–20 Sekunden</p>
            </div>
          </div>
        )}
        {step === 'preview' && parsed && validation && (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <CheckCircle className="w-4 h-4" /><span className="font-medium">Plan erfolgreich generiert!</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground">Einheiten</p><p className="font-semibold">{validation.stats.workouts}</p></div>
                <div><p className="text-muted-foreground">Übungen</p><p className="font-semibold">{validation.stats.exercises}</p></div>
                <div><p className="text-muted-foreground">Wochen</p><p className="font-semibold">{validation.stats.weeks?.length ?? weeks}</p></div>
              </div>
            </div>
            {validation.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                {validation.warnings.map((w, i) => <p key={i} className="text-xs text-amber-700">⚠ {w}</p>)}
              </div>
            )}
            <div className="border rounded-lg p-3 max-h-[300px] overflow-y-auto">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Vorschau:</p>
              <div className="space-y-2">
                {parsed.workouts.slice(0, 6).map((w, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-muted-foreground">Woche {w.week_number}:</span>{' '}
                    <span className="font-medium">{w.day_label}</span>{' '}
                    <span className="text-muted-foreground">({w.exercises.length} Übungen)</span>
                  </div>
                ))}
                {parsed.workouts.length > 6 && <p className="text-xs text-muted-foreground">... und {parsed.workouts.length - 6} weitere</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('config')} className="flex-1">← Neu generieren</Button>
              <Button onClick={handleImport} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'Speichern...' : 'Plan übernehmen'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── TrainingPlanTab (Haupt-Komponente) ────────────────────────────────────────

const TrainingPlanTab: React.FC<TrainingPlanTabProps> = ({ clientId, clientName }) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [activeAssessment, setActiveAssessment] = useState<PlanWorkout | null>(null);
  const [catalogExercises, setCatalogExercises] = useState<{ id: string; name_de: string }[]>([]);

  const loadPlans = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: exerciseCatalog } = await supabase.from('exercises').select('id, name_de').order('name_de');
    setCatalogExercises(exerciseCatalog || []);
    const { data: plansData } = await supabase.from('training_plans').select('*').or(`client_id.eq.${clientId},second_client_id.eq.${clientId}`).eq('trainer_id', user.id).order('created_at', { ascending: false });
    if (!plansData) { setLoading(false); return; }
    setPlans(plansData);
    const active = plansData.find(p => p.is_active) || null;
    if (active) {
      const { data: workoutsData } = await supabase.from('plan_workouts').select('*').eq('plan_id', active.id).order('week_number').order('order_in_week');
      if (workoutsData) {
        const workoutIds = workoutsData.map(w => w.id);
        const { data: exercisesData } = workoutIds.length > 0
          ? await supabase.from('plan_exercises').select('*').in('workout_id', workoutIds).order('order_in_workout')
          : { data: [] };
        active.workouts = workoutsData.map(w => ({ ...w, exercises: (exercisesData || []).filter(e => e.workout_id === w.id) }));
        setSelectedWeek(prev => prev ?? (active.workouts?.[0]?.week_number ?? null));
      }
    }
    setActivePlan(active);
    setLoading(false);
  }, [clientId, user]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const handleExerciseUpdated = (exerciseId: string, alternativeName: string) => {
    setActivePlan(prev => {
      if (!prev?.workouts) return prev;
      return {
        ...prev,
        workouts: prev.workouts.map(w => ({
          ...w,
          exercises: (w.exercises || []).map(ex =>
            ex.id === exerciseId ? { ...ex, alternative_name: alternativeName || null } : ex
          ),
        })),
      };
    });
  };

  const handleToggleAssessment = async (workoutId: string, isAssessment: boolean) => {
    const { error } = await supabase.from('plan_workouts').update({ is_assessment: isAssessment }).eq('id', workoutId);
    if (error) { toast.error('Fehler beim Aktualisieren'); return; }
    setActivePlan(prev => {
      if (!prev?.workouts) return prev;
      return { ...prev, workouts: prev.workouts.map(w => w.id === workoutId ? { ...w, is_assessment: isAssessment } : w) };
    });
    toast.success(isAssessment ? 'Als Assessment markiert' : 'Assessment-Markierung entfernt');
  };

  const handleDelete = async (planId: string, planName: string) => {
    if (!window.confirm(`Plan "${planName}" wirklich löschen?`)) return;
    const { error } = await supabase.from('training_plans').delete().eq('id', planId);
    if (error) { toast.error('Fehler beim Löschen'); return; }
    toast.success('Plan gelöscht'); setSelectedWeek(null); loadPlans();
  };

  const handleActivate = async (planId: string) => {
    await supabase.from('training_plans').update({ is_active: false }).or(`client_id.eq.${clientId},second_client_id.eq.${clientId}`);
    await supabase.from('training_plans').update({ is_active: true }).eq('id', planId);
    toast.success('Plan aktiviert'); setSelectedWeek(null); loadPlans();
  };

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const weekMap = activePlan?.workouts ? groupWorkoutsByWeek(activePlan.workouts) : new Map();
  const weekNumbers = [...weekMap.keys()].sort((a, b) => a - b);
  const currentWeekWorkouts = selectedWeek !== null ? (weekMap.get(selectedWeek) || []) : [];
  const archivedPlans = plans.filter(p => !p.is_active);

  return (
    <>
      {activeAssessment && (
        <AssessmentGuide
          workoutId={activeAssessment.id}
          clientId={clientId}
          clientName={clientName}
          onClose={() => setActiveAssessment(null)}
          onComplete={() => { setActiveAssessment(null); loadPlans(); }}
        />
      )}

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold">Trainingsplan</h3>
            {activePlan && <p className="text-xs text-muted-foreground mt-0.5">{activePlan.name}{activePlan.weeks_total && ` · ${activePlan.weeks_total} Wochen`}{activePlan.sessions_per_week && ` · ${activePlan.sessions_per_week}×/Woche`}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setAiBuilderOpen(true)}>
              <Sparkles className="w-4 h-4" /> KI-Plan
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
              <Plus className="w-4 h-4" /> Importieren
            </Button>
          </div>
        </div>

        {!activePlan && (
          <Card><CardContent className="p-8 text-center space-y-4">
            <Dumbbell className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">Noch kein aktiver Trainingsplan für {clientName}.</p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setAiBuilderOpen(true)}>
                <Sparkles className="w-4 h-4" /> KI-Plan erstellen
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
                <ClipboardPaste className="w-4 h-4" /> Plan importieren
              </Button>
            </div>
          </CardContent></Card>
        )}

        {activePlan && (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              {activePlan.goal && <Card><CardContent className="p-3 flex items-start gap-2"><Target className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground font-medium">Ziel</p><p className="text-sm">{activePlan.goal}</p></div></CardContent></Card>}
              {activePlan.start_date && <Card><CardContent className="p-3 flex items-start gap-2"><Calendar className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground font-medium">Startdatum</p><p className="text-sm">{format(new Date(activePlan.start_date), 'd. MMM yyyy', { locale: de })}</p></div></CardContent></Card>}
              <Card><CardContent className="p-3 flex items-start gap-2"><Dumbbell className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><div><p className="text-xs text-muted-foreground font-medium">Umfang</p><p className="text-sm">{weekNumbers.length} Woche{weekNumbers.length !== 1 ? 'n' : ''} · {activePlan.workouts?.length || 0} Einheiten</p></div></CardContent></Card>
            </div>

            {weekNumbers.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {weekNumbers.map(wn => {
                  const label = weekMap.get(wn)?.[0]?.week_label;
                  return (
                    <button key={wn} onClick={() => setSelectedWeek(wn)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedWeek === wn ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                      {label ? label.replace(/^Woche\s*/i, 'W').split(':')[0] : `Woche ${wn}`}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedWeek !== null && currentWeekWorkouts.length > 0 && (
              <div className="space-y-3">
                {currentWeekWorkouts[0]?.week_label && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{currentWeekWorkouts[0].week_label}</p>}
                {currentWeekWorkouts.map(workout => (
                  <WorkoutCard
                    key={workout.id}
                    workout={workout}
                    onExerciseUpdated={handleExerciseUpdated}
                    onToggleAssessment={handleToggleAssessment}
                    onOpenAssessment={setActiveAssessment}
                    onWorkoutUpdated={loadPlans}
                    clientName={clientName}
                    catalogExercises={catalogExercises}
                  />
                ))}
              </div>
            )}

            {activePlan.workouts && activePlan.workouts.length > 0 && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Nächstes Training des Kunden</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={activePlan.next_plan_workout_id || activePlan.workouts[0]?.id || ''}
                      onChange={async e => {
                        const newId = e.target.value;
                        await supabase.from('training_plans').update({ next_plan_workout_id: newId }).eq('id', activePlan.id);
                        setActivePlan(prev => prev ? { ...prev, next_plan_workout_id: newId } : prev);
                        toast.success('Nächstes Training aktualisiert.');
                      }}
                      className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {activePlan.workouts.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.week_label ? w.week_label.split(':')[0] : `Woche ${w.week_number}`} · {w.day_label}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>
            )}

            {(activePlan.progression_notes || activePlan.coaching_notes) && (
              <div className="grid sm:grid-cols-2 gap-3">
                {activePlan.progression_notes && <Card><CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progressionslogik</CardTitle></CardHeader><CardContent className="px-4 pb-3"><p className="text-sm text-muted-foreground whitespace-pre-wrap">{activePlan.progression_notes}</p></CardContent></Card>}
                {activePlan.coaching_notes && <Card><CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Coaching-Hinweise</CardTitle></CardHeader><CardContent className="px-4 pb-3"><p className="text-sm text-muted-foreground whitespace-pre-wrap">{activePlan.coaching_notes}</p></CardContent></Card>}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-1.5 text-xs" onClick={() => handleDelete(activePlan.id, activePlan.name)}>
                <Trash2 className="w-3.5 h-3.5" /> Plan löschen
              </Button>
            </div>
          </>
        )}

        {archivedPlans.length > 0 && (
          <div>
            <button onClick={() => setShowArchive(v => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
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
                        <p className="text-xs text-muted-foreground">Importiert {format(new Date(plan.created_at), 'd. MMM yyyy', { locale: de })}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleActivate(plan.id)} className="text-xs">Aktivieren</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(plan.id, plan.name)} className="text-xs text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {user && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={loadPlans} clientId={clientId} trainerId={user.id} />}
        {user && <AIBuilderDialog open={aiBuilderOpen} onClose={() => setAiBuilderOpen(false)} onImported={loadPlans} clientId={clientId} clientName={clientName} trainerId={user.id} />}
      </div>
    </>
  );
};

export default TrainingPlanTab;
