/**
 * WorkoutHistoryTab.tsx
 *
 * Coach-seitiger Tab: Workout-Verlauf, PR-Board, Volumen-Chart,
 * Adherence, KI-Briefing, Coach-Feedback (Phase 5A).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Loader2, Trophy, ChevronDown, ChevronUp,
  Dumbbell, Star, MessageSquare, Send, Check,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import VolumeChart from '@/components/VolumeChart';
import ClaudeBriefing from '@/components/ClaudeBriefing';
import AdherenceWidget from '@/components/AdherenceWidget';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SetLog {
  id: string;
  exercise_name: string;
  set_number: number;
  reps_done: number;
  weight_kg: number;
  is_pr: boolean;
  logged_at: string;
}

interface WorkoutFeedback {
  id: string;
  message: string;
  created_at: string;
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
  feedback?: WorkoutFeedback | null;
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

interface WeeklyCheckin {
  id: string;
  week_start: string;
  energy_level: number;
  sleep_quality: number;
  mood: number;
  notes: string | null;
  created_at: string;
}

type ActiveTab = 'history' | 'chart' | 'prs' | 'adherence' | 'checkins' | 'briefing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcVolume(sets: SetLog[]): number {
  return sets.reduce(
    (sum, s) => sum + (Number(s.weight_kg) || 0) * (Number(s.reps_done) || 0),
    0
  );
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

const WorkoutLogCard: React.FC<{
  log: WorkoutLog;
  trainerId: string;
  onFeedbackSaved: (logId: string, feedback: WorkoutFeedback) => void;
}> = ({ log, trainerId, onFeedbackSaved }) => {
  const [open, setOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  const sets = log.set_logs || [];
  const volume = calcVolume(sets);
  const duration = calcDuration(log);
  const prCount = sets.filter(s => s.is_pr).length;
  const exerciseGroups = groupSetsByExercise(sets);
  const workoutName = log.plan_workouts?.day_label || 'Freies Training';

  const handleSaveFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSavingFeedback(true);

    // Bestehendes Feedback ersetzen falls vorhanden
    if (log.feedback?.id) {
      await supabase.from('workout_feedback').delete().eq('id', log.feedback.id);
    }

    const { data, error } = await supabase
      .from('workout_feedback')
      .insert({
        workout_log_id: log.id,
        trainer_id: trainerId,
        message: feedbackText.trim(),
      })
      .select()
      .single();

    if (error) {
      toast.error('Feedback konnte nicht gespeichert werden.');
    } else if (data) {
      onFeedbackSaved(log.id, data);
      setFeedbackText('');
      setShowFeedbackInput(false);
      toast.success('Feedback gespeichert ✓');
    }
    setSavingFeedback(false);
  };

  return (
    <Card className={prCount > 0 ? 'border-amber-200 bg-amber-50/30' : ''}>
      <CardContent className="p-0">
        {/* Header */}
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
                {log.feedback && (
                  <Badge variant="outline" className="text-primary border-primary/30 text-xs gap-1">
                    <MessageSquare className="w-3 h-3" /> Feedback
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
              {open
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
          {(log.rating || log.energy_level) && (
            <div className="flex gap-4 mt-2">
              <RatingStars value={log.rating} label="Workout" />
              <RatingStars value={log.energy_level} label="Energie" />
            </div>
          )}
        </button>

        {/* Details */}
        {open && (
          <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
            {/* Sätze */}
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
                        <span className="text-xs text-muted-foreground">
                          = {Math.round(Number(set.weight_kg) * set.reps_done)}kg
                        </span>
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

            {/* ── Coach-Feedback ── */}
            {log.completed_at && (
              <div className="border-t border-border pt-3 space-y-2">
                {log.feedback ? (
                  <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-primary flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Dein Feedback
                      </p>
                      <button
                        onClick={() => {
                          setFeedbackText(log.feedback!.message);
                          setShowFeedbackInput(true);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Bearbeiten
                      </button>
                    </div>
                    <p className="text-sm text-foreground">{log.feedback.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(log.feedback.created_at), { locale: de, addSuffix: true })}
                    </p>
                  </div>
                ) : !showFeedbackInput ? (
                  <button
                    onClick={() => setShowFeedbackInput(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Feedback hinterlassen
                  </button>
                ) : null}

                {showFeedbackInput && (
                  <div className="space-y-2">
                    <Textarea
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      placeholder="Super Progression beim Bankdrücken! Nächste Woche 2.5kg mehr versuchen..."
                      rows={3}
                      className="text-sm"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveFeedback}
                        disabled={savingFeedback || !feedbackText.trim()}
                        className="gap-1.5"
                      >
                        {savingFeedback
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />}
                        Senden
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowFeedbackInput(false); setFeedbackText(''); }}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────

const WorkoutHistoryTab: React.FC<WorkoutHistoryTabProps> = ({ clientId }) => {
  const { user } = useAuth();
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [checkins, setCheckins] = useState<WeeklyCheckin[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [clientName, setClientName] = useState('');
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('history');

  const load = useCallback(async () => {
    setLoading(true);

    // Workout-Logs
    const { data: logsData } = await supabase
      .from('workout_logs')
      .select('id, started_at, completed_at, notes, rating, energy_level, plan_workout_id, plan_workouts ( day_label )')
      .eq('client_id', clientId)
      .order('started_at', { ascending: false })
      .limit(50);

    const logIds = (logsData || []).map(l => l.id);

    // Set-Logs + Feedback parallel laden
    const [setsRes, feedbackRes] = await Promise.all([
      logIds.length > 0
        ? supabase.from('set_logs').select('*').in('workout_log_id', logIds)
        : { data: [] },
      logIds.length > 0
        ? supabase.from('workout_feedback').select('*').in('workout_log_id', logIds)
        : { data: [] },
    ]);

    const normalised: WorkoutLog[] = (logsData || []).map(log => ({
      ...log,
      plan_workouts: Array.isArray(log.plan_workouts)
        ? (log.plan_workouts[0] ?? null)
        : log.plan_workouts,
      set_logs: ((setsRes.data || []) as SetLog[])
        .filter(s => s.workout_log_id === log.id)
        .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()),
      feedback: (feedbackRes.data || []).find(f => f.workout_log_id === log.id) ?? null,
    }));

    setWorkoutLogs(normalised);

    // PRs
    const { data: prsData } = await supabase
      .from('personal_records')
      .select('exercise_name, weight_kg, reps, achieved_at')
      .eq('client_id', clientId)
      .order('exercise_name');
    setPersonalRecords(prsData || []);

    // Erstgespräch
    const { data: convData } = await supabase
      .from('onboarding_conversations')
      .select('motivation, fitness_goal_text, stress_level, sleep_quality, current_training, personality_type, goal_importance, success_criteria')
      .eq('client_id', clientId)
      .order('conversation_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    setConversation(convData || null);

    // Kundenname
    const { data: clientData } = await supabase
      .from('clients')
      .select('full_name')
      .eq('id', clientId)
      .single();
    setClientName(clientData?.full_name || '');

    // sessions_per_week aus aktivem Plan
    const { data: planData } = await supabase
      .from('training_plans')
      .select('sessions_per_week')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle();
    setSessionsPerWeek(planData?.sessions_per_week || 3);

    // Wöchentliche Check-ins
    const { data: checkinData } = await supabase
      .from('weekly_checkins')
      .select('*')
      .eq('client_id', clientId)
      .order('week_start', { ascending: false })
      .limit(12);
    setCheckins(checkinData || []);

    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // Feedback lokal updaten ohne reload
  const handleFeedbackSaved = (logId: string, feedback: WorkoutFeedback) => {
    setWorkoutLogs(prev => prev.map(log =>
      log.id === logId ? { ...log, feedback } : log
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completedLogs = workoutLogs.filter(l => l.completed_at);
  const totalVolume = completedLogs.reduce((sum, l) => sum + calcVolume(l.set_logs || []), 0);
  const totalSets = completedLogs.reduce((sum, l) => sum + (l.set_logs?.length || 0), 0);
  const lastWorkout = completedLogs[0];

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'history', label: 'Verlauf' },
    { id: 'chart', label: 'Progression 📈' },
    { id: 'prs', label: `PRs${personalRecords.length > 0 ? ' 🏆' : ''}` },
    { id: 'adherence', label: 'Adherence' },
    { id: 'checkins', label: `Check-ins${checkins.length > 0 ? ` (${checkins.length})` : ''}` },
    { id: 'briefing', label: 'KI-Briefing ✨' },
  ];

  return (
    <div className="space-y-4">

      {/* Zusammenfassung */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { value: completedLogs.length, label: 'Workouts' },
          { value: totalSets, label: 'Sätze' },
          {
            value: totalVolume >= 1000
              ? `${(totalVolume / 1000).toFixed(0)}t`
              : `${Math.round(totalVolume)}kg`,
            label: 'Volumen',
          },
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

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap px-2 ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── VERLAUF ── */}
      {activeTab === 'history' && (
        workoutLogs.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <Dumbbell className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Noch keine Workouts geloggt.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {workoutLogs.map(log => (
              <WorkoutLogCard
                key={log.id}
                log={log}
                trainerId={user?.id || ''}
                onFeedbackSaved={handleFeedbackSaved}
              />
            ))}
          </div>
        )
      )}

      {/* ── PROGRESSION ── */}
      {activeTab === 'chart' && (
        completedLogs.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-muted-foreground">Noch keine abgeschlossenen Workouts.</p>
          </div>
        ) : (
          <VolumeChart workoutLogs={completedLogs} />
        )
      )}

      {/* ── PR-BOARD ── */}
      {activeTab === 'prs' && (
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
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(pr.achieved_at), "d. MMM yyyy", { locale: de })}
                    </p>
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

      {/* ── ADHERENCE ── */}
      {activeTab === 'adherence' && (
        <AdherenceWidget
          workoutLogs={workoutLogs}
          targetPerWeek={sessionsPerWeek}
        />
      )}

      {/* ── CHECK-INS ── */}
      {activeTab === 'checkins' && (
        checkins.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <p className="text-2xl">📋</p>
            <p className="text-sm text-muted-foreground">Noch keine Check-ins vorhanden.</p>
            <p className="text-xs text-muted-foreground">Erscheint automatisch wenn der Kunde die App wöchentlich öffnet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Trend-Übersicht */}
            {checkins.length >= 2 && (() => {
              const last = checkins[0];
              const prev = checkins[1];
              const energyDiff = last.energy_level - prev.energy_level;
              const moodDiff = last.mood - prev.mood;
              return (
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex gap-4 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Energie</p>
                    <p className={`font-bold ${energyDiff > 0 ? 'text-primary' : energyDiff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {energyDiff > 0 ? `↑ +${energyDiff}` : energyDiff < 0 ? `↓ ${energyDiff}` : '→ 0'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Stimmung</p>
                    <p className={`font-bold ${moodDiff > 0 ? 'text-primary' : moodDiff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {moodDiff > 0 ? `↑ +${moodDiff}` : moodDiff < 0 ? `↓ ${moodDiff}` : '→ 0'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Schlaf</p>
                    <p className={`font-bold ${(last.sleep_quality - prev.sleep_quality) > 0 ? 'text-primary' : (last.sleep_quality - prev.sleep_quality) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {(last.sleep_quality - prev.sleep_quality) > 0 ? `↑ +${last.sleep_quality - prev.sleep_quality}` : (last.sleep_quality - prev.sleep_quality) < 0 ? `↓ ${last.sleep_quality - prev.sleep_quality}` : '→ 0'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground self-center ml-auto">vs. Vorwoche</p>
                </div>
              );
            })()}

            {/* Check-in Karten */}
            {checkins.map(checkin => {
              const EMOJIS = { 1: '😔', 2: '😕', 3: '😐', 4: '😊', 5: '😄' } as Record<number, string>;
              const ENERGY = { 1: '😴', 2: '😐', 3: '🙂', 4: '😊', 5: '🔥' } as Record<number, string>;
              const SLEEP  = { 1: '😩', 2: '😪', 3: '😌', 4: '😴', 5: '⭐' } as Record<number, string>;
              return (
                <Card key={checkin.id}>
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      KW {format(new Date(checkin.week_start), 'w', { locale: de })} · {format(new Date(checkin.week_start), 'd. MMM yyyy', { locale: de })}
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="rounded-xl bg-muted/30 py-2 px-1">
                        <p className="text-xl">{ENERGY[checkin.energy_level]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Energie</p>
                        <p className="text-sm font-bold">{checkin.energy_level}/5</p>
                      </div>
                      <div className="rounded-xl bg-muted/30 py-2 px-1">
                        <p className="text-xl">{SLEEP[checkin.sleep_quality]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Schlaf</p>
                        <p className="text-sm font-bold">{checkin.sleep_quality}/5</p>
                      </div>
                      <div className="rounded-xl bg-muted/30 py-2 px-1">
                        <p className="text-xl">{EMOJIS[checkin.mood]}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Stimmung</p>
                        <p className="text-sm font-bold">{checkin.mood}/5</p>
                      </div>
                    </div>
                    {checkin.notes && (
                      <p className="text-sm text-muted-foreground mt-3 italic border-t border-border pt-2">
                        „{checkin.notes}"
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* ── KI-BRIEFING ── */}
      {activeTab === 'briefing' && (
        <ClaudeBriefing
  clientId={clientId}              // ← NEU
  clientName={client.full_name}
  workoutLogs={workoutLogs}
  personalRecords={personalRecords}
  conversation={conversation}
  recentCheckins={recentCheckins}
  pinnedNote={client?.pinned_note} // ← NEU
/>
      )}
    </div>
  );
};

export default WorkoutHistoryTab;
