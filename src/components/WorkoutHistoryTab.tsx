/**
 * WorkoutHistoryTab.tsx – FIXED
 *
 * Fixes:
 * 1. set_logs per nested select geladen (ein Query statt zwei)
 * 2. Explizite Number()-Konvertierung in calcVolume
 * 3. Details-Ansicht korrekt
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Loader2, Trophy, ChevronDown, ChevronUp, Dumbbell, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SetLog {
  id: string;
  exercise_name: string;
  set_number: number;
  reps_done: number;
  weight_kg: number;
  is_pr: boolean;
  logged_at: string;
}

interface WorkoutLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  rating: number | null;
  energy_level: number | null;
  plan_workouts: { day_label: string } | null;
  set_logs: SetLog[];
}

interface PersonalRecord {
  exercise_name: string;
  weight_kg: number;
  reps: number;
  achieved_at: string;
}

interface WorkoutHistoryTabProps {
  clientId: string;
}

function calcVolume(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + (Number(s.weight_kg) || 0) * (Number(s.reps_done) || 0), 0);
}

function calcDuration(log: WorkoutLog): string {
  if (!log.completed_at) return '—';
  const mins = Math.round(
    (new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 60000
  );
  return `${mins} Min.`;
}

function groupSetsByExercise(sets: SetLog[]): Map<string, SetLog[]> {
  const map = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (!map.has(s.exercise_name)) map.set(s.exercise_name, []);
    map.get(s.exercise_name)!.push(s);
  }
  return map;
}

const RatingStars: React.FC<{ value: number | null; label: string }> = ({ value, label }) => {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star key={i} className={`w-3 h-3 ${i <= value ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`} />
        ))}
      </div>
    </div>
  );
};

const WorkoutLogCard: React.FC<{ log: WorkoutLog }> = ({ log }) => {
  const [open, setOpen] = useState(false);
  const sets = log.set_logs || [];
  const volume = calcVolume(sets);
  const duration = calcDuration(log);
  const prCount = sets.filter(s => s.is_pr).length;
  const exerciseGroups = groupSetsByExercise(sets);
  const workoutName = log.plan_workouts?.day_label || 'Freies Training';

  return (
    <Card className={prCount > 0 ? 'border-amber-200 bg-amber-50/30' : ''}>
      <CardContent className="p-0">
        <button onClick={() => setOpen(o => !o)} className="w-full p-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">{workoutName}</p>
                {prCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs gap-1">
                    <Trophy className="w-3 h-3" /> {prCount} PR{prCount > 1 ? 's' : ''}
                  </Badge>
                )}
                {!log.completed_at && (
                  <Badge variant="outline" className="text-muted-foreground text-xs">Abgebrochen</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(log.started_at), "EEEE, d. MMM · HH:mm", { locale: de })} Uhr
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <p className="text-xs font-medium tabular-nums">
                  {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
                </p>
                <p className="text-[10px] text-muted-foreground">Volumen</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium tabular-nums">{sets.length}</p>
                <p className="text-[10px] text-muted-foreground">Sätze</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium">{duration}</p>
                <p className="text-[10px] text-muted-foreground">Dauer</p>
              </div>
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
          {(log.rating || log.energy_level) && (
            <div className="flex gap-4 mt-2">
              <RatingStars value={log.rating} label="Workout" />
              <RatingStars value={log.energy_level} label="Energie" />
            </div>
          )}
        </button>

        {open && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
            {sets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Sätze aufgezeichnet.</p>
            ) : (
              [...exerciseGroups.entries()].map(([name, exSets]) => (
                <div key={name}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{name}</p>
                  <div className="space-y-1.5">
                    {exSets.map(set => (
                      <div key={set.id} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground text-xs w-14 flex-shrink-0">Satz {set.set_number}</span>
                        <span className="font-medium tabular-nums">{Number(set.weight_kg)}kg × {set.reps_done}</span>
                        <span className="text-xs text-muted-foreground">= {Math.round(Number(set.weight_kg) * set.reps_done)}kg</span>
                        {set.is_pr && <span className="text-xs text-amber-500 font-bold ml-auto">🏆 PR</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            {log.notes && (
              <p className="text-xs text-muted-foreground italic border-t border-border pt-2">{log.notes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const WorkoutHistoryTab: React.FC<WorkoutHistoryTabProps> = ({ clientId }) => {
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'history' | 'prs'>('history');

  const load = useCallback(async () => {
    setLoading(true);

    const { data: logsData, error } = await supabase
      .from('workout_logs')
      .select(`
        id, started_at, completed_at, notes, rating, energy_level,
        plan_workouts ( day_label ),
        set_logs ( id, exercise_name, set_number, reps_done, weight_kg, is_pr, logged_at )
      `)
      .eq('client_id', clientId)
      .order('started_at', { ascending: false })
      .limit(50);

    if (error) console.error('WorkoutHistoryTab:', error);

    const normalised: WorkoutLog[] = (logsData || []).map(log => ({
      ...log,
      plan_workouts: Array.isArray(log.plan_workouts) ? (log.plan_workouts[0] ?? null) : log.plan_workouts,
      set_logs: ((log.set_logs as SetLog[]) || [])
        .slice()
        .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()),
    }));

    setWorkoutLogs(normalised);

    const { data: prsData } = await supabase
      .from('personal_records')
      .select('exercise_name, weight_kg, reps, achieved_at')
      .eq('client_id', clientId)
      .order('exercise_name');

    setPersonalRecords(prsData || []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const completedLogs = workoutLogs.filter(l => l.completed_at);
  const totalVolume = completedLogs.reduce((sum, l) => sum + calcVolume(l.set_logs || []), 0);
  const totalSets = completedLogs.reduce((sum, l) => sum + (l.set_logs?.length || 0), 0);
  const lastWorkout = completedLogs[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { value: completedLogs.length, label: 'Workouts' },
          { value: totalSets, label: 'Sätze' },
          { value: totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(0)}t` : `${Math.round(totalVolume)}kg`, label: 'Volumen' },
          { value: `${personalRecords.length} 🏆`, label: 'PRs' },
        ].map(({ value, label }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-display font-bold">{value}</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {lastWorkout && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-muted-foreground">
            Letztes Workout:{' '}
            <span className="text-foreground font-medium">
              {formatDistanceToNow(new Date(lastWorkout.started_at), { locale: de, addSuffix: true })}
            </span>
            {lastWorkout.plan_workouts?.day_label && ` · ${lastWorkout.plan_workouts.day_label}`}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        {(['history', 'prs'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {v === 'history' ? 'Verlauf' : 'PR-Board 🏆'}
          </button>
        ))}
      </div>

      {view === 'history' && (
        workoutLogs.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <Dumbbell className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Noch keine Workouts geloggt.</p>
            <p className="text-xs text-muted-foreground">Sobald der Kunde über „Mein Plan" trainiert, erscheinen die Logs hier.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {workoutLogs.map(log => <WorkoutLogCard key={log.id} log={log} />)}
          </div>
        )
      )}

      {view === 'prs' && (
        personalRecords.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Noch keine Personal Records.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {personalRecords.map((pr, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{pr.exercise_name}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(pr.achieved_at), "d. MMM yyyy", { locale: de })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-display font-bold text-primary tabular-nums">
                      {Number(pr.weight_kg)}kg × {pr.reps}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Gewicht × Wdh.</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default WorkoutHistoryTab;  sets: SetLog[];
}

interface PersonalRecord {
  exercise_name: string;
  weight_kg: number;
  reps: number;
  achieved_at: string;
}

interface WorkoutHistoryTabProps {
  clientId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcVolume(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + (s.weight_kg || 0) * (s.reps_done || 0), 0);
}

function calcDuration(log: WorkoutLog): string {
  if (!log.completed_at) return '—';
  const mins = Math.round(
    (new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 60000
  );
  return `${mins} Min.`;
}

function groupSetsByExercise(sets: SetLog[]): Map<string, SetLog[]> {
  const map = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (!map.has(s.exercise_name)) map.set(s.exercise_name, []);
    map.get(s.exercise_name)!.push(s);
  }
  return map;
}

const RatingStars: React.FC<{ value: number | null; label: string }> = ({ value, label }) => {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-3 h-3 ${i <= value ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
          />
        ))}
      </div>
    </div>
  );
};

// ── Workout Log Card ──────────────────────────────────────────────────────────

const WorkoutLogCard: React.FC<{ log: WorkoutLog }> = ({ log }) => {
  const [open, setOpen] = useState(false);
  const volume = calcVolume(log.sets);
  const duration = calcDuration(log);
  const prCount = log.sets.filter(s => s.is_pr).length;
  const exerciseGroups = groupSetsByExercise(log.sets);
  const workoutName = log.plan_workouts?.day_label || 'Freies Training';

  return (
    <Card className={prCount > 0 ? 'border-amber-200 bg-amber-50/30' : ''}>
      <CardContent className="p-0">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full p-4 text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate">{workoutName}</p>
                {prCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs gap-1">
                    <Trophy className="w-3 h-3" /> {prCount} PR{prCount > 1 ? 's' : ''}
                  </Badge>
                )}
                {!log.completed_at && (
                  <Badge variant="outline" className="text-muted-foreground text-xs">Abgebrochen</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(log.started_at), "EEEE, d. MMM · HH:mm", { locale: de })} Uhr
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <p className="text-xs font-medium text-foreground tabular-nums">
                  {volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}
                </p>
                <p className="text-[10px] text-muted-foreground">Volumen</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-foreground">{duration}</p>
                <p className="text-[10px] text-muted-foreground">Dauer</p>
              </div>
              {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>

          {/* Rating/Energy */}
          {(log.rating || log.energy_level) && (
            <div className="flex gap-4 mt-2">
              <RatingStars value={log.rating} label="Workout" />
              <RatingStars value={log.energy_level} label="Energie" />
            </div>
          )}
        </button>

        {/* Aufgeklappte Detailansicht */}
        {open && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
            {[...exerciseGroups.entries()].map(([exerciseName, sets]) => (
              <div key={exerciseName}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {exerciseName}
                </p>
                <div className="space-y-1">
                  {sets.map((set, i) => (
                    <div key={set.id} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground text-xs w-12 flex-shrink-0">
                        Satz {set.set_number}
                      </span>
                      <span className="font-medium tabular-nums">
                        {set.weight_kg}kg × {set.reps_done}
                      </span>
                      {set.is_pr && (
                        <span className="text-xs text-amber-500 font-bold">PR 🏆</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {log.notes && (
              <p className="text-xs text-muted-foreground italic border-t border-border pt-2">
                {log.notes}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const WorkoutHistoryTab: React.FC<WorkoutHistoryTabProps> = ({ clientId }) => {
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'history' | 'prs'>('history');

  const load = useCallback(async () => {
    setLoading(true);

    // Workout-Logs mit Sätzen laden
    const { data: logsData } = await supabase
      .from('workout_logs')
      .select(`
        id, started_at, completed_at, notes, rating, energy_level, plan_workout_id,
        plan_workouts ( day_label )
      `)
      .eq('client_id', clientId)
      .order('started_at', { ascending: false })
      .limit(30);

    if (logsData && logsData.length > 0) {
      const logIds = logsData.map(l => l.id);
      const { data: setsData } = await supabase
        .from('set_logs')
        .select('*')
        .in('workout_log_id', logIds)
        .order('logged_at');

      const logsWithSets: WorkoutLog[] = logsData.map(log => ({
        ...log,
        plan_workouts: Array.isArray(log.plan_workouts) ? log.plan_workouts[0] : log.plan_workouts,
        sets: (setsData || []).filter(s => s.workout_log_id === log.id),
      }));
      setWorkoutLogs(logsWithSets);
    } else {
      setWorkoutLogs([]);
    }

    // Personal Records laden
    const { data: prsData } = await supabase
      .from('personal_records')
      .select('exercise_name, weight_kg, reps, achieved_at')
      .eq('client_id', clientId)
      .order('achieved_at', { ascending: false });

    setPersonalRecords(prsData || []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Zusammenfassungs-Stats ────────────────────────────────────────────────
  const completedLogs = workoutLogs.filter(l => l.completed_at);
  const totalVolume = completedLogs.reduce((sum, l) => sum + calcVolume(l.sets), 0);
  const totalSets = completedLogs.reduce((sum, l) => sum + l.sets.length, 0);
  const prCount = personalRecords.length;
  const lastWorkout = completedLogs[0];

  return (
    <div className="space-y-4">

      {/* Zusammenfassung */}
      <div className="grid grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold">{completedLogs.length}</p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Workouts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold">{totalSets}</p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Sätze</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold">
              {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(0)}t` : `${Math.round(totalVolume)}kg`}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Volumen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-display font-bold flex items-center justify-center gap-0.5">
              {prCount} <Trophy className="w-4 h-4 text-amber-400" />
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">PRs</p>
          </CardContent>
        </Card>
      </div>

      {/* Letztes Workout */}
      {lastWorkout && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-muted-foreground">
            Letztes Workout:{' '}
            <span className="text-foreground font-medium">
              {formatDistanceToNow(new Date(lastWorkout.started_at), { locale: de, addSuffix: true })}
            </span>
            {lastWorkout.plan_workouts?.day_label && ` · ${lastWorkout.plan_workouts.day_label}`}
          </span>
        </div>
      )}

      {/* Tab-Toggle: History / PRs */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('history')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'history' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          Verlauf
        </button>
        <button
          onClick={() => setView('prs')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'prs' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          PR-Board 🏆
        </button>
      </div>

      {/* Verlauf */}
      {view === 'history' && (
        <>
          {workoutLogs.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Dumbbell className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">Noch keine Workouts geloggt.</p>
              <p className="text-xs text-muted-foreground">Sobald der Kunde über "Mein Plan" trainiert, erscheinen die Logs hier.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {workoutLogs.map(log => (
                <WorkoutLogCard key={log.id} log={log} />
              ))}
            </div>
          )}
        </>
      )}

      {/* PR-Board */}
      {view === 'prs' && (
        <>
          {personalRecords.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">Noch keine Personal Records.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {personalRecords.map((pr, i) => (
                <Card key={i}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{pr.exercise_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(pr.achieved_at), "d. MMM yyyy", { locale: de })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-display font-bold text-primary tabular-nums">
                        {pr.weight_kg}kg × {pr.reps}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Gewicht × Wdh.</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WorkoutHistoryTab;
