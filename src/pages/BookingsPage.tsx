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
  CalendarDays, AlertTriangle, Pencil
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addDays, addWeeks, subWeeks, addMonths, subMonths,
  isBefore, isSameDay, isToday, isSameMonth,
  formatDistanceToNow, startOfDay, eachDayOfInterval, differenceInHours
} from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { buildEmail } from '@/lib/emailTemplate';

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

// ── Auto-split helper: Zeitblock → Array von 60-Min-Slots ────────────────────
const splitIntoHourlySlots = (
  dateStr: string,
  startTime: string,
  endTime: string
): { start_time: string; end_time: string }[] => {
  const start = new Date(`${dateStr}T${startTime}:00`);
  const end = new Date(`${dateStr}T${endTime}:00`);
  const result: { start_time: string; end_time: string }[] = [];
  let current = start;
  while (current < end) {
    const next = new Date(current.getTime() + 60 * 60 * 1000);
    if (next > end) break; // unvollständige Slots nicht anlegen
    result.push({
      start_time: current.toISOString(),
      end_time: next.toISOString(),
    });
    current = next;
  }
  return result;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const slotTypeLabels: Record<string, string> = {
  'in-person': 'Vor Ort',
  'online': 'Online',
  'call': 'Telefonat',
};

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Präsenz',
  'Online Training': 'Online',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In',
  'Free Intro': 'Erstgespräch',
};

const sessionStatuses = ['Scheduled', 'Completed', 'No-Show', 'Cancelled by Client', 'Cancelled by Trainer'];
const sessionStatusLabels: Record<string, string> = {
  'Scheduled': 'Geplant',
  'Completed': 'Abgeschlossen',
  'No-Show': 'Nicht erschienen',
  'Cancelled by Client': 'Vom Kunden abgesagt',
  'Cancelled by Trainer': 'Vom Trainer abgesagt',
};

const requestStatusLabels: Record<string, string> = {
  pending: 'Ausstehend',
  confirmed: 'Bestätigt',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
};

