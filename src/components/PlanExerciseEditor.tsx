/**
 * PlanExerciseEditor.tsx
 * Inline-Editor für Übungen im Trainingsplan.
 */

import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pencil, Trash2, Plus, Check, X, Loader2,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

interface PlanExercise {
  id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps_target: string | null;
  weight_target: string | null;
  rest_seconds: number | null;
  notes: string | null;
  alternative_name: string | null;
  order_in_workout: number;
  exercise_id?: string | null;
}

interface PlanExerciseEditorProps {
  exercises: PlanExercise[];
  workoutId: string;
  onUpdate: () => void;
  catalogExercises?: { id: string; name_de: string }[];
}

const EditableExerciseRow: React.FC<{
  exercise: PlanExercise;
  index: number;
  onSave: (exercise: PlanExercise) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  catalogExercises?: { id: string; name_de: string }[];
}> = ({ exercise, index, onSave, onDelete, onMoveUp, onMoveDown, isFirst, isLast, catalogExercises }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(String(exercise.sets || ''));
  const [reps, setReps] = useState(exercise.reps_target || '');
  const [weight, setWeight] = useState(exercise.weight_target || '');
  const [rest, setRest] = useState(String(exercise.rest_seconds || ''));
  const [notes, setNotes] = useState(exercise.notes || '');

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      ...exercise,
      name,
      sets: sets ? parseInt(sets) : null,
      reps_target: reps || null,
      weight_target: weight || null,
      rest_seconds: rest ? parseInt(rest) : null,
      notes: notes || null,
    });
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setName(exercise.name);
    setSets(String(exercise.sets || ''));
    setReps(exercise.reps_target || '');
    setWeight(exercise.weight_target || '');
    setRest(String(exercise.rest_seconds || ''));
    setNotes(exercise.notes || '');
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`"${exercise.name}" wirklich löschen?`)) return;
    setDeleting(true);
    await onDelete(exercise.id);
    setDeleting(false);
  };

  const formatRest = (seconds: number | null): string => {
    if (!seconds) return '—';
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
    }
    return `${seconds}s`;
  };

  if (editing) {
    return (
      <tr className="bg-primary/5 border-l-2 border-primary">
        <td className="px-2 py-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-8 text-sm"
            placeholder="Übungsname"
          />
        </td>
        <td className="px-2 py-2">
          <Input
            value={sets}
            onChange={e => setSets(e.target.value)}
            className="h-8 text-sm w-16 text-center"
            placeholder="3"
            type="number"
          />
        </td>
        <td className="px-2 py-2">
          <Input
            value={reps}
            onChange={e => setReps(e.target.value)}
            className="h-8 text-sm w-20 text-center"
            placeholder="8-12"
          />
        </td>
        <td className="px-2 py-2">
          <Input
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="h-8 text-sm w-24 text-center"
            placeholder="z.B. 60kg"
          />
        </td>
        <td className="px-2 py-2">
          <Select value={rest} onValueChange={setRest}>
            <SelectTrigger className="h-8 text-sm w-20">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="45">45s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
              <SelectItem value="90">90s</SelectItem>
              <SelectItem value="120">2 min</SelectItem>
              <SelectItem value="180">3 min</SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="px-2 py-2">
          <Input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="h-8 text-sm"
            placeholder="Hinweis..."
          />
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-500" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancel}>
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`group ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'} hover:bg-accent/30`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="opacity-0 group-hover:opacity-100 flex flex-col -my-1">
            <button onClick={onMoveUp} disabled={isFirst} className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground">
              <ChevronUp className="w-3 h-3" />
            </button>
            <button onClick={onMoveDown} disabled={isLast} className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground">
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <span className="font-medium text-sm">{exercise.name}</span>
        </div>
        {exercise.alternative_name && (
          <p className="text-xs text-blue-500 ml-6">⇄ {exercise.alternative_name}</p>
        )}
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-sm">{exercise.sets ?? '—'}</td>
      <td className="px-3 py-2 text-center tabular-nums text-sm">{exercise.reps_target || '—'}</td>
      <td className="px-3 py-2 text-center tabular-nums text-sm text-primary font-medium">{exercise.weight_target || '—'}</td>
      <td className="px-3 py-2 text-center text-muted-foreground text-xs">{formatRest(exercise.rest_seconds)}</td>
      <td className="px-3 py-2 text-muted-foreground text-xs max-w-[150px] truncate">{exercise.notes || ''}</td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
          </Button>
        </div>
      </td>
    </tr>
  );
};

