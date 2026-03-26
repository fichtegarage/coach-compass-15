import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, MapPin, List, LayoutGrid, Copy, Check, Users, Dumbbell } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import WorkoutLogger from '@/components/WorkoutLogger';
import WorkoutSummaryView from '@/components/WorkoutSummaryView';

const sessionTypes = ['Präsenz-Training', 'Online-Training', 'Telefonat', 'Check-In Call', 'Kostenloses Erstgespräch', 'Duo Training'];
const sessionStatuses = ['Scheduled', 'Completed', 'No-Show', 'Cancelled by Client', 'Cancelled by Trainer'];
const locations = ['Gym', 'Outdoor'];

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Präsenz-Training',
  'Online Training': 'Online-Training',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In Call',
  'Free Intro': 'Kostenloses Erstgespräch',
  'Duo Training': 'Duo Training',
};

const statusLabels: Record<string, string> = {
  'Scheduled': 'Geplant',
  'Completed': 'Abgeschlossen',
  'No-Show': 'Nicht erschienen',
  'Cancelled by Client': 'Vom Kunden abgesagt',
  'Cancelled by Trainer': 'Vom Trainer abgesagt',
};

const sessionTypeToDb: Record<string, string> = {
  'Präsenz-Training': 'In-Person Training',
  'Online-Training': 'Online Training',
  'Telefonat': 'Phone Call',
  'Check-In Call': 'Check-In Call',
  'Kostenloses Erstgespräch': 'Free Intro',
  'Duo Training': 'Duo Training',
};

interface WorkoutSummary {
  duration: number;
  totalSets: number;
  totalVolume: number;
  prs: string[];
}

