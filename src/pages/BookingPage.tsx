import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, addDays, isBefore, isSameDay, addWeeks, subWeeks, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Clock, MapPin, Video, Phone, Loader2, LogOut, CalendarDays } from 'lucide-react';

// ── Legal texts ───────────────────────────────────────────────────────────────
const impressumText = `Angaben gemäß § 5 TMG

Jakob Neumann
Milchberg 8
86150 Augsburg
Deutschland

Kontakt
Telefon: 015154823993
E-Mail: jakob.neumann@posteo.de
Website: buchung.jakob-neumann.net`;

const datenschutzText = `Diese Datenschutzerklärung gilt für die Webanwendung unter buchung.jakob-neumann.net.

1. Erhobene Daten
Wir verarbeiten: E-Mail-Adresse, Name, Buchungscode, Trainingseinheiten, Körperwerte sowie technische Zugriffsdaten.

2. Zweck
Verwaltung von Trainingsterminen, Dokumentation von Fortschritten und technischer Betrieb der Anwendung.

3. Rechtsgrundlage
Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Für Gesundheitsdaten: Art. 9 Abs. 2 lit. a DSGVO.

4. Drittanbieter
Supabase Inc. (Datenbank, EU-Server Frankfurt) – supabase.com/privacy
Vercel Inc. (Hosting) – vercel.com/legal/privacy-policy

5. Speicherdauer
Daten werden nach Beendigung des Trainingsverhältnisses auf Anfrage gelöscht.

6. Ihre Rechte
Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit.
Kontakt: jakob.neumann@posteo.de

7. Datensicherheit
Alle Übertragungen erfolgen verschlüsselt via HTTPS.`;

// ── Legal Modal ───────────────────────────────────────────────────────────────
const LegalModal: React.FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/50" />
    <div
      className="relative bg-white rounded-t-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-xl"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <h2 className="font-semibold text-lg text-slate-900">{title}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
      </div>
      <div className="overflow-y-auto p-4">
        <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{content}</p>
      </div>
    </div>
  </div>
);