const AddExerciseDialog: React.FC<{
  workoutId: string;
  nextOrder: number;
  onAdded: () => void;
  catalogExercises?: { id: string; name_de: string }[];
}> = ({ workoutId, nextOrder, onAdded, catalogExercises }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10-12');
  const [weight, setWeight] = useState('');
  const [rest, setRest] = useState('90');
  const [notes, setNotes] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) { toast.error('Übungsname erforderlich'); return; }
    setSaving(true);
    let exerciseId: string | null = null;
    if (catalogExercises) {
      const match = catalogExercises.find(e => e.name_de.toLowerCase() === name.toLowerCase());
      if (match) exerciseId = match.id;
    }
    const { error } = await supabase.from('plan_exercises').insert({
      workout_id: workoutId,
      name: name.trim(),
      sets: parseInt(sets) || 3,
      reps_target: reps || null,
      weight_target: weight || null,
      rest_seconds: parseInt(rest) || 90,
      notes: notes || null,
      order_in_workout: nextOrder,
      exercise_id: exerciseId,
    });
    if (error) {
      console.error(error);
      toast.error('Fehler beim Hinzufügen');
    } else {
      toast.success('Übung hinzugefügt');
      setName(''); setSets('3'); setReps('10-12'); setWeight(''); setRest('90'); setNotes('');
      setOpen(false);
      onAdded();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Übung hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Übung hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Übungsname</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="z.B. Bankdrücken"
              list="exercise-suggestions"
            />
            {catalogExercises && (
              <datalist id="exercise-suggestions">
                {catalogExercises.slice(0, 50).map(ex => (
                  <option key={ex.id} value={ex.name_de} />
                ))}
              </datalist>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Sätze</label>
              <Input value={sets} onChange={e => setSets(e.target.value)} type="number" placeholder="3" />
            </div>
            <div>
              <label className="text-sm font-medium">Wdh.</label>
              <Input value={reps} onChange={e => setReps(e.target.value)} placeholder="8-12" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Gewicht (optional)</label>
              <Input value={weight} onChange={e => setWeight(e.target.value)} placeholder="z.B. 60kg" />
            </div>
            <div>
              <label className="text-sm font-medium">Pause</label>
              <Select value={rest} onValueChange={setRest}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="45">45s</SelectItem>
                  <SelectItem value="60">60s</SelectItem>
                  <SelectItem value="90">90s</SelectItem>
                  <SelectItem value="120">2 min</SelectItem>
                  <SelectItem value="180">3 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Hinweis (optional)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="z.B. Langsam absenken" />
          </div>
          <Button onClick={handleAdd} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Hinzufügen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const PlanExerciseEditor: React.FC<PlanExerciseEditorProps> = ({
  exercises,
  workoutId,
  onUpdate,
  catalogExercises,
}) => {
  const sortedExercises = [...exercises].sort((a, b) => a.order_in_workout - b.order_in_workout);

  const handleSave = async (updated: PlanExercise) => {
    const { error } = await supabase.from('plan_exercises').update({
      name: updated.name,
      sets: updated.sets,
      reps_target: updated.reps_target,
      weight_target: updated.weight_target,
      rest_seconds: updated.rest_seconds,
      notes: updated.notes,
    }).eq('id', updated.id);
    if (error) {
      console.error(error);
      toast.error('Fehler beim Speichern');
    } else {
      toast.success('Gespeichert');
      onUpdate();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('plan_exercises').delete().eq('id', id);
    if (error) {
      console.error(error);
      toast.error('Fehler beim Löschen');
    } else {
      toast.success('Übung gelöscht');
      onUpdate();
    }
  };

  const handleMove = async (exerciseId: string, direction: 'up' | 'down') => {
    const idx = sortedExercises.findIndex(e => e.id === exerciseId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedExercises.length) return;
    const current = sortedExercises[idx];
    const swap = sortedExercises[swapIdx];
    await Promise.all([
      supabase.from('plan_exercises').update({ order_in_workout: swap.order_in_workout }).eq('id', current.id),
      supabase.from('plan_exercises').update({ order_in_workout: current.order_in_workout }).eq('id', swap.id),
    ]);
    onUpdate();
  };

  const nextOrder = sortedExercises.length > 0
    ? Math.max(...sortedExercises.map(e => e.order_in_workout)) + 1
    : 0;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Übung</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">Sätze</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Wdh.</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Gewicht</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Pause</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Hinweis</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {sortedExercises.map((exercise, index) => (
              <EditableExerciseRow
                key={exercise.id}
                exercise={exercise}
                index={index}
                onSave={handleSave}
                onDelete={handleDelete}
                onMoveUp={() => handleMove(exercise.id, 'up')}
                onMoveDown={() => handleMove(exercise.id, 'down')}
                isFirst={index === 0}
                isLast={index === sortedExercises.length - 1}
                catalogExercises={catalogExercises}
              />
            ))}
            {sortedExercises.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Keine Übungen. Füge die erste hinzu!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <AddExerciseDialog
          workoutId={workoutId}
          nextOrder={nextOrder}
          onAdded={onUpdate}
          catalogExercises={catalogExercises}
        />
      </div>
    </div>
  );
};

export default PlanExerciseEditor;
interface PlanExerciseEditorProps {
  exercises: PlanExercise[];
  workoutId: string;
  onUpdate: () => void;
  catalogExercises?: { id: string; name_de: string }[];
}

// Einzelne editierbare Zeile
const EditableExerciseRow: React.FC<{
  exercise: PlanExercise;
  index: number;
  onSave: (exercise: PlanExercise) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  catalogExercises?: { id: string; name_de: string }[];
}> = ({ exercise, index, onSave, onDelete, onMoveUp, onMoveDown, isFirst, isLast, catalogExercises }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Edit state
  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(String(exercise.sets || ''));
  const [reps, setReps] = useState(exercise.reps_target || '');
  const [rest, setRest] = useState(String(exercise.rest_seconds || ''));
  const [notes, setNotes] = useState(exercise.notes || '');

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      ...exercise,
      name,
      sets: sets ? parseInt(sets) : null,
      reps_target: reps || null,
      rest_seconds: rest ? parseInt(rest) : null,
      notes: notes || null,
    });
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setName(exercise.name);
    setSets(String(exercise.sets || ''));
    setReps(exercise.reps_target || '');
    setRest(String(exercise.rest_seconds || ''));
    setNotes(exercise.notes || '');
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`"${exercise.name}" wirklich löschen?`)) return;
    setDeleting(true);
    await onDelete(exercise.id);
    setDeleting(false);
  };

  const formatRest = (seconds: number | null): string => {
    if (!seconds) return '—';
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
    }
    return `${seconds}s`;
  };

  if (editing) {
    return (
      <tr className="bg-primary/5 border-l-2 border-primary">
        <td className="px-2 py-2">
          <Input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="h-8 text-sm"
            placeholder="Übungsname"
          />
        </td>
        <td className="px-2 py-2">
          <Input 
            value={sets} 
            onChange={e => setSets(e.target.value)} 
            className="h-8 text-sm w-16 text-center"
            placeholder="3"
            type="number"
          />
        </td>
        <td className="px-2 py-2">
          <Input 
            value={reps} 
            onChange={e => setReps(e.target.value)} 
            className="h-8 text-sm w-20 text-center"
            placeholder="8-12"
          />
        </td>
        <td className="px-2 py-2">
          <Select value={rest} onValueChange={setRest}>
            <SelectTrigger className="h-8 text-sm w-20">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="45">45s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
              <SelectItem value="90">90s</SelectItem>
              <SelectItem value="120">2 min</SelectItem>
              <SelectItem value="180">3 min</SelectItem>
            </SelectContent>
          </Select>
        </td>
        <td className="px-2 py-2">
          <Input 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            className="h-8 text-sm"
            placeholder="Hinweis..."
          />
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-green-500" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancel}>
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`group ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'} hover:bg-accent/30`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="opacity-0 group-hover:opacity-100 flex flex-col -my-1">
            <button 
              onClick={onMoveUp} 
              disabled={isFirst}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button 
              onClick={onMoveDown} 
              disabled={isLast}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <span className="font-medium text-sm">{exercise.name}</span>
        </div>
        {exercise.alternative_name && (
          <p className="text-xs text-blue-500 ml-6">⇄ {exercise.alternative_name}</p>
        )}
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-sm">{exercise.sets ?? '—'}</td>
      <td className="px-3 py-2 text-center tabular-nums text-sm">{exercise.reps_target || '—'}</td>
      <td className="px-3 py-2 text-center text-muted-foreground text-xs">{formatRest(exercise.rest_seconds)}</td>
      <td className="px-3 py-2 text-muted-foreground text-xs max-w-[150px] truncate">{exercise.notes || ''}</td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
          </Button>
        </div>
      </td>
    </tr>
  );
};