const requestStatusColors: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  confirmed: 'bg-success/10 text-success border-success/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const BookingsPage: React.FC = () => {
  const { user } = useAuth();

  // Data
  const [slots, setSlots] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  // UI state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(20);

  // Slot dialog (create)
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

  // Slot edit dialog
  const [editSlot, setEditSlot] = useState<any | null>(null);
  const [editSlotForm, setEditSlotForm] = useState({ start_time: '', end_time: '', slot_type: '', notes: '' });

  // Session detail/edit dialog
  const [editSession, setEditSession] = useState<any | null>(null);
  const [editSessionStatus, setEditSessionStatus] = useState('');

  // Respond dialog
  const [respondDialog, setRespondDialog] = useState<any | null>(null);
  const [trainerNote, setTrainerNote] = useState('');
  const [responding, setResponding] = useState(false);

  // Multi-select delete
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const [slotsRes, requestsRes, sessionsRes, clientsRes] = await Promise.all([
      supabase
        .from('availability_slots')
        .select('*')
        .eq('trainer_id', user.id)
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .order('start_time'),
      supabase
        .from('booking_requests')
        .select('*, clients(full_name, email, profile_photo_url), availability_slots(start_time, end_time, slot_type, trainer_id, max_bookings)')
        .order('requested_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name), second_client:clients!sessions_second_client_id_fkey(full_name)')
        .gte('session_date', monthStart.toISOString())
        .lte('session_date', monthEnd.toISOString())
        .order('session_date'),
      supabase
        .from('clients')
        .select('id, full_name')
        .eq('status', 'Active')
        .order('full_name'),
    ]);

    setSlots(slotsRes.data || []);
    setRequests(requestsRes.data || []);
    setSessions(sessionsRes.data || []);
    setClients(clientsRes.data || []);
    setLoading(false);
  }, [user, currentMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime
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

  // In-App 24h Notification
  useEffect(() => {
    if (!sessions.length) return;
    const in24h = sessions.filter(s => {
      if (s.status !== 'Scheduled') return false;
      const hours = differenceInHours(new Date(s.session_date), new Date());
      return hours > 0 && hours <= 24;
    });
    if (in24h.length > 0) {
      in24h.forEach(s => {
        const clientName = s.clients?.full_name || 'Kunde';
        const time = format(new Date(s.session_date), "HH:mm", { locale: de });
        toast.warning(`⏰ Einheit mit ${clientName} heute um ${time} Uhr`, { duration: 8000 });
      });
    }
  }, [sessions]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

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

  // ── Vorschau: wie viele Slots entstehen beim Erstellen ───────────────────
  const slotPreviewCount = useMemo(() => {
    if (!slotForm.start_time || !slotForm.end_time) return 0;
    const start = new Date(`2000-01-01T${slotForm.start_time}:00`);
    const end = new Date(`2000-01-01T${slotForm.end_time}:00`);
    const diffMinutes = (end.getTime() - start.getTime()) / 60000;
    return Math.floor(diffMinutes / 60);
  }, [slotForm.start_time, slotForm.end_time]);

  // ── Entries per day for calendar – merged & sorted chronologically ──────────
  const entriesByDay = useMemo(() => {
    type CalEntry =
      | { kind: 'slot'; time: number; data: any }
      | { kind: 'session'; time: number; data: any };

    const map: Record<string, CalEntry[]> = {};
    calendarDays.forEach(d => { map[format(d, 'yyyy-MM-dd')] = []; });

    slots.forEach(slot => {
      const hasPending = (slotBookingCounts[slot.id]?.pending || 0) > 0;
      if (!slot.is_bookable && !hasPending) return;
      const key = format(new Date(slot.start_time), 'yyyy-MM-dd');
      if (map[key]) map[key].push({ kind: 'slot', time: new Date(slot.start_time).getTime(), data: slot });
    });

    sessions.forEach(session => {
      const key = format(new Date(session.session_date), 'yyyy-MM-dd');
      if (map[key]) map[key].push({ kind: 'session', time: new Date(session.session_date).getTime(), data: session });
    });

    // Sort each day chronologically
    Object.keys(map).forEach(key => map[key].sort((a, b) => a.time - b.time));

    return map;
  }, [slots, sessions, slotBookingCounts, calendarDays]);

  // ── Slot actions ──────────────────────────────────────────────────────────
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
          const hourlySlots = splitIntoHourlySlots(dateStr, slotForm.start_time, slotForm.end_time);
          hourlySlots.forEach(s => {
            slotsToCreate.push({
              trainer_id: user.id,
              start_time: s.start_time,
              end_time: s.end_time,
              slot_type: slotForm.slot_type,
              notes: slotForm.notes || null,
              is_bookable: true,
            });
          });
        }
      }
    } else {
      const hourlySlots = splitIntoHourlySlots(slotForm.date, slotForm.start_time, slotForm.end_time);
      hourlySlots.forEach(s => {
        slotsToCreate.push({
          trainer_id: user.id,
          start_time: s.start_time,
          end_time: s.end_time,
          slot_type: slotForm.slot_type,
          notes: slotForm.notes || null,
          is_bookable: true,
        });
      });
    }

    if (slotsToCreate.length === 0) {
      toast.error('Kein gültiger Zeitblock (mind. 1 Stunde eingeben)');
      return;
    }

    const { error } = await supabase.from('availability_slots').insert(slotsToCreate);
    if (error) { toast.error('Fehler beim Erstellen der Slots'); return; }
    toast.success(`${slotsToCreate.length} Slot(s) à 60 Min. erstellt`);
    setSlotDialogOpen(false);
    setSlotForm({
      date: new Date().toISOString().split('T')[0],
      start_time: '09:00',
      end_time: '10:00',
      slot_type: 'in-person',
      notes: '',
      recurring: false,
      recurring_days: [],
      recurring_weeks: '4',
    });
    loadData();
  };

  const openEditSlot = (slot: any) => {
    setEditSlot(slot);
    setEditSlotForm({
      start_time: format(new Date(slot.start_time), 'HH:mm'),
      end_time: format(new Date(slot.end_time), 'HH:mm'),
      slot_type: slot.slot_type,
      notes: slot.notes || '',
    });
  };

  const saveEditSlot = async () => {
    if (!editSlot) return;
    const dateStr = format(new Date(editSlot.start_time), 'yyyy-MM-dd');
    const { error } = await supabase.from('availability_slots').update({
      start_time: new Date(`${dateStr}T${editSlotForm.start_time}:00`).toISOString(),
      end_time: new Date(`${dateStr}T${editSlotForm.end_time}:00`).toISOString(),
      slot_type: editSlotForm.slot_type,
      notes: editSlotForm.notes || null,
    }).eq('id', editSlot.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Slot aktualisiert');
    setEditSlot(null);
    loadData();
  };

  const deleteSlot = async (slotId: string) => {
    const hasConfirmed = requests.some(r => r.slot_id === slotId && r.status === 'confirmed');
    if (hasConfirmed) { toast.error('Slot hat bestätigte Buchungen.'); return; }
    if (!window.confirm('Slot wirklich löschen?')) return;
    await supabase.from('availability_slots').delete().eq('id', slotId);
    toast.success('Slot gelöscht');
    loadData();
  };

  const bulkDeleteSlots = async () => {
    if (selectedSlotIds.size === 0) return;
    const ids = [...selectedSlotIds];
    const hasConfirmed = ids.some(id => requests.some(r => r.slot_id === id && r.status === 'confirmed'));
    if (hasConfirmed) {
      toast.error('Mindestens ein Slot hat bestätigte Buchungen und kann nicht gelöscht werden.');
      return;
    }
    if (!window.confirm(`${ids.length} Slot${ids.length > 1 ? 's' : ''} wirklich löschen?`)) return;
    const { error } = await supabase.from('availability_slots').delete().in('id', ids);
    if (error) { toast.error('Fehler beim Löschen'); return; }
    toast.success(`${ids.length} Slot${ids.length > 1 ? 's' : ''} gelöscht`);
    setSelectedSlotIds(new Set());
    setSelectionMode(false);
    loadData();
  };

  // ── Session status update ─────────────────────────────────────────────────
  const saveSessionStatus = async () => {
    if (!editSession) return;

    const wasScheduled = editSession.status === 'Scheduled';
    const isCancelledByTrainer = editSessionStatus === 'Cancelled by Trainer';

    const { error } = await supabase
      .from('sessions')
      .update({ status: editSessionStatus })
      .eq('id', editSession.id);
    if (error) { toast.error('Fehler: ' + error.message); return; }

    if (wasScheduled && isCancelledByTrainer && editSession.client_id) {
      const sessionDate = format(new Date(editSession.session_date), "EEEE, d. MMMM · HH:mm", { locale: de });
      await supabase.from('client_notifications').insert({
        client_id: editSession.client_id,
        message: `Deine Einheit am ${sessionDate} Uhr wurde vom Trainer abgesagt.`,
      });
    }

    toast.success('Status aktualisiert');
    setEditSession(null);
    loadData();
  };

  // ── Respond to booking request ────────────────────────────────────────────
  const handleRespond = async (status: 'confirmed' | 'rejected') => {
    if (!respondDialog) return;
    setResponding(true);

    await supabase.from('booking_requests').update({
      status,
      trainer_note: trainerNote || null,
      responded_at: new Date().toISOString(),
    }).eq('id', respondDialog.id);

    if (status === 'confirmed') {
      // Slot immer als nicht buchbar markieren wenn bestätigt (1:1 PT)
      await supabase.from('availability_slots').update({ is_bookable: false }).eq('id', respondDialog.slot_id);
      if (respondDialog.availability_slots) {
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
          session_date: new Date(respondDialog.availability_slots.start_time).toISOString(),
          duration_minutes: durationMinutes,
          session_type: slotTypeMap[respondDialog.availability_slots.slot_type] || 'In-Person Training',
          status: 'Scheduled',
          notes: respondDialog.client_message || null,
          location: 'Gym',
        });
      }
    }

    const clientEmail = respondDialog.clients?.email;
    if (clientEmail && respondDialog.availability_slots) {
      const slotDate = format(new Date(respondDialog.availability_slots.start_time), "EEEE, d. MMMM · HH:mm", { locale: de });

      if (status === 'confirmed') {
        await sendEmail(
          clientEmail,
          'Dein Termin wurde bestätigt ✅',
          buildEmail(`
            <p>Hallo ${respondDialog.clients.full_name},</p>
            <p>dein Termin am <strong>${slotDate} Uhr</strong> wurde bestätigt. Ich freue mich auf dich!</p>
            ${trainerNote ? `<p style="background:#f4f4f5;border-radius:8px;padding:12px 16px;font-size:14px;">💬 ${trainerNote}</p>` : ''}
          `)
        );
      } else {
        await sendEmail(
          clientEmail,
          'Zu deiner Buchungsanfrage',
          buildEmail(`
            <p>Hallo ${respondDialog.clients.full_name},</p>
            <p>leider kann ich den Termin am <strong>${slotDate} Uhr</strong> nicht bestätigen.</p>
            ${trainerNote ? `<p style="background:#f4f4f5;border-radius:8px;padding:12px 16px;font-size:14px;">💬 ${trainerNote}</p>` : ''}
            <p>Melde dich gerne für einen anderen Termin.</p>
          `)
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
  const weekDaysFallback = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), i)), []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Buchungen</h1>
          <p className="text-sm text-muted-foreground">Verfügbarkeit, Anfragen & Sessions im Überblick</p>
        </div>
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <span className="text-sm text-muted-foreground">{selectedSlotIds.size} ausgewählt</span>
              {selectedSlotIds.size > 0 && (
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={bulkDeleteSlots}>
                  <Trash2 className="w-3.5 h-3.5" /> {selectedSlotIds.size} löschen
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setSelectionMode(false); setSelectedSlotIds(new Set()); }}>
                Abbrechen
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectionMode(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Auswählen
              </Button>
              <Button className="gap-2" onClick={() => setSlotDialogOpen(true)}>
                <Plus className="w-4 h-4" /> Slot erstellen
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" /> Freier Slot</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> Anfrage ausstehend</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/100 inline-block rounded-sm" /> Geplante Session</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-400 inline-block" /> Abgeschlossen</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Abgesagt</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-muted border border-dashed border-muted-foreground/30 inline-block" /> Slot abgelaufen</span>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="calendar">
            <CalendarDays className="w-4 h-4 mr-1.5" /> Kalender
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

        {/* ── CALENDAR TAB ── */}
        <TabsContent value="calendar" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h3 className="font-display font-semibold text-lg">
              {format(currentMonth, 'MMMM yyyy', { locale: de })}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-7 bg-muted/30">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b border-border">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                const key = format(day, 'yyyy-MM-dd');
                const entries = entriesByDay[key] || [];
                const inMonth = isSameMonth(day, currentMonth);
                const today = isToday(day);
                const isPast = isBefore(day, startOfDay(new Date())) && !isSameDay(day, new Date());

                return (
                  <div
                    key={i}
                    className={`min-h-[110px] border-b border-r border-border p-1 ${!inMonth ? 'bg-muted/20 opacity-40' : ''} ${today ? 'bg-primary/5' : ''}`}
                  >
                    <p className={`text-xs font-medium mb-1 ${today ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                      {format(day, 'd')}
                    </p>
                    <div className="space-y-0.5">
                      {entries.map(entry => {
                        if (entry.kind === 'slot') {
                          const slot = entry.data;
                          const counts = slotBookingCounts[slot.id];
                          const hasPending = (counts?.pending || 0) > 0;
                          const isExpired = isPast;
                          const isSelected = selectedSlotIds.has(slot.id);

                          const handleSlotClick = () => {
                            if (selectionMode) {
                              setSelectedSlotIds(prev => {
                                const next = new Set(prev);
                                next.has(slot.id) ? next.delete(slot.id) : next.add(slot.id);
                                return next;
                              });
                            } else {
                              openEditSlot(slot);
                            }
                          };

                          return (
                            <button
                              key={slot.id}
                              onClick={handleSlotClick}
                              className={`w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight transition-colors ${
                                isSelected
                                  ? 'bg-destructive/20 text-destructive border border-destructive/40 ring-1 ring-destructive/30'
                                  : isExpired
                                  ? 'bg-muted/50 text-muted-foreground/50 border border-dashed border-muted-foreground/20'
                                  : hasPending
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                              }`}
                            >
                              {selectionMode && (
                                <span className={`inline-block w-2.5 h-2.5 rounded-sm border mr-1 align-middle ${isSelected ? 'bg-destructive border-destructive' : 'border-muted-foreground/40'}`} />
                              )}
                              <span className="font-medium">{format(new Date(slot.start_time), 'HH:mm')}</span>
                              {hasPending && !selectionMode && <span className="ml-1 font-bold text-amber-700">●</span>}
                              {isExpired && !selectionMode && <span className="ml-1 opacity-50">abgel.</span>}
                            </button>
                          );
                        } else {
                          const session = entry.data;
                          const isCancelled = session.status.startsWith('Cancelled') || session.status === 'No-Show';
                          const isCompleted = session.status === 'Completed';
                          const isScheduled = session.status === 'Scheduled';
                          const clientName = session.clients?.full_name?.split(' ')[0] || '?';
                          const secondClientName = session.second_client?.full_name?.split(' ')[0];
                          const isDuoSession = session.session_type === 'Duo Training';
                          return (
                            <button
                              key={session.id}
                              onClick={() => { if (!selectionMode) { setEditSession(session); setEditSessionStatus(session.status); } }}
                              className={`w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight transition-colors ${
                                isScheduled
                                  ? 'bg-primary/100 text-white hover:bg-primary'
                                  : isCompleted
                                  ? 'bg-slate-300 text-slate-700 hover:bg-slate-400'
                                  : isCancelled
                                  ? 'bg-red-100 text-red-700 line-through hover:bg-red-200'
                                  : 'bg-muted text-muted-foreground'
                              } ${selectionMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span className="font-medium">{format(new Date(session.session_date), 'HH:mm')}</span>
                              {' '}{clientName}{isDuoSession && secondClientName ? ' & ' + secondClientName : ''}
                            </button>
                          );
                        }
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── REQUESTS TAB ── */}
        <TabsContent value="requests" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'confirmed', 'rejected', 'cancelled'].map(f => (
              <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => { setFilter(f); setVisibleCount(20); }}>
                {f === 'all' ? 'Alle' : requestStatusLabels[f]}
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
              {filteredRequests.slice(0, visibleCount).map(r => (
                <Card key={r.id} className={r.status === 'pending' ? 'border-warning/30' : ''}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.clients?.full_name || 'Unbekannt'}</span>
                        <Badge variant="outline" className={requestStatusColors[r.status]}>
                          {requestStatusLabels[r.status]}
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
                        <Button size="sm" className="gap-1 bg-success hover:bg-success/90 text-success-foreground"
                          onClick={() => { setRespondDialog(r); setTrainerNote(''); }}>
                          <Check className="w-3.5 h-3.5" /> Bestätigen
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => { setRespondDialog({ ...r, _action: 'reject' }); setTrainerNote(''); }}>
                          <X className="w-3.5 h-3.5" /> Ablehnen
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          {filteredRequests.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(v => v + 20)}
              className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border rounded-xl hover:bg-muted/50"
            >
              + {filteredRequests.length - visibleCount} weitere anzeigen
            </button>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create Slot Dialog ── */}
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
                <Label>Verfügbar von</Label>
                <Input type="time" value={slotForm.start_time} onChange={e => setSlotForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Verfügbar bis</Label>
                <Input type="time" value={slotForm.end_time} onChange={e => setSlotForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            {slotPreviewCount > 0 ? (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
                → {slotPreviewCount} Slot{slotPreviewCount > 1 ? 's' : ''} à 60 Min. werden erstellt
                {slotForm.recurring && slotForm.recurring_days.length > 0
                  ? ` × ${slotForm.recurring_days.length} Tag(e) × ${slotForm.recurring_weeks} Woche(n)`
                  : ''}
              </div>
            ) : (
              <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Bitte mind. 1 Stunde Verfügbarkeit eingeben
              </div>
            )}

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
                      <button key={i} type="button"
                        onClick={() => setSlotForm(f => ({
                          ...f,
                          recurring_days: f.recurring_days.includes(i)
                            ? f.recurring_days.filter(d => d !== i)
                            : [...f.recurring_days, i],
                        }))}
                        className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors ${
                          slotForm.recurring_days.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                        }`}
                      >{name}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Anzahl Wochen</Label>
                  <Input type="number" value={slotForm.recurring_weeks}
                    onChange={e => setSlotForm(f => ({ ...f, recurring_weeks: e.target.value }))} min={1} max={52} />
                </div>
              </div>
            )}
            <Button onClick={createSlot} className="w-full" disabled={slotPreviewCount === 0}>
              {slotPreviewCount > 0 ? `${slotPreviewCount} Slot${slotPreviewCount > 1 ? 's' : ''} erstellen` : 'Slot erstellen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Slot Dialog ── */}
      <Dialog open={!!editSlot} onOpenChange={open => { if (!open) setEditSlot(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Slot bearbeiten</DialogTitle>
          </DialogHeader>
          {editSlot && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {format(new Date(editSlot.start_time), "EEEE, d. MMMM yyyy", { locale: de })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Startzeit</Label>
                  <Input type="time" value={editSlotForm.start_time}
                    onChange={e => setEditSlotForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Endzeit</Label>
                  <Input type="time" value={editSlotForm.end_time}
                    onChange={e => setEditSlotForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Typ</Label>
                <Select value={editSlotForm.slot_type} onValueChange={v => setEditSlotForm(f => ({ ...f, slot_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-person">Vor Ort</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="call">Telefonat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notiz</Label>
                <Input value={editSlotForm.notes}
                  onChange={e => setEditSlotForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveEditSlot} className="flex-1">Speichern</Button>
                <Button variant="destructive" onClick={() => { deleteSlot(editSlot.id); setEditSlot(null); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Session Status Dialog ── */}
      <Dialog open={!!editSession} onOpenChange={open => { if (!open) setEditSession(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Session bearbeiten</DialogTitle>
          </DialogHeader>
          {editSession && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                <p className="text-sm font-medium">{editSession.clients?.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(editSession.session_date), "EEEE, d. MMMM · HH:mm", { locale: de })} Uhr
                </p>
                <p className="text-xs text-muted-foreground">
                  {sessionTypeLabels[editSession.session_type] || editSession.session_type} · {editSession.duration_minutes} Min.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editSessionStatus} onValueChange={setEditSessionStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sessionStatuses.map(s => (
                      <SelectItem key={s} value={s}>{sessionStatusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editSessionStatus === 'Cancelled by Trainer' && editSession.status === 'Scheduled' && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  ⚠️ Der Kunde wird über die Absage benachrichtigt.
                </div>
              )}
              <Button onClick={saveSessionStatus} className="w-full">Status speichern</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Respond Dialog ── */}
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
                <Label>Notiz an Kunden (optional)</Label>
                <Textarea value={trainerNote} onChange={e => setTrainerNote(e.target.value)}
                  placeholder={respondDialog._action === 'reject' ? 'Grund für Ablehnung...' : 'Hinweis zur Bestätigung...'} rows={2} />
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
