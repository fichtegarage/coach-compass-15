/**
 * ExerciseLibrary.tsx
 *
 * Globale Übungsdatenbank für Coaches.
 * - Übungen durchsuchen und filtern
 * - Neue Übungen hinzufügen
 * - Bestehende Übungen editieren und löschen
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Search, Plus, Dumbbell, ChevronDown, ChevronUp,
  X, Pencil, Trash2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Equipment {
  id: string;
  name: string;
  name_de: string;
  category: string;
}

interface Exercise {
  id: string;
  name: string;
  name_de: string;
  description?: string | null;
  muscle_groups: string[];
  movement_pattern: string;
  exercise_type: string;
  difficulty: number;
  coaching_cues: string[];
  context: string[];
  required_equipment: string[];
  created_at: string;
}

// ── Labels ───────────────────────────────────────────────────────────────────

// Nur Werte die im DB-Check-Constraint erlaubt sind:
// core, pull_vertical, pull_horizontal, lunge, mobility,
// push_vertical, hinge, squat, push_horizontal, compound, cardio, carry, isolation
const movementPatternLabels: Record<string, string> = {
  push_horizontal: 'Horizontales Drücken',
  push_vertical: 'Vertikales Drücken',
  pull_horizontal: 'Horizontales Ziehen',
  pull_vertical: 'Vertikales Ziehen',
  squat: 'Kniebeuge',
  hinge: 'Hüftbeuge',
  lunge: 'Ausfallschritt',
  carry: 'Tragen',
  compound: 'Komplex',
  core: 'Core',
  isolation: 'Isolation',
  mobility: 'Mobilität',
  cardio: 'Cardio',
};

// Erlaubte exercise_type-Werte laut DB-Constraint:
// strength, mobility, compound, isolation, accessory, cardio
const exerciseTypeLabels: Record<string, string> = {
  compound: 'Mehrgelenkig',
  isolation: 'Eingelenkig',
  accessory: 'Assistenz',
  cardio: 'Cardio',
  mobility: 'Mobilität',
  strength: 'Kraft',
};

const muscleGroupLabels: Record<string, string> = {
  chest: 'Brust',
  back: 'Rücken',
  shoulders: 'Schultern',
  biceps: 'Bizeps',
  triceps: 'Trizeps',
  forearms: 'Unterarme',
  quads: 'Quadrizeps',
  hamstrings: 'Beinbeuger',
  glutes: 'Gesäß',
  calves: 'Waden',
  core: 'Core',
  abs: 'Bauch',
  obliques: 'Schräge Bauchmuskeln',
  lower_back: 'Unterer Rücken',
  traps: 'Trapezius',
  lats: 'Latissimus',
};

const contextLabels: Record<string, string> = {
  gym: 'Studio',
  home: 'Zuhause',
  outdoor: 'Outdoor',
  minimal: 'Minimal Equipment',
};

const difficultyLabels = ['', 'Anfänger', 'Leicht-Fortgeschritten', 'Fortgeschritten', 'Weit-Fortgeschritten', 'Experte'];

// ── Shared Form ───────────────────────────────────────────────────────────────

interface ExerciseFormState {
  name: string;
  nameDe: string;
  description: string;
  muscleGroups: string[];
  movementPattern: string;
  exerciseType: string;
  difficulty: number;
  coachingCues: string;
  context: string[];
  requiredEquipment: string[];
}

const defaultForm: ExerciseFormState = {
  name: '',
  nameDe: '',
  description: '',
  muscleGroups: [],
  movementPattern: '',
  exerciseType: 'compound',
  difficulty: 3,
  coachingCues: '',
  context: ['gym'],
  requiredEquipment: [],
};

interface ExerciseFormProps {
  form: ExerciseFormState;
  onChange: (f: ExerciseFormState) => void;
  equipment: Equipment[];
}

const ExerciseForm: React.FC<ExerciseFormProps> = ({ form, onChange, equipment }) => {
  const set = (partial: Partial<ExerciseFormState>) => onChange({ ...form, ...partial });

  const toggle = (field: 'muscleGroups' | 'context' | 'requiredEquipment', value: string) => {
    const arr = form[field] as string[];
    set({ [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] });
  };

  return (
    <div className="space-y-4">
      {/* Namen */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Name (Deutsch) *</Label>
          <Input value={form.nameDe} onChange={e => set({ nameDe: e.target.value })} placeholder="z.B. Bankdrücken" />
        </div>
        <div>
          <Label>Name (Englisch) *</Label>
          <Input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="z.B. Bench Press" />
        </div>
      </div>

      {/* Beschreibung */}
      <div>
        <Label>Beschreibung (optional)</Label>
        <Textarea
          value={form.description}
          onChange={e => set({ description: e.target.value })}
          placeholder="Kurze Übungsbeschreibung..."
          rows={2}
        />
      </div>

      {/* Bewegungsmuster & Typ */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Bewegungsmuster *</Label>
          <Select value={form.movementPattern} onValueChange={v => set({ movementPattern: v })}>
            <SelectTrigger><SelectValue placeholder="Auswählen..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(movementPatternLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Übungstyp</Label>
          <Select value={form.exerciseType} onValueChange={v => set({ exerciseType: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(exerciseTypeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Schwierigkeit */}
      <div>
        <Label>Schwierigkeit: {difficultyLabels[form.difficulty]}</Label>
        <div className="flex gap-2 mt-2">
          {[1, 2, 3, 4, 5].map(level => (
            <button
              key={level}
              type="button"
              onClick={() => set({ difficulty: level })}
              className={`w-8 h-8 rounded-lg border transition-colors ${
                level <= form.difficulty
                  ? 'bg-primary border-primary text-white'
                  : 'bg-muted border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Muskelgruppen */}
      <div>
        <Label>Muskelgruppen * (mind. 1 auswählen)</Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Object.entries(muscleGroupLabels).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle('muscleGroups', key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                form.muscleGroups.includes(key)
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Kontext */}
      <div>
        <Label>Kontext</Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Object.entries(contextLabels).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle('context', key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                form.context.includes(key)
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Equipment */}
      {equipment.length > 0 && (
        <div>
          <Label>Benötigtes Equipment</Label>
          <div className="flex flex-wrap gap-1.5 mt-2 max-h-32 overflow-y-auto">
            {equipment.map(eq => (
              <button
                key={eq.id}
                type="button"
                onClick={() => toggle('requiredEquipment', eq.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  form.requiredEquipment.includes(eq.id)
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {eq.name_de}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Coaching Cues */}
      <div>
        <Label>Coaching Cues (eine pro Zeile)</Label>
        <Textarea
          value={form.coachingCues}
          onChange={e => set({ coachingCues: e.target.value })}
          placeholder={'Schulterblätter zusammen\nKontrollierte Bewegung\nVolle Bewegungsamplitude'}
          rows={4}
        />
      </div>
    </div>
  );
};

// ── AddExerciseDialog ─────────────────────────────────────────────────────────

const AddExerciseDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipment: Equipment[];
}> = ({ open, onClose, onSaved, equipment }) => {
  const [form, setForm] = useState<ExerciseFormState>(defaultForm);
  const [saving, setSaving] = useState(false);

  const handleClose = () => { setForm(defaultForm); onClose(); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.nameDe.trim() || form.muscleGroups.length === 0 || !form.movementPattern) {
      toast.error('Bitte fülle alle Pflichtfelder aus (Name DE, Name EN, Bewegungsmuster, mind. 1 Muskelgruppe)');
      return;
    }
    setSaving(true);
    try {
      const cuesArray = form.coachingCues.split('\n').map(c => c.trim()).filter(c => c.length > 0);
      const { error } = await supabase.from('exercises').insert({
        name: form.name.trim(),
        name_de: form.nameDe.trim(),
        description: form.description.trim() || null,
        muscle_groups: form.muscleGroups,
        movement_pattern: form.movementPattern,
        exercise_type: form.exerciseType,
        difficulty: form.difficulty,
        coaching_cues: cuesArray,
        context: form.context,
        required_equipment: form.requiredEquipment,
      });
      if (error) {
        console.error('Supabase Error:', error);
        toast.error(`Fehler: ${error.message}`);
        return;
      }
      toast.success(`„${form.nameDe}" hinzugefügt`);
      onSaved();
      handleClose();
    } catch (err) {
      console.error(err);
      toast.error('Unbekannter Fehler beim Speichern');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Plus className="w-5 h-5" /> Neue Übung hinzufügen
          </DialogTitle>
        </DialogHeader>
        <ExerciseForm form={form} onChange={setForm} equipment={equipment} />
        <div className="flex gap-2 pt-2 border-t border-border mt-2">
          <Button variant="outline" onClick={handleClose} className="flex-1">Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Übung speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── EditExerciseDialog ────────────────────────────────────────────────────────

const EditExerciseDialog: React.FC<{
  exercise: Exercise | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  equipment: Equipment[];
}> = ({ exercise, open, onClose, onSaved, equipment }) => {
  const [form, setForm] = useState<ExerciseFormState>(defaultForm);
  const [saving, setSaving] = useState(false);

  // Form mit Übungsdaten befüllen wenn Dialog öffnet
  useEffect(() => {
    if (exercise) {
      setForm({
        name: exercise.name,
        nameDe: exercise.name_de,
        description: exercise.description || '',
        muscleGroups: exercise.muscle_groups || [],
        movementPattern: exercise.movement_pattern,
        exerciseType: exercise.exercise_type,
        difficulty: exercise.difficulty,
        coachingCues: (exercise.coaching_cues || []).join('\n'),
        context: exercise.context || ['gym'],
        requiredEquipment: exercise.required_equipment || [],
      });
    }
  }, [exercise]);

  const handleSave = async () => {
    if (!exercise) return;
    if (!form.name.trim() || !form.nameDe.trim() || form.muscleGroups.length === 0 || !form.movementPattern) {
      toast.error('Bitte fülle alle Pflichtfelder aus');
      return;
    }
    setSaving(true);
    try {
      const cuesArray = form.coachingCues.split('\n').map(c => c.trim()).filter(c => c.length > 0);
      const { error } = await supabase.from('exercises').update({
        name: form.name.trim(),
        name_de: form.nameDe.trim(),
        description: form.description.trim() || null,
        muscle_groups: form.muscleGroups,
        movement_pattern: form.movementPattern,
        exercise_type: form.exerciseType,
        difficulty: form.difficulty,
        coaching_cues: cuesArray,
        context: form.context,
        required_equipment: form.requiredEquipment,
      }).eq('id', exercise.id);
      if (error) {
        console.error('Supabase Error:', error);
        toast.error(`Fehler: ${error.message}`);
        return;
      }
      toast.success(`„${form.nameDe}" aktualisiert`);
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Unbekannter Fehler beim Speichern');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Pencil className="w-5 h-5" /> Übung bearbeiten
          </DialogTitle>
        </DialogHeader>
        <ExerciseForm form={form} onChange={setForm} equipment={equipment} />
        <div className="flex gap-2 pt-2 border-t border-border mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Änderungen speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── ExerciseCard ──────────────────────────────────────────────────────────────

const ExerciseCard: React.FC<{
  exercise: Exercise;
  equipment: Map<string, Equipment>;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ exercise, equipment, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);

  const requiredEquipmentNames = (exercise.required_equipment || [])
    .map(id => equipment.get(id)?.name_de || id)
    .filter(Boolean);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`„${exercise.name_de}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    onDelete();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{exercise.name_de}</p>
              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                {exerciseTypeLabels[exercise.exercise_type] || exercise.exercise_type}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{exercise.name}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(exercise.muscle_groups || []).slice(0, 3).map(mg => (
                <span key={mg} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {muscleGroupLabels[mg] || mg}
                </span>
              ))}
              {(exercise.muscle_groups || []).length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{exercise.muscle_groups.length - 3}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {movementPatternLabels[exercise.movement_pattern] || exercise.movement_pattern}
              </p>
              <div className="flex items-center gap-0.5 justify-end mt-0.5">
                {[1, 2, 3, 4, 5].map(level => (
                  <div
                    key={level}
                    className={`w-1.5 h-1.5 rounded-full ${level <= exercise.difficulty ? 'bg-primary' : 'bg-muted'}`}
                  />
                ))}
              </div>
            </div>
            {/* Edit / Delete Buttons */}
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={handleEdit}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Bearbeiten"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Löschen"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
          {exercise.description && (
            <p className="text-sm text-muted-foreground italic">{exercise.description}</p>
          )}
          {requiredEquipmentNames.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Benötigtes Equipment</p>
              <div className="flex flex-wrap gap-1">
                {requiredEquipmentNames.map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
                ))}
              </div>
            </div>
          )}
          {exercise.coaching_cues && exercise.coaching_cues.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Coaching Cues</p>
              <ul className="space-y-1">
                {exercise.coaching_cues.map((cue, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-primary">•</span>{cue}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {exercise.context && exercise.context.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Kontext</p>
              <div className="flex flex-wrap gap-1">
                {exercise.context.map(ctx => (
                  <Badge key={ctx} variant="outline" className="text-xs">{contextLabels[ctx] || ctx}</Badge>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Muskelgruppen</p>
            <div className="flex flex-wrap gap-1">
              {(exercise.muscle_groups || []).map(mg => (
                <span key={mg} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                  {muscleGroupLabels[mg] || mg}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const ExerciseLibrary: React.FC = () => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentMap, setEquipmentMap] = useState<Map<string, Equipment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPattern, setFilterPattern] = useState<string | null>(null);
  const [filterMuscle, setFilterMuscle] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  const loadExercises = async () => {
    setLoading(true);
    const { data: exercisesData } = await supabase.from('exercises').select('*').order('name_de');
    const { data: equipmentData } = await supabase.from('equipment_catalog').select('*').order('sort_order');
    if (exercisesData) setExercises(exercisesData);
    if (equipmentData) {
      setEquipment(equipmentData);
      const map = new Map<string, Equipment>();
      equipmentData.forEach(eq => map.set(eq.id, eq));
      setEquipmentMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { loadExercises(); }, []);

  const handleDelete = async (exercise: Exercise) => {
    const { error } = await supabase.from('exercises').delete().eq('id', exercise.id);
    if (error) {
      console.error(error);
      toast.error(`Fehler beim Löschen: ${error.message}`);
    } else {
      toast.success(`„${exercise.name_de}" gelöscht`);
      loadExercises();
    }
  };

  const filteredExercises = exercises.filter(ex => {
    const matchesSearch = search === '' ||
      ex.name_de.toLowerCase().includes(search.toLowerCase()) ||
      ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesPattern = !filterPattern || ex.movement_pattern === filterPattern;
    const matchesMuscle = !filterMuscle || (ex.muscle_groups || []).includes(filterMuscle);
    return matchesSearch && matchesPattern && matchesMuscle;
  });

  const patterns = [...new Set(exercises.map(e => e.movement_pattern))];
  const muscles = [...new Set(exercises.flatMap(e => e.muscle_groups || []))];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-display font-bold">Übungsdatenbank</h2>
          <p className="text-sm text-muted-foreground">{exercises.length} Übungen</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Übung hinzufügen
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Übung suchen..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filterPattern || 'all'} onValueChange={v => setFilterPattern(v === 'all' ? null : v)}>
            <SelectTrigger className="w-auto min-w-[150px]">
              <SelectValue placeholder="Bewegungsmuster" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Muster</SelectItem>
              {patterns.map(p => (
                <SelectItem key={p} value={p}>{movementPatternLabels[p] || p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMuscle || 'all'} onValueChange={v => setFilterMuscle(v === 'all' ? null : v)}>
            <SelectTrigger className="w-auto min-w-[150px]">
              <SelectValue placeholder="Muskelgruppe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Muskeln</SelectItem>
              {muscles.map(m => (
                <SelectItem key={m} value={m}>{muscleGroupLabels[m] || m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(filterPattern || filterMuscle) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterPattern(null); setFilterMuscle(null); }}
              className="text-muted-foreground"
            >
              <X className="w-3 h-3 mr-1" /> Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {/* Ergebniszähler */}
      {(search || filterPattern || filterMuscle) && (
        <p className="text-xs text-muted-foreground">
          {filteredExercises.length} von {exercises.length} Übungen
        </p>
      )}

      {/* Exercise List */}
      <div className="space-y-2">
        {filteredExercises.map(ex => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            equipment={equipmentMap}
            onEdit={() => setEditingExercise(ex)}
            onDelete={() => handleDelete(ex)}
          />
        ))}
      </div>

      {filteredExercises.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Dumbbell className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Keine Übungen gefunden.</p>
        </div>
      )}

      {/* Dialoge */}
      <AddExerciseDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSaved={loadExercises}
        equipment={equipment}
      />
      <EditExerciseDialog
        exercise={editingExercise}
        open={!!editingExercise}
        onClose={() => setEditingExercise(null)}
        onSaved={loadExercises}
        equipment={equipment}
      />
    </div>
  );
};

export default ExerciseLibrary;
