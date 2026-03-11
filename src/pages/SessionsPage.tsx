import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, MapPin, List, LayoutGrid, Copy, Check } from 'lucide-react';
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

const sessionTypes = ['Präsenz-Training', 'Online-Training', 'Telefonat', 'Check-In Call', 'Kostenloses Erstgespräch'];
const sessionStatuses = ['Scheduled', 'Completed', 'No-Show', 'Cancelled by Client', 'Cancelled by Trainer'];
const locations = ['Gym', 'Outdoor'];

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Präsenz-Training',
  'Online Training': 'Online-Training',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In Call',
  'Free Intro': 'Kostenloses Erstgespräch',
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
};

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
  const [form, setForm] = useState({
    client_id: '', package_id: '', session_date: new Date().toISOString().slice(0, 16),
    duration_minutes: '60', session_type: 'Präsenz-Training',
    status: 'Completed', notes: '', late_cancellation: false, location: 'Gym',
  });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, currentMonth]);

  const loadData = async () => {
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    const [sRes, cRes, pRes] = await Promise.all([
      supabase.from('sessions').select('*, clients(full_name)')
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
    if (error) {
      toast.error('Fehler beim Löschen: ' + error.message);
      return;
    }
    toast.success('Einheit gelöscht');
    loadData();
  };

  const save = async () => {
    if (!user || !form.client_id) return;
    const { error } = await supabase.from('sessions').insert({
      client_id: form.client_id, user_id: user.id,
      session_date: form.session_date,
      duration_minutes: Number(form.duration_minutes),
      session_type: sessionTypeToDb[form.session_type] || form.session_type,
      status: form.status,
      notes: form.notes || null,
      late_cancellation: form.late_cancellation,
      location: form.location,
      package_id: form.package_id || null,
    });
    if (error) {
      toast.error('Fehler: ' + error.message);
      return;
    }
    setDialogOpen(false);
    toast.success('Einheit erfasst');
    loadData();
  };

  const handleDrop = async (sessionId: string, targetDay: Date) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'Scheduled') return;
    const oldDate = new Date(session.session_date);
    const newDate = new Date(targetDay);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    const newDateStr = format(newDate, "yyyy-MM-dd'T'HH:mm:ss");
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, session_date: newDateStr } : s));
    setDragOverDay(null);
    const { error } = await supabase.from('sessions').update({ session_date: newDateStr }).eq('id', sessionId);
    if (error) {
      toast.error('Verschieben fehlgeschlagen');
      loadData();
    } else {
      toast.success('Session verschoben');
    }
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
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?user_id=${user.id}`
    : '';

  const copyFeedUrl = async () => {
    await navigator.clipboard.writeText(calendarFeedUrl);
    setCopied(true);
    toast.success('Feed-URL kopiert');
    setTimeout(() => setCopied(false), 2000);
  };

  const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
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
                  Füge diese URL als Kalender-Abonnement in deiner Kalender-App hinzu (Apple Kalender, Google Calendar, Outlook). Der Kalender aktualisiert sich automatisch.
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

      {/* Month Navigation */}
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
        /* CALENDAR VIEW */
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/30">
            {weekDays.map(d => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b border-border">
                {d}
              </div>
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
                  className={`min-h-[100px] md:min-h-[120px] border-b border-r border-border p-1.5 transition-colors ${
                    !inMonth ? 'bg-muted/20 opacity-40' : ''
                  } ${today ? 'bg-primary/5' : ''} ${isDragOver ? 'bg-primary/15 ring-2 ring-primary/30 ring-inset' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOverDay(dayKey); }}
                  onDragLeave={() => setDragOverDay(null)}
                  onDrop={e => {
                    e.preventDefault();
                    const sessionId = e.dataTransfer.getData('sessionId');
                    if (sessionId) handleDrop(sessionId, day);
                  }}
                >
                  <p className={`text-xs font-medium mb-1 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    {format(day, 'd')}
                  </p>
                  <div className="space-y-1">
                    {daySessions.map(s => {
                      const clientName = (s.clients as any)?.full_name || '?';
                      const loc = s.location || 'Gym';
                      const count = getSessionCount(s.client_id, s.package_id);
                      const isCancelled = s.status.startsWith('Cancelled') || s.status === 'No-Show';
                      const isScheduled = s.status === 'Scheduled';
                      const inner = (
                        <div
                          draggable={isScheduled}
                          onDragStart={isScheduled ? (e) => {
                            e.dataTransfer.setData('sessionId', s.id);
                            e.dataTransfer.effectAllowed = 'move';
                          } : undefined}
                          className={`rounded-md px-1.5 py-1 text-[10px] md:text-xs transition-colors ${
                            isCancelled
                              ? 'bg-destructive/10 text-destructive/70 line-through cursor-default'
                              : isScheduled
                              ? 'bg-primary/10 text-foreground hover:bg-primary/20 cursor-grab active:cursor-grabbing border border-dashed border-primary/30'
                              : 'bg-primary/10 text-foreground hover:bg-primary/20 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-medium truncate">
                              {isScheduled && <span className="mr-1">⠿</span>}
                              {format(new Date(s.session_date), 'HH:mm')} {clientName}
                            </p>
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); deleteSession(s.id); }}
                              className="text-destructive/50 hover:text-destructive flex-shrink-0 text-[10px]"
                            >✕</button>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                            <span className="truncate">{loc}</span>
                            {count && (
                              <span className="ml-auto flex-shrink-0 font-medium text-primary">
                                {count.used}/{count.total}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                      return (
                        <div key={s.id} onClick={() => !isScheduled && setSelectedSession(s)}>
                          {inner}
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
        /* LIST VIEW */
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
                return (
                  <div key={s.id} onClick={() => setSelectedSession(s)} className="cursor-pointer">
                    <Card className="hover:bg-accent/50 transition-colors">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{(s.clients as any)?.full_name}</p>
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
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); deleteSession(s.id); }}
                            className="text-destructive/50 hover:text-destructive ml-1"
                          >✕</button>
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

      {/* Session Detail Dialog */}
      <Dialog open={!!selectedSession} onOpenChange={open => { if (!open) setSelectedSession(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Einheit Details</DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Kunde</p>
                  <p className="text-sm font-medium">{(selectedSession.clients as any)?.full_name}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <Badge variant={selectedSession.status === 'Completed' ? 'default' : selectedSession.status === 'No-Show' ? 'destructive' : 'secondary'}>
                    {statusLabels[selectedSession.status] || selectedSession.status}
                  </Badge>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Datum & Uhrzeit</p>
                  <p className="text-sm font-medium">{format(new Date(selectedSession.session_date), "d. MMM yyyy · HH:mm", { locale: de })} Uhr</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Dauer</p>
                  <p className="text-sm font-medium">{selectedSession.duration_minutes} Minuten</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Art</p>
                  <p className="text-sm font-medium">{sessionTypeLabels[selectedSession.session_type] || selectedSession.session_type}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Ort</p>
                  <p className="text-sm font-medium">{selectedSession.location || 'Gym'}</p>
                </div>
              </div>
              {selectedSession.notes && (
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notizen</p>
                  <p className="text-sm">{selectedSession.notes}</p>
                </div>
              )}
              {selectedSession.late_cancellation && (
                <Badge variant="outline" className="text-destructive border-destructive/30">Kurzfristige Absage</Badge>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" asChild>
                  <Link to={`/clients/${selectedSession.client_id}`}>Zum Kundenprofil</Link>
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => { deleteSession(selectedSession.id); setSelectedSession(null); }}
                >
                  Löschen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SessionsPage;
