import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, addDays, isBefore, isSameDay, addWeeks, subWeeks, startOfDay, differenceInDays, differenceInHours } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Clock, MapPin, Video, Phone, Loader2, LogOut } from 'lucide-react';

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
        <button onClick={() => setModal('impressum')} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Impressum</button>
        <button onClick={() => setModal('datenschutz')} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Datenschutz</button>
      </footer>
      {modal === 'impressum' && <LegalModal title="Impressum" content={impressumText} onClose={() => setModal(null)} />}
      {modal === 'datenschutz' && <LegalModal title="Datenschutzerklärung" content={datenschutzText} onClose={() => setModal(null)} />}
    </>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

const slotTypeLabels: Record<string, string> = {
  'in-person': 'Vor Ort',
  'online': 'Online',
  'call': 'Telefonat',
};

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Vor Ort',
  'Online Training': 'Online',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In',
  'Free Intro': 'Erstgespräch',
};

const slotTypeIcons: Record<string, React.ReactNode> = {
  'in-person': <MapPin className="w-3.5 h-3.5" />,
  'online': <Video className="w-3.5 h-3.5" />,
  'call': <Phone className="w-3.5 h-3.5" />,
};

// Feature 8: Klare Statusbezeichnungen
const statusLabels: Record<string, string> = {
  pending: 'Wartet auf Bestätigung',
  confirmed: 'Bestätigt ✅',
  rejected: 'Abgelehnt ❌',
  cancelled: 'Storniert',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
};