// Dialog zum Hinzufügen einer neuen Übung
const AddExerciseDialog: React.FC<{
  workoutId: string;
  nextOrder: number;
  onAdded: () => void;
  catalogExercises?: { id: string; name_de: string }[];
}> = ({ workoutId, nextOrder, onAdded, catalogExercises }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10-12');
  const [rest, setRest] = useState('90');
  const [notes, setNotes] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error('Übungsname erforderlich');
      return;
    }
    
    setSaving(true);
    
    // Prüfen ob Übung im Katalog existiert
    let exerciseId: string | null = null;
    if (catalogExercises) {
      const match = catalogExercises.find(e => 
        e.name_de.toLowerCase() === name.toLowerCase()
      );
      if (match) exerciseId = match.id;
    }
    
    const { error } = await supabase.from('plan_exercises').insert({
      workout_id: workoutId,
      name: name.trim(),
      sets: parseInt(sets) || 3,
      reps_target: reps || null,
      rest_seconds: parseInt(rest) || 90,
      notes: notes || null,
      order_in_workout: nextOrder,
      exercise_id: exerciseId,
    });
    
    if (error) {
      console.error(error);
      toast.error('Fehler beim Hinzufügen');
    } else {
      toast.success('Übung hinzugefügt');
      setName('');
      setSets('3');
      setReps('10-12');
      setRest('90');
      setNotes('');
      setOpen(false);
      onAdded();
    }
    
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Übung hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Übung hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Übungsname</label>
            <Input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="z.B. Bankdrücken"
              list="exercise-suggestions"
            />
            {catalogExercises && (
              <datalist id="exercise-suggestions">
                {catalogExercises.slice(0, 50).map(ex => (
                  <option key={ex.id} value={ex.name_de} />
                ))}
              </datalist>
            )}
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Sätze</label>
              <Input 
                value={sets} 
                onChange={e => setSets(e.target.value)} 
                type="number"
                placeholder="3"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Wdh.</label>
              <Input 
                value={reps} 
                onChange={e => setReps(e.target.value)} 
                placeholder="8-12"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Pause</label>
              <Select value={rest} onValueChange={setRest}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="45">45s</SelectItem>
                  <SelectItem value="60">60s</SelectItem>
                  <SelectItem value="90">90s</SelectItem>
                  <SelectItem value="120">2 min</SelectItem>
                  <SelectItem value="180">3 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium">Hinweis (optional)</label>
            <Input 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="z.B. Langsam absenken"
            />
          </div>
          
          <Button onClick={handleAdd} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Hinzufügen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Hauptkomponente