// ── Legal Footer ──────────────────────────────────────────────────────────────
const LegalFooter: React.FC = () => {
  const [modal, setModal] = useState<'impressum' | 'datenschutz' | null>(null);
  return (
    <>
      <footer className="py-4 flex gap-4 justify-center">
        <button
          onClick={() => setModal('impressum')}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Impressum
        </button>
        <button
          onClick={() => setModal('datenschutz')}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Datenschutz
        </button>
      </footer>
      {modal === 'impressum' && (
        <LegalModal title="Impressum" content={impressumText} onClose={() => setModal(null)} />
      )}
      {modal === 'datenschutz' && (
        <LegalModal title="Datenschutzerklärung" content={datenschutzText} onClose={() => setModal(null)} />
      )}
    </>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const slotTypeLabels: Record<string, string> = {
  'in-person': 'Vor Ort',
  'online': 'Online',
  'call': 'Telefonat',
};

const slotTypeIcons: Record<string, React.ReactNode> = {
  'in-person': <MapPin className="w-3.5 h-3.5" />,
  'online': <Video className="w-3.5 h-3.5" />,
  'call': <Phone className="w-3.5 h-3.5" />,
};

const statusLabels: Record<string, string> = {
  pending: 'Ausstehend',
  confirmed: 'Bestätigt',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};

const BookingPage: React.FC = () => {
  const [clientId, setClientId] = useState<string | null>(() => sessionStorage.getItem('booking_client_id'));
  const [clientName, setClientName] = useState<string>(() => sessionStorage.getItem('booking_client_name') || '');
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const [slots, setSlots] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [bookingMessage, setBookingMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRequests, setShowRequests] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    setCodeLoading(true);
    setCodeError('');
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('booking_code', code)
      .eq('booking_code_active', true)
      .maybeSingle();

    if (error || !data) {
      setCodeError('Dieser Code ist ungültig oder wurde deaktiviert.');
      setCodeLoading(false);
      return;
    }
    sessionStorage.setItem('booking_client_id', data.id);
    sessionStorage.setItem('booking_client_name', data.full_name);
    setClientId(data.id);
    setClientName(data.full_name);
    setCodeLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('booking_client_id');
    sessionStorage.removeItem('booking_client_name');
    setClientId(null);
    setClientName('');
  };

  const loadData = async () => {
    if (!clientId) return;
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    const [slotsRes, bookingsRes] = await Promise.all([
      supabase
        .from('availability_slots')
        .select('*')
        .eq('is_bookable', true)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString())
        .order('start_time'),
      supabase
        .from('booking_requests')
        .select('*, availability_slots(start_time, end_time, slot_type)')
        .eq('client_id', clientId)
        .order('requested_at', { ascending: false }),
    ]);
    setSlots(slotsRes.data || []);
    setBookings(bookingsRes.data || []);

    const recentResponses = (bookingsRes.data || []).filter(
      (b: any) => b.responded_at && (b.status === 'confirmed' || b.status === 'rejected')
    );
    setNotifications(recentResponses.slice(0, 3));
    setLoading(false);
  };

  useEffect(() => {
    if (clientId) loadData();
  }, [clientId, weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const slotsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    weekDays.forEach(d => { map[format(d, 'yyyy-MM-dd')] = []; });
    (slots || []).forEach(slot => {
      const key = format(new Date(slot.start_time), 'yyyy-MM-dd');
      if (map[key]) map[key].push(slot);
    });
    return map;
  }, [slots, weekDays]);

  const myBookingSlotIds = useMemo(() => {
    return new Set(
      (bookings || [])
        .filter((b: any) => b.status === 'pending' || b.status === 'confirmed')
        .map((b: any) => b.slot_id)
    );
  }, [bookings]);

  const [allSlotBookings, setAllSlotBookings] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!slots.length) return;
    const slotIds = slots.map(s => s.id);
    supabase
      .from('booking_requests')
      .select('slot_id')
      .in('slot_id', slotIds)
      .in('status', ['pending', 'confirmed'])
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          counts[r.slot_id] = (counts[r.slot_id] || 0) + 1;
        });
        setAllSlotBookings(counts);
      });
  }, [slots]);

  const handleBookSlot = async () => {
    if (!selectedSlot || !clientId) return;
    setSubmitting(true);
    const { error } = await supabase.from('booking_requests').insert({
      slot_id: selectedSlot.id,
      client_id: clientId,
      status: 'pending',
      client_message: bookingMessage || null,
    });
    if (error) {
      toast.error('Buchungsanfrage konnte nicht gesendet werden.');
      setSubmitting(false);
      return;
    }
    toast.success('Deine Anfrage wurde gesendet. Du hörst bald von deinem Trainer!');
    setSelectedSlot(null);
    setBookingMessage('');
    setSubmitting(false);
    loadData();
  };

  const handleCancelRequest = async (requestId: string) => {
    await supabase.from('booking_requests').update({ status: 'cancelled' }).eq('id', requestId);
    toast.success('Buchungsanfrage storniert.');
    loadData();
  };

  // Access gate
  if (!clientId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex flex-col items-center justify-center px-4">
        <meta name="robots" content="noindex" />
        <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Jakob Neumann
            </h1>
            <p className="text-slate-500 mt-1">Personal Training – Terminbuchung</p>
          </div>
          <form onSubmit={handleCodeSubmit} className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4 w-full">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Zugangscode eingeben</label>
              <Input
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value); setCodeError(''); }}
                placeholder="z.B. PT-X7K2MQ"
                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500"
                autoFocus
              />
            </div>
            {codeError && <p className="text-sm text-red-600">{codeError}</p>}
            <Button
              type="submit"
              disabled={codeLoading || !codeInput.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {codeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Weiter'}
            </Button>
          </form>
        </div>
        <LegalFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex flex-col">
      <meta name="robots" content="noindex" />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Jakob Neumann
            </h1>
            <p className="text-xs text-slate-500">Hallo, {clientName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRequests(!showRequests)}
              className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              {showRequests ? 'Kalender' : 'Meine Anfragen'}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {notifications.length > 0 && !showRequests && (
        <div className="max-w-4xl mx-auto px-4 mt-3 space-y-2 w-full">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`rounded-lg px-4 py-2 text-sm border ${n.status === 'confirmed' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}
            >
              Deine Anfrage für {n.availability_slots ? format(new Date(n.availability_slots.start_time), "d. MMM, HH:mm", { locale: de }) : '—'} wurde{' '}
              <strong>{n.status === 'confirmed' ? 'bestätigt' : 'abgelehnt'}</strong>.
              {n.trainer_note && ` Hinweis: ${n.trainer_note}`}
            </div>
          ))}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-4 flex-1 w-full">
        {showRequests ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Meine Buchungsanfragen
            </h2>
            {bookings.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">Noch keine Anfragen</p>
            ) : (
              bookings.map((b: any) => (
                <Card key={b.id} className="bg-white border-slate-200 shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {b.availability_slots
                          ? `${format(new Date(b.availability_slots.start_time), "EEEE, d. MMM · HH:mm", { locale: de })} – ${format(new Date(b.availability_slots.end_time), "HH:mm", { locale: de })}`
                          : 'Slot entfernt'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {b.availability_slots && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            {slotTypeIcons[b.availability_slots.slot_type]}
                            {slotTypeLabels[b.availability_slots.slot_type]}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          Angefragt {format(new Date(b.requested_at), "d. MMM, HH:mm", { locale: de })}
                        </span>
                      </div>
                      {b.client_message && <p className="text-xs text-slate-500 mt-1">„{b.client_message}"</p>}
                      {b.trainer_note && <p className="text-xs text-slate-500 mt-1 italic">Trainer: {b.trainer_note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColors[b.status]}>
                        {statusLabels[b.status]}
                      </Badge>
                      {b.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelRequest(b.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                        >
                          Stornieren
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="text-slate-600 hover:bg-slate-200">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-base font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {format(weekStart, "d. MMM", { locale: de })} – {format(addDays(weekStart, 6), "d. MMM yyyy", { locale: de })}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))} className="text-slate-600 hover:bg-slate-200">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            <div className="space-y-2">
              {weekDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const daySlots = slotsByDay[key] || [];
                const isPast = isBefore(day, startOfDay(new Date())) && !isSameDay(day, new Date());
                return (
                  <div key={key} className={`rounded-xl border bg-white ${isPast ? 'opacity-50' : 'border-slate-200'}`}>
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className={`text-sm font-semibold ${isSameDay(day, new Date()) ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {format(day, 'EEEE, d. MMMM', { locale: de })}
                        {isSameDay(day, new Date()) && <span className="ml-2 text-xs font-normal text-emerald-500">Heute</span>}
                      </p>
                    </div>
                    <div className="p-3 space-y-2">
                      {daySlots.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-2">Keine verfügbaren Slots</p>
                      ) : (
                        daySlots.map(slot => {
                          const isMyBooking = myBookingSlotIds.has(slot.id);
                          const myBooking = bookings.find((b: any) => b.slot_id === slot.id && (b.status === 'pending' || b.status === 'confirmed'));
                          const totalBooked = allSlotBookings[slot.id] || 0;
                          const isFull = totalBooked >= slot.max_bookings && !isMyBooking;
                          const slotPast = isBefore(new Date(slot.start_time), new Date());
                          return (
                            <button
                              key={slot.id}
                              disabled={isPast |
