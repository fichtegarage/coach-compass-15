import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, addDays, isBefore, isSameDay, startOfDay, differenceInDays, differenceInHours } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Clock, MapPin, Video, Phone, Loader2, LogOut, Users } from 'lucide-react';
import { buildEmail } from '@/lib/emailTemplate';
import ClientPlanView from '@/components/ClientPlanView';
import ClientMetricsWidget from '@/components/ClientMetricsWidget';
import WeeklyCheckin from '@/components/WeeklyCheckin';
import CycleTracker from '@/components/CycleTracker';
import ClientProgressPhotos from '@/components/ClientProgressPhotos';
import WeeklyCheckinModal from '@/components/WeeklyCheckinModal';
import { setClientSessionToken } from '@/lib/clientSession';

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

const impressumText = `Angaben gemäß § 5 TMG

Jakob Neumann
Milchberg 8
86150 Augsburg
Deutschland

Kontakt
Telefon: 015567 251 650
E-Mail: hallo@jakob-neumann.net
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

const LegalModal: React.FC<{ title: string; content: string; onClose: () => void }> = ({ title, content, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center p-4" onClick={onClose}>
    <div className="absolute inset-0 bg-black/50" />
    <div className="relative bg-white rounded-t-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
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

const slotTypeLabels: Record<string, string> = { 'in-person': 'Vor Ort', 'online': 'Online', 'call': 'Telefonat' };
const slotTypeIcons: Record<string, React.ReactNode> = {
  'in-person': <MapPin className="w-3.5 h-3.5" />,
  'online': <Video className="w-3.5 h-3.5" />,
  'call': <Phone className="w-3.5 h-3.5" />,
};
const statusLabels: Record<string, string> = { pending: 'Wartet auf Bestätigung', confirmed: 'Bestätigt ✅', rejected: 'Abgelehnt ❌', cancelled: 'Storniert' };
const statusColors: Record<string, string> = { pending: 'bg-amber-100 text-amber-800 border-amber-200', confirmed: 'bg-primary/20 text-primary border-primary/30', rejected: 'bg-red-100 text-red-800 border-red-200', cancelled: 'bg-gray-100 text-gray-500 border-gray-200' };

const generateIcs = (booking: any) => {
  const slot = booking.availability_slots;
  if (!slot) return;
  const start = new Date(slot.start_time);
  const end = new Date(slot.end_time);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jakob Neumann Personal Training//DE', 'BEGIN:VEVENT', `UID:${booking.id}@jakob-neumann.net`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, 'SUMMARY:Personal Training – Jakob Neumann', `DESCRIPTION:Trainingsart: ${slotTypeLabels[slot.slot_type] || slot.slot_type}`, 'LOCATION:Jakob Neumann Personal Training', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `training-${format(start, 'yyyy-MM-dd')}.ics`; a.click();
  URL.revokeObjectURL(url);
};

const BookingPage: React.FC = () => {
  const [clientId, setClientId] = useState<string | null>(() => {
    const id = localStorage.getItem('booking_client_id') || sessionStorage.getItem('booking_client_id');
    return id && id !== 'undefined' ? id : null;
  });
  const [clientName, setClientName] = useState<string>(() => {
    const name = localStorage.getItem('booking_client_name') || sessionStorage.getItem('booking_client_name') || '';
    return name === 'undefined' ? '' : name;
  });
  const [clientEmail, setClientEmail] = useState<string | null>(() => {
    const email = localStorage.getItem('booking_client_email') || sessionStorage.getItem('booking_client_email') || null;
    return email === 'undefined' ? null : email;
  });
  
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [slots, setSlots] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [scheduledSessions, setScheduledSessions] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [bookingMessage, setBookingMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<'calendar' | 'bookings' | 'plan'>('plan');
  const [summaryEnabled, setSummaryEnabled] = useState(true);
  const [showCheckin, setShowCheckin] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [clientNotifications, setClientNotifications] = useState<any[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(() => {
    const stored = sessionStorage.getItem('dismissed_notifications');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  // Paket-Info – inkl. Duo-Daten
  const [packageInfo, setPackageInfo] = useState<{
    name: string; total: number; used: number; endDate: string | null;
    isDuo?: boolean; packageId?: string;
  } | null>(null);
  const [duoPartnerName, setDuoPartnerName] = useState<string | null>(null);
  const [allSlotBookings, setAllSlotBookings] = useState<Record<string, number>>({});

const handleCodeSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const code = codeInput.trim().toUpperCase();
  if (!code) return;
  setCodeLoading(true);
  setCodeError('');

  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, email')
    .eq('booking_code', code)
    .eq('booking_code_active', true)
    .maybeSingle();

  if (error || !data || !data.id) {
    setCodeError('Dieser Code ist ungültig oder wurde deaktiviert.');
    setCodeLoading(false);
    return;
  }

  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem('booking_client_id', data.id);
  storage.setItem('booking_client_name', data.full_name);
  storage.setItem('booking_client_email', data.email || '');

  setClientId(data.id);
  setClientName(data.full_name);
  setClientEmail(data.email || null);
  setCodeLoading(false);
};


  const handleLogout = () => {
  ['booking_client_id', 'booking_client_name', 'booking_client_email', 'booking_client_token'].forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
  setClientId(null);
  setClientName('');
  setClientEmail(null);
  setPackageInfo(null);
};


  const loadData = async () => {
    if (!clientId) return;
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    const [slotsRes, bookingsRes] = await Promise.all([
      supabase.from('availability_slots').select('*').eq('is_bookable', true).gte('start_time', weekStart.toISOString()).lt('start_time', weekEnd.toISOString()).order('start_time'),
      supabase.from('booking_requests').select('*, availability_slots(start_time, end_time, slot_type)').eq('client_id', clientId).order('requested_at', { ascending: false }),
    ]);
    setSlots(slotsRes.data || []);
    setBookings(bookingsRes.data || []);
    setNotifications((bookingsRes.data || []).filter((b: any) => b.responded_at && (b.status === 'confirmed' || b.status === 'rejected')).slice(0, 3));

    // Kundendaten laden
    const { data: clientData } = await supabase.from('clients').select('*, packages!packages_client_id_fkey(id, package_name, sessions_included, end_date, is_duo, partner_client_id)').eq('id', clientId).maybeSingle();

    if (clientData) {
      if (clientData.email && clientData.email !== clientEmail) {
        setClientEmail(clientData.email);
        sessionStorage.setItem('booking_client_email', clientData.email);
      }
      if (typeof clientData.email_weekly_summary === 'boolean') setSummaryEnabled(clientData.email_weekly_summary);

      // Aktive Pakete als Hauptkunde
      const myPkgs = Array.isArray(clientData.packages) ? clientData.packages : (clientData.packages ? [clientData.packages] : []);

      // Pakete als Partner laden
      const { data: partnerPkgs } = await supabase
        .from('packages')
        .select('id, package_name, sessions_included, end_date, is_duo, partner_client_id, client_id')
        .eq('partner_client_id', clientId);

      const allPkgs = [...myPkgs, ...(partnerPkgs || [])];

      // Aktives Paket = erstes mit verbleibenden Credits (Session-Pool per package_id)
      for (const pkg of allPkgs) {
        const { count } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('package_id', pkg.id).in('status', ['Completed', 'No-Show']);
        const used = count || 0;
        if (used < pkg.sessions_included) {
          const isDuo = pkg.is_duo || false;

          // Partner-Name für Duo ermitteln
          if (isDuo) {
            const partnerId = pkg.client_id !== clientId ? pkg.client_id : pkg.partner_client_id;
            if (partnerId) {
              const { data: partnerData } = await supabase.from('clients').select('full_name').eq('id', partnerId).single();
              setDuoPartnerName(partnerData?.full_name || null);
            }
          } else {
            setDuoPartnerName(null);
          }

          setPackageInfo({ name: pkg.package_name, total: pkg.sessions_included, used, endDate: pkg.end_date || null, isDuo, packageId: pkg.id });
          break;
        }
      }
    }

    // Geplante Sessions
    const { data: sessionsData } = await supabase.from('sessions').select('*').eq('client_id', clientId).eq('status', 'Scheduled').gte('session_date', new Date().toISOString()).order('session_date');
    setScheduledSessions(sessionsData || []);

    // Ungelesene Notifications
    const { data: clientNotifs } = await supabase.from('client_notifications').select('*').eq('client_id', clientId).eq('is_read', false).order('created_at', { ascending: false });
    setClientNotifications(clientNotifs || []);

    // Wöchentlicher Check-in prüfen
    const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!sessionStorage.getItem(`checkin_skipped_${weekStartStr}`)) {
      const { data: existingCheckin } = await supabase.from('weekly_checkins').select('id').eq('client_id', clientId).eq('week_start', weekStartStr).maybeSingle();
      if (!existingCheckin) setShowCheckin(true);
    }
    setLoading(false);
  };

  useEffect(() => { if (clientId) loadData(); }, [clientId, weekStart]);

  // Slot-Buchungszähler
  useEffect(() => {
    if (!slots.length) return;
    const slotIds = slots.map(s => s.id);
    supabase.from('booking_requests').select('slot_id').in('slot_id', slotIds).in('status', ['pending', 'confirmed']).then(({ data }) => {
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { counts[r.slot_id] = (counts[r.slot_id] || 0) + 1; });
      setAllSlotBookings(counts);
    });
  }, [slots]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const slotsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    weekDays.forEach(d => { map[format(d, 'yyyy-MM-dd')] = []; });
    slots.forEach(slot => { const key = format(new Date(slot.start_time), 'yyyy-MM-dd'); if (map[key]) map[key].push(slot); });
    return map;
  }, [slots, weekDays]);

  const myBookingSlotIds = useMemo(() =>
    new Set((bookings || []).filter((b: any) => b.status === 'pending' || b.status === 'confirmed').map((b: any) => b.slot_id))
  , [bookings]);

  const handleBookSlot = async () => {
    if (!selectedSlot || !clientId) return;
    if (myBookingSlotIds.has(selectedSlot.id)) { toast.error('Du hast für diesen Slot bereits eine Anfrage gestellt.'); setSelectedSlot(null); return; }
    setSubmitting(true);
    const { error } = await supabase.from('booking_requests').insert({ slot_id: selectedSlot.id, client_id: clientId, status: 'pending', client_message: bookingMessage || null });
    if (error) { toast.error('Buchungsanfrage konnte nicht gesendet werden.'); setSubmitting(false); return; }

    const slotDate = format(new Date(selectedSlot.start_time), "EEEE, d. MMMM · HH:mm", { locale: de });
    const duoHint = packageInfo?.isDuo ? `\n<p><strong>Duo Training</strong> mit ${duoPartnerName || 'deinem Trainingspartner'}</p>` : '';
    toast.success('Deine Anfrage wurde gesendet!');

    await sendEmail('jakob.neumann@posteo.de', 'Neue Buchungsanfrage 📅',
      `<p><strong>${clientName}</strong> hat eine neue Buchungsanfrage gestellt.</p><p>Termin: <strong>${slotDate} Uhr</strong></p>${packageInfo?.isDuo ? '<p>⚠️ Duo-Paket – bitte auch Partner-Session einplanen.</p>' : ''}${bookingMessage ? `<p>Nachricht: „${bookingMessage}"</p>` : ''}<p><a href="https://buchung.jakob-neumann.net">Zur App</a></p>`
    );
    if (clientEmail) {
      await sendEmail(clientEmail, 'Deine Buchungsanfrage wurde eingereicht', buildEmail(`
        <p>Hallo ${clientName},</p>
        <p>deine Anfrage für den Termin am <strong>${slotDate} Uhr</strong> wurde eingereicht.</p>
        ${duoHint}
        <p>Du erhältst eine weitere Benachrichtigung, sobald der Termin bestätigt wurde.</p>
      `));
    }
    setSelectedSlot(null); setBookingMessage(''); setSubmitting(false); loadData();
  };

  const handleCancelRequest = async (requestId: string, slotStartTime?: string) => {
    if (slotStartTime && differenceInHours(new Date(slotStartTime), new Date()) < 24) {
      toast.error('Absagen innerhalb von 24 Stunden sind nicht möglich. Bitte kontaktiere Jakob direkt.'); return;
    }
    await supabase.from('booking_requests').update({ status: 'cancelled' }).eq('id', requestId);
    toast.success('Buchungsanfrage storniert.'); loadData();
  };

  const dismissClientNotification = async (id: string) => {
    await supabase.from('client_notifications').update({ is_read: true }).eq('id', id);
    setClientNotifications(prev => prev.filter(n => n.id !== id));
  };

  const remainingDays = useMemo(() => packageInfo?.endDate ? differenceInDays(new Date(packageInfo.endDate), new Date()) : null, [packageInfo]);

  // ── Login-Screen ────────────────────────────────────────────────────────────
  if (!clientId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex flex-col items-center justify-center px-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <div className="w-full max-w-md flex-1 flex flex-col items-center justify-center">
          <div className="text-center mb-8">
            <img src="/Logo.svg" alt="Jakob Neumann Training" className="h-12 w-auto mx-auto mb-4" />
            <p className="text-slate-500 mt-1">Personal Training – Terminbuchung</p>
          </div>
          <form onSubmit={handleCodeSubmit} className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4 w-full">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Zugangscode eingeben</label>
              <Input value={codeInput} onChange={e => { setCodeInput(e.target.value); setCodeError(''); }} placeholder="z.B. PT-X7K2MQ" className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-primary" autoFocus />
            </div>
            {codeError && <p className="text-sm text-red-600">{codeError}</p>}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
              <span className="text-sm text-slate-600">Angemeldet bleiben</span>
            </label>
            <Button type="submit" disabled={codeLoading || !codeInput.trim()} className="w-full bg-primary hover:bg-primary/90 text-white">
              {codeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Weiter'}
            </Button>
          </form>
        </div>
        <LegalFooter />
      </div>
    );
  }

  // ── App ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {showCheckin && clientId && (
        <WeeklyCheckin clientId={clientId} clientName={clientName} onDone={() => setShowCheckin(false)} />
      )}

      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <img src="/Logo-white.svg" alt="Jakob Neumann Training" className="h-10 w-auto" />
              <div>
                <p className="text-white font-bold text-lg leading-tight">{clientName}</p>
                <p className="text-orange-400 text-xs">Stronger Every Day</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {packageInfo && (
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                    {packageInfo.isDuo && <Users className="w-3 h-3 text-blue-400" />}
                    {packageInfo.name}: <span className="font-semibold text-orange-400 ml-1">{packageInfo.used}/{packageInfo.total}</span>
                  </p>
                  {remainingDays !== null && remainingDays <= 14 && (
                    <p className={`text-xs font-medium ${remainingDays <= 7 ? 'text-red-400' : 'text-amber-400'}`}>
                      {remainingDays > 0 ? `${remainingDays} Tage verbleibend` : 'Paket abgelaufen'}
                    </p>
                  )}
                </div>
              )}
              <button onClick={handleLogout} className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors" title="Abmelden">
                <LogOut className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 bg-slate-700/50 rounded-xl p-1">
            {[{ id: 'plan', label: '🏋️ Training' }, { id: 'calendar', label: '📅 Buchen' }, { id: 'bookings', label: '📋 Termine' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveView(tab.id as any)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${activeView === tab.id ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Duo-Hinweis (immer sichtbar wenn Duo-Paket aktiv) */}
      {packageInfo?.isDuo && duoPartnerName && (
        <div className="max-w-4xl mx-auto px-4 mt-3 w-full">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            Duo-Paket mit {duoPartnerName} · Geteilter Session-Pool · Buchungen immer als Duo Training
          </div>
        </div>
      )}

      {/* Booking response Notifications */}
      {notifications.filter(n => !dismissedNotifications.has(n.id)).length > 0 && activeView === 'calendar' && (
        <div className="max-w-4xl mx-auto px-4 mt-3 space-y-2 w-full">
          {notifications.filter(n => !dismissedNotifications.has(n.id)).map(n => (
            <div key={n.id} className={`rounded-lg px-4 py-2 text-sm border flex items-center justify-between gap-2 ${n.status === 'confirmed' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              <span>Deine Anfrage für {n.availability_slots ? format(new Date(n.availability_slots.start_time), "d. MMM, HH:mm", { locale: de }) : '—'} wurde <strong>{n.status === 'confirmed' ? 'bestätigt ✅' : 'abgelehnt ❌'}</strong>.{n.trainer_note && ` Hinweis: ${n.trainer_note}`}</span>
              <button onClick={() => setDismissedNotifications(prev => { const u = new Set([...prev, n.id]); sessionStorage.setItem('dismissed_notifications', JSON.stringify([...u])); return u; })} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity text-slate-400">✕</button>
            </div>
          ))}
        </div>
      )}

      {clientNotifications.length > 0 && activeView === 'calendar' && (
        <div className="max-w-4xl mx-auto px-4 mt-2 space-y-2 w-full">
          {clientNotifications.map(n => (
            <div key={n.id} className="rounded-lg px-4 py-2 text-sm border flex items-center justify-between gap-2 bg-amber-500/10 border-amber-500/30 text-amber-400">
              <span>📅 {n.message}</span>
              <button onClick={() => dismissClientNotification(n.id)} className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity text-slate-400">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-4 flex-1 w-full">

        {/* ── TRAINING TAB ── */}
        {activeView === 'plan' && (
          <div className="space-y-4">
            <ClientPlanView clientId={clientId} />
            <ClientMetricsWidget clientId={clientId} />
            <CycleTracker clientId={clientId} />
            <ClientProgressPhotos clientId={clientId} />
          </div>
        )}

        {/* ── BUCHEN TAB ── */}
        {activeView === 'calendar' && (
          <div className="space-y-4">
            {/* Paket-Status */}
            {packageInfo && (
              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {packageInfo.isDuo && <Users className="w-4 h-4 text-blue-400" />}
                    <p className="text-sm font-semibold text-white">{packageInfo.name}</p>
                  </div>
                  <p className="text-sm font-bold text-orange-400">{packageInfo.used}/{packageInfo.total} genutzt</p>
                </div>
                {/* Credit-Fortschrittsbalken */}
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${Math.min((packageInfo.used / packageInfo.total) * 100, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{packageInfo.total - packageInfo.used} Einheit{packageInfo.total - packageInfo.used !== 1 ? 'en' : ''} verbleibend</span>
                  {packageInfo.endDate && (
                    <span className={remainingDays !== null && remainingDays <= 14 ? (remainingDays <= 7 ? 'text-red-400' : 'text-amber-400') : ''}>
                      {packageInfo.endDate && `bis ${format(new Date(packageInfo.endDate), 'd. MMM yyyy', { locale: de })}`}
                    </span>
                  )}
                </div>
                {/* Duo: Hinweis zur Credit-Regelung */}
                {packageInfo.isDuo && (
                  <p className="text-xs text-blue-400/70 border-t border-slate-700 pt-2">
                    Hinweis: Jede gebuchte Einheit verbraucht einen Credit aus dem gemeinsamen Pool – unabhängig davon, ob einer oder beide trainieren.
                  </p>
                )}
              </div>
            )}

            {/* Wochennavigation */}
            <div className="flex items-center justify-between">
              <button onClick={() => setWeekStart(w => addDays(w, -7))} className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-300" />
              </button>
              <p className="text-sm font-semibold text-slate-300">
                {format(weekStart, 'd. MMM', { locale: de })} – {format(addDays(weekStart, 6), 'd. MMM yyyy', { locale: de })}
              </p>
              <button onClick={() => setWeekStart(w => addDays(w, 7))} className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
                <ChevronRight className="w-5 h-5 text-slate-300" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
            ) : (
              <div className="space-y-3">
                {weekDays.map(day => {
                  const dayKey = format(day, 'yyyy-MM-dd');
                  const daySlots = slotsByDay[dayKey] || [];
                  const isPastDay = isBefore(day, startOfDay(new Date())) && !isSameDay(day, new Date());
                  if (daySlots.length === 0) return null;
                  return (
                    <div key={dayKey}>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        {format(day, 'EEEE, d. MMMM', { locale: de })}
                        {isSameDay(day, new Date()) && <span className="ml-2 text-orange-400">Heute</span>}
                      </p>
                      <div className="space-y-2">
                        {daySlots.map(slot => {
                          const isBooked = myBookingSlotIds.has(slot.id);
                          const totalBooked = allSlotBookings[slot.id] || 0;
                          const isFull = totalBooked >= (slot.max_bookings ?? 1) && !isBooked;
                          const isPast = isPastDay || isBefore(new Date(slot.start_time), new Date());
                          return (
                            <button
                              key={slot.id}
                              disabled={isBooked || isFull || isPast}
                              onClick={() => { if (!isBooked && !isFull && !isPast) setSelectedSlot(slot); }}
                              className={`w-full rounded-xl border p-3 flex items-center gap-3 transition-all text-left ${
                                isBooked ? 'bg-primary/10 border-primary/30 opacity-70 cursor-not-allowed'
                                : isFull || isPast ? 'bg-slate-800/50 border-slate-700/50 opacity-40 cursor-not-allowed'
                                : 'bg-slate-800 border-slate-700 hover:border-orange-500/50 hover:bg-slate-700 active:scale-[0.99]'
                              }`}
                            >
                              <div className={`p-2 rounded-lg flex-shrink-0 ${isBooked ? 'bg-primary/20' : 'bg-slate-700'}`}>
                                {slotTypeIcons[slot.slot_type] || <Clock className="w-3.5 h-3.5 text-slate-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">
                                  {format(new Date(slot.start_time), 'HH:mm')} – {format(new Date(slot.end_time), 'HH:mm')} Uhr
                                </p>
                                <p className="text-xs text-slate-400">{slotTypeLabels[slot.slot_type] || slot.slot_type}</p>
                              </div>
                              <div className="flex-shrink-0">
                                {isBooked ? <span className="text-xs text-primary font-medium">Angefragt</span>
                                : isFull ? <span className="text-xs text-slate-500">Ausgebucht</span>
                                : isPast ? <span className="text-xs text-slate-500">Abgelaufen</span>
                                : <span className="text-xs text-orange-400 font-medium">Anfragen →</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {weekDays.every(d => (slotsByDay[format(d, 'yyyy-MM-dd')] || []).length === 0) && (
                  <div className="text-center py-12">
                    <p className="text-slate-500 text-sm">Keine freien Slots in dieser Woche.</p>
                    <p className="text-slate-600 text-xs mt-1">Schau in der nächsten Woche oder kontaktiere Jakob.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TERMINE TAB ── */}
        {activeView === 'bookings' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Meine Termine</h2>

            {scheduledSessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Bestätigte Einheiten</h3>
                {scheduledSessions.map(s => (
                  <div key={s.id} className="rounded-xl bg-slate-800 border border-slate-700 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{format(new Date(s.session_date), "EEEE, d. MMM · HH:mm", { locale: de })} Uhr</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.session_type === 'Duo Training' ? '👥 Duo Training' : s.session_type} · {s.duration_minutes} Min.</p>
                      </div>
                      <Badge className="bg-success/10 text-success border-success/20 text-xs flex-shrink-0">Bestätigt</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Buchungsanfragen</h3>
              {bookings.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">Noch keine Anfragen gestellt.</p>
              ) : (
                bookings.map(b => (
                  <div key={b.id} className={`rounded-xl border p-3 space-y-2 ${b.status === 'pending' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800 border-slate-700'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">
                          {b.availability_slots ? format(new Date(b.availability_slots.start_time), "EEEE, d. MMM · HH:mm", { locale: de }) + ' Uhr' : 'Slot nicht verfügbar'}
                        </p>
                        {b.availability_slots && <p className="text-xs text-slate-400 mt-0.5">{slotTypeLabels[b.availability_slots.slot_type] || b.availability_slots.slot_type}</p>}
                        {b.client_message && <p className="text-xs text-slate-500 mt-1 italic">„{b.client_message}"</p>}
                        {b.trainer_note && <p className="text-xs text-orange-400 mt-1">Hinweis: {b.trainer_note}</p>}
                      </div>
                      <Badge variant="outline" className={`text-xs flex-shrink-0 ${statusColors[b.status] || ''}`}>
                        {statusLabels[b.status] || b.status}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      {b.status === 'confirmed' && b.availability_slots && (
                        <button onClick={() => generateIcs(b)} className="text-xs text-slate-400 hover:text-white transition-colors">
                          📅 Kalender-Eintrag
                        </button>
                      )}
                      {b.status === 'pending' && (
                        <button onClick={() => handleCancelRequest(b.id, b.availability_slots?.start_time)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                          Anfrage zurückziehen
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Buchungs-Dialog */}
      <Dialog open={!!selectedSlot} onOpenChange={open => { if (!open) { setSelectedSlot(null); setBookingMessage(''); } }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Termin anfragen</DialogTitle>
          </DialogHeader>
          {selectedSlot && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-700 p-3 space-y-1">
                <p className="font-semibold">{format(new Date(selectedSlot.start_time), "EEEE, d. MMMM", { locale: de })}</p>
                <p className="text-sm text-slate-300">{format(new Date(selectedSlot.start_time), 'HH:mm')} – {format(new Date(selectedSlot.end_time), 'HH:mm')} Uhr · {slotTypeLabels[selectedSlot.slot_type]}</p>
                {packageInfo?.isDuo && duoPartnerName && (
                  <p className="text-xs text-blue-400 flex items-center gap-1 mt-1"><Users className="w-3 h-3" />Duo Training mit {duoPartnerName}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nachricht an Jakob (optional)</label>
                <Textarea value={bookingMessage} onChange={e => setBookingMessage(e.target.value)} placeholder="z.B. besondere Wünsche oder Hinweise..." rows={3} className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 resize-none" />
              </div>
              <Button onClick={handleBookSlot} disabled={submitting} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Termin anfragen'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LegalFooter />
    </div>
  );
};

export default BookingPage;