const PlanExerciseEditor: React.FC<PlanExerciseEditorProps> = ({ 
  exercises, 
  workoutId, 
  onUpdate,
  catalogExercises 
}) => {
  const sortedExercises = [...exercises].sort((a, b) => a.order_in_workout - b.order_in_workout);
  
  const handleSave = async (updated: PlanExercise) => {
    const { error } = await supabase.from('plan_exercises').update({
      name: updated.name,
      sets: updated.sets,
      reps_target: updated.reps_target,
      rest_seconds: updated.rest_seconds,
      notes: updated.notes,
    }).eq('id', updated.id);
    
    if (error) {
      console.error(error);
      toast.error('Fehler beim Speichern');
    } else {
      toast.success('Gespeichert');
      onUpdate();
    }
  };
  
  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('plan_exercises').delete().eq('id', id);
    
    if (error) {
      console.error(error);
      toast.error('Fehler beim Löschen');
    } else {
      toast.success('Übung gelöscht');
      onUpdate();
    }
  };
  
  const handleMove = async (exerciseId: string, direction: 'up' | 'down') => {
    const idx = sortedExercises.findIndex(e => e.id === exerciseId);
    if (idx === -1) return;
    
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sortedExercises.length) return;
    
    const current = sortedExercises[idx];
    const swap = sortedExercises[swapIdx];
    
    // Reihenfolge tauschen
    await Promise.all([
      supabase.from('plan_exercises').update({ order_in_workout: swap.order_in_workout }).eq('id', current.id),
      supabase.from('plan_exercises').update({ order_in_workout: current.order_in_workout }).eq('id', swap.id),
    ]);
    
    onUpdate();
  };
  
  const nextOrder = sortedExercises.length > 0 
    ? Math.max(...sortedExercises.map(e => e.order_in_workout)) + 1 
    : 0;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Übung</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">Sätze</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Wdh.</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Pause</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Hinweis</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {sortedExercises.map((exercise, index) => (
              <EditableExerciseRow
                key={exercise.id}
                exercise={exercise}
                index={index}
                onSave={handleSave}
                onDelete={handleDelete}
                onMoveUp={() => handleMove(exercise.id, 'up')}
                onMoveDown={() => handleMove(exercise.id, 'down')}
                isFirst={index === 0}
                isLast={index === sortedExercises.length - 1}
                catalogExercises={catalogExercises}
              />
            ))}
            {sortedExercises.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Keine Übungen. Füge die erste hinzu!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="flex justify-end">
        <AddExerciseDialog 
          workoutId={workoutId} 
          nextOrder={nextOrder} 
          onAdded={onUpdate}
          catalogExercises={catalogExercises}
        />
      </div>
    </div>
  );
};

export default PlanExerciseEditor;