const SessionsPage: React.FC = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Phase 3: Session-Begleiter ────────────────────────────────────────────
  const [planWorkouts, setPlanWorkouts] = useState<any[]>([]);
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false);
  const [activeLoggerWorkout, setActiveLoggerWorkout] = useState<any | null>(null);
  const [activeLoggerSessionId, setActiveLoggerSessionId] = useState<string | null>(null);
  const [activeLoggerClientId, setActiveLoggerClientId] = useState<string | null>(null);
  const [completedSummary, setCompletedSummary] = useState<WorkoutSummary | null>(null);

  const [form, setForm] = useState({
    client_id: '', second_client_id: '', package_id: '',
    session_date: new Date().toISOString().slice(0, 16),
    duration_minutes: '60', session_type: 'Präsenz-Training',
    status: 'Completed', notes: '', late_cancellation: false, location: 'Gym',
  });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, currentMonth]);

  useEffect(() => {
    if (!selectedSession) { setEditForm(null); return; }
    setEditForm({
      status: selectedSession.status,
      session_date: selectedSession.session_date ? format(new Date(selectedSession.session_date), "yyyy-MM-dd'T'HH:mm") : '',
      duration_minutes: String(selectedSession.duration_minutes || 60),
      session_type: sessionTypeLabels[selectedSession.session_type] || selectedSession.session_type,
      location: selectedSession.location || 'Gym',
      notes: selectedSession.notes || '',
      late_cancellation: selectedSession.late_cancellation || false,
      second_client_id: selectedSession.second_client_id || '',
    });
  }, [selectedSession]);

  const loadData = async () => {
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    const [sRes, cRes, pRes] = await Promise.all([
      supabase.from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name), second_client:clients!sessions_second_client_id_fkey(full_name)')
        .gte('session_date', monthStart)
        .lte('session_date', monthEnd + 'T23:59:59')
        .order('session_date'),
      supabase.from('clients').select('id, full_name').eq('status', 'Active').order('full_name'),
      supabase.from('packages').select('id, client_id, package_name, sessions_included, start_date, end_date'),
    ]);
    setSessions(sRes.data || []);
    setClients(cRes.data || []);
    setPackages(pRes.data || []);
    setLoading(false);
  };

  // ── Phase 3: Plan-Workouts des Kunden laden ───────────────────────────────
  const loadPlanWorkouts = async (clientId: string) => {
    const { data: planData } = await supabase
      .from('training_plans')
      .select('id')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle();

    if (!planData) {
      toast.error('Kein aktiver Trainingsplan für diesen Kunden.');
      return;
    }

    const { data: workoutsData } = await supabase
      .from('plan_workouts')
      .select('*, plan_exercises(*)')
      .eq('plan_id', planData.id)
      .order('week_number')
      .order('order_in_week');

    if (!workoutsData || workoutsData.length === 0) {
      toast.error('Keine Einheiten im Plan gefunden.');
      return;
    }

    // exercises normalisieren
    const workoutsWithEx = workoutsData.map(w => ({
      ...w,
      exercises: (w.plan_exercises || []).sort((a: any, b: any) => a.order_in_workout - b.order_in_workout),
    }));

    setPlanWorkouts(workoutsWithEx);
    setWorkoutPickerOpen(true);
  };

  const handleStartSessionLogger = async () => {
    if (!selectedSession) return;
    await loadPlanWorkouts(selectedSession.client_id);
    setActiveLoggerSessionId(selectedSession.id);
    setActiveLoggerClientId(selectedSession.client_id);
  };

  const handleSelectWorkout = (workout: any) => {
    setWorkoutPickerOpen(false);
    setActiveLoggerWorkout(workout);
    setSelectedSession(null); // Edit-Dialog schließen
  };

  const getSessionCount = (clientId: string, packageId: string | null) => {
    if (!packageId) return null;
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return null;
    const used = sessions.filter(s => s.package_id === packageId && ['Completed', 'No-Show'].includes(s.status)).length;
    return { used, total: pkg.sessions_included };
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Einheit wirklich löschen?')) return;
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
    if (error) { toast.error('Fehler beim Löschen: ' + error.message); return; }
    toast.success('Einheit gelöscht');
    loadData();
  };

  const checkAndHandleSlot = async (sessionDateISO: string): Promise<boolean> => {
    const sessionTime = new Date(sessionDateISO);
    const windowStart = new Date(sessionTime.getTime() - 2 * 60000).toISOString();
    const windowEnd = new Date(sessionTime.getTime() + 2 * 60000).toISOString();
    const { data: matchingSlots } = await supabase
      .from('availability_slots')
      .select('id, is_bookable, booking_requests(status)')
      .gte('start_time', windowStart)
      .lte('start_time', windowEnd);
    if (!matchingSlots || matchingSlots.length === 0) return true;
    const slot = matchingSlots[0] as any;
    const hasConfirmedBooking = slot.booking_requests?.some((r: any) => r.status === 'confirmed');
    if (hasConfirmedBooking || !slot.is_bookable) {
      toast.error('Dieser Slot ist bereits von einem Kunden gebucht. Bitte die bestehende Buchung verwalten.');
      return false;
    }
    await supabase.from('availability_slots').delete().eq('id', slot.id);
    toast.info('Freier Slot für diese Uhrzeit wurde automatisch entfernt.');
    return true;
  };

  const save = async () => {
    if (!user || !form.client_id) return;
    const sessionDateISO = new Date(form.session_date).toISOString();
    const slotOk = await checkAndHandleSlot(sessionDateISO);
    if (!slotOk) return;
    const isDuo = form.session_type === 'Duo Training';
    const { error } = await supabase.from('sessions').insert({
      client_id: form.client_id,
      second_client_id: isDuo && form.second_client_id ? form.second_client_id : null,
      user_id: user.id,
      session_date: new Date(form.session_date).toISOString(),
      duration_minutes: Number(form.duration_minutes),
      session_type: sessionTypeToDb[form.session_type] || form.session_type,
      status: form.status,
      notes: form.notes || null,
      late_cancellation: form.late_cancellation,
      location: form.location,
      package_id: form.package_id || null,
    });
    if (error) { toast.error('Fehler: ' + error.message); return; }
    setDialogOpen(false);
    toast.success('Einheit erfasst');
    loadData();
  };

  const saveEdit = async () => {
    if (!selectedSession || !editForm) return;
    setSaving(true);
    const wasScheduled = selectedSession.status === 'Scheduled';
    const isCancelledByTrainer = editForm.status === 'Cancelled by Trainer';
    const isDuo = editForm.session_type === 'Duo Training';
    const { error } = await supabase.from('sessions').update({
      status: editForm.status,
      session_date: new Date(editForm.session_date).toISOString(),
      duration_minutes: Number(editForm.duration_minutes),
      session_type: sessionTypeToDb[editForm.session_type] || editForm.session_type,
      location: editForm.location,
      notes: editForm.notes || null,
      late_cancellation: editForm.late_cancellation,
      second_client_id: isDuo && editForm.second_client_id ? editForm.second_client_id : null,
    }).eq('id', selectedSession.id);
    if (error) { toast.error('Fehler: ' + error.message); setSaving(false); return; }
    if (wasScheduled && isCancelledByTrainer && selectedSession.client_id) {
      const sessionDate = format(new Date(editForm.session_date), "EEEE, d. MMMM · HH:mm", { locale: de });
      await supabase.from('client_notifications').insert({
        client_id: selectedSession.client_id,
        message: `Deine Einheit am ${sessionDate} Uhr wurde vom Trainer abgesagt.`,
      });
      if (isDuo && editForm.second_client_id) {
        await supabase.from('client_notifications').insert({
          client_id: editForm.second_client_id,
          message: `Deine Duo-Einheit am ${sessionDate} Uhr wurde vom Trainer abgesagt.`,
        });
      }
    }
    toast.success('Einheit gespeichert');
    setSaving(false);
    setSelectedSession(null);
    loadData();
  };

  const handleDrop = async (sessionId: string, targetDay: Date) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'Scheduled') return;
    const oldDate = new Date(session.session_date);
    const newDate = new Date(targetDay);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    const newDateISO = newDate.toISOString();
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, session_date: newDateISO } : s));
    setDragOverDay(null);
    const { error } = await supabase.from('sessions').update({ session_date: newDateISO }).eq('id', sessionId);
    if (error) { toast.error('Verschieben fehlgeschlagen'); loadData(); }
    else toast.success('Session verschoben');
  };

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { locale: de, weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { locale: de, weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  const getSessionsForDay = (day: Date) =>
    sessions.filter(s => isSameDay(new Date(s.session_date), day));

  const calendarFeedUrl = user
    ? `${window.location.origin}/api/calendar-feed?user_id=${user.id}`
    : '';

  const copyFeedUrl = async () => {
    await navigator.clipboard.writeText(calendarFeedUrl);
    setCopied(true);
    toast.success('Feed-URL kopiert');
    setTimeout(() => setCopied(false), 2000);
  };

  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const isDuoForm = form.session_type === 'Duo Training';
  const isDuoEdit = editForm?.session_type === 'Duo Training';

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <>
      {/* ── Phase 3: WorkoutLogger Overlay ── */}
      {activeLoggerWorkout && activeLoggerClientId && (
        <WorkoutLogger
          workout={activeLoggerWorkout}
          clientId={activeLoggerClientId}
          sessionId={activeLoggerSessionId || undefined}
          onClose={() => { setActiveLoggerWorkout(null); setActiveLoggerSessionId(null); setActiveLoggerClientId(null); }}
          onComplete={(summary) => {
            setActiveLoggerWorkout(null);
            setActiveLoggerSessionId(null);
            setActiveLoggerClientId(null);
            setCompletedSummary(summary);
          }}
        />
      )}

      {/* ── Zusammenfassung nach Logger ── */}
      {completedSummary && (
        <WorkoutSummaryView
          summary={completedSummary}
          workoutName="Training abgeschlossen"
          onClose={() => { setCompletedSummary(null); loadData(); }}
        />
      )}

      {/* ── Workout-Picker Dialog ── */}
      <Dialog open={workoutPickerOpen} onOpenChange={setWorkoutPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Dumbbell className="w-5 h-5" /> Einheit aus Plan wählen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {planWorkouts.map(workout => (
              <button
                key={workout.id}
                onClick={() => handleSelectWorkout(workout)}
                className="w-full text-left rounded-xl border border-border p-3 hover:bg-accent transition-colors"
              >
                <p className="font-medium text-sm">{workout.day_label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {workout.week_label && `${workout.week_label} · `}
                  {workout.exercises?.length || 0} Übungen
                </p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-display font-bold">Einheiten</h1>
        <div className="flex items-center gap-2">
          <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <RefreshCw className="w-4 h-4" /> Kalender-Sync
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Kalender synchronisieren</DialogTitle>
                <DialogDescription>
                  Füge diese URL als Kalender-Abonnement in deiner Kalender-App hinzu.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input readOnly value={calendarFeedUrl} className="text-xs font-mono" />
                  <Button size="icon" variant="outline" onClick={copyFeedUrl}>
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Apple Kalender:</strong> Ablage → Neues Kalenderabonnement → URL einfügen</p>
                  <p><strong>Google Calendar:</strong> Andere Kalender → Per URL hinzufügen</p>
                  <p><strong>Outlook:</strong> Kalender hinzufügen → Aus dem Internet abonnieren</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <Button variant={view === 'calendar' ? 'default' : 'ghost'} size="sm" onClick={() => setView('calendar')} className="rounded-none">
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button variant={view === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setView('list')} className="rounded-none">
              <List className="w-4 h-4" />
            </Button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Einheit erfassen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Einheit erfassen</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Kunde *</Label>
                  <Select value={form.client_id} onValueChange={v => {
                    const clientPkgs = packages.filter(p => p.client_id === v);
                    setForm(f => ({ ...f, client_id: v, package_id: clientPkgs.length === 1 ? clientPkgs[0].id : '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.client_id && (() => {
                  const clientPkgs = packages.filter(p => p.client_id === form.client_id);
                  if (clientPkgs.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <Label>Paket</Label>
                      <Select value={form.package_id} onValueChange={v => setForm(f => ({ ...f, package_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Paket wählen (optional)" /></SelectTrigger>
                        <SelectContent>
                          {clientPkgs.map(p => <SelectItem key={p.id} value={p.id}>{p.package_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  <Label>Datum & Uhrzeit</Label>
                  <Input type="datetime-local" value={form.session_date} onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Dauer (Min.)</Label>
                    <Input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Art</Label>
                    <Select value={form.session_type} onValueChange={v => setForm(f => ({ ...f, session_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sessionTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {isDuoForm && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Zweiter Teilnehmer</Label>
                    <Select value={form.second_client_id} onValueChange={v => setForm(f => ({ ...f, second_client_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Zweiten Kunden wählen" /></SelectTrigger>
                      <SelectContent>
                        {clients.filter(c => c.id !== form.client_id).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sessionStatuses.map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Ort</Label>
                    <Select value={form.location} onValueChange={v => setForm(f => ({ ...f, location: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.late_cancellation} onCheckedChange={v => setForm(f => ({ ...f, late_cancellation: v }))} />
                  <Label>Kurzfristige Absage (&lt;24h)</Label>
                </div>
                <div className="space-y-2">
                  <Label>Notizen</Label>
                  <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>
                <Button onClick={save} className="w-full">Einheit speichern</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-display font-semibold">
          {format(currentMonth, 'MMMM yyyy', { locale: de })}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      {view === 'calendar' ? (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/30">
            {weekDays.map(d => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b border-border">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const daySessions = getSessionsForDay(day);
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);
              const dayKey = format(day, 'yyyy-MM-dd');
              const isDragOver = dragOverDay === dayKey;
              return (
                <div
                  key={i}
                  className={`min-h-[100px] md:min-h-[120px] border-b border-r border-border p-1.5 transition-colors ${!inMonth ? 'bg-muted/20 opacity-40' : ''} ${today ? 'bg-primary/5' : ''} ${isDragOver ? 'bg-primary/15 ring-2 ring-primary/30 ring-inset' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOverDay(dayKey); }}
                  onDragLeave={() => setDragOverDay(null)}
                  onDrop={e => { e.preventDefault(); const sid = e.dataTransfer.getData('sessionId'); if (sid) handleDrop(sid, day); }}
                >
                  <p className={`text-xs font-medium mb-1 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    {format(day, 'd')}
                  </p>
                  <div className="space-y-1">
                    {daySessions.map(s => {
                      const clientName = s.clients?.full_name?.split(' ')[0] || '?';
                      const secondClientName = s.second_client?.full_name?.split(' ')[0];
                      const isDuo = s.session_type === 'Duo Training';
                      const loc = s.location || 'Gym';
                      const count = getSessionCount(s.client_id, s.package_id);
                      const isCancelled = s.status.startsWith('Cancelled') || s.status === 'No-Show';
                      const isScheduled = s.status === 'Scheduled';
                      return (
                        <div key={s.id} onClick={() => setSelectedSession(s)}>
                          <div
                            draggable={isScheduled}
                            onDragStart={isScheduled ? (e) => { e.dataTransfer.setData('sessionId', s.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}
                            className={`rounded-md px-1.5 py-1 text-[10px] md:text-xs transition-colors ${
                              isCancelled
                                ? 'bg-destructive/10 text-destructive/70 line-through cursor-default'
                                : isScheduled
                                ? 'bg-primary/10 text-foreground hover:bg-primary/20 cursor-grab active:cursor-grabbing border border-dashed border-primary/30'
                                : 'bg-primary/10 text-foreground hover:bg-primary/20 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <p className="font-medium truncate flex items-center gap-1">
                                {isScheduled && <span className="mr-0.5">⠿</span>}
                                {isDuo && <Users className="w-2.5 h-2.5 flex-shrink-0" />}
                                {format(new Date(s.session_date), 'HH:mm')} {clientName}
                                {isDuo && secondClientName && ` & ${secondClientName}`}
                              </p>
                              <button onClick={e => { e.preventDefault(); e.stopPropagation(); deleteSession(s.id); }} className="text-destructive/50 hover:text-destructive flex-shrink-0 text-[10px]">✕</button>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{loc}</span>
                              {count && <span className="ml-auto flex-shrink-0 font-medium text-primary">{count.used}/{count.total}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{sessions.length} Einheiten</p>
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Keine Einheiten diesen Monat</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...sessions].reverse().map(s => {
                const count = getSessionCount(s.client_id, s.package_id);
                const isDuo = s.session_type === 'Duo Training';
                const secondName = s.second_client?.full_name;
                return (
                  <div key={s.id} onClick={() => setSelectedSession(s)} className="cursor-pointer">
                    <Card className="hover:bg-accent/50 transition-colors">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-1.5">
                            {isDuo && <Users className="w-3.5 h-3.5 text-primary" />}
                            {s.clients?.full_name}
                            {isDuo && secondName && <span className="text-muted-foreground">& {secondName}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(s.session_date), 'd. MMM · HH:mm', { locale: de })} · {sessionTypeLabels[s.session_type] || s.session_type} · {s.duration_minutes} Min.
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.location || 'Gym'}</span>
                            {count && <span className="text-primary font-medium">Einheiten {count.used}/{count.total}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {s.late_cancellation && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">Kurzfristig</Badge>}
                          <Badge variant={s.status === 'Completed' ? 'default' : s.status === 'No-Show' ? 'destructive' : 'secondary'}>{statusLabels[s.status] || s.status}</Badge>
                          <button onClick={e => { e.preventDefault(); e.stopPropagation(); deleteSession(s.id); }} className="text-destructive/50 hover:text-destructive ml-1">✕</button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Session Detail / Edit Dialog */}
      <Dialog open={!!selectedSession} onOpenChange={open => { if (!open) setSelectedSession(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Einheit bearbeiten</DialogTitle></DialogHeader>
          {selectedSession && editForm && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-1">Kunde</p>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {selectedSession.session_type === 'Duo Training' && <Users className="w-3.5 h-3.5 text-primary" />}
                  {selectedSession.clients?.full_name}
                  {selectedSession.second_client?.full_name && (
                    <span className="text-muted-foreground">& {selectedSession.second_client.full_name}</span>
                  )}
                </p>
              </div>

              {/* ── Phase 3: Training loggen Button ── */}
              {selectedSession.status === 'Scheduled' && (
                <Button
                  variant="outline"
                  className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={handleStartSessionLogger}
                >
                  <Dumbbell className="w-4 h-4" /> Training jetzt loggen
                </Button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={v => setEditForm((f: any) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sessionStatuses.map(s => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ort</Label>
                  <Select value={editForm.location} onValueChange={v => setEditForm((f: any) => ({ ...f, location: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Datum & Uhrzeit</Label>
                <Input type="datetime-local" value={editForm.session_date} onChange={e => setEditForm((f: any) => ({ ...f, session_date: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Dauer (Min.)</Label>
                  <Input type="number" value={editForm.duration_minutes} onChange={e => setEditForm((f: any) => ({ ...f, duration_minutes: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Art</Label>
                  <Select value={editForm.session_type} onValueChange={v => setEditForm((f: any) => ({ ...f, session_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sessionTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isDuoEdit && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Zweiter Teilnehmer</Label>
                  <Select value={editForm.second_client_id || ''} onValueChange={v => setEditForm((f: any) => ({ ...f, second_client_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Zweiten Kunden wählen" /></SelectTrigger>
                    <SelectContent>
                      {clients.filter(c => c.id !== selectedSession.client_id).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch checked={editForm.late_cancellation} onCheckedChange={v => setEditForm((f: any) => ({ ...f, late_cancellation: v }))} />
                <Label>Kurzfristige Absage (&lt;24h)</Label>
              </div>

              <div className="space-y-1.5">
                <Label>Notizen</Label>
                <Textarea value={editForm.notes} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>

              {editForm.status === 'Cancelled by Trainer' && selectedSession.status === 'Scheduled' && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  ⚠️ Der Kunde wird über die Absage benachrichtigt.
                  {isDuoEdit && editForm.second_client_id && ' Beide Teilnehmer erhalten eine Benachrichtigung.'}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" asChild>
                  <Link to={`/clients/${selectedSession.client_id}`}>Zum Kundenprofil</Link>
                </Button>
                <Button variant="destructive" onClick={() => { deleteSession(selectedSession.id); setSelectedSession(null); }}>
                  Löschen
                </Button>
                <Button onClick={saveEdit} disabled={saving} className="flex-1">
                  {saving ? 'Speichern…' : 'Speichern'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
};

export default SessionsPage;
