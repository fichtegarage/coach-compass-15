import { getLatestConversation, getHealthRecord } from '@/lib/onboarding-api';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft, User, Pin, Plus, CalendarDays, Package, TrendingUp, Activity,
  StickyNote, AlertTriangle, Flame, Loader2, Edit, FileText, Check, Circle, Trash2, Camera,
  Key, Copy, RefreshCw, CalendarCheck, Download, Lock
} from 'lucide-react';
import { format, formatDistanceToNow, differenceInWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Checkbox } from '@/components/ui/checkbox';
import ProgressPhotos from '@/components/ProgressPhotos';
import BookSessionDialog from '@/components/BookSessionDialog';
import { exportSingleClient, type ExportClientData } from '@/lib/exportForClaude';
import TrainingPlanTab from '@/components/TrainingPlanTab';
import WorkoutHistoryTab from '@/components/WorkoutHistoryTab';
import ClientEquipmentTab from '@/components/ClientEquipmentTab';

interface PackageFeature {
  label: string;
  key: string;
  manual?: boolean;
}

const packageFeaturesMap: Record<string, PackageFeature[]> = {
  'Testkunde': [
    { label: 'Persönliches Erstgespräch & Zielsetzung', key: 'erstgespraech', manual: true },
    { label: 'Trainingseinheiten', key: 'sessions' },
    { label: 'Trainingsplan passend zu deinen Zielen', key: 'trainingsplan', manual: true },
    { label: 'Fortschrittsdokumentation', key: 'fortschrittsdoku' },
    { label: 'Feedback nach letzter Einheit erhalten', key: 'feedback_erhalten', manual: true },
  ],
  'Test-Duo': [
    { label: 'Persönliches Erstgespräch & Zielsetzung', key: 'erstgespraech', manual: true },
    { label: 'Trainingseinheiten (Duo)', key: 'sessions' },
    { label: 'Trainingsplan passend zu euren Zielen', key: 'trainingsplan', manual: true },
    { label: 'Fortschrittsdokumentation', key: 'fortschrittsdoku' },
    { label: 'Feedback nach letzter Einheit erhalten', key: 'feedback_erhalten', manual: true },
  ],
  'Starter': [
    { label: 'Persönliches Erstgespräch & Zielsetzung', key: 'erstgespraech', manual: true },
    { label: 'Trainingseinheiten', key: 'sessions' },
    { label: 'Trainingsplan passend zu deinen Zielen', key: 'trainingsplan', manual: true },
    { label: 'Fortschrittsdokumentation', key: 'fortschrittsdoku' },
  ],
  'Transformation': [
    { label: 'Persönliches Erstgespräch & Zielsetzung', key: 'erstgespraech', manual: true },
    { label: 'Trainingseinheiten', key: 'sessions' },
    { label: 'Trainingsplan passend zu deinen Zielen', key: 'trainingsplan', manual: true },
    { label: 'Fortschrittsdokumentation', key: 'fortschrittsdoku' },
    { label: 'Monatliche Check-in-Calls', key: 'checkin_calls' },
    { label: 'Angepasster Ernährungsleitfaden', key: 'ernaehrung', manual: true },
    { label: 'Fortschrittsfotos & Messung', key: 'fortschrittsfotos' },
  ],
  'Intensiv': [
    { label: 'Persönliches Erstgespräch & Zielsetzung', key: 'erstgespraech', manual: true },
    { label: 'Trainingseinheiten', key: 'sessions' },
    { label: 'Trainingsplan passend zu deinen Zielen', key: 'trainingsplan', manual: true },
    { label: 'Fortschrittsdokumentation', key: 'fortschrittsdoku' },
    { label: 'Monatliche Check-in-Calls', key: 'checkin_calls' },
    { label: 'Angepasster Ernährungsleitfaden', key: 'ernaehrung', manual: true },
    { label: 'Fortschrittsfotos & Messung', key: 'fortschrittsfotos' },
    { label: 'WhatsApp-Support zwischen den Einheiten', key: 'whatsapp_support' },
    { label: 'Priorisierte Terminbuchung', key: 'prio_buchung' },
    { label: 'Gratis-Einheit bei Weiterempfehlung', key: 'gratis_einheit', manual: true },
  ],
};

const packageTemplates: Record<string, { sessions_included: string; checkin_calls_included: string; package_price: string; duration_weeks: string; description: string; is_duo?: boolean }> = {
  'Testkunde': {
    sessions_included: '3', checkin_calls_included: '0', package_price: '0', duration_weeks: '8',
    description: '1 Vorgespräch + 3 Einheiten à 60 Min. • kostenlos • 8 Wochen',
    is_duo: false,
  },
  'Test-Duo': {
    sessions_included: '3', checkin_calls_included: '0', package_price: '0', duration_weeks: '8',
    description: '3 Duo-Einheiten à 60 Min. • kostenlos • 8 Wochen',
    is_duo: true,
  },
  'Starter': {
    sessions_included: '5', checkin_calls_included: '0', package_price: '470', duration_weeks: '13',
    description: '5 Einheiten à 60 Min. • gültig 3 Monate',
    is_duo: false,
  },
  'Transformation': {
    sessions_included: '10', checkin_calls_included: '6', package_price: '890', duration_weeks: '26',
    description: '10 Einheiten à 60 Min. • gültig 6 Monate',
    is_duo: false,
  },
  'Intensiv': {
    sessions_included: '20', checkin_calls_included: '12', package_price: '1700', duration_weeks: '52',
    description: '20 Einheiten à 60 Min. • gültig 12 Monate',
    is_duo: false,
  },
  'Starter Duo': {
    sessions_included: '5', checkin_calls_included: '0', package_price: '705', duration_weeks: '13',
    description: '5 Duo-Einheiten à 60 Min. • ~75% von 2× 470 € • 3 Monate',
    is_duo: true,
  },
  'Transformation Duo': {
    sessions_included: '10', checkin_calls_included: '6', package_price: '1335', duration_weeks: '26',
    description: '10 Duo-Einheiten • ~75% von 2× 890 € • 6 Monate',
    is_duo: true,
  },
  'Intensiv Duo': {
    sessions_included: '20', checkin_calls_included: '12', package_price: '2550', duration_weeks: '52',
    description: '20 Duo-Einheiten • ~75% von 2× 1.700 € • 12 Monate',
    is_duo: true,
  },
};

const sessionTypes = ['In-Person Training', 'Online Training', 'Phone Call', 'Check-In Call', 'Free Intro', 'Duo Training'];
const sessionStatuses = ['Scheduled', 'Completed', 'No-Show', 'Cancelled by Client', 'Cancelled by Trainer'];

const sessionTypeLabelsDE: Record<string, string> = {
  'In-Person Training': 'Präsenz-Training',
  'Online Training': 'Online-Training',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In Call',
  'Free Intro': 'Kostenloses Erstgespräch',
  'Duo Training': 'Duo-Training',
};

const sessionStatusLabelsDE: Record<string, string> = {
  'Scheduled': 'Geplant',
  'Completed': 'Abgeschlossen',
  'No-Show': 'Nicht erschienen',
  'Cancelled by Client': 'Vom Kunden abgesagt',
  'Cancelled by Trainer': 'Vom Trainer abgesagt',
};

