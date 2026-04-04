/**
 * ExerciseLibrary.tsx
 *
 * Globale Übungsdatenbank für Coaches.
 * - Übungen durchsuchen und filtern
 * - Neue Übungen hinzufügen (mit Beschreibung)
 * - Übungen bearbeiten (inkl. Beschreibung)
 * - Übungsdetails mit Beschreibung, Coaching-Cues anzeigen
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
  Pencil, Trash2, X,
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

const movementPatternLabels: Record<string, string> = {
  push_horizontal: 'Horizontales Drücken',
  push_vertical: 'Vertikales Drücken',
  pull_horizontal: 'Horizontales Ziehen',
  pull_vertical: 'Vertikales Ziehen',
  squat: 'Kniebeuge',
  hinge: 'Hüftbeuge',
  lunge: 'Ausfallschritt',
  carry: 'Tragen',
  core: 'Core',
  compound: 'Mehrgelenkig',
  isolation: 'Isolation',
  mobility: 'Mobilität',
  cardio: 'Cardio',
};

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

const AUTO_DESCRIPTION = 'Automatisch hinzugefügt beim Plan-Import.';

// ── ExerciseCard ─────────────────────────────────────────────────────────────

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

  const hasRealDescription = exercise.description && exercise.description !== AUTO_DESCRIPTION;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{exercise.name_de}</p>
              <Badge variant="outline" className="text-[10px]">
                {exerciseTypeLabels[exercise.exercise_type] || exercise.exercise_type}
              </Badge>
              {!hasRealDescription && (
                <Badge variant="outline" className="text-[10px] text-warning border-warning/30 bg-warning/5">
                  Beschreibung fehlt
                </Badge>
              )}
            </div>
            {exercise.name && exercise.name !== exercise.name_de && (
              <p className="text-xs text-muted-foreground mt-0.5">{exercise.name}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(exercise.muscle_groups || []).slice(0, 3).map(mg => (
                <span key={mg} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {muscleGroupLabels[mg] || mg}
                </span>
              ))}
              {(exercise.muscle_groups || []).length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{exercise.muscle_groups.length - 3}</span>
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
                  <div key={level} className={`w-1.5 h-1.5 rounded-full ${level <= exercise.difficulty ? 'bg-primary' : 'bg-muted'}`} />
                ))}
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">

          {/* Beschreibung */}
          {hasRealDescription ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Beschreibung</p>
              <p className="text-sm text-foreground leading-relaxed">{exercise.description}</p>
            </div>
          ) : (
            <div className="rounded-lg bg-warning/5 border border-warning/20 px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground italic">Noch keine Beschreibung hinterlegt.</p>
              <button onClick={e => { e.stopPropagation(); onEdit(); }} className="text-xs text-primary hover:underline flex-shrink-0">
                Jetzt ergänzen
              </button>
            </div>
          )}

          {/* Equipment */}
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

          {/* Coaching Cues */}
          {exercise.coaching_cues && exercise.coaching_cues.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Coaching Cues</p>
              <ul className="space-y-1">
                {exercise.coaching_cues.map((cue, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-primary flex-shrink-0">•</span>{cue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Kontext */}
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

          {/* Muskelgruppen */}
          {exercise.muscle_groups && exercise.muscle_groups.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Muskelgruppen</p>
              <div className="flex flex-wrap gap-1">
                {exercise.muscle_groups.map(mg => (
                  <span key={mg} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                    {muscleGroupLabels[mg] || mg}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Aktionen */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="gap-1.5 flex-1"
              onClick={e => { e.stopPropagation(); onEdit(); }}>
              <Pencil className="w-3.5 h-3.5" /> Bearbeiten
            </Button>
            <Button size="sm" variant="outline"
              className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={e => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Gemeinsame Formular-Felder ────────────────────────────────────────────────

const ExerciseFormFields: React.FC<{
  nameDe: string; setNameDe: (v: string) => void;
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  movementPattern: string; setMovementPattern: (v: string) => void;
  exerciseType: string; setExerciseType: (v: string) => void;
  difficulty: number; setDifficulty: (v: number) => void;
  muscleGroups: string[]; setMuscleGroups: (v: string[]) => void;
  context: string[]; setContext: (v: string[]) => void;
  requiredEquipment: string[]; setRequiredEquipment: (v: string[]) => void;
  coachingCues: string; setCoachingCues: (v: string) => void;
  equipment: Equipment[];
}> = ({
  nameDe, setNameDe, name, setName, description, setDescription,
  movementPattern, setMovementPattern, exerciseType, setExerciseType,
  difficulty, setDifficulty, muscleGroups, setMuscleGroups,
  context, setContext, requiredEquipment, setRequiredEquipment,
  coachingCues, setCoachingCues, equipment,
}) => {
  const toggle = (arr: string[], val: string, set: (v: string[]) => void) =>
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Name (Deutsch) *</Label>
          <Input value={nameDe} onChange={e => setNameDe(e.target.value)} placeholder="z.B. Bankdrücken" />
        </div>
        <div className="space-y-1.5">
          <Label>Name (Englisch)</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Bench Press" />
        </div>
      </div>

      {/* Beschreibung – prominent platziert */}
      <div className="space-y-1.5">
        <Label>Beschreibung</Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Erkläre die Übung in 1–3 Sätzen: Ausführung, Hauptziel, worauf zu achten ist."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Wird Kunden als Erklärung angezeigt, wenn sie die Übung im Plan sehen.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Bewegungsmuster *</Label>
          <Select value={movementPattern} onValueChange={setMovementPattern}>
            <SelectTrigger><SelectValue placeholder="Auswählen..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(movementPatternLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Übungstyp</Label>
          <Select value={exerciseType} onValueChange={setExerciseType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(exerciseTypeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Schwierigkeit: <span className="font-medium">{difficultyLabels[difficulty]}</span></Label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(level => (
            <button key={level} type="button" onClick={() => setDifficulty(level)}
              className={`w-9 h-9 rounded-lg border text-sm font-medium transition-colors ${
                level <= difficulty ? 'bg-primary border-primary text-white' : 'bg-muted border-border text-muted-foreground'
              }`}>{level}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Muskelgruppen * (mind. 1)</Label>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(muscleGroupLabels).map(([key, label]) => (
            <button key={key} type="button" onClick={() => toggle(muscleGroups, key, setMuscleGroups)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                muscleGroups.includes(key) ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Kontext</Label>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(contextLabels).map(([key, label]) => (
            <button key={key} type="button" onClick={() => toggle(context, key, setContext)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                context.includes(key) ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Benötigtes Equipment</Label>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {equipment.map(eq => (
            <button key={eq.id} type="button" onClick={() => toggle(requiredEquipment, eq.id, setRequiredEquipment)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                requiredEquipment.includes(eq.id) ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>{eq.name_de}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Coaching Cues (eine pro Zeile)</Label>
        <Textarea value={coachingCues} onChange={e => setCoachingCues(e.target.value)}
          placeholder="Schulterblätter zusammen&#10;Kontrollierte Bewegung&#10;Volle Bewegungsamplitude"
          rows={4} />
      </div>
    </div>
  );
};

// ── AddExerciseDialog ────────────────────────────────────────────────────────

const AddExerciseDialog: React.FC<{
  open: boolean; onClose: () => void; onAdded: () => void; equipment: Equipment[];
}> = ({ open, onClose, onAdded, equipment }) => {
  const [nameDe, setNameDe] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [movementPattern, setMovementPattern] = useState('');
  const [exerciseType, setExerciseType] = useState('compound');
  const [difficulty, setDifficulty] = useState(3);
  const [coachingCues, setCoachingCues] = useState('');
  const [context, setContext] = useState<string[]>(['gym']);
  const [requiredEquipment, setRequiredEquipment] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNameDe(''); setName(''); setDescription(''); setMuscleGroups([]);
    setMovementPattern(''); setExerciseType('compound'); setDifficulty(3);
    setCoachingCues(''); setContext(['gym']); setRequiredEquipment([]);
  };

  const handleSave = async () => {
    if (!nameDe.trim() || muscleGroups.length === 0 || !movementPattern) {
      toast.error('Bitte Name (Deutsch), Bewegungsmuster und Muskelgruppen ausfüllen');
      return;
    }
    setSaving(true);
    try {
      const cues = coachingCues.split('\n').map(c => c.trim()).filter(Boolean);
      const { error } = await supabase.from('exercises').insert({
        name: name.trim() || nameDe.trim(),
        name_de: nameDe.trim(),
        description: description.trim() || null,
        muscle_groups: muscleGroups,
        movement_pattern: movementPattern,
        exercise_type: exerciseType,
        difficulty,
        coaching_cues: cues,
        context,
        required_equipment: requiredEquipment,
      });
      if (error) throw error;
      toast.success(`"${nameDe}" hinzugefügt`);
      onAdded(); onClose(); reset();
    } catch (err) {
      console.error(err);
      toast.error('Fehler beim Speichern');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Plus className="w-5 h-5" /> Neue Übung hinzufügen
          </DialogTitle>
        </DialogHeader>
        <ExerciseFormFields nameDe={nameDe} setNameDe={setNameDe} name={name} setName={setName}
          description={description} setDescription={setDescription}
          movementPattern={movementPattern} setMovementPattern={setMovementPattern}
          exerciseType={exerciseType} setExerciseType={setExerciseType}
          difficulty={difficulty} setDifficulty={setDifficulty}
          muscleGroups={muscleGroups} setMuscleGroups={setMuscleGroups}
          context={context} setContext={setContext}
          requiredEquipment={requiredEquipment} setRequiredEquipment={setRequiredEquipment}
          coachingCues={coachingCues} setCoachingCues={setCoachingCues}
          equipment={equipment} />
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={() => { onClose(); reset(); }} className="flex-1">Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── EditExerciseDialog ───────────────────────────────────────────────────────

const EditExerciseDialog: React.FC<{
  exercise: Exercise | null; open: boolean; onClose: () => void;
  onUpdated: () => void; equipment: Equipment[];
}> = ({ exercise, open, onClose, onUpdated, equipment }) => {
  const [nameDe, setNameDe] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [movementPattern, setMovementPattern] = useState('');
  const [exerciseType, setExerciseType] = useState('compound');
  const [difficulty, setDifficulty] = useState(3);
  const [coachingCues, setCoachingCues] = useState('');
  const [context, setContext] = useState<string[]>(['gym']);
  const [requiredEquipment, setRequiredEquipment] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    setNameDe(exercise.name_de || '');
    setName(exercise.name || '');
    // Auto-Beschreibung nicht ins Feld übernehmen – soll manuell befüllt werden
    const desc = exercise.description === AUTO_DESCRIPTION ? '' : (exercise.description || '');
    setDescription(desc);
    setMuscleGroups(exercise.muscle_groups || []);
    setMovementPattern(exercise.movement_pattern || '');
    setExerciseType(exercise.exercise_type || 'compound');
    setDifficulty(exercise.difficulty || 3);
    setCoachingCues((exercise.coaching_cues || []).join('\n'));
    setContext(exercise.context || ['gym']);
    setRequiredEquipment(exercise.required_equipment || []);
  }, [exercise]);

  const handleSave = async () => {
    if (!exercise || !nameDe.trim() || muscleGroups.length === 0 || !movementPattern) {
      toast.error('Bitte Name, Bewegungsmuster und Muskelgruppen ausfüllen');
      return;
    }
    setSaving(true);
    try {
      const cues = coachingCues.split('\n').map(c => c.trim()).filter(Boolean);
      const { error } = await supabase.from('exercises').update({
        name: name.trim() || nameDe.trim(),
        name_de: nameDe.trim(),
        description: description.trim() || null,
        muscle_groups: muscleGroups,
        movement_pattern: movementPattern,
        exercise_type: exerciseType,
        difficulty,
        coaching_cues: cues,
        context,
        required_equipment: requiredEquipment,
      }).eq('id', exercise.id);
      if (error) throw error;
      toast.success('Übung aktualisiert');
      onUpdated(); onClose();
    } catch (err) {
      console.error(err);
      toast.error('Fehler beim Speichern');
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
        <ExerciseFormFields nameDe={nameDe} setNameDe={setNameDe} name={name} setName={setName}
          description={description} setDescription={setDescription}
          movementPattern={movementPattern} setMovementPattern={setMovementPattern}
          exerciseType={exerciseType} setExerciseType={setExerciseType}
          difficulty={difficulty} setDifficulty={setDifficulty}
          muscleGroups={muscleGroups} setMuscleGroups={setMuscleGroups}
          context={context} setContext={setContext}
          requiredEquipment={requiredEquipment} setRequiredEquipment={setRequiredEquipment}
          coachingCues={coachingCues} setCoachingCues={setCoachingCues}
          equipment={equipment} />
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Änderungen speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const ExerciseLibrary: React.FC = () => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentMap, setEquipmentMap] = useState<Map<string, Equipment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPattern, setFilterPattern] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showMissingDescOnly, setShowMissingDescOnly] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editExercise, setEditExercise] = useState<Exercise | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: exData }, { data: eqData }] = await Promise.all([
      supabase.from('exercises').select('*').order('name_de'),
      supabase.from('equipment_catalog').select('*').order('name_de'),
    ]);
    setExercises(exData || []);
    const eqList = eqData || [];
    setEquipment(eqList);
    const map = new Map<string, Equipment>();
    eqList.forEach(eq => map.set(eq.id, eq));
    setEquipmentMap(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (exercise: Exercise) => {
    if (!window.confirm(`"${exercise.name_de}" wirklich löschen?`)) return;
    const { error } = await supabase.from('exercises').delete().eq('id', exercise.id);
    if (error) { toast.error('Fehler beim Löschen'); return; }
    toast.success(`"${exercise.name_de}" gelöscht`);
    load();
  };

  const missingDescCount = exercises.filter(
    ex => !ex.description || ex.description === AUTO_DESCRIPTION
  ).length;

  const filtered = exercises.filter(ex => {
    const q = search.toLowerCase();
    if (q && !ex.name_de.toLowerCase().includes(q) && !(ex.name || '').toLowerCase().includes(q)) return false;
    if (filterPattern !== 'all' && ex.movement_pattern !== filterPattern) return false;
    if (filterType !== 'all' && ex.exercise_type !== filterType) return false;
    if (showMissingDescOnly) {
      const hasReal = ex.description && ex.description !== AUTO_DESCRIPTION;
      if (hasReal) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold">Übungsdatenbank</h2>
          <p className="text-xs text-muted-foreground">
            {exercises.length} Übungen
            {missingDescCount > 0 && (
              <span className="ml-2 text-warning">· {missingDescCount} ohne Beschreibung</span>
            )}
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" /> Übung hinzufügen
        </Button>
      </div>

      {/* Hinweis: fehlende Beschreibungen */}
      {missingDescCount > 0 && (
        <div className="rounded-lg bg-warning/5 border border-warning/20 px-3 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-warning">{missingDescCount} Übung{missingDescCount !== 1 ? 'en' : ''}</span> {missingDescCount !== 1 ? 'haben' : 'hat'} noch keine Beschreibung.
            {missingDescCount > 3 ? ' Beim Plan-Import automatisch hinzugefügte Übungen müssen manuell ergänzt werden.' : ''}
          </p>
          {!showMissingDescOnly ? (
            <button onClick={() => setShowMissingDescOnly(true)} className="text-xs text-primary hover:underline flex-shrink-0">
              Nur diese anzeigen
            </button>
          ) : (
            <button onClick={() => setShowMissingDescOnly(false)} className="text-xs text-muted-foreground hover:underline flex-shrink-0">
              Alle anzeigen
            </button>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Übung suchen..." className="pl-9" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={filterPattern} onValueChange={setFilterPattern}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Bewegungsmuster" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Muster</SelectItem>
            {Object.entries(movementPatternLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {Object.entries(exerciseTypeLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Dumbbell className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Keine Übungen gefunden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ex => (
            <ExerciseCard key={ex.id} exercise={ex} equipment={equipmentMap}
              onEdit={() => setEditExercise(ex)} onDelete={() => handleDelete(ex)} />
          ))}
        </div>
      )}

      <AddExerciseDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} equipment={equipment} />
      <EditExerciseDialog exercise={editExercise} open={!!editExercise}
        onClose={() => setEditExercise(null)} onUpdated={load} equipment={equipment} />
    </div>
  );
};

export default ExerciseLibrary;
