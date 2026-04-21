/**
 * ExerciseLibrary.tsx
 *
 * Globale Übungsdatenbank für Coaches.
 * - Übungen durchsuchen und filtern
 * - Neue Übungen hinzufügen
 * - Übungsdetails mit Coaching-Cues anzeigen
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Search, Plus, Dumbbell, ChevronDown, ChevronUp,
  Target, Zap, Info, X, Filter
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
  description?: string;
  description_de?: string;
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
  rotation: 'Rotation',
  core: 'Core',
  isolation: 'Isolation',
};

const exerciseTypeLabels: Record<string, string> = {
  compound: 'Mehrgelenkig',
  isolation: 'Eingelenkig',
  accessory: 'Assistenz',
  cardio: 'Cardio',
  mobility: 'Mobilität',
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

// ── ExerciseCard ─────────────────────────────────────────────────────────────

const ExerciseCard: React.FC<{
  exercise: Exercise;
  equipment: Map<string, Equipment>;
  onEdit?: () => void;
}> = ({ exercise, equipment, onEdit }) => {
  const [expanded, setExpanded] = useState(false);

  const requiredEquipmentNames = exercise.required_equipment
    .map(id => equipment.get(id)?.name_de || id)
    .filter(Boolean);

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
              <Badge variant="outline" className="text-[10px]">
                {exerciseTypeLabels[exercise.exercise_type] || exercise.exercise_type}
              </Badge>
              {!exercise.description_de && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  Keine Beschreibung
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{exercise.name}</p>
            {exercise.description_de && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{exercise.description_de}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {exercise.muscle_groups.slice(0, 3).map(mg => (
                <span key={mg} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {muscleGroupLabels[mg] || mg}
                </span>
              ))}
              {exercise.muscle_groups.length > 3 && (
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
                    className={`w-1.5 h-1.5 rounded-full ${
                      level <= exercise.difficulty ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
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
          {/* Description */}
          {exercise.description_de && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Beschreibung
              </p>
              <p className="text-sm text-foreground">{exercise.description_de}</p>
            </div>
          )}

          {/* Equipment */}
          {requiredEquipmentNames.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Benötigtes Equipment
              </p>
              <div className="flex flex-wrap gap-1">
                {requiredEquipmentNames.map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Coaching Cues */}
          {exercise.coaching_cues && exercise.coaching_cues.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Coaching Cues
              </p>
              <ul className="space-y-1">
                {exercise.coaching_cues.map((cue, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {cue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Context */}
          {exercise.context && exercise.context.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Kontext
              </p>
              <div className="flex flex-wrap gap-1">
                {exercise.context.map(ctx => (
                  <Badge key={ctx} variant="outline" className="text-xs">
                    {contextLabels[ctx] || ctx}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* All Muscle Groups */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Muskelgruppen
            </p>
            <div className="flex flex-wrap gap-1">
              {exercise.muscle_groups.map(mg => (
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

// ── AddExerciseDialog ────────────────────────────────────────────────────────

interface AddExerciseDialogProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  equipment: Equipment[];
}

const AddExerciseDialog: React.FC<AddExerciseDialogProps> = ({ open, onClose, onAdded, equipment }) => {
  const [name, setName] = useState('');
  const [nameDe, setNameDe] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionDe, setDescriptionDe] = useState('');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [movementPattern, setMovementPattern] = useState('');
  const [exerciseType, setExerciseType] = useState('compound');
  const [difficulty, setDifficulty] = useState(3);
  const [coachingCues, setCoachingCues] = useState('');
  const [context, setContext] = useState<string[]>(['gym']);
  const [requiredEquipment, setRequiredEquipment] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Generate URL-friendly slug from exercise name
  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')          // Spaces to hyphens
      .replace(/-+/g, '-')           // Remove duplicate hyphens
      .replace(/^-|-$/g, '');        // Trim hyphens
  };

  const handleSave = async () => {
    if (!name.trim() || !nameDe.trim() || muscleGroups.length === 0 || !movementPattern) {
      toast.error('Bitte fülle alle Pflichtfelder aus');
      return;
    }

    setSaving(true);
    try {
      const cuesArray = coachingCues
        .split('\n')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      const slug = generateSlug(name);

      const { error } = await supabase.from('exercises').insert({
        name: name.trim(),
        name_de: nameDe.trim(),
        description: description.trim() || null,
        description_de: descriptionDe.trim() || null,
        exercise_slug: slug,
        muscle_groups: muscleGroups,
        movement_pattern: movementPattern,
        exercise_type: exerciseType,
        difficulty,
        coaching_cues: cuesArray,
        context,
        required_equipment: requiredEquipment,
      });

      if (error) throw error;

      toast.success(`"${nameDe}" hinzugefügt`);
      onAdded();
      onClose();

      // Reset
      setName('');
      setNameDe('');
      setDescription('');
      setDescriptionDe('');
      setMuscleGroups([]);
      setMovementPattern('');
      setExerciseType('compound');
      setDifficulty(3);
      setCoachingCues('');
      setContext(['gym']);
      setRequiredEquipment([]);
    } catch (err) {
      console.error(err);
      toast.error('Fehler beim Speichern');
    }
    setSaving(false);
  };

  const toggleMuscleGroup = (mg: string) => {
    setMuscleGroups(prev => 
      prev.includes(mg) ? prev.filter(m => m !== mg) : [...prev, mg]
    );
  };

  const toggleContext = (ctx: string) => {
    setContext(prev =>
      prev.includes(ctx) ? prev.filter(c => c !== ctx) : [...prev, ctx]
    );
  };

  const toggleEquipment = (eqId: string) => {
    setRequiredEquipment(prev =>
      prev.includes(eqId) ? prev.filter(e => e !== eqId) : [...prev, eqId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Neue Übung hinzufügen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Names */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Name (Deutsch) *</Label>
              <Input
                value={nameDe}
                onChange={e => setNameDe(e.target.value)}
                placeholder="z.B. Bankdrücken"
              />
            </div>
            <div>
              <Label>Name (Englisch) *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="z.B. Bench Press"
              />
            </div>
          </div>

          {/* Descriptions */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Beschreibung (Deutsch)</Label>
              <Textarea
                value={descriptionDe}
                onChange={e => setDescriptionDe(e.target.value)}
                placeholder="Kurze Beschreibung der Übung..."
                rows={3}
              />
            </div>
            <div>
              <Label>Beschreibung (Englisch)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Short exercise description..."
                rows={3}
              />
            </div>
          </div>

          {/* Movement Pattern & Type */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Bewegungsmuster *</Label>
              <Select value={movementPattern} onValueChange={setMovementPattern}>
                <SelectTrigger>
                  <SelectValue placeholder="Auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(movementPatternLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Übungstyp</Label>
              <Select value={exerciseType} onValueChange={setExerciseType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(exerciseTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <Label>Schwierigkeit: {difficultyLabels[difficulty]}</Label>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4, 5].map(level => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`w-8 h-8 rounded-lg border transition-colors ${
                    level <= difficulty
                      ? 'bg-primary border-primary text-white'
                      : 'bg-muted border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Muscle Groups */}
          <div>
            <Label>Muskelgruppen * (mind. 1 auswählen)</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(muscleGroupLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleMuscleGroup(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    muscleGroups.includes(key)
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Context */}
          <div>
            <Label>Kontext</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(contextLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => toggleContext(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    context.includes(key)
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Required Equipment */}
          <div>
            <Label>Benötigtes Equipment</Label>
            <div className="flex flex-wrap gap-1.5 mt-2 max-h-32 overflow-y-auto">
              {equipment.map(eq => (
                <button
                  key={eq.id}
                  onClick={() => toggleEquipment(eq.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    requiredEquipment.includes(eq.id)
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {eq.name_de}
                </button>
              ))}
            </div>
          </div>

          {/* Coaching Cues */}
          <div>
            <Label>Coaching Cues (eine pro Zeile)</Label>
            <Textarea
              value={coachingCues}
              onChange={e => setCoachingCues(e.target.value)}
              placeholder="Schulterblätter zusammen&#10;Kontrollierte Bewegung&#10;Volle Bewegungsamplitude"
              rows={4}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Übung speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

const ExerciseLibrary: React.FC = () => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentMap, setEquipmentMap] = useState<Map<string, Equipment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPattern, setFilterPattern] = useState<string | null>(null);
  const [filterMuscle, setFilterMuscle] = useState<string | null>(null);
  const [filterNoDescription, setFilterNoDescription] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ── Load Data ──────────────────────────────────────────────────────────────

  const loadExercises = async () => {
    setLoading(true);

    const { data: exercisesData } = await supabase
      .from('exercises')
      .select('*')
      .order('name_de');

    const { data: equipmentData } = await supabase
      .from('equipment_catalog')
      .select('*')
      .order('sort_order');

    if (exercisesData) setExercises(exercisesData);
    if (equipmentData) {
      setEquipment(equipmentData);
      const map = new Map<string, Equipment>();
      equipmentData.forEach(eq => map.set(eq.id, eq));
      setEquipmentMap(map);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadExercises();
  }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filteredExercises = exercises.filter(ex => {
    const matchesSearch = search === '' ||
      ex.name_de.toLowerCase().includes(search.toLowerCase()) ||
      ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesPattern = !filterPattern || ex.movement_pattern === filterPattern;
    const matchesMuscle = !filterMuscle || ex.muscle_groups.includes(filterMuscle);
    const matchesNoDescription = !filterNoDescription || !ex.description_de;
    return matchesSearch && matchesPattern && matchesMuscle && matchesNoDescription;
  });

  const patterns = [...new Set(exercises.map(e => e.movement_pattern))];
  const muscles = [...new Set(exercises.flatMap(e => e.muscle_groups))];
  const exercisesWithoutDescription = exercises.filter(e => !e.description_de).length;

  // ── Render ─────────────────────────────────────────────────────────────────

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
          <p className="text-sm text-muted-foreground">
            {exercises.length} Übungen
            {exercisesWithoutDescription > 0 && (
              <span className="text-amber-600 ml-2">
                ({exercisesWithoutDescription} ohne Beschreibung)
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Übung hinzufügen
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
          {/* Pattern Filter */}
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

          {/* Muscle Filter */}
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

          {/* No Description Filter */}
          {exercisesWithoutDescription > 0 && (
            <Button
              variant={filterNoDescription ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterNoDescription(!filterNoDescription)}
              className="gap-1.5"
            >
              <Filter className="w-3 h-3" />
              Ohne Beschreibung ({exercisesWithoutDescription})
            </Button>
          )}

          {(filterPattern || filterMuscle || filterNoDescription) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { 
                setFilterPattern(null); 
                setFilterMuscle(null); 
                setFilterNoDescription(false);
              }}
              className="text-muted-foreground"
            >
              <X className="w-3 h-3 mr-1" /> Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {/* Exercise List */}
      <div className="space-y-2">
        {filteredExercises.map(ex => (
          <ExerciseCard key={ex.id} exercise={ex} equipment={equipmentMap} />
        ))}
      </div>

      {filteredExercises.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Dumbbell className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Keine Übungen gefunden.</p>
        </div>
      )}

      {/* Add Dialog */}
      <AddExerciseDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={loadExercises}
        equipment={equipment}
      />
    </div>
  );
};

export default ExerciseLibrary;
