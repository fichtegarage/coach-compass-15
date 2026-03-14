import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Check, X, ChevronLeft, ChevronRight, Loader2, Trash2,
  Clock, CalendarDays, AlertTriangle
} from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isBefore, isSameDay, formatDistanceToNow, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

// ── E-Mail helper ─────────────────────────────────────────────────────────────
const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });
  } catch (e) {
    console.error('E-Mail konnte nicht gesendet werden', e);
  }
};

const slotTypeLabels: Record<string, string> = {
  'in-person': 'Vor Ort',
  'online': 'Online',
  'call': 'Telefonat',
};

const statusLabels: Record<string, string> = {
  pending: 'Ausstehend',
  confirmed: 'Bestätigt',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
};

const statusColors: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  confirmed: 'bg-success/10 text-success border-success/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const BookingsPage: React.FC = () => {
  const { user } = useAuth();
  const [slots, setSlots] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotForm, setSlotForm] = useState({
    date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    slot_type: 'in-person',
    notes: '',
    recurring: false,
    recurring_days: [] as number[],
    recurring_weeks: '4',
  });

  const [respondDialog, setRespondDialog] = useState<any | null>(null);
  const [trainerNote, setTrainerNote] = useState('');
  const [responding, setResponding] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    const [slotsRes, requestsRes] = await Promise.all([
      supabase
        .from('availability_slots')
        .select('*')
        .eq('trainer_id', user.id)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString())
        .order('start_time'),
      supabase
        .from('booking_requests')
        .select('*, clients(full_name, email, profile_photo_url), availability_slots(start_time, end_time, slot_type, trainer_id)')
        .order('requested_at', { ascending: false }),
    ]);
    setSlots(slotsRes.data || []);
    setRequests(requestsRes.data || []);
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('booking-requests-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_requests' }, () => {
        loadData();
        toast.info('Neue Buchungsanfrage eingegangen!');
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const slotsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    weekDays.forEach(d => { map[format(d, 'yyyy-MM-dd')] = []; });
    (slots || []).forEach(slot => {
      const key = format(new Date(slot.start_time), 'yyyy-MM-dd');
      if (map[key]) map[key].push(slot);
    });
    return map;
  }, [slots, weekDays]);

  const pendingCount = useMemo(() =>
    requests.filter(r => r.status === 'pending').length
  , [requests]);

  const filteredRequests = useMemo(() => {
    if (filter === 'all') return requests;
    return requests.filter(r => r.status === filter);
  }, [requests, filter]);

  const slotBookingCounts = useMemo(() => {
    const counts: Record<string, { confirmed: number; pending: number }> = {};
    requests.forEach(r => {
      if (!counts[r.slot_id]) counts[r.slot_id] = { confirmed: 0, pending: 0 };
      if (r.status === 'confirmed') counts[r.slot_id].confirmed++;
      if (r.status === 'pending') counts[r.slot_id].pending++;
    });
    return counts;
  }, [requests]);

  const createSlot = async () => {
    if (!user) return;
    const slotsToCreate: any[] = [];

    if (slotForm.recurring && slotForm.recurring_days.length > 0) {
      const weeks = parseInt(slotForm.recurring_weeks) || 4;
      for (let w = 0; w < weeks; w++) {
        for (const dayOfWeek of slotForm.recurring_days) {
          const baseDate = startOfWeek(new Date(slotForm.date), { weekStartsOn: 1 });
          const targetDate = addDays(addWeeks(baseDate, w), dayOfWeek);
          if (isBefore(targetDate, startOfDay(new Date()))) continue;
          const dateStr = format(targetDate, 'yyyy-MM-dd');
          slotsToCreate.push({
            trainer_id: user.id,
            start_time: new Date(`${dateStr}T${slotForm.start_time}:00`).toISOString(),
            end_time: new Date(`${dateStr}T${slotForm.end_time}:00`).toISOString(),
            slot_type: slotForm.slot_type,
            notes: slotForm.notes || null,
          });
        }
      }
    } else {
      slotsToCreate.push({
        trainer_id: user.id,
        start_time: new Date(`${slotForm.date}T${slotForm.start_time}:00`).toISOString(),
        end_time: new Date(`${slotForm.date}T${slotForm.end_time}:00`).toISOString(),
        slot_type: slotForm.slot_type,
        notes: slotForm.notes || null,
      });
    }

    const { error } = await supabase.from('availability_slots').insert(slotsToCreate);
    if (error) {
      toast.error('Fehler beim Erstellen der Slots');
      return;
    }
    toast.success(`${slotsToCreate.length} Slot(s) erstellt`);
    setSlotDialogOpen(false);
    setSlotForm({ date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '10:00', slot_type: 'in-person', notes: '', recurring: false, recurring_days: [], recurring_weeks: '4' });
    loadData();
  };

  const deleteSlot = async (slotId: string) => {
    const hasConfirmed = requests.some(r => r.slot_id === slotId && r.status === 'confirmed');
    if (hasConfirmed) {
      toast.error('Slot hat bestätigte Buchungen und kann nicht gelöscht werden.');
      return;
    }
    if (!window.confirm('Slot wirklich löschen?')) return;
    await supabase.from('availability_slots').delete().eq('id', slotId);
    toast.success('Slot gelöscht');
    loadData();
  };

  const handleRespond = async (status: 'confirmed' | 'rejected') => {
    if (!respondDialog) return;
    setResponding(true);

    const updates: any = {
      status,
      trainer_note: trainerNote || null,
      responded_at: new Date().toISOString(),
    };

    if (status === 'confirmed') {
      const slot = slots.find(s => s.id === respondDialog.slot_id) || respondDialog.availability_slots;
      if (slot) {
        const currentConfirmed = (slotBookingCounts[respondDialog.slot_id]?.confirmed || 0) + 1;
        if (currentConfirmed >= (slot.max_bookings || 1)) {
          await supabase.from('availability_slots').update({ is_bookable: false }).eq('id', respondDialog.slot_id);
        }
      }
    }

    await supabase.from('booking_requests').update(updates).eq('id', respondDialog.id);

    if (status === 'confirmed' && respondDialog.availability_slots) {
      const slotTypeMap: Record<string, string> = {
        'in-person': 'In-Person Training',
        'online': 'Online Training',
        'call': 'Phone Call',
      };
      const start = new Date(respondDialog.availability_slots.start_time);
      const end = new Date(respondDialog.availability_slots.end_time);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
      await supabase.from('sessions').insert({
        client_id: respondDialog.client_id,
        user_id: user!.id,
        session_date: respondDialog.availability_slots.start_time,
        duration_minutes: durationMinutes,
        session_type: slotTypeMap[respondDialog.availability_slots.slot_type] || 'In-Person Training',
        status: 'Scheduled',
        notes: respondDialog.client_message || null,
        location: 'Gym',
      });
    }

    // E-Mail an Kunden
    const clientEmail = respondDialog.clients?.email;
    if (clientEmail && respondDialog.availability_slots) {
      const slotDate = format(new Date(respondDialog.availability_slots.start_time), "EEEE, d. MMMM · HH:mm", { locale: de });
      if (status === 'confirmed') {
        await sendEmail(
          clientEmail,
          'Dein Termin wurde bestätigt ✅',
          `<p>Hallo ${respondDialog.clients.full_name},</p>
           <p>dein Termin am <strong>${slotDate} Uhr</strong> wurde bestätigt.</p>
           ${trainerNote ? `<p>Hinweis von Jakob: ${trainerNote}</p>` : ''}
           <p>Bis bald,<br/>Jakob Neumann Personal Training</p>`
        );
      } else {
        await sendEmail(
          clientEmail,
          'Deine Buchungsanfrage',
          `<p>Hallo ${respondDialog.clients.full_name},</p>
           <p>leider kann ich den Termin am <strong>${slotDate} Uhr</strong> nicht bestätigen.</p>
           ${trainerNote ? `<p>Hinweis: ${trainerNote}</p>` : ''}
           <p>Melde dich gerne für einen anderen Termin.<br/>Jakob Neumann Personal Training</p>`
        );
      }
    }

    toast.success(status === 'confirmed' ? 'Buchung bestätigt & Session erstellt' : 'Buchung abgelehnt');
    setRespondDialog(null);
    setTrainerNote('');
    setResponding(false);
    loadData();
  };

  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Buchungen</h1>
          <p className="text-sm text-muted-foreground">Verfügbarkeit verwalten & Anfragen bearbeiten</p>
        </div>
        <Button className="gap-2" onClick={() => setSlotDialogOpen(true)}>
          <Plus className="w-4 h-4" /> Slot erstellen
        </Button>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="calendar">
            <CalendarDays className="w-4 h-4 mr-1.5" /> Verfügbarkeit
          </TabsTrigger>
          <TabsTrigger value="requests" className="relative">
            Anfragen
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-destructive text-destructive-foreground">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* CALENDAR TAB */}
        <TabsContent value="calendar" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h3 className="font-display font-semibold">
              {format(weekStart, "d. MMM", { locale: de })} – {format(addDays(weekStart, 6), "d. MMM yyyy", { locale: de })}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-2">
            {weekDays.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const daySlots = slotsByDay[key] || [];
              const isPast = isBefore(day, startOfDay(new Date())) && !isSameDay(day, new Date());
              return (
                <Card key={key} className={isPast ? 'opacity-50' : ''}>
                  <CardContent className="p-3">
                    <p className={`text-sm font-semibold mb-2 ${isSameDay(day, new Date()) ? 'text-primary' : ''}`}>
                      {format(day, 'EEEE, d. MMMM', { locale: de })}
                    </p>
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Keine Slots</p>
                    ) : (
                      <div className="space-y-1.5">
                        {daySlots.map(slot => {
                          const counts = slotBookingCounts[slot.id];
                          const hasConfirmed = counts?.confirmed > 0;
                          return (
                            <div key={slot.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                              <div className="flex items-center gap-3">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm font-medium">
                                  {format(new Date(slot.start_time), 'HH:mm')} – {format(new Date(slot.end_time), 'HH:mm')}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {slotTypeLabels[slot.slot_type]}
                                </Badge>
                                {counts?.pending > 0 && (
                                  <Badge className="bg-warning/10 text-warning border-warning/20 text-xs" variant="outline">
                                    {counts.pending} ausstehend
                                  </Badge>
                                )}
                                {counts?.confirmed > 0 && (
                                  <Badge className="bg-success/10 text-success border-success/20 text-xs" variant="outline">
                                    {counts.confirmed} bestätigt
                                  </Badge>
                                )}
                                {slot.notes && <span className="text-xs text-muted-foreground italic">{slot.notes}</span>}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteSlot(slot.id)}
                                className="text-muted-foreground hover:text-destructive h-7 w-7"
                                title={hasConfirmed ? 'Gesperrt – bestätigte Buchung vorhanden' : 'Löschen'}
                              >
                                {hasConfirmed ? <AlertTriangle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* REQUESTS TAB */}
        <TabsContent value="requests" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'confirmed', 'rejected', 'cancelled'].map(f => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Alle' : statusLabels[f]}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
                    {pendingCount}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {filteredRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Keine Anfragen</p>
          ) : (
            <div className="space-y-2">
              {filteredRequests.map(r => (
                <Card key={r.id} className={r.status === 'pending' ? 'border-warning/30' : ''}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.clients?.full_name || 'Unbekannt'}</span>
                        <Badge variant="outline" className={statusColors[r.status]}>
                          {statusLabels[r.status]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {r.availability_slots
                          ? `${format(new Date(r.availability_slots.start_time), "EEE, d. MMM · HH:mm", { locale: de })} – ${format(new Date(r.availability_slots.end_time), "HH:mm")} · ${slotTypeLabels[r.availability_slots.slot_type]}`
                          : 'Slot entfernt'}
                      </p>
                      {r.client_message && <p className="text-xs text-muted-foreground mt-1">„{r.client_message}"</p>}
                      {r.trainer_note && <p className="text-xs text-primary mt-1">Notiz: {r.trainer_note}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        vor {formatDistanceToNow(new Date(r.requested_at), { locale: de })}
                      </p>
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          className="gap-1 bg-success hover:bg-success/90 text-success-foreground"
                          onClick={() => { setRespondDialog(r); setTrainerNote(''); }}
                        >
                          <Check className="w-3.5 h-3.5" /> Bestätigen
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => { setRespondDialog({ ...r, _action: 'reject' }); setTrainerNote(''); }}
                        >
                          <X className="w-3.5 h-3.5" /> Ablehnen
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Slot Dialog */}
      <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Neuen Slot erstellen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={slotForm.date} onChange={e => setSlotForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Startzeit</Label>
                <Input type="time" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Endzeit</Label>
                <Input type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select value={slotForm.slot_type} onValueChange={v => setSlotForm(f => ({ ...f, slot_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in-person">Vor Ort</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="call">Telefonat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Interne Notiz (optional)</Label>
              <Input value={slotForm.notes} onChange={e => setSlotForm(f => ({ ...f, notes: e.target.value }))} placeholder="z.B. Nur für Stammkunden" />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={slotForm.recurring} onCheckedChange={v => setSlotForm(f => ({ ...f, recurring: v }))} />
              <Label>Wiederkehrend erstellen</Label>
            </div>
            {slotForm.recurring && (
              <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                <div className="space-y-2">
                  <Label>Wochentage</Label>
                  <div className="flex gap-1.5">
                    {dayNames.map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setSlotForm(f => ({
                            ...f,
                            recurring_days: f.recurring_days.includes(i)
                              ? f.recurring_days.filter(d => d !== i)
                              : [...f.recurring_days, i],
                          }));
                        }}
                        className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                          slotForm.recurring_days.includes(i)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Anzahl Wochen</Label>
                  <Input
                    type="number"
                    value={slotForm.recurring_weeks}
                    onChange={e => setSlotForm(f => ({ ...f, recurring_weeks: e.target.value }))}
                    min={1}
                    max={52}
                  />
                </div>
              </div>
            )}

            <Button onClick={createSlot} className="w-full">Slot erstellen</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Respond Dialog */}
      <Dialog open={!!respondDialog} onOpenChange={open => { if (!open) setRespondDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {respondDialog?._action === 'reject' ? 'Buchung ablehnen' : 'Buchung bestätigen'}
            </DialogTitle>
          </DialogHeader>
          {respondDialog && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-medium">{respondDialog.clients?.full_name}</p>
                {respondDialog.availability_slots && (
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(respondDialog.availability_slots.start_time), "EEEE, d. MMM · HH:mm", { locale: de })} –{' '}
                    {format(new Date(respondDialog.availability_slots.end_time), "HH:mm")}
                  </p>
                )}
                {respondDialog.client_message && (
                  <p className="text-xs text-muted-foreground">Nachricht: „{respondDialog.client_message}"</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Interne Notiz (optional)</Label>
                <Textarea
                  value={trainerNote}
                  onChange={e => setTrainerNote(e.target.value)}
                  placeholder={respondDialog._action === 'reject' ? 'Grund für Ablehnung...' : 'Hinweis zur Bestätigung...'}
                  rows={2}
                />
              </div>
              <Button
                onClick={() => handleRespond(respondDialog._action === 'reject' ? 'rejected' : 'confirmed')}
                disabled={responding}
                className={`w-full ${respondDialog._action === 'reject' ? 'bg-destructive hover:bg-destructive/90' : 'bg-success hover:bg-success/90 text-success-foreground'}`}
              >
                {responding ? <Loader2 className="w-4 h-4 animate-spin" /> : respondDialog._action === 'reject' ? 'Ablehnen' : 'Bestätigen'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingsPage;