const generateIcs = (booking: any) => {
  const slot = booking.availability_slots;
  if (!slot) return;
  const start = new Date(slot.start_time);
  const end = new Date(slot.end_time);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Jakob Neumann Personal Training//DE',
    'BEGIN:VEVENT',
    `UID:${booking.id}@jakob-neumann.net`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    'SUMMARY:Personal Training – Jakob Neumann',
    `DESCRIPTION:Trainingsart: ${slotTypeLabels[slot.slot_type] || slot.slot_type}`,
    'LOCATION:Jakob Neumann Personal Training',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-${format(start, 'yyyy-MM-dd')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
};

const BookingPage: React.FC = () => {
  const [clientId, setClientId] = useState<string | null>(() => sessionStorage.getItem('booking_client_id'));
  const [clientName, setClientName] = useState<string>(() => sessionStorage.getItem('booking_client_name') || '');
  const [clientEmail, setClientEmail] = useState<string | null>(() => sessionStorage.getItem('booking_client_email') || null);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const [slots, setSlots] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [scheduledSessions, setScheduledSessions] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [bookingMessage, setBookingMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRequests, setShowRequests] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [clientNotifications, setClientNotifications] = useState<any[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(() => {
    const stored = sessionStorage.getItem('dismissed_notifications');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  // Feature 11: Paketlaufzeit
  const [packageInfo, setPackageInfo] = useState<{
    name: string; total: number; used: number; endDate: string | null;
  } | null>(null);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    setCodeLoading(true);
    setCodeError('');
    const { data, error } = await supabase
      .from('clients')
      .select('id, full_name, email')
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
    if (data.email) sessionStorage.setItem('booking_client_email', data.email);
    setClientId(data.id);
    setClientName(data.full_name);
    setClientEmail(data.email || null);
    setCodeLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('booking_client_id');
    sessionStorage.removeItem('booking_client_name');
    sessionStorage.removeItem('booking_client_email');
    setClientId(null);
    setClientName('');
    setClientEmail(null);
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

    const { data: clientData } = await supabase
      .from('clients')
      .select('*, packages(id, package_name, sessions_included, end_date)')
      .eq('id', clientId)
      .maybeSingle();

    if (clientData) {
      if (clientData.email && clientData.email !== clientEmail) {
        setClientEmail(clientData.email);
        sessionStorage.setItem('booking_client_email', clientData.email);
      }
      if (clientData.packages) {
        const pkg = Array.isArray(clientData.packages) ? clientData.packages[0] : clientData.packages;
        if (pkg) {
          const { count } = await supabase
            .from('sessions')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', clientId)
            .in('status', ['Completed', 'No-Show']);
          setPackageInfo({
            name: pkg.package_name,
            total: pkg.sessions_included,
            used: count || 0,
            endDate: pkg.end_date || null,
          });
        }
      }
    }

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'Scheduled')
      .gte('session_date', new Date().toISOString())
      .order('session_date');
    setScheduledSessions(sessionsData || []);

    const { data: clientNotifs } = await supabase
      .from('client_notifications')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    setClientNotifications(clientNotifs || []);

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

  // Feature 10: Alle Slots mit aktiver Anfrage des Kunden
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

    // Feature 10: Doppelbuchung verhindern
    if (myBookingSlotIds.has(selectedSlot.id)) {
      toast.error('Du hast für diesen Slot bereits eine Anfrage gestellt.');
      setSelectedSlot(null);
      return;
    }

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

    const slotDate = format(new Date(selectedSlot.start_time), "EEEE, d. MMMM · HH:mm", { locale: de });

    // E-Mail an Trainer
    await sendEmail(
      'jakob.neumann@posteo.de',
      'Neue Buchungsanfrage 📅',
      `<p><strong>${clientName}</strong> hat eine neue Buchungsanfrage gestellt.</p>
       <p>Termin: <strong>${slotDate} Uhr</strong></p>
       ${bookingMessage ? `<p>Nachricht: „${bookingMessage}"</p>` : ''}
       <p><a href="https://buchung.jakob-neumann.net">Zur App</a></p>`
    );

    // Eingangsbestätigung an Kunden
    if (clientEmail) {
      await sendEmail(
        clientEmail,
        'Deine Buchungsanfrage wurde eingereicht',
        `<p>Hallo ${clientName},</p>
         <p>deine Anfrage für den Termin am <strong>${slotDate} Uhr</strong> wurde eingereicht.</p>
         <p>Du erhältst eine weitere Benachrichtigung, sobald Jakob deinen Termin bestätigt hat.</p>
         <p>Bis bald,<br/>Jakob Neumann Personal Training</p>`
      );
    }

    setSelectedSlot(null);
    setBookingMessage('');
    setSubmitting(false);
    loadData();
  };

  // Feature 7: Stornierung mit 24h-Sperre
  const handleCancelRequest = async (requestId: string, slotStartTime?: string) => {
    if (slotStartTime) {
      const hoursUntilSlot = differenceInHours(new Date(slotStartTime), new Date());
      if (hoursUntilSlot < 24) {
        toast.error('Absagen innerhalb von 24 Stunden vor dem Termin sind nicht möglich. Bitte kontaktiere Jakob direkt.');
        return;
      }
    }
    await supabase.from('booking_requests').update({ status: 'cancelled' }).eq('id', requestId);
    toast.success('Buchungsanfrage storniert.');
    loadData();
  };

  const dismissClientNotification = async (id: string) => {
    await supabase.from('client_notifications').update({ is_read: true }).eq('id', id);
    setClientNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Feature 11: Verbleibende Tage im Paket
  const remainingDays = useMemo(() => {
    if (!packageInfo?.endDate) return null;
    const days = differenceInDays(new Date(packageInfo.endDate), new Date());
    return days;
  }, [packageInfo]);

  // Access gate
  if (!clientId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex flex-col items-center justify-center px-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <meta name="robots" content="noindex" />
        <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center">
          <div className="text-center mb-8">
            <img src="/Logo.svg" alt="Jakob Neumann Training" className="h-12 w-auto mx-auto mb-4" />
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex flex-col" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <meta name="robots" content="noindex" />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src="/Logo.svg" alt="Jakob Neumann Training" className="h-8 w-auto" />
          <div className="text-right">
            <p className="text-base font-semibold text-slate-900">Hallo, {clientName} 👋</p>
            {packageInfo && (
              <div className="flex flex-col items-end gap-0.5">
                <p className="text-xs text-slate-400">
                  {packageInfo.name}: <span className="font-medium text-emerald-600">{packageInfo.used}/{packageInfo.total}</span> Einheiten
                </p>
                {/* Feature 11: Paketlaufzeit */}
                {remainingDays !== null && (
                  <p className={`text-xs font-medium ${remainingDays <= 7 ? 'text-red-500' : remainingDays <= 14 ? 'text-amber-500' : 'text-slate-400'}`}>
                    {remainingDays > 0
                      ? `Paket läuft noch ${remainingDays} Tag${remainingDays === 1 ? '' : 'e'}`
                      : 'Paket abgelaufen'}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowRequests(!showRequests)} className="text-slate-600 hover:text-slate-900 hover:bg-slate-100">
              {showRequests ? 'Kalender' : 'Meine Buchungen'}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Booking response notifications */}
      {notifications.filter(n => !dismissedNotifications.has(n.id)).length > 0 && !showRequests && (
        <div className="max-w-4xl mx-auto px-4 mt-3 space-y-2 w-full">
          {notifications.filter(n => !dismissedNotifications.has(n.id)).map(n => (
            <div key={n.id} className={`rounded-lg px-4 py-2 text-sm border flex items-center justify-between gap-2 ${n.status === 'confirmed' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              <span>
                Deine Anfrage für {n.availability_slots ? format(new Date(n.availability_slots.start_time), "d. MMM, HH:mm", { locale: de }) : '—'} wurde{' '}
                <strong>{n.status === 'confirmed' ? 'bestätigt ✅' : 'abgelehnt ❌'}</strong>.
                {n.trainer_note && ` Hinweis: ${n.trainer_note}`}
              </span>
              <button
                onClick={() => setDismissedNotifications(prev => {
                  const updated = new Set([...prev, n.id]);
                  sessionStorage.setItem('dismissed_notifications', JSON.stringify([...updated]));
                  return updated;
                })}
                className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Trainer-cancellation notifications */}
      {clientNotifications.length > 0 && !showRequests && (
        <div className="max-w-4xl mx-auto px-4 mt-2 space-y-2 w-full">
          {clientNotifications.map(n => (
            <div key={n.id} className="rounded-lg px-4 py-2 text-sm border flex items-center justify-between gap-2 bg-red-50 border-red-200 text-red-800">
              <span>📅 {n.message}</span>
              <button onClick={() => dismissClientNotification(n.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-4 flex-1 w-full">
        {/* Feature 6: Vollständige Buchungshistorie */}
        {showRequests ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Meine Buchungen</h2>

            {/* Geplante Sessions */}
            {scheduledSessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Bestätigte Einheiten</h3>
                {scheduledSessions.map(s => (
                  <div key={s.id} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {format(new Date(s.session_date), "EEEE, d. MMMM · HH:mm", { locale: de })} Uhr
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {sessionTypeLabels[s.session_type] || s.session_type} · {s.duration_minutes} Min. · {s.location || 'Gym'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => {
                          const start = new Date(s.session_date);
                          const end = new Date(start.getTime() + s.duration_minutes * 60000);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
                          const ics = [
                            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jakob Neumann Personal Training//DE',
                            'BEGIN:VEVENT',
                            `UID:${s.id}@jakob-neumann.net`,
                            `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
                            'SUMMARY:Personal Training – Jakob Neumann',
                            `DESCRIPTION:${sessionTypeLabels[s.session_type] || s.session_type}`,
                            `LOCATION:${s.location || 'Jakob Neumann Personal Training'}`,
                            'END:VEVENT', 'END:VCALENDAR',
                          ].join('\r\n');
                          const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url;
                          a.download = `training-${format(start, 'yyyy-MM-dd')}.ics`;
                          a.click(); URL.revokeObjectURL(url);
                        }}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 text-xs"
                      >+ Kalender</Button>
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">Bestätigt ✅</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Alle Buchungsanfragen */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Anfragen & Verlauf</h3>
              {bookings.length === 0 ? (
                <p className="text-slate-500 text-sm py-6 text-center">Noch keine Anfragen</p>
              ) : (
                bookings.map((b: any) => {
                  const slotStart = b.availability_slots?.start_time;
                  const hoursUntil = slotStart ? differenceInHours(new Date(slotStart), new Date()) : 999;
                  const canCancel = (b.status === 'pending' || b.status === 'confirmed') && hoursUntil >= 24;
                  const withinLock = (b.status === 'pending' || b.status === 'confirmed') && hoursUntil < 24;

                  return (
                    <Card key={b.id} className="bg-white border-slate-200 shadow-sm">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {slotStart
                              ? `${format(new Date(slotStart), "EEEE, d. MMM · HH:mm", { locale: de })} – ${format(new Date(b.availability_slots.end_time), "HH:mm", { locale: de })}`
                              : 'Slot entfernt'}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                          {b.trainer_note && <p className="text-xs text-slate-500 mt-1 italic">Hinweis: {b.trainer_note}</p>}
                          {/* Feature 7: Hinweis bei 24h-Sperre */}
                          {withinLock && (
                            <p className="text-xs text-amber-600 mt-1">
                              ⚠️ Absage nicht mehr möglich (weniger als 24h). Bitte kontaktiere Jakob direkt.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-col sm:flex-row ml-3">
                          <Badge variant="outline" className={statusColors[b.status]}>
                            {statusLabels[b.status]}
                          </Badge>
                          {canCancel && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => handleCancelRequest(b.id, slotStart)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                            >Stornieren</Button>
                          )}
                          {b.status === 'confirmed' && slotStart && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => generateIcs(b)}
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs"
                            >+ Kalender</Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Geplante Einheiten im Kalender-View */}
            {scheduledSessions.length > 0 && (
              <div className="mb-6 space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Deine nächsten Einheiten</h3>
                {scheduledSessions.map(s => (
                  <div key={s.id} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {format(new Date(s.session_date), "EEEE, d. MMMM · HH:mm", { locale: de })} Uhr
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {sessionTypeLabels[s.session_type] || s.session_type} · {s.duration_minutes} Min. · {s.location || 'Gym'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => {
                          const start = new Date(s.session_date);
                          const end = new Date(start.getTime() + s.duration_minutes * 60000);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
                          const ics = [
                            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jakob Neumann Personal Training//DE',
                            'BEGIN:VEVENT',
                            `UID:${s.id}@jakob-neumann.net`,
                            `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
                            'SUMMARY:Personal Training – Jakob Neumann',
                            `DESCRIPTION:${sessionTypeLabels[s.session_type] || s.session_type}`,
                            `LOCATION:${s.location || 'Jakob Neumann Personal Training'}`,
                            'END:VEVENT', 'END:VCALENDAR',
                          ].join('\r\n');
                          const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url;
                          a.download = `training-${format(start, 'yyyy-MM-dd')}.ics`;
                          a.click(); URL.revokeObjectURL(url);
                        }}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100 text-xs"
                      >+ Kalender</Button>
                      <span className="text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">
                        Bestätigt ✅
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Wochenkalender */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))} className="text-slate-600 hover:bg-slate-200">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-base font-semibold text-slate-900">
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
                              disabled={isPast || slotPast || isFull || isMyBooking}
                              onClick={() => { if (isMyBooking) return; setSelectedSlot(slot); }}
                              className={`w-full text-left rounded-lg px-3 py-2.5 border transition-all ${
                                isMyBooking
                                  ? 'bg-emerald-50 border-emerald-200 cursor-default'
                                  : isFull || slotPast
                                  ? 'bg-slate-50 border-slate-100 cursor-not-allowed'
                                  : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-sm cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-sm font-medium text-slate-900">
                                    {format(new Date(slot.start_time), 'HH:mm')} – {format(new Date(slot.end_time), 'HH:mm')}
                                  </span>
                                  <span className="text-xs text-slate-500 flex items-center gap-1">
                                    {slotTypeIcons[slot.slot_type]}{slotTypeLabels[slot.slot_type]}
                                  </span>
                                </div>
                                {/* Feature 10: Zeige Status wenn bereits gebucht */}
                                {isMyBooking && myBooking && (
                                  <Badge variant="outline" className={statusColors[myBooking.status]}>
                                    {statusLabels[myBooking.status]}
                                  </Badge>
                                )}
                                {isFull && !isMyBooking && <span className="text-xs text-slate-400">Ausgebucht</span>}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <LegalFooter />

      {/* Buchungs-Dialog */}
      <Dialog open={!!selectedSlot} onOpenChange={open => { if (!open) setSelectedSlot(null); }}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Termin anfragen</DialogTitle>
          </DialogHeader>
          {selectedSlot && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                <p className="text-sm font-medium text-slate-900">{format(new Date(selectedSlot.start_time), "EEEE, d. MMMM yyyy", { locale: de })}</p>
                <p className="text-sm text-slate-600">{format(new Date(selectedSlot.start_time), 'HH:mm')} – {format(new Date(selectedSlot.end_time), 'HH:mm')} Uhr</p>
                <p className="text-xs text-slate-500 flex items-center gap-1">{slotTypeIcons[selectedSlot.slot_type]} {slotTypeLabels[selectedSlot.slot_type]}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nachricht an den Trainer (optional)</label>
                <Textarea
                  value={bookingMessage}
                  onChange={e => setBookingMessage(e.target.value)}
                  placeholder="z.B. Schwerpunkt Oberkörper gewünscht..."
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                  rows={3}
                />
              </div>
              <Button onClick={handleBookSlot} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Termin anfragen'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingPage;