const paymentStatusLabelsDE: Record<string, string> = {
  'Unpaid': 'Unbezahlt',
  'Partially paid': 'Teilweise bezahlt',
  'Paid in full': 'Vollständig bezahlt',
};

const statusLabelsDE: Record<string, string> = {
  'Active': 'Aktiv',
  'Paused': 'Pausiert',
  'Churned': 'Abgemeldet',
};

const generateBookingCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PT-';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

// ── Rabatt-Berechnung ───────────────────────────────────────────
function calcFinalPrice(base: number, type: string, val: number): number {
  if (!type || val <= 0) return base;
  if (type === 'percent') return Math.round(base * (1 - val / 100) * 100) / 100;
  if (type === 'absolute') return Math.max(0, base - val);
  return base;
}
function formatEur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

const BookingCodeCard: React.FC<{ client: any; clientId: string; onUpdate: () => void }> = ({ client, clientId, onUpdate }) => {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    const code = generateBookingCode();
    await supabase.from('clients').update({ booking_code: code, booking_code_active: true }).eq('id', clientId);
    toast.success('Buchungscode erstellt');
    setGenerating(false);
    onUpdate();
  };

  const handleToggle = async (active: boolean) => {
    await supabase.from('clients').update({ booking_code_active: active }).eq('id', clientId);
    toast.success(active ? 'Buchungszugang aktiviert' : 'Buchungszugang deaktiviert');
    onUpdate();
  };

  const handleCopy = () => {
    if (client.booking_code) {
      navigator.clipboard.writeText(client.booking_code);
      toast.success('Code kopiert');
    }
  };

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          <Key className="w-4 h-4" /> Buchungszugang
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {client.booking_code ? (
          <>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-3 py-1.5 rounded-lg text-sm font-mono font-bold tracking-wider">
                {client.booking_code}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleGenerate} disabled={generating}>
                <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={client.booking_code_active} onCheckedChange={handleToggle} />
              <span className="text-sm text-muted-foreground">
                {client.booking_code_active ? 'Aktiv' : 'Deaktiviert'}
              </span>
            </div>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating} className="gap-2">
            <Key className="w-3.5 h-3.5" /> Code generieren
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [quickLogs, setQuickLogs] = useState<any[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [healthRecord, setHealthRecord] = useState<any>(null);
  const [manualCompletions, setManualCompletions] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [quickLogText, setQuickLogText] = useState('');
  const [editingPinned, setEditingPinned] = useState(false);
  const [pinnedText, setPinnedText] = useState('');

  // ── NEU: Liste aller aktiven Kunden für Duo-Partner-Auswahl ──
  const [allClients, setAllClients] = useState<{ id: string; full_name: string }[]>([]);

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const defaultSessionForm = {
    session_date: new Date().toISOString().slice(0, 16),
    duration_minutes: '60', session_type: 'In-Person Training',
    status: 'Completed', notes: '', package_id: '', late_cancellation: false, location: 'Gym',
    second_client_id: '', // ← NEU: Duo-Partner
  };
  const [sessionForm, setSessionForm] = useState(defaultSessionForm);

  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [packageForm, setPackageForm] = useState({
    package_name: '', sessions_included: '10', checkin_calls_included: '0',
    package_price: '', start_date: new Date().toISOString().split('T')[0],
    duration_weeks: '', is_deal: false, deal_reason: '', deal_discounted_price: '',
    deal_adjusted_terms: '', payment_status: 'Unpaid', payment_date: '',
    is_duo: false, partner_client_id: '', // ← NEU: Duo-Felder
    discount_type: '' as 'percent' | 'absolute' | '', // ← NEU: Rabatt
    discount_value: 0,                                 // ← NEU
    discount_reason: '',                               // ← NEU
  });

  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [metricForm, setMetricForm] = useState({
    measured_at: new Date().toISOString().split('T')[0],
    weight_kg: '', body_fat_pct: '', waist_cm: '', hip_cm: '', chest_cm: '',
  });

  const [benchmarkDialogOpen, setBenchmarkDialogOpen] = useState(false);
  const [benchmarkForm, setBenchmarkForm] = useState({
    label: '', value: '', measured_at: new Date().toISOString().split('T')[0],
  });
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const profilePhotoRef = useRef<HTMLInputElement>(null);

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/${id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('client-photos').upload(filePath, file, { upsert: true });
    if (error) { toast.error('Upload fehlgeschlagen'); return; }
    const { data: urlData } = supabase.storage.from('client-photos').getPublicUrl(filePath);
    await supabase.from('clients').update({ profile_photo_url: urlData.publicUrl }).eq('id', id);
    toast.success('Profilbild aktualisiert');
    loadAll();
  };

  const loadAll = useCallback(async () => {
    if (!id || !user) return;
    const [cRes, pRes, sRes, mRes, bRes, qlRes, fcRes, clientsRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('packages').select('*').eq('client_id', id).order('start_date', { ascending: false }),
      supabase.from('sessions').select('*, clients!sessions_client_id_fkey(full_name), second_client:clients!sessions_second_client_id_fkey(full_name)').eq('client_id', id).order('session_date', { ascending: false }),
      supabase.from('body_metrics').select('*').eq('client_id', id).order('measured_at'),
      supabase.from('fitness_benchmarks').select('*').eq('client_id', id).order('measured_at', { ascending: false }),
      supabase.from('quick_logs').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('package_feature_completions').select('package_id, feature_key'),
      // ← NEU: alle aktiven Kunden für Duo-Partner-Auswahl laden
      supabase.from('clients').select('id, full_name').eq('status', 'Active').order('full_name'),
    ]);

    // Auch Kunden-eingetragene Metriken laden (falls Tabelle existiert)
    let clientMetricsData: any[] = [];
    try {
      const { data } = await supabase
        .from('client_metrics')
        .select('*')
        .eq('client_id', id)
        .order('recorded_at', { ascending: true });
      clientMetricsData = (data || []).map((m: any) => ({
        ...m,
        measured_at: m.recorded_at,
        body_fat_pct: m.body_fat_percent,
        source: 'client',
      }));
    } catch {
      // Tabelle existiert noch nicht
    }

    const coachMetrics = (mRes.data || []).map((m: any) => ({ ...m, source: 'coach' }));
    const allMetrics = [...coachMetrics, ...clientMetricsData].sort(
      (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
    );

    setClient(cRes.data);
    setPinnedText(cRes.data?.pinned_note || '');
    setPackages(pRes.data || []);
    setSessions(sRes.data || []);
    setMetrics(allMetrics);
    setBenchmarks(bRes.data || []);
    setQuickLogs(qlRes.data || []);
    // ← NEU
    setAllClients((clientsRes.data || []).filter((c: any) => c.id !== id));

    const mcMap: Record<string, Set<string>> = {};
    (fcRes.data || []).forEach((c: any) => {
      if (!mcMap[c.package_id]) mcMap[c.package_id] = new Set();
      mcMap[c.package_id].add(c.feature_key);
    });
    setManualCompletions(mcMap);
    if (id) {
      const [convData, healthData] = await Promise.all([
        getLatestConversation(id),
        getHealthRecord(id),
      ]);
      setConversation(convData);
      setHealthRecord(healthData);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleManualCompletion = useCallback(async (packageId: string, featureKey: string, currentlyDone: boolean) => {
    if (!user) return;
    if (currentlyDone) {
      await supabase.from('package_feature_completions').delete().eq('package_id', packageId).eq('feature_key', featureKey);
      setManualCompletions(prev => {
        const next = { ...prev };
        const s = new Set(next[packageId]);
        s.delete(featureKey);
        next[packageId] = s;
        return next;
      });
    } else {
      await supabase.from('package_feature_completions').insert({ user_id: user.id, package_id: packageId, feature_key: featureKey });
      setManualCompletions(prev => {
        const next = { ...prev };
        const s = new Set(next[packageId] || []);
        s.add(featureKey);
        next[packageId] = s;
        return next;
      });
    }
  }, [user]);

  const getFeatureStatusDetail = (key: string, pkg: any, usedSessions: number, checkinCount: number, hasMetrics: boolean): { done: boolean; detail?: string; manual?: boolean } => {
    const manualDone = manualCompletions[pkg.id]?.has(key) || false;
    switch (key) {
      case 'erstgespraech': return { done: manualDone, manual: true };
      case 'sessions': return { done: usedSessions >= pkg.sessions_included, detail: `${usedSessions} / ${pkg.sessions_included}` };
      case 'trainingsplan': return { done: manualDone, manual: true };
      case 'fortschrittsdoku': return { done: hasMetrics };
      case 'checkin_calls': return { done: checkinCount >= pkg.checkin_calls_included, detail: `${checkinCount} / ${pkg.checkin_calls_included}` };
      case 'ernaehrung': return { done: manualDone, manual: true };
      case 'fortschrittsfotos': return { done: hasMetrics };
      case 'whatsapp_support': return { done: true };
      case 'prio_buchung': return { done: true };
      case 'gratis_einheit': return { done: manualDone, manual: true };
      case 'feedback_erhalten': return { done: manualDone, manual: true };
      default: return { done: false };
    }
  };

  const addQuickLog = async () => {
    if (!quickLogText.trim() || !user || !id) return;
    await supabase.from('quick_logs').insert({ client_id: id, user_id: user.id, content: quickLogText });
    setQuickLogText('');
    loadAll();
  };

  const savePinnedNote = async () => {
    await supabase.from('clients').update({ pinned_note: pinnedText }).eq('id', id);
    setEditingPinned(false);
    loadAll();
    toast.success('Notiz aktualisiert');
  };

  const openEditSession = (s: any) => {
    setEditingSessionId(s.id);
    setSessionForm({
      session_date: s.session_date ? format(new Date(s.session_date), "yyyy-MM-dd'T'HH:mm") : '',
      duration_minutes: String(s.duration_minutes),
      session_type: s.session_type,
      status: s.status,
      notes: s.notes || '',
      package_id: s.package_id || '',
      late_cancellation: s.late_cancellation,
      location: s.location || 'Gym',
      second_client_id: s.second_client_id || '', // ← NEU
    });
    setSessionDialogOpen(true);
  };

  const openNewSession = () => {
    setEditingSessionId(null);
    setSessionForm(defaultSessionForm);
    setSessionDialogOpen(true);
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

  const saveSession = async () => {
    if (!user || !id) return;
    const sessionDateISO = new Date(sessionForm.session_date).toISOString();
    if (!editingSessionId) {
      const slotOk = await checkAndHandleSlot(sessionDateISO);
      if (!slotOk) return;
    }
    const payload = {
      session_date: sessionDateISO,
      duration_minutes: Number(sessionForm.duration_minutes),
      session_type: sessionForm.session_type,
      status: sessionForm.status,
      notes: sessionForm.notes || null,
      package_id: sessionForm.package_id || null,
      late_cancellation: sessionForm.late_cancellation,
      location: sessionForm.location,
      // ← NEU: Duo-Partner speichern
      second_client_id: sessionForm.second_client_id || null,
    };
    if (editingSessionId) {
      await supabase.from('sessions').update(payload).eq('id', editingSessionId);
      toast.success('Einheit aktualisiert');
    } else {
      await supabase.from('sessions').insert({ ...payload, client_id: id, user_id: user.id });
      toast.success('Einheit gespeichert');
    }
    setSessionDialogOpen(false);
    setEditingSessionId(null);
    loadAll();
  };

  const deleteSession = async () => {
    if (!editingSessionId) return;
    if (!window.confirm('Einheit wirklich löschen?')) return;
    await supabase.from('sessions').delete().eq('id', editingSessionId);
    toast.success('Einheit gelöscht');
    setSessionDialogOpen(false);
    setEditingSessionId(null);
    loadAll();
  };

  const savePackage = async () => {
    if (!user || !id) return;
    const isTestkunde = packageForm.package_name === 'Testkunde' || packageForm.package_name === 'Test-Duo';
    const endDate = packageForm.start_date && packageForm.duration_weeks
      ? new Date(new Date(packageForm.start_date).getTime() + Number(packageForm.duration_weeks) * 7 * 86400000).toISOString().split('T')[0]
      : null;

    // Rabatt-Endpreis berechnen
    const basePrice = isTestkunde ? 0 : Number(packageForm.package_price);
    const hasDiscount = !!packageForm.discount_type && packageForm.discount_value > 0;
    const finalPrice = hasDiscount ? calcFinalPrice(basePrice, packageForm.discount_type, packageForm.discount_value) : null;

    const { error: pkgError } = await supabase.from('packages').insert({
      client_id: id, user_id: user.id,
      package_name: packageForm.package_name,
      sessions_included: Number(packageForm.sessions_included),
      checkin_calls_included: Number(packageForm.checkin_calls_included),
      package_price: basePrice,
      start_date: packageForm.start_date,
      end_date: endDate,
      duration_weeks: packageForm.duration_weeks ? Number(packageForm.duration_weeks) : null,
      is_deal: hasDiscount || packageForm.is_deal,
      deal_reason: packageForm.discount_reason || packageForm.deal_reason || null,
      deal_discounted_price: finalPrice ?? (packageForm.deal_discounted_price ? Number(packageForm.deal_discounted_price) : null),
      deal_adjusted_terms: packageForm.deal_adjusted_terms || null,
      payment_status: isTestkunde ? 'Paid in full' : packageForm.payment_status,
      payment_date: isTestkunde ? packageForm.start_date : (packageForm.payment_date || null),
      is_duo: packageForm.is_duo,
      partner_client_id: packageForm.is_duo && packageForm.partner_client_id ? packageForm.partner_client_id : null,
      discount_type: packageForm.discount_type || null,
      discount_value: packageForm.discount_value || 0,
      discount_reason: packageForm.discount_reason || null,
    });
    if (pkgError) {
      toast.error(`Fehler: ${pkgError.message}`);
      return;
    }
    setPackageDialogOpen(false);
    toast.success('Paket hinzugefügt');
    loadAll();
  };

  const saveMetric = async () => {
    if (!user || !id) return;
    await supabase.from('body_metrics').insert({
      client_id: id, user_id: user.id,
      measured_at: metricForm.measured_at,
      weight_kg: metricForm.weight_kg ? Number(metricForm.weight_kg) : null,
      body_fat_pct: metricForm.body_fat_pct ? Number(metricForm.body_fat_pct) : null,
      waist_cm: metricForm.waist_cm ? Number(metricForm.waist_cm) : null,
      hip_cm: metricForm.hip_cm ? Number(metricForm.hip_cm) : null,
      chest_cm: metricForm.chest_cm ? Number(metricForm.chest_cm) : null,
    });
    setMetricDialogOpen(false);
    toast.success('Messwerte gespeichert');
    loadAll();
  };

  const saveBenchmark = async () => {
    if (!user || !id) return;
    await supabase.from('fitness_benchmarks').insert({
      client_id: id, user_id: user.id,
      label: benchmarkForm.label, value: benchmarkForm.value, measured_at: benchmarkForm.measured_at,
    });
    setBenchmarkDialogOpen(false);
    toast.success('Benchmark gespeichert');
    loadAll();
  };

  const handleExportForClaude = () => {
    if (!conversation || !client) return;
    const buildExportData = (c: any, conv: any, health: any): ExportClientData => ({
      full_name: c.full_name,
      date_of_birth: c.date_of_birth,
      occupation: c.occupation,
      fitness_goal: c.fitness_goal,
      fitness_goal_text: conv.fitness_goal_text ?? c.fitness_goal_text,
      starting_date: c.starting_date,
      contact_source: conv.contact_source,
      motivation: conv.motivation,
      previous_experience: conv.previous_experience,
      stress_level: conv.stress_level,
      sleep_quality: conv.sleep_quality,
      daily_activity: conv.daily_activity,
      current_training: conv.current_training,
      nutrition_habits: conv.nutrition_habits,
      goal_importance: conv.goal_importance,
      success_criteria: conv.success_criteria,
      personality_type: conv.personality_type,
      next_steps: conv.next_steps,
      notes: conv.notes,
      conversation_date: conv.conversation_date,
      cardiovascular: health?.cardiovascular,
      musculoskeletal: health?.musculoskeletal,
      surgeries: health?.surgeries,
      sports_injuries: health?.sports_injuries,
      other_conditions: health?.other_conditions,
      medications: health?.medications,
      current_pain: health?.current_pain,
      substances: health?.substances,
    });
    exportSingleClient(buildExportData(client, conversation, healthRecord));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!client) {
    return <div className="text-center py-12"><p className="text-muted-foreground">Kunde nicht gefunden</p></div>;
  }

  const activePackage = packages.find(p => {
    const sessionsUsed = sessions.filter(s => s.package_id === p.id && ['Completed', 'No-Show'].includes(s.status)).length;
    return sessionsUsed < p.sessions_included;
  });

  const getSessionsUsed = (pkgId: string) =>
    sessions.filter(s => s.package_id === pkgId && ['Completed', 'No-Show'].includes(s.status)).length;

  const totalSessions = sessions.filter(s => s.status === 'Completed').length;
  const noShows = sessions.filter(s => s.status === 'No-Show').length;
  const noShowRate = sessions.length > 0 ? ((noShows / sessions.length) * 100).toFixed(1) : '0';

  const streakWeeks = (() => {
    if (sessions.length === 0) return 0;
    const completedDates = sessions
      .filter(s => s.status === 'Completed')
      .map(s => new Date(s.session_date))
      .sort((a, b) => b.getTime() - a.getTime());
    if (completedDates.length === 0) return 0;
    let streak = 1;
    const now = new Date();
    const weeksSinceLastSession = differenceInWeeks(now, completedDates[0]);
    if (weeksSinceLastSession > 1) return 0;
    for (let i = 0; i < completedDates.length - 1; i++) {
      const weekDiff = differenceInWeeks(completedDates[i], completedDates[i + 1]);
      if (weekDiff <= 1) streak++;
      else break;
    }
    return streak;
  })();

  const clientSinceDuration = client.starting_date
    ? formatDistanceToNow(new Date(client.starting_date), { locale: de })
    : null;

  const statusColor = (s: string) => {
    if (s === 'Active') return 'bg-success/10 text-success border-success/20';
    if (s === 'Paused') return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-muted text-muted-foreground';
  };

  const paymentColor = (s: string) => {
    if (s === 'Paid in full') return 'bg-success/10 text-success border-success/20';
    if (s === 'Partially paid') return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-destructive/10 text-destructive border-destructive/20';
  };

  const isTestkundeFormSelected = packageForm.package_name === 'Testkunde' || packageForm.package_name === 'Test-Duo';
  const isDuoSession = sessionForm.session_type === 'Duo Training';

  // Rabatt-Vorschau im Paket-Dialog
  const pkgBasePrice = Number(packageForm.package_price) || 0;
  const pkgFinalPrice = calcFinalPrice(pkgBasePrice, packageForm.discount_type, packageForm.discount_value);
  const pkgHasDiscount = !!packageForm.discount_type && packageForm.discount_value > 0 && pkgFinalPrice !== pkgBasePrice;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate('/clients')} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Kunden
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div
          className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer relative group"
          onClick={() => profilePhotoRef.current?.click()}
        >
          {client.profile_photo_url ? (
            <img src={client.profile_photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-primary" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-display font-bold">{client.full_name}</h1>
            <Badge variant="outline" className={statusColor(client.status)}>{statusLabelsDE[client.status] || client.status}</Badge>
            {activePackage?.package_name === 'Testkunde' && (
              <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-300">
                Testkunde
              </Badge>
            )}
            {activePackage?.package_name === 'Test-Duo' && (
              <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                Test-Duo
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            {clientSinceDuration && <span>Kunde seit {clientSinceDuration}</span>}
            {client.fitness_goal && <span>· {client.fitness_goal}</span>}
            <span>· {streakWeeks}🔥 Wochen-Serie</span>
            <span>· {noShowRate}% Ausfallquote</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" className="gap-2" onClick={() => setBookDialogOpen(true)}>
              <Plus className="w-4 h-4" /> Session buchen
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/clients/${id}/assessment`)}>
              <Activity className="w-4 h-4" /> Assessment
            </Button>
            <Link to={`/clients/${id}/edit`}>
              <Button variant="outline" size="sm" className="gap-2"><Edit className="w-4 h-4" /> Bearbeiten</Button>
            </Link>
          </div>
        </div>

      {/* Pinned Note */}
      {(client.pinned_note || editingPinned) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-start gap-2">
            <Pin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            {editingPinned ? (
              <div className="flex-1 flex gap-2">
                <Input value={pinnedText} onChange={e => setPinnedText(e.target.value)} className="flex-1" />
                <Button size="sm" onClick={savePinnedNote}>Speichern</Button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-between">
                <p className="text-sm">{client.pinned_note}</p>
                <Button variant="ghost" size="sm" onClick={() => setEditingPinned(true)}>Bearbeiten</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {!client.pinned_note && !editingPinned && (
        <Button variant="ghost" size="sm" onClick={() => setEditingPinned(true)} className="text-muted-foreground gap-2">
          <Pin className="w-3 h-3" /> Notiz anheften
        </Button>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-muted/50 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="packages">Pakete</TabsTrigger>
          <TabsTrigger value="sessions">Einheiten</TabsTrigger>
          <TabsTrigger value="progress">Fortschritt</TabsTrigger>
          <TabsTrigger value="erstgespraech">Erstgespräch</TabsTrigger>
          <TabsTrigger value="notes">Notizen</TabsTrigger>
          <TabsTrigger value="plan">Trainingsplan</TabsTrigger>
          <TabsTrigger value="workouts">Workouts</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-display">Kontakt</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {client.email && <a href={`mailto:${client.email}`} className="text-primary hover:underline block">{client.email}</a>}
                {client.phone && (
                  <div className="flex items-center gap-2">
                    <a href={`tel:${client.phone}`} className="text-primary hover:underline text-sm">{client.phone}</a>
                    <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-success hover:bg-success/90 text-white px-2 py-0.5 rounded-full transition-colors">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.558 4.112 1.528 5.837L.057 23.882l6.233-1.636A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894c-1.868 0-3.618-.498-5.12-1.367l-.367-.217-3.801.997 1.014-3.7-.24-.381A9.879 9.879 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106c5.42 0 9.894 4.474 9.894 9.894 0 5.42-4.474 9.894-9.894 9.894z" />
                      </svg>
                      WhatsApp
                    </a>
                  </div>
                )}
                {client.date_of_birth && <p>Geb.: {format(new Date(client.date_of_birth), 'd. MMM yyyy', { locale: de })}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-display">Notfallkontakt</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p>{client.emergency_contact_name || 'Nicht hinterlegt'}</p>
                <p>{client.emergency_contact_phone || ''}</p>
              </CardContent>
            </Card>
            <BookingCodeCard client={client} clientId={id!} onUpdate={loadAll} />
          </div>
          {client.health_notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-display text-destructive">Gesundheitsnotizen</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{client.health_notes}</CardContent>
            </Card>
          )}
          {activePackage && (() => {
            const features = packageFeaturesMap[activePackage.package_name] || [];
            const usedSessions = getSessionsUsed(activePackage.id);
            const checkinCount = sessions.filter(s => s.package_id === activePackage.id && s.session_type === 'Check-In Call' && s.status === 'Completed').length;
            const hasMetrics = metrics.length > 0;
            const isTestPkg = activePackage.package_name === 'Testkunde' || activePackage.package_name === 'Test-Duo';
            return (
              <Card className="stat-glow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    Aktives Paket
                    {isTestPkg && (
                      <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-300 text-xs">{activePackage.package_name}</Badge>
                    )}
                    {activePackage.is_duo && !isTestPkg && (
                      <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 text-xs">Duo</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{activePackage.package_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {usedSessions} / {activePackage.sessions_included} Einheiten genutzt
                        {isTestPkg && <span className="ml-2 text-violet-600 font-medium">· kostenlos</span>}
                      </p>
                    </div>
                    {activePackage.sessions_included - usedSessions <= 2 && (
                      <Badge className="bg-warning/10 text-warning border-warning/20" variant="outline">
                        <AlertTriangle className="w-3 h-3 mr-1" /> Wenig übrig
                      </Badge>
                    )}
                  </div>
                  {features.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paketinhalte</p>
                      <ul className="space-y-1.5">
                        {features.map((feat, i) => {
                          const status = getFeatureStatusDetail(feat.key, activePackage, usedSessions, checkinCount, hasMetrics);
                          const isManual = feat.manual === true;
                          return (
                            <li
                              key={i}
                              className={`flex items-center gap-2.5 text-sm ${isManual ? 'cursor-pointer hover:bg-accent/50 -mx-1 px-1 rounded' : ''}`}
                              onClick={isManual ? () => toggleManualCompletion(activePackage.id, feat.key, status.done) : undefined}
                            >
                              {isManual ? (
                                <Checkbox
                                  checked={status.done}
                                  className="flex-shrink-0"
                                  onCheckedChange={() => toggleManualCompletion(activePackage.id, feat.key, status.done)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : status.done ? (
                                <Check className="w-4 h-4 flex-shrink-0 text-success" />
                              ) : (
                                <Circle className="w-4 h-4 flex-shrink-0 text-muted-foreground/30" />
                              )}
                              <span className={status.done ? 'text-foreground' : 'text-muted-foreground'}>{feat.label}</span>
                              {status.detail && (
                                <span className={`ml-auto text-xs font-medium ${status.done ? 'text-success' : 'text-muted-foreground'}`}>
                                  {status.detail}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-display font-bold">{totalSessions}</p>
                <p className="text-xs text-muted-foreground">Einheiten gesamt</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-display font-bold flex items-center justify-center gap-1">
                  {streakWeeks} <Flame className="w-5 h-5 text-primary" />
                </p>
                <p className="text-xs text-muted-foreground">Wochen-Serie</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-display font-bold">{noShowRate}%</p>
                <p className="text-xs text-muted-foreground">Ausfallquote</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PACKAGES TAB */}
        <TabsContent value="packages" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Paket hinzufügen</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="font-display">Neues Paket</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Paketvorlage</Label>
                    <Select value={packageForm.package_name} onValueChange={v => {
                      const tpl = packageTemplates[v];
                      if (tpl) {
                        setPackageForm(f => ({
                          ...f, package_name: v,
                          sessions_included: tpl.sessions_included,
                          checkin_calls_included: tpl.checkin_calls_included,
                          package_price: tpl.package_price,
                          duration_weeks: tpl.duration_weeks,
                          is_duo: tpl.is_duo ?? false,
                          discount_type: '', discount_value: 0, discount_reason: '',
                        }));
                      } else {
                        setPackageForm(f => ({ ...f, package_name: v }));
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Paket wählen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Testkunde">🧪 Testkunde – 3 Einheiten · kostenlos</SelectItem>
                        <SelectItem value="Test-Duo">🧪 Test-Duo – 3 Duo-Einheiten · kostenlos</SelectItem>
                        <SelectItem value="Starter">Starter – 5 Einheiten · 470 €</SelectItem>
                        <SelectItem value="Transformation">Transformation – 10 Einheiten · 890 €</SelectItem>
                        <SelectItem value="Intensiv">Intensiv – 20 Einheiten · 1.700 €</SelectItem>
                        <SelectItem value="Starter Duo">👥 Starter Duo – 5 Einheiten · 705 €</SelectItem>
                        <SelectItem value="Transformation Duo">👥 Transformation Duo – 10 Einheiten · 1.335 €</SelectItem>
                        <SelectItem value="Intensiv Duo">👥 Intensiv Duo – 20 Einheiten · 2.550 €</SelectItem>
                      </SelectContent>
                    </Select>
                    {packageForm.package_name && packageTemplates[packageForm.package_name] && (
                      <p className="text-xs text-muted-foreground">{packageTemplates[packageForm.package_name].description}</p>
                    )}
                  </div>

                  {isTestkundeFormSelected && (
                    <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-800">
                      🧪 Testkunde / Test-Duo: Kein Zahlungsstatus erforderlich. Das Paket ist kostenlos.
                    </div>
                  )}

                  {/* ── NEU: Duo-Partner-Auswahl ── */}
                  {packageForm.is_duo && (
                    <div className="space-y-2 rounded-lg bg-purple-50 border border-purple-200 p-3">
                      <Label className="text-purple-800">👥 Duo-Partner/in</Label>
                      <Select
                        value={packageForm.partner_client_id}
                        onValueChange={v => setPackageForm(f => ({ ...f, partner_client_id: v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Partner/in wählen" /></SelectTrigger>
                        <SelectContent>
                          {allClients.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Enthaltene Einheiten</Label>
                      <Input type="number" value={packageForm.sessions_included} onChange={e => setPackageForm(f => ({ ...f, sessions_included: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Check-in Calls</Label>
                      <Input type="number" value={packageForm.checkin_calls_included} onChange={e => setPackageForm(f => ({ ...f, checkin_calls_included: e.target.value }))} />
                    </div>
                  </div>

                  {!isTestkundeFormSelected && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Paketpreis (€)</Label>
                        <Input type="number" value={packageForm.package_price} onChange={e => setPackageForm(f => ({ ...f, package_price: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Preis je Einheit</Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          {packageForm.package_price && Number(packageForm.sessions_included) > 0
                            ? `€${(Number(packageForm.package_price) / Number(packageForm.sessions_included)).toFixed(2)}`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Startdatum</Label>
                      <Input type="date" value={packageForm.start_date} onChange={e => setPackageForm(f => ({ ...f, start_date: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Laufzeit (Wochen)</Label>
                      <Input type="number" value={packageForm.duration_weeks} onChange={e => setPackageForm(f => ({ ...f, duration_weeks: e.target.value }))} placeholder="Berechnet Enddatum" />
                    </div>
                  </div>

                  {/* ── NEU: Strukturierter Rabatt ── */}
                  {!isTestkundeFormSelected && (
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!packageForm.discount_type}
                          onCheckedChange={v => setPackageForm(f => ({
                            ...f,
                            discount_type: v ? 'percent' : '',
                            discount_value: 0,
                            discount_reason: '',
                          }))}
                        />
                        <Label>🏷️ Rabatt gewähren</Label>
                      </div>
                      {!!packageForm.discount_type && (
                        <div className="space-y-3 pl-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant={packageForm.discount_type === 'percent' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setPackageForm(f => ({ ...f, discount_type: 'percent' }))}
                            >% Prozentual</Button>
                            <Button
                              type="button"
                              variant={packageForm.discount_type === 'absolute' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setPackageForm(f => ({ ...f, discount_type: 'absolute' }))}
                            >€ Absolut</Button>
                          </div>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="number"
                              min={0}
                              max={packageForm.discount_type === 'percent' ? 100 : pkgBasePrice}
                              value={packageForm.discount_value || ''}
                              onChange={e => setPackageForm(f => ({ ...f, discount_value: Number(e.target.value) }))}
                              placeholder={packageForm.discount_type === 'percent' ? 'z.B. 10' : 'z.B. 50'}
                              className="w-32"
                            />
                            <span className="text-muted-foreground">{packageForm.discount_type === 'percent' ? '%' : '€'}</span>
                          </div>
                          <Input
                            value={packageForm.discount_reason}
                            onChange={e => setPackageForm(f => ({ ...f, discount_reason: e.target.value }))}
                            placeholder="Grund: z.B. Empfehlung, Treue-Bonus …"
                          />
                          {pkgHasDiscount && (
                            <div className="flex items-center justify-between rounded bg-success/10 border border-success/20 px-3 py-2 text-sm">
                              <span className="text-muted-foreground line-through">{formatEur(pkgBasePrice)}</span>
                              <div className="text-right">
                                <p className="text-xs text-success">{packageForm.discount_type === 'percent' ? `−${packageForm.discount_value} %` : `−${formatEur(packageForm.discount_value)}`}</p>
                                <p className="font-bold text-success">{formatEur(pkgFinalPrice)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Klassisches Sonderkonditionen-Feld bleibt erhalten */}
                      <div className="flex items-center gap-2 pt-1">
                        <Switch checked={packageForm.is_deal} onCheckedChange={v => setPackageForm(f => ({ ...f, is_deal: v }))} />
                        <Label className="text-muted-foreground text-xs">Weitere Sonderkonditionen</Label>
                      </div>
                      {packageForm.is_deal && (
                        <div className="space-y-2 pl-2">
                          <Input value={packageForm.deal_reason} onChange={e => setPackageForm(f => ({ ...f, deal_reason: e.target.value }))} placeholder="Konditionen / Notiz" />
                        </div>
                      )}
                    </div>
                  )}

                  {!isTestkundeFormSelected && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Zahlungsstatus</Label>
                        <Select value={packageForm.payment_status} onValueChange={v => setPackageForm(f => ({ ...f, payment_status: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Unpaid">Unbezahlt</SelectItem>
                            <SelectItem value="Partially paid">Teilweise bezahlt</SelectItem>
                            <SelectItem value="Paid in full">Vollständig bezahlt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Zahlungsdatum</Label>
                        <Input type="date" value={packageForm.payment_date} onChange={e => setPackageForm(f => ({ ...f, payment_date: e.target.value }))} />
                      </div>
                    </div>
                  )}
                  <Button onClick={savePackage} className="w-full">Paket speichern</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Noch keine Pakete</p>
          ) : (
            <div className="space-y-3">
              {packages.map(pkg => {
                const used = getSessionsUsed(pkg.id);
                const remaining = pkg.sessions_included - used;
                const hasFollowUp = packages.some(p => p.id !== pkg.id && new Date(p.start_date) > new Date(pkg.start_date));
                const isTestPkg = pkg.package_name === 'Testkunde' || pkg.package_name === 'Test-Duo';
                const displayPrice = pkg.discount_type && pkg.discount_value > 0
                  ? calcFinalPrice(Number(pkg.package_price), pkg.discount_type, pkg.discount_value)
                  : pkg.deal_discounted_price ?? pkg.package_price;
                return (
                  <Card key={pkg.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{pkg.package_name}</p>
                            {isTestPkg && (
                              <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-300 text-xs">{pkg.package_name}</Badge>
                            )}
                            {pkg.is_duo && !isTestPkg && <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300 text-xs">Duo</Badge>}
                            {!isTestPkg && (pkg.is_deal || (pkg.discount_type && pkg.discount_value > 0)) && <Badge variant="outline" className="text-primary border-primary/30">Rabatt</Badge>}
                            {!isTestPkg && (
                              <Badge variant="outline" className={paymentColor(pkg.payment_status)}>{paymentStatusLabelsDE[pkg.payment_status] || pkg.payment_status}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {used}/{pkg.sessions_included} Einheiten
                            {isTestPkg ? ' · kostenlos' : ` · €${displayPrice}`}
                            {pkg.start_date && ` · ${format(new Date(pkg.start_date), 'd. MMM yyyy', { locale: de })}`}
                            {pkg.end_date && ` → ${format(new Date(pkg.end_date), 'd. MMM yyyy', { locale: de })}`}
                          </p>
                          {(pkg.discount_reason || pkg.deal_reason) && (
                            <p className="text-xs text-primary mt-1">{pkg.discount_reason || pkg.deal_reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {remaining <= 2 && remaining > 0 && (
                            <Badge className="bg-warning/10 text-warning border-warning/20" variant="outline">{remaining} übrig</Badge>
                          )}
                          {remaining <= 0 && !hasFollowUp && (
                            <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">Verlängerung nötig</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* SESSIONS TAB */}
        <TabsContent value="sessions" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={openNewSession}><Plus className="w-4 h-4" /> Einheit erfassen</Button>
            <Dialog open={sessionDialogOpen} onOpenChange={(open) => { setSessionDialogOpen(open); if (!open) setEditingSessionId(null); }}>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display">{editingSessionId ? 'Einheit bearbeiten' : 'Einheit erfassen'}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Datum & Uhrzeit</Label>
                    <Input type="datetime-local" value={sessionForm.session_date} onChange={e => setSessionForm(f => ({ ...f, session_date: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Dauer (Min.)</Label>
                      <Input type="number" value={sessionForm.duration_minutes} onChange={e => setSessionForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Art</Label>
                      <Select value={sessionForm.session_type} onValueChange={v => setSessionForm(f => ({ ...f, session_type: v, second_client_id: '' }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sessionTypes.map(t => <SelectItem key={t} value={t}>{sessionTypeLabelsDE[t] || t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* ── NEU: Duo-Partner-Auswahl erscheint nur bei Duo Training ── */}
                  {isDuoSession && (
                    <div className="space-y-2 rounded-lg bg-purple-50 border border-purple-200 p-3">
                      <Label className="text-purple-800">👥 Duo-Partner/in</Label>
                      <Select
                        value={sessionForm.second_client_id}
                        onValueChange={v => setSessionForm(f => ({ ...f, second_client_id: v }))}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Partner/in wählen …" />
                        </SelectTrigger>
                        <SelectContent>
                          {allClients.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!sessionForm.second_client_id && (
                        <p className="text-xs text-amber-600">Bitte Partner/in auswählen, um die Session zu speichern.</p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={sessionForm.status} onValueChange={v => setSessionForm(f => ({ ...f, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sessionStatuses.map(s => <SelectItem key={s} value={s}>{sessionStatusLabelsDE[s] || s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Paket</Label>
                      <Select value={sessionForm.package_id} onValueChange={v => setSessionForm(f => ({ ...f, package_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Keins" /></SelectTrigger>
                        <SelectContent>
                          {packages.map(p => <SelectItem key={p.id} value={p.id}>{p.package_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={sessionForm.late_cancellation} onCheckedChange={v => setSessionForm(f => ({ ...f, late_cancellation: v }))} />
                      <Label>Kurzfristige Absage (&lt;24h)</Label>
                    </div>
                    <div className="space-y-2">
                      <Label>Ort</Label>
                      <Select value={sessionForm.location} onValueChange={v => setSessionForm(f => ({ ...f, location: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Gym">Gym</SelectItem>
                          <SelectItem value="Outdoor">Outdoor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notizen</Label>
                    <Textarea value={sessionForm.notes} onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
                  </div>
                  <Button
                    onClick={saveSession}
                    disabled={isDuoSession && !sessionForm.second_client_id}
                    className="w-full"
                  >
                    {editingSessionId ? 'Änderungen speichern' : 'Einheit speichern'}
                  </Button>
                  {editingSessionId && (
                    <Button variant="destructive" onClick={deleteSession} className="w-full gap-2">
                      <Trash2 className="w-4 h-4" /> Einheit löschen
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Noch keine Einheiten</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <Card key={s.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => openEditSession(s)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{format(new Date(s.session_date), 'd. MMM yyyy · HH:mm', { locale: de })}</p>
                      <p className="text-xs text-muted-foreground">
                        {sessionTypeLabelsDE[s.session_type] || s.session_type} · {s.duration_minutes} Min. · {s.location || 'Gym'}
                        {s.second_client?.full_name && ` · 👥 ${s.second_client.full_name}`}
                      </p>
                      {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {s.late_cancellation && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">Kurzfristig</Badge>}
                      <Badge variant={s.status === 'Completed' ? 'default' : s.status === 'No-Show' ? 'destructive' : 'secondary'}>{sessionStatusLabelsDE[s.status] || s.status}</Badge>
                      <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* PROGRESS TAB */}
        <TabsContent value="progress" className="space-y-6 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Körpermaße</h3>
            <Dialog open={metricDialogOpen} onOpenChange={setMetricDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Messung hinzufügen</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display">Körpermaße erfassen</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Datum</Label><Input type="date" value={metricForm.measured_at} onChange={e => setMetricForm(f => ({ ...f, measured_at: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Gewicht (kg)</Label><Input type="number" step="0.1" value={metricForm.weight_kg} onChange={e => setMetricForm(f => ({ ...f, weight_kg: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Körperfett (%)</Label><Input type="number" step="0.1" value={metricForm.body_fat_pct} onChange={e => setMetricForm(f => ({ ...f, body_fat_pct: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Taille (cm)</Label><Input type="number" step="0.1" value={metricForm.waist_cm} onChange={e => setMetricForm(f => ({ ...f, waist_cm: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Hüfte (cm)</Label><Input type="number" step="0.1" value={metricForm.hip_cm} onChange={e => setMetricForm(f => ({ ...f, hip_cm: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Brust (cm)</Label><Input type="number" step="0.1" value={metricForm.chest_cm} onChange={e => setMetricForm(f => ({ ...f, chest_cm: e.target.value }))} /></div>
                  </div>
                  <Button onClick={saveMetric} className="w-full">Messwerte speichern</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {metrics.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                    <XAxis dataKey="measured_at" tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'hsl(215 15% 55%)' }} />
                    <Tooltip contentStyle={{ background: 'hsl(220 18% 10%)', border: '1px solid hsl(220 14% 18%)', borderRadius: '8px', color: 'hsl(210 20% 92%)' }} />
                    <Line type="monotone" dataKey="weight_kg" name="Gewicht (kg)" stroke="hsl(84 81% 44%)" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="body_fat_pct" name="Körperfett (%)" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold">Fitness-Benchmarks</h3>
            <Dialog open={benchmarkDialogOpen} onOpenChange={setBenchmarkDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Benchmark hinzufügen</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display">Benchmark erfassen</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Bezeichnung (z.B. Max. Liegestütze, Plank-Zeit)</Label><Input value={benchmarkForm.label} onChange={e => setBenchmarkForm(f => ({ ...f, label: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Wert</Label><Input value={benchmarkForm.value} onChange={e => setBenchmarkForm(f => ({ ...f, value: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Datum</Label><Input type="date" value={benchmarkForm.measured_at} onChange={e => setBenchmarkForm(f => ({ ...f, measured_at: e.target.value }))} /></div>
                  <Button onClick={saveBenchmark} className="w-full">Benchmark speichern</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {benchmarks.length > 0 && (
            <div className="space-y-2">
              {benchmarks.map(b => (
                <Card key={b.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{b.label}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(b.measured_at), 'd. MMM yyyy', { locale: de })}</p>
                    </div>
                    <p className="text-sm font-display font-bold text-primary">{b.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {id && <ProgressPhotos clientId={id} />}
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <TrainingPlanTab clientId={id!} clientName={client.full_name} />
        </TabsContent>
        <TabsContent value="workouts" className="mt-4">
          <WorkoutHistoryTab clientId={id!} />
        </TabsContent>

        {/* EQUIPMENT TAB */}
        <TabsContent value="equipment" className="mt-4">
          <ClientEquipmentTab clientId={id!} clientName={client.first_name + ' ' + (client.last_name || '')} />
        </TabsContent>

        {/* ERSTGESPRÄCH TAB */}
        <TabsContent value="erstgespraech" className="space-y-4 mt-4">
          {!conversation ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground mb-4">Noch kein Erstgespräch dokumentiert.</p>
                <Link to={`/onboarding?clientId=${id}`}>
                  <Button className="gap-2"><FileText className="w-4 h-4" /> Erstgespräch führen</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-start justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  Erstgespräch vom {format(new Date(conversation.conversation_date), 'd. MMMM yyyy', { locale: de })}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleExportForClaude}>
                    <Download className="w-4 h-4" /> Für Claude exportieren
                  </Button>
                  <Link to={`/onboarding?clientId=${id}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Edit className="w-4 h-4" /> Neues Gespräch
                    </Button>
                  </Link>
                </div>
              </div>
              {conversation.personality_type && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">
                        {conversation.personality_type === 'success_oriented' ? '⚡' :
                         conversation.personality_type === 'avoidance_oriented' ? '🛡️' : '❓'}
                      </span>
                      <div>
                        <p className="font-medium">
                          {conversation.personality_type === 'success_oriented' ? 'Erfolgsorientiert' :
                           conversation.personality_type === 'avoidance_oriented' ? 'Meidungsorientiert' : 'Noch unklar'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {conversation.personality_type === 'success_oriented'
                            ? 'Herausfordernde Ziele setzen, Eigenverantwortung betonen'
                            : conversation.personality_type === 'avoidance_oriented'
                            ? 'Realistische Erwartungen, mehr Begleitung und Sicherheit geben'
                            : 'Im Training weiter beobachten'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">🎯 Motivation & Ziele</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {conversation.contact_source && <div><span className="text-muted-foreground">Kontakt über:</span> <span>{conversation.contact_source}</span></div>}
                  {conversation.motivation && <div><span className="text-muted-foreground">Motivation:</span><p className="mt-1 whitespace-pre-wrap">{conversation.motivation}</p></div>}
                  {conversation.previous_experience && <div><span className="text-muted-foreground">Bisherige Erfahrung:</span><p className="mt-1 whitespace-pre-wrap">{conversation.previous_experience}</p></div>}
                  {conversation.goal_importance && <div><span className="text-muted-foreground">Warum wichtig:</span><p className="mt-1 whitespace-pre-wrap">{conversation.goal_importance}</p></div>}
                  {conversation.success_criteria && <div><span className="text-muted-foreground">Erfolgskriterium:</span><p className="mt-1">{conversation.success_criteria}</p></div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">📊 Ist-Zustand</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
                  {conversation.stress_level && <div><span className="text-muted-foreground">Stresslevel:</span> <span>{conversation.stress_level}</span></div>}
                  {conversation.sleep_quality && <div><span className="text-muted-foreground">Schlaf:</span> <span>{conversation.sleep_quality}</span></div>}
                  {conversation.daily_activity && <div><span className="text-muted-foreground">Bewegung im Alltag:</span> <span>{conversation.daily_activity}</span></div>}
                  {conversation.current_training && <div><span className="text-muted-foreground">Aktuelles Training:</span> <span>{conversation.current_training}</span></div>}
                  {conversation.nutrition_habits && <div className="sm:col-span-2"><span className="text-muted-foreground">Ernährung:</span> <span>{conversation.nutrition_habits}</span></div>}
                </CardContent>
              </Card>
              {healthRecord && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display flex items-center gap-2 text-destructive">🩺 Anamnese / Gesundheit</CardTitle>
                  </CardHeader>
                  <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
                    {healthRecord.cardiovascular && <div><span className="text-muted-foreground">Herz-Kreislauf:</span> <span>{healthRecord.cardiovascular}</span></div>}
                    {healthRecord.musculoskeletal && <div><span className="text-muted-foreground">Bewegungsapparat:</span> <span>{healthRecord.musculoskeletal}</span></div>}
                    {healthRecord.surgeries && <div><span className="text-muted-foreground">Operationen:</span> <span>{healthRecord.surgeries}</span></div>}
                    {healthRecord.sports_injuries && <div><span className="text-muted-foreground">Sportverletzungen:</span> <span>{healthRecord.sports_injuries}</span></div>}
                    {healthRecord.other_conditions && <div><span className="text-muted-foreground">Sonstige Erkrankungen:</span> <span>{healthRecord.other_conditions}</span></div>}
                    {healthRecord.medications && <div><span className="text-muted-foreground">Medikamente:</span> <span>{healthRecord.medications}</span></div>}
                    {healthRecord.current_pain && <div><span className="text-muted-foreground">Aktuelle Schmerzen:</span> <span>{healthRecord.current_pain}</span></div>}
                    {healthRecord.substances && <div><span className="text-muted-foreground">Genussmittel:</span> <span>{healthRecord.substances}</span></div>}
                    {!healthRecord.cardiovascular && !healthRecord.musculoskeletal &&
                     !healthRecord.surgeries && !healthRecord.sports_injuries &&
                     !healthRecord.other_conditions && !healthRecord.medications &&
                     !healthRecord.current_pain && !healthRecord.substances && (
                      <p className="text-muted-foreground sm:col-span-2">Keine Einschränkungen dokumentiert.</p>
                    )}
                  </CardContent>
                </Card>
              )}
              {(conversation.next_steps || conversation.notes) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display flex items-center gap-2">🚀 Vereinbarungen & Notizen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {conversation.next_steps && <div><span className="text-muted-foreground">Nächste Schritte:</span><p className="mt-1">{conversation.next_steps}</p></div>}
                    {conversation.notes && <div><span className="text-muted-foreground">Notizen:</span><p className="mt-1 whitespace-pre-wrap">{conversation.notes}</p></div>}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* NOTES TAB */}
        <TabsContent value="notes" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-display">Schnellnotiz</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={quickLogText}
                  onChange={e => setQuickLogText(e.target.value)}
                  placeholder="Kurze Notiz..."
                  onKeyDown={e => e.key === 'Enter' && addQuickLog()}
                />
                <Button size="sm" onClick={addQuickLog}>Hinzufügen</Button>
              </div>
              {quickLogs.length > 0 && (
                <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                  {quickLogs.map(ql => (
                    <div key={ql.id} className="text-sm p-2 rounded bg-muted/50">
                      <p>{ql.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(ql.created_at), 'd. MMM yyyy · HH:mm', { locale: de })}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-display">Allgemeine Notizen</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                defaultValue={client.general_notes || ''}
                onBlur={async (e) => {
                  await supabase.from('clients').update({ general_notes: e.target.value }).eq('id', id);
                }}
                rows={6}
                placeholder="Allgemeine Notizen zu diesem Kunden..."
              />
            </CardContent>
          </Card>
          <Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-sm font-display flex items-center gap-2">
      <Lock className="w-4 h-4" /> {/* Import: Lock von lucide-react */}
      Interne Notizen
    </CardTitle>
  </CardHeader>
  <CardContent>
    <Textarea
      defaultValue={client.notes_internal || ''}
      onBlur={async (e) => {
        await supabase.from('clients').update({ notes_internal: e.target.value }).eq('id', id);
        toast.success('Interne Notizen gespeichert');
      }}
      rows={4}
      placeholder="Vertrauliche Notizen (nur für dich sichtbar)..."
      className="bg-muted/30"
    />
    <p className="text-xs text-muted-foreground mt-2">
      💡 Diese Notizen sind nur für dich sichtbar und werden trotzdem dem AI-Builder mitgeteilt.
    </p>
  </CardContent>
</Card>
        </TabsContent>
      </Tabs>

      <BookSessionDialog
        open={bookDialogOpen}
        onOpenChange={setBookDialogOpen}
        clientId={id}
        clientName={client?.full_name}
        onSaved={loadAll}
      />

    </div>
  );
};

export default ClientDetailPage;
