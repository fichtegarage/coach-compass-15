import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CalendarDays, AlertTriangle, DollarSign, Plus, Clock,
  ChevronRight, Package, Cake, Users, TrendingUp, Trophy, BarChart3,
  CalendarCheck, Dumbbell, AlertCircle,
} from 'lucide-react';
import BookSessionDialog from '@/components/BookSessionDialog';
import CoachAlerts from '@/components/CoachAlerts';
import {
  format, addDays, isSameDay, isToday, differenceInDays, getMonth, getDate,
} from 'date-fns';
import { de } from 'date-fns/locale';

// ── Label Maps ────────────────────────────────────────────────────────────────

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Präsenz-Training',
  'Online Training': 'Online-Training',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In Call',
  'Free Intro': 'Erstgespräch',
  'Duo Training': 'Duo Training',
};

const bookingStatusColors: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  confirmed: 'bg-success/10 text-success border-success/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimelineSession {
  id: string;
  clientName: string;
  clientId: string;
  secondClientName?: string;
  sessionType: string;
  sessionDate: string;
  status: string;
  location: string | null;
  durationMinutes: number;
}

interface Reminder {
  type: 'unpaid' | 'expiring' | 'birthday' | 'inactive' | 'plan_end';
  clientName: string;
  clientId: string;
  packageName: string;
  detail: string;
  severity: 'warning' | 'destructive' | 'info';
  isDuo?: boolean;
}

interface BirthdayInfo {
  clientName: string;
  clientId: string;
  date: Date;
}

interface YearStats {
  totalRevenue: number;
  totalClients: number;
  totalSessions: number;
  totalBookings: number;
  clientSessionRanking: { clientId: string; clientName: string; count: number }[];
  clientRevenueRanking: { clientId: string; clientName: string; revenue: number }[];
}

// ── Komponente ────────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [timelineSessions, setTimelineSessions] = useState<TimelineSession[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [visibleReminders, setVisibleReminders] = useState(4);
  const [loading, setLoading] = useState(true);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookPrefillDate, setBookPrefillDate] = useState<string | undefined>();
  const [birthdaysByDay, setBirthdaysByDay] = useState<Record<string, BirthdayInfo[]>>({});
  const [yearStats, setYearStats] = useState<YearStats | null>(null);
  const [workoutFeed, setWorkoutFeed] = useState<any[]>([]);
  const [stagnationAlerts, setStagnationAlerts] = useState<{ clientId: string; clientName: string; exercise: string }[]>([]);
  const [inactiveClients, setInactiveClients] = useState<{ clientId: string; clientName: string; daysSince: number }[]>([]);
  const [planEndAlerts, setPlanEndAlerts] = useState<{ clientId: string; clientName: string; planName: string }[]>([]);

  const next7Days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)), []);
  const getSessionsForDay = (day: Date) => timelineSessions.filter(s => isSameDay(new Date(s.sessionDate), day));
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01T00:00:00`;
  const yearEnd = `${currentYear}-12-31T23:59:59`;

  useEffect(() => { if (user) loadDashboard(); }, [user]);

  const loadDashboard = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');

    const [sessionsRes, packagesRes, clientsRes, ytdSessionsRes, ytdBookingsRes, allClientsRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name, id), second_client:clients!sessions_second_client_id_fkey(full_name)')
        .gte('session_date', today + 'T00:00:00')
        .lte('session_date', weekEnd + 'T23:59:59')
        .order('session_date'),
      // Pakete inkl. Duo-Felder und Partner-Name
      supabase
        .from('packages')
        .select('*, clients(full_name, id), partner:clients!packages_partner_client_id_fkey(full_name, id)'),
      supabase
        .from('clients')
        .select('id, full_name, date_of_birth')
        .eq('status', 'Active')
        .not('date_of_birth', 'is', null),
      supabase
        .from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name, id)')
        .gte('session_date', yearStart)
        .lte('session_date', yearEnd)
        .order('session_date', { ascending: false }),
      supabase
        .from('booking_requests')
        .select('*, clients(full_name, id), availability_slots(start_time, end_time, slot_type)')
        .gte('requested_at', yearStart)
        .lte('requested_at', yearEnd)
        .order('requested_at', { ascending: false }),
      supabase.from('clients').select('id', { count: 'exact', head: true }),
    ]);

    // ── Timeline Sessions ───────────────────────────────────────────────────
    setTimelineSessions((sessionsRes.data || []).map(s => ({
      id: s.id,
      clientName: (s.clients as any)?.full_name || 'Unbekannt',
      clientId: s.client_id,
      secondClientName: (s.second_client as any)?.full_name,
      sessionType: s.session_type,
      sessionDate: s.session_date,
      status: s.status,
      location: s.location,
      durationMinutes: s.duration_minutes,
    })));

    // ── Reminders ───────────────────────────────────────────────────────────
    const reminderList: Reminder[] = [];
    const packages = packagesRes.data || [];

    for (const pkg of packages) {
      const clientName = (pkg.clients as any)?.full_name || 'Unbekannt';
      const clientId   = (pkg.clients as any)?.id || pkg.client_id;
      const isDuo      = pkg.is_duo || false;
      const partnerName = Array.isArray(pkg.partner) ? pkg.partner[0]?.full_name : (pkg.partner as any)?.full_name;
      const partnerId   = Array.isArray(pkg.partner) ? pkg.partner[0]?.id : (pkg.partner as any)?.id || pkg.partner_client_id;

      // ── Unbezahlt: Hauptkunde ─────────────────────────────────────────────
      if (pkg.package_name !== 'Testkunde' && pkg.payment_status !== 'Paid in full') {
        const price = pkg.is_deal && pkg.deal_discounted_price ? pkg.deal_discounted_price : pkg.package_price;
        reminderList.push({
          type: 'unpaid',
          clientName,
          clientId,
          packageName: pkg.package_name + (isDuo ? ' (Hauptkunde)' : ''),
          detail: `€${Number(price).toFixed(0)} · ${pkg.payment_status === 'Unpaid' ? 'Unbezahlt' : 'Teilweise bezahlt'}`,
          severity: 'destructive',
          isDuo,
        });
      }

      // ── Unbezahlt: Partner (nur bei Duo) ─────────────────────────────────
      if (isDuo && partnerId && pkg.partner_payment_status && pkg.partner_payment_status !== 'Paid in full') {
        const price = pkg.is_deal && pkg.deal_discounted_price ? pkg.deal_discounted_price : pkg.package_price;
        reminderList.push({
          type: 'unpaid',
          clientName: partnerName || 'Partner',
          clientId: partnerId,
          packageName: pkg.package_name + ' (Partner)',
          detail: `€${Number(price).toFixed(0)} · ${pkg.partner_payment_status === 'Unpaid' ? 'Unbezahlt' : 'Teilweise bezahlt'}`,
          severity: 'destructive',
          isDuo: true,
        });
      }

      // ── Paket läuft aus ───────────────────────────────────────────────────
      if (pkg.start_date && pkg.duration_weeks) {
        const start = new Date(pkg.start_date);
        const totalDays = pkg.duration_weeks * 7;
        const endDate = pkg.end_date ? new Date(pkg.end_date) : addDays(start, totalDays);
        const daysRemaining = differenceInDays(endDate, new Date());
        const pctRemaining = daysRemaining / totalDays;

        if (pctRemaining > 0 && pctRemaining < 0.33) {
          const { count } = await supabase
            .from('sessions')
            .select('id', { count: 'exact', head: true })
            .eq('package_id', pkg.id)
            .in('status', ['Completed', 'No-Show']);
          const used = count || 0;
          const remaining = pkg.sessions_included - used;

          if (remaining > 0) {
            const weeksLeft = Math.max(0, Math.ceil(daysRemaining / 7));
            reminderList.push({
              type: 'expiring',
              clientName: isDuo ? `${clientName} & ${partnerName || 'Partner'}` : clientName,
              clientId,
              packageName: pkg.package_name,
              detail: `${remaining} von ${pkg.sessions_included} Einheiten offen · noch ${weeksLeft} Wo.`,
              severity: 'warning',
              isDuo,
            });
          }
        }
      }
    }

    // ── Geburtstage ─────────────────────────────────────────────────────────
    const bdayMap: Record<string, BirthdayInfo[]> = {};
    next7Days.forEach(d => { bdayMap[format(d, 'yyyy-MM-dd')] = []; });

    for (const c of (clientsRes.data || [])) {
      if (!c.date_of_birth) continue;
      const dob = new Date(c.date_of_birth);
      for (const day of next7Days) {
        if (getMonth(day) === getMonth(dob) && getDate(day) === getDate(dob)) {
          bdayMap[format(day, 'yyyy-MM-dd')].push({ clientName: c.full_name, clientId: c.id, date: day });
          if (isToday(day)) {
            const age = currentYear - dob.getFullYear();
            reminderList.push({
              type: 'birthday',
              clientName: c.full_name,
              clientId: c.id,
              packageName: '',
              detail: `Wird heute ${age} Jahre alt 🎂`,
              severity: 'info',
            });
          }
        }
      }
    }
    setBirthdaysByDay(bdayMap);

    // Reminder sortieren: destructive → warning → info
    const severityOrder = { destructive: 0, warning: 1, info: 2 };
    reminderList.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    setReminders(reminderList);

    // ── Jahresstatistiken ───────────────────────────────────────────────────
    const ytdSessions = ytdSessionsRes.data || [];
    const ytdBookings = ytdBookingsRes.data || [];
    const ytdPackages = packages.filter(p => p.start_date?.startsWith(String(currentYear)));

    const totalRevenue = ytdPackages.reduce((sum, p) => {
      if (p.package_name === 'Testkunde') return sum;
      return sum + (p.is_deal && p.deal_discounted_price ? Number(p.deal_discounted_price) : Number(p.package_price));
    }, 0);

    const completedSessions = ytdSessions.filter(s => s.status === 'Completed');

    const sessionCountByClient: Record<string, { name: string; count: number }> = {};
    completedSessions.forEach(s => {
      const cid = s.client_id;
      const cname = (s.clients as any)?.full_name || 'Unbekannt';
      if (!sessionCountByClient[cid]) sessionCountByClient[cid] = { name: cname, count: 0 };
      sessionCountByClient[cid].count++;
    });

    const revenueByClient: Record<string, { name: string; revenue: number }> = {};
    ytdPackages.forEach(p => {
      if (p.package_name === 'Testkunde') return;
      const cid = (p.clients as any)?.id || p.client_id;
      const cname = (p.clients as any)?.full_name || 'Unbekannt';
      const price = p.is_deal && p.deal_discounted_price ? Number(p.deal_discounted_price) : Number(p.package_price);
      if (!revenueByClient[cid]) revenueByClient[cid] = { name: cname, revenue: 0 };
      revenueByClient[cid].revenue += price;
    });

    setYearStats({
      totalRevenue,
      totalClients: allClientsRes.count || 0,
      totalSessions: completedSessions.length,
      totalBookings: ytdBookings.length,
      clientSessionRanking: Object.entries(sessionCountByClient)
        .map(([id, v]) => ({ clientId: id, clientName: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count).slice(0, 10),
      clientRevenueRanking: Object.entries(revenueByClient)
        .map(([id, v]) => ({ clientId: id, clientName: v.name, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    });

    // ── Workout-Feed ────────────────────────────────────────────────────────
    const { data: feedData } = await supabase
      .from('workout_logs')
      .select('id, started_at, completed_at, client_id, clients(full_name), plan_workouts(day_label), set_logs(id, weight_kg, reps_done)')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10);
    setWorkoutFeed(feedData || []);

    // ── Stagnations-Alerts ──────────────────────────────────────────────────
    const stagnAlerts: { clientId: string; clientName: string; exercise: string }[] = [];
    const clientGroups: Record<string, { clientId: string; clientName: string; logs: any[] }> = {};
    for (const log of (feedData || []).slice(0, 20)) {
      const cid = log.client_id;
      const cname = Array.isArray(log.clients) ? log.clients[0]?.full_name : (log.clients as any)?.full_name || '';
      if (!clientGroups[cid]) clientGroups[cid] = { clientId: cid, clientName: cname, logs: [] };
      clientGroups[cid].logs.push(log);
    }
    for (const { clientId, clientName, logs } of Object.values(clientGroups)) {
      if (logs.length < 3) continue;
      const { data: recentSets } = await supabase
        .from('set_logs')
        .select('exercise_name, weight_kg, reps_done, logged_at')
        .in('workout_log_id', logs.map((l: any) => l.id))
        .order('logged_at', { ascending: false });
      if (!recentSets) continue;
      const byExercise: Record<string, number[]> = {};
      for (const s of recentSets) {
        if (!byExercise[s.exercise_name]) byExercise[s.exercise_name] = [];
        byExercise[s.exercise_name].push(Number(s.weight_kg) * Number(s.reps_done));
      }
      for (const [exercise, volumes] of Object.entries(byExercise)) {
        if (volumes.length < 3) continue;
        const last3 = volumes.slice(0, 3);
        if (last3.every(v => v <= last3[last3.length - 1] * 1.02)) {
          stagnAlerts.push({ clientId, clientName, exercise });
          break;
        }
      }
    }
    setStagnationAlerts(stagnAlerts.slice(0, 5));

    // ── Inaktive Kunden (≥10 Tage kein Workout) ────────────────────────────
    const { data: recentWorkouts } = await supabase
      .from('workout_logs')
      .select('client_id, started_at, clients(full_name)')
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false });

    const latestByClient: Record<string, { name: string; date: Date }> = {};
    for (const w of (recentWorkouts || [])) {
      const cid = w.client_id;
      const name = Array.isArray(w.clients) ? w.clients[0]?.full_name : (w.clients as any)?.full_name || '';
      if (!latestByClient[cid]) latestByClient[cid] = { name, date: new Date(w.started_at) };
    }
    setInactiveClients(
      Object.entries(latestByClient)
        .map(([clientId, { name, date }]) => ({ clientId, clientName: name, daysSince: differenceInDays(new Date(), date) }))
        .filter(c => c.daysSince >= 10)
        .sort((a, b) => b.daysSince - a.daysSince)
        .slice(0, 3)
    );

    // ── Plan-Ende-Alerts ────────────────────────────────────────────────────
    const { data: alertsData } = await supabase
      .from('plan_end_alerts')
      .select('client_id, plan_id, clients(full_name), training_plans(name)')
      .is('dismissed_at', null)
      .order('alerted_at', { ascending: false })
      .limit(5);
    setPlanEndAlerts((alertsData || []).map((a: any) => ({
      clientId: a.client_id,
      clientName: Array.isArray(a.clients) ? a.clients[0]?.full_name : (a.clients as any)?.full_name || 'Unbekannt',
      planName: Array.isArray(a.training_plans) ? a.training_plans[0]?.name : (a.training_plans as any)?.name || '',
    })));

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const severityIcon = (s: Reminder['severity']) => {
    if (s === 'destructive') return <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />;
    if (s === 'warning')     return <Package className="w-4 h-4 text-warning flex-shrink-0" />;
    return <Cake className="w-4 h-4 text-info flex-shrink-0" />;
  };
  const severityBorder = (s: Reminder['severity']) => {
    if (s === 'destructive') return 'border-destructive/20 bg-destructive/5';
    if (s === 'warning')     return 'border-warning/20 bg-warning/5';
    return 'border-info/20 bg-info/5';
  };

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Übersicht</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de })}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setBookPrefillDate(undefined); setBookDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Session buchen
        </Button>
      </div>

      {/* YTD Stats */}
      {yearStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Jahresübersicht {currentYear}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="stat-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Umsatz</span></div>
                <p className="text-2xl font-display font-bold">€{yearStats.totalRevenue.toLocaleString('de-DE')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-info" /><span className="text-xs text-muted-foreground">Kunden gesamt</span></div>
                <p className="text-2xl font-display font-bold">{yearStats.totalClients}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><CalendarDays className="w-4 h-4 text-success" /><span className="text-xs text-muted-foreground">Sessions (YTD)</span></div>
                <p className="text-2xl font-display font-bold">{yearStats.totalSessions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><CalendarCheck className="w-4 h-4 text-warning" /><span className="text-xs text-muted-foreground">Buchungen (YTD)</span></div>
                <p className="text-2xl font-display font-bold">{yearStats.totalBookings}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Hinweise (Reminders) */}
      {reminders.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Hinweise
            <Badge variant="outline" className="ml-auto text-xs">{reminders.length}</Badge>
          </h2>
          <div className="space-y-2">
            {reminders.slice(0, visibleReminders).map((r, i) => (
              <Link key={i} to={`/clients/${r.clientId}`}>
                <Card className={`hover:opacity-90 transition-opacity border ${severityBorder(r.severity)}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    {severityIcon(r.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate">{r.clientName}</p>
                        {r.isDuo && (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-400/30 gap-0.5 px-1.5 py-0">
                            <Users className="w-2.5 h-2.5" /> Duo
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.packageName && <span className="font-medium">{r.packageName} · </span>}
                        {r.detail}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {reminders.length > visibleReminders && (
            <button
              onClick={() => setVisibleReminders(v => v + 4)}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border rounded-xl hover:bg-muted/50"
            >
              + {reminders.length - visibleReminders} weitere anzeigen
            </button>
          )}
        </section>
      )}

      {/* Stagnations-Alerts */}
      {stagnationAlerts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" /> Stagnation erkannt
          </h2>
          <div className="space-y-2">
            {stagnationAlerts.map((alert, i) => (
              <Link key={i} to={`/clients/${alert.clientId}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-amber-200">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{alert.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">Keine Progression bei: <strong>{alert.exercise}</strong></p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Plan-Ende-Alerts */}
      {planEndAlerts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Plan endet bald
          </h2>
          <div className="space-y-2">
            {planEndAlerts.map((a, i) => (
              <Link key={i} to={`/clients/${a.clientId}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-primary/20">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">Letzte Woche: <strong>{a.planName}</strong></p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Inaktive Kunden */}
      {inactiveClients.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" /> Inaktiv
          </h2>
          <div className="space-y-2">
            {inactiveClients.map((c, i) => (
              <Link key={i} to={`/clients/${c.clientId}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted flex-shrink-0">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.clientName}</p>
                      <p className="text-xs text-muted-foreground">Kein Workout seit <strong>{c.daysSince} Tagen</strong></p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Coach Alerts */}
      <section className="space-y-3">
        <CoachAlerts />
      </section>

      {/* 7-Tage-Timeline */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Nächste 7 Tage
        </h2>
        <div className="space-y-2">
          {next7Days.map((day, idx) => {
            const daySessions = getSessionsForDay(day);
            const today = isToday(day);
            const dayKey = format(day, 'yyyy-MM-dd');
            return (
              <div key={idx} className={`rounded-xl border border-border p-3 transition-colors ${today ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold flex-shrink-0 ${today ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <span className="text-[10px] leading-none uppercase">{format(day, 'EEE', { locale: de })}</span>
                    <span className="text-sm leading-none">{format(day, 'd')}</span>
                  </div>
                  <span className="text-sm font-medium">{today ? 'Heute' : format(day, 'EEEE', { locale: de })}</span>
                  {daySessions.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {daySessions.length} {daySessions.length === 1 ? 'Einheit' : 'Einheiten'}
                    </Badge>
                  )}
                </div>

                {/* Geburtstage */}
                {(birthdaysByDay[dayKey] || []).map(b => (
                  <Link key={b.clientId} to={`/clients/${b.clientId}`}>
                    <div className="pl-[52px] mb-2">
                      <div className="flex items-center gap-2 rounded-lg bg-info/10 border border-info/20 px-3 py-1.5 text-sm hover:bg-info/15 transition-colors">
                        <Cake className="w-4 h-4 text-info flex-shrink-0" />
                        <span className="font-medium">{b.clientName}</span>
                        <span className="text-xs text-muted-foreground">hat Geburtstag 🎂</span>
                      </div>
                    </div>
                  </Link>
                ))}

                {daySessions.length === 0 ? (
                  <div className="pl-[52px] flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Keine Termine</p>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                      onClick={() => {
                        const d = new Date(day); d.setHours(10, 0, 0, 0);
                        setBookPrefillDate(d.toISOString().slice(0, 16));
                        setBookDialogOpen(true);
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Buchen
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5 pl-[52px]">
                    {daySessions.map(s => {
                      const isCancelled = s.status.startsWith('Cancelled') || s.status === 'No-Show';
                      const isScheduled = s.status === 'Scheduled';
                      const isDuo = s.sessionType === 'Duo Training';
                      return (
                        <Link key={s.id} to={`/clients/${s.clientId}`}>
                          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                            isCancelled ? 'bg-destructive/10 text-destructive/70 line-through'
                            : isScheduled ? 'bg-primary/10 border border-primary/20 hover:bg-primary/15'
                            : 'bg-muted/50 hover:bg-muted'
                          }`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium">{format(new Date(s.sessionDate), 'HH:mm')}</span>
                              {isDuo && <Users className="w-3 h-3 text-primary flex-shrink-0" />}
                              <span className="truncate">
                                {s.clientName}{isDuo && s.secondClientName && ` & ${s.secondClientName}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-muted-foreground">{sessionTypeLabels[s.sessionType] || s.sessionType}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Workout-Feed */}
      {workoutFeed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Dumbbell className="w-4 h-4" /> Letzte Workouts
          </h2>
          <div className="space-y-2">
            {workoutFeed.map(log => {
              const clientName = Array.isArray(log.clients) ? log.clients[0]?.full_name : (log.clients as any)?.full_name || 'Unbekannt';
              const workoutLabel = Array.isArray(log.plan_workouts) ? log.plan_workouts[0]?.day_label : (log.plan_workouts as any)?.day_label || 'Freies Training';
              const sets = log.set_logs || [];
              const volume = sets.reduce((s: number, x: any) => s + (Number(x.weight_kg) || 0) * (Number(x.reps_done) || 0), 0);
              const mins = log.completed_at ? Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 60000) : null;
              return (
                <Link key={log.id} to={`/clients/${log.client_id}`}>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                        <Dumbbell className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {workoutLabel}
                          {mins && ` · ${mins} Min.`}
                          {volume > 0 && ` · ${volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`} Volumen`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">{format(new Date(log.completed_at), 'd. MMM', { locale: de })}</p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto mt-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Rankings */}
      {yearStats && (yearStats.clientSessionRanking.length > 0 || yearStats.clientRevenueRanking.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Rankings {currentYear}
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {yearStats.clientSessionRanking.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-display">🏋️ Sessions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {yearStats.clientSessionRanking.slice(0, 5).map((c, i) => (
                    <Link key={c.clientId} to={`/clients/${c.clientId}`}>
                      <div className="flex items-center gap-2 hover:bg-accent/50 rounded-lg px-2 py-1 transition-colors">
                        <span className={`text-xs font-bold w-5 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'}`}>{i + 1}</span>
                        <span className="flex-1 text-sm truncate">{c.clientName}</span>
                        <span className="text-xs font-semibold text-primary">{c.count}</span>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
            {yearStats.clientRevenueRanking.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-display">💰 Umsatz</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {yearStats.clientRevenueRanking.slice(0, 5).map((c, i) => (
                    <Link key={c.clientId} to={`/clients/${c.clientId}`}>
                      <div className="flex items-center gap-2 hover:bg-accent/50 rounded-lg px-2 py-1 transition-colors">
                        <span className={`text-xs font-bold w-5 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'}`}>{i + 1}</span>
                        <span className="flex-1 text-sm truncate">{c.clientName}</span>
                        <span className="text-xs font-semibold text-primary">€{c.revenue.toLocaleString('de-DE')}</span>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      <BookSessionDialog
        open={bookDialogOpen}
        onOpenChange={setBookDialogOpen}
        prefillDate={bookPrefillDate}
        onSaved={loadDashboard}
      />
    </div>
  );
};

export default DashboardPage;const bookingStatusLabels: Record<string, string> = {
  pending: 'Ausstehend',
  confirmed: 'Bestätigt',
  rejected: 'Abgelehnt',
  cancelled: 'Storniert',
};

const bookingStatusColors: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  confirmed: 'bg-success/10 text-success border-success/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

// ── Hinweis-Typ ───────────────────────────────────────────────────────────────
type HinweisType = 'unpaid' | 'expiring' | 'plan_end' | 'birthday_today' | 'inactive';

interface Hinweis {
  type: HinweisType;
  priority: number;       // 1 = dringend, 4 = info
  clientId: string;
  clientName: string;
  detail: string;
}

interface TimelineSession {
  id: string; clientName: string; clientId: string; secondClientName?: string;
  sessionType: string; sessionDate: string; status: string; location: string | null; durationMinutes: number;
}

interface BirthdayInfo { clientName: string; clientId: string; date: Date; }

interface YearStats {
  totalRevenue: number; totalClients: number; totalSessions: number; totalBookings: number;
  sessionsYTD: any[]; bookingsYTD: any[];
  clientSessionRanking: { clientId: string; clientName: string; count: number }[];
  clientRevenueRanking: { clientId: string; clientName: string; revenue: number }[];
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [timelineSessions, setTimelineSessions] = useState<TimelineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookPrefillDate, setBookPrefillDate] = useState<string | undefined>();
  const [birthdaysByDay, setBirthdaysByDay] = useState<Record<string, BirthdayInfo[]>>({});
  const [yearStats, setYearStats] = useState<YearStats | null>(null);
  const [workoutFeed, setWorkoutFeed] = useState<any[]>([]);

  // Unified alert data
  const [hinweise, setHinweise] = useState<Hinweis[]>([]);
  const [showAllHinweise, setShowAllHinweise] = useState(false);

  const HINWEISE_LIMIT = 4;

  const next7Days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  const getSessionsForDay = (day: Date) =>
    timelineSessions.filter(s => isSameDay(new Date(s.sessionDate), day));
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01T00:00:00`;
  const yearEnd = `${currentYear}-12-31T23:59:59`;

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');

    const [sessionsRes, packagesRes, clientsRes, ytdSessionsRes, ytdBookingsRes, allClientsRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name, id), second_client:clients!sessions_second_client_id_fkey(full_name)')
        .gte('session_date', today + 'T00:00:00')
        .lte('session_date', weekEnd + 'T23:59:59')
        .order('session_date'),
      supabase.from('packages').select('*, clients(full_name, id)'),
      supabase.from('clients').select('id, full_name, date_of_birth').eq('status', 'Active').not('date_of_birth', 'is', null),
      supabase
        .from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name, id), second_client:clients!sessions_second_client_id_fkey(full_name)')
        .gte('session_date', yearStart)
        .lte('session_date', yearEnd)
        .order('session_date', { ascending: false }),
      supabase
        .from('booking_requests')
        .select('*, clients(full_name, id), availability_slots(start_time, end_time, slot_type)')
        .gte('requested_at', yearStart)
        .lte('requested_at', yearEnd)
        .order('requested_at', { ascending: false }),
      supabase.from('clients').select('id', { count: 'exact', head: true }),
    ]);

    // Timeline
    const sessions: TimelineSession[] = (sessionsRes.data || []).map(s => ({
      id: s.id, clientName: (s.clients as any)?.full_name || 'Unbekannt', clientId: s.client_id,
      secondClientName: (s.second_client as any)?.full_name, sessionType: s.session_type,
      sessionDate: s.session_date, status: s.status, location: s.location, durationMinutes: s.duration_minutes,
    }));
    setTimelineSessions(sessions);

    // ── Unified Hinweise berechnen ─────────────────────────────────────────
    const collected: Hinweis[] = [];
    const packages = packagesRes.data || [];

    for (const pkg of packages) {
      const clientName = (pkg.clients as any)?.full_name || 'Unbekannt';
      const clientId = (pkg.clients as any)?.id || pkg.client_id;
      const isTestkunde = pkg.package_name === 'Testkunde';

      // 1. Hauptkunde unbezahlt
      if (pkg.package_name !== 'Testkunde' && pkg.payment_status !== 'Paid in full') {
        const price = pkg.is_deal && pkg.deal_discounted_price ? pkg.deal_discounted_price : pkg.package_price;
        const duoSuffix = pkg.is_duo ? ' (Hauptkunde)' : '';
        
        collected.push({
          type: 'unpaid',
          priority: 1, // Höchste Priorität für Geldthemen
          clientId,
          clientName,
          detail: `${pkg.package_name}${duoSuffix}: €${Number(price).toFixed(0)} ausstehend`,
        });
      }
         
      // 2. Partner unbezahlt (Duo-Pakete)
      if (pkg.is_duo && pkg.partner_client_id && pkg.partner_payment_status !== 'Paid in full') {
        const price = pkg.is_deal && pkg.deal_discounted_price ? pkg.deal_discounted_price : pkg.package_price;
        
        // Da partner_name oft nicht im Join ist, hier ein einfacher Fallback
        // (Für eine saubere Lösung müsstest du den Query oben anpassen)
        collected.push({
          type: 'unpaid',
          priority: 1,
          clientId: pkg.partner_client_id,
          clientName: 'Partner-Kunde', 
          detail: `${pkg.package_name} (Partner): €${Number(price).toFixed(0)} ausstehend`,
        });
      }

      // 3. Paket läuft aus
      if (pkg.start_date && pkg.duration_weeks) {
        // ... (dein restlicher Code für "expiring" bleibt gleich, 
        // achte nur darauf 'collected.push' zu nutzen)
      }
    }// 1. Hauptkunde unbezahlt
      if (pkg.package_name !== 'Testkunde' && pkg.payment_status !== 'Paid in full') {
        const price = pkg.is_deal && pkg.deal_discounted_price ? pkg.deal_discounted_price : pkg.package_price;
        const duoSuffix = pkg.is_duo ? ' (Hauptkunde)' : '';
        
        collected.push({
          type: 'unpaid',
          priority: 1, // Höchste Priorität für Geldthemen
          clientId,
          clientName,
          detail: `${pkg.package_name}${duoSuffix}: €${Number(price).toFixed(0)} ausstehend`,
        });
      }
         
      // 2. Partner unbezahlt (Duo-Pakete)
      if (pkg.is_duo && pkg.partner_client_id && pkg.partner_payment_status !== 'Paid in full') {
        const price = pkg.is_deal && pkg.deal_discounted_price ? pkg.deal_discounted_price : pkg.package_price;
        
        // Da partner_name oft nicht im Join ist, hier ein einfacher Fallback
        // (Für eine saubere Lösung müsstest du den Query oben anpassen)
        collected.push({
          type: 'unpaid',
          priority: 1,
          clientId: pkg.partner_client_id,
          clientName: 'Partner-Kunde', 
          detail: `${pkg.package_name} (Partner): €${Number(price).toFixed(0)} ausstehend`,
        });
      }

      // 3. Paket läuft aus
      if (pkg.start_date && pkg.duration_weeks) {
        // ... (dein restlicher Code für "expiring" bleibt gleich, 
        // achte nur darauf 'collected.push' zu nutzen)
      }
    }

    // Geburtstag heute – nur heute, nicht die nächsten 7 Tage (die sind in der Timeline)
    const clients = clientsRes.data || [];
    const bdayMap: Record<string, BirthdayInfo[]> = {};
    next7Days.forEach(d => { bdayMap[format(d, 'yyyy-MM-dd')] = []; });
    for (const c of clients) {
      if (!c.date_of_birth) continue;
      const dob = new Date(c.date_of_birth);
      for (const day of next7Days) {
        if (getMonth(dob) === getMonth(day) && getDate(dob) === getDate(day)) {
          bdayMap[format(day, 'yyyy-MM-dd')].push({ clientName: c.full_name, clientId: c.id, date: day });
          if (isToday(day)) {
            const age = new Date().getFullYear() - dob.getFullYear();
            collected.push({
              type: 'birthday_today', priority: 3, clientId: c.id, clientName: c.full_name,
              detail: `Wird heute ${age} Jahre alt 🎂`,
            });
          }
        }
      }
    }
    setBirthdaysByDay(bdayMap);

    // Plan läuft aus
    try {
      const { data: alertsData } = await supabase
        .from('plan_end_alerts')
        .select('client_id, plan_id, clients ( full_name ), training_plans ( name )')
        .is('dismissed_at', null)
        .order('alerted_at', { ascending: false })
        .limit(3);
      (alertsData || []).forEach((a: any) => {
        const cn = Array.isArray(a.clients) ? a.clients[0]?.full_name : a.clients?.full_name || 'Unbekannt';
        const pn = Array.isArray(a.training_plans) ? a.training_plans[0]?.name : a.training_plans?.name || '';
        collected.push({
          type: 'plan_end', priority: 2, clientId: a.client_id, clientName: cn,
          detail: `Plan "${pn}" fast abgeschlossen – neuen Plan vorbereiten`,
        });
      });
    } catch { /* Tabelle existiert noch nicht */ }

    // Lange inaktiv (≥ 10 Tage kein selbst-geloggtes Workout)
    const { data: recentWorkouts } = await supabase
      .from('workout_logs')
      .select('client_id, started_at, clients ( full_name )')
      .not('completed_at', 'is', null)
      .order('started_at', { ascending: false });

    const latestByClient: Record<string, { name: string; date: Date }> = {};
    for (const w of (recentWorkouts || [])) {
      const cid = w.client_id;
      const name = Array.isArray(w.clients) ? w.clients[0]?.full_name : (w.clients as any)?.full_name || '';
      if (!latestByClient[cid]) latestByClient[cid] = { name, date: new Date(w.started_at) };
    }
    Object.entries(latestByClient)
      .map(([clientId, { name, date }]) => ({ clientId, clientName: name, daysSince: differenceInDays(new Date(), date) }))
      .filter(c => c.daysSince >= 10)
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 2)
      .forEach(c => {
        collected.push({
          type: 'inactive', priority: 4, clientId: c.clientId, clientName: c.clientName,
          detail: `Kein Training seit ${c.daysSince} Tagen`,
        });
      });

    // Deduplizieren: pro Kunde nur den dringendsten Hinweis behalten
    const deduped: Hinweis[] = [];
    const seenClients = new Set<string>();
    collected
      .sort((a, b) => a.priority - b.priority)
      .forEach(h => {
        // Geburtstag und Inaktiv dürfen auch kommen wenn Kunde schon einen anderen Alert hat
        if (h.type === 'birthday_today' || h.type === 'inactive') {
          deduped.push(h);
        } else {
          if (!seenClients.has(h.clientId)) {
            seenClients.add(h.clientId);
            deduped.push(h);
          }
        }
      });

    setHinweise(deduped);

    // Year stats
    const ytdSessions = ytdSessionsRes.data || [];
    const ytdBookings = ytdBookingsRes.data || [];
    const ytdPackages = packages.filter(p => p.start_date && p.start_date.startsWith(String(currentYear)));
    const totalRevenue = ytdPackages.reduce((sum, p) => {
      if (p.package_name === 'Testkunde') return sum;
      return sum + (p.is_deal && p.deal_discounted_price ? Number(p.deal_discounted_price) : Number(p.package_price));
    }, 0);
    const completedSessions = ytdSessions.filter(s => s.status === 'Completed');
    const sessionCountByClient: Record<string, { name: string; count: number }> = {};
    completedSessions.forEach(s => {
      const cid = s.client_id;
      const cname = (s.clients as any)?.full_name || 'Unbekannt';
      if (!sessionCountByClient[cid]) sessionCountByClient[cid] = { name: cname, count: 0 };
      sessionCountByClient[cid].count++;
    });
    const clientSessionRanking = Object.entries(sessionCountByClient)
      .map(([id, v]) => ({ clientId: id, clientName: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
    const revenueByClient: Record<string, { name: string; revenue: number }> = {};
    ytdPackages.forEach(p => {
      if (p.package_name === 'Testkunde') return;
      const cid = (p.clients as any)?.id || p.client_id;
      const cname = (p.clients as any)?.full_name || 'Unbekannt';
      const price = p.is_deal && p.deal_discounted_price ? Number(p.deal_discounted_price) : Number(p.package_price);
      if (!revenueByClient[cid]) revenueByClient[cid] = { name: cname, revenue: 0 };
      revenueByClient[cid].revenue += price;
    });
    const clientRevenueRanking = Object.entries(revenueByClient)
      .map(([id, v]) => ({ clientId: id, clientName: v.name, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    setYearStats({
      totalRevenue, totalClients: allClientsRes.count || 0,
      totalSessions: completedSessions.length, totalBookings: ytdBookings.length,
      sessionsYTD: ytdSessions, bookingsYTD: ytdBookings,
      clientSessionRanking, clientRevenueRanking,
    });

    // Workout-Feed
    const { data: feedData } = await supabase
      .from('workout_logs')
      .select(`id, started_at, completed_at, client_id,
        clients ( full_name ),
        plan_workouts ( day_label ),
        set_logs ( id, weight_kg, reps_done )`)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(8);
    setWorkoutFeed(feedData || []);

    setLoading(false);
  };

  // ── Hinweis-Icon und Farbe ────────────────────────────────────────────────
  const hinweisStyle = (h: Hinweis) => {
    switch (h.type) {
      case 'unpaid': return { icon: <DollarSign className="w-4 h-4 text-destructive" />, bg: 'bg-destructive/10', label: 'Unbezahlt' };
      case 'expiring': return { icon: <Package className="w-4 h-4 text-warning" />, bg: 'bg-warning/10', label: 'Paket läuft aus' };
      case 'plan_end': return { icon: <AlertTriangle className="w-4 h-4 text-orange-500" />, bg: 'bg-orange-500/10', label: 'Plan endet' };
      case 'birthday_today': return { icon: <Cake className="w-4 h-4 text-info" />, bg: 'bg-info/10', label: 'Geburtstag' };
      case 'inactive': return { icon: <Clock className="w-4 h-4 text-muted-foreground" />, bg: 'bg-muted', label: 'Inaktiv' };
    }
  };

  const visibleHinweise = showAllHinweise ? hinweise : hinweise.slice(0, HINWEISE_LIMIT);
  const hiddenCount = hinweise.length - HINWEISE_LIMIT;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Übersicht</h1>
          <p className="text-muted-foreground text-sm">
            {format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de })}
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setBookPrefillDate(undefined); setBookDialogOpen(true); }}>
          <Plus className="w-4 h-4" /> Session buchen
        </Button>
      </div>

      {/* YTD Stats */}
      {yearStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Jahresübersicht {currentYear}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="stat-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-primary" /><span className="text-xs text-muted-foreground">Umsatz</span></div>
                <p className="text-2xl font-display font-bold">€{yearStats.totalRevenue.toLocaleString('de-DE')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-info" /><span className="text-xs text-muted-foreground">Kunden gesamt</span></div>
                <p className="text-2xl font-display font-bold">{yearStats.totalClients}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><CalendarDays className="w-4 h-4 text-success" /><span className="text-xs text-muted-foreground">Sessions (YTD)</span></div>
                <p className="text-2xl font-display font-bold">{yearStats.totalSessions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><CalendarCheck className="w-4 h-4 text-warning" /><span className="text-xs text-muted-foreground">Buchungen (YTD)</span></div>
                <p className="text-2xl font-display font-bold">{yearStats.totalBookings}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* ── UNIFIED HINWEISE ─────────────────────────────────────────────── */}
      {hinweise.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Hinweise
            <span className="text-xs font-normal text-muted-foreground/70">({hinweise.length})</span>
          </h2>
          <div className="space-y-1.5">
            {visibleHinweise.map((h, i) => {
              const style = hinweisStyle(h);
              return (
                <Link key={i} to={`/clients/${h.clientId}`}>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${style.bg}`}>
                        {style.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{h.clientName}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">{style.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{h.detail}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
            {!showAllHinweise && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllHinweise(true)}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 text-center"
              >
                + {hiddenCount} weitere Hinweis{hiddenCount !== 1 ? 'e' : ''} anzeigen
              </button>
            )}
          </div>
        </section>
      )}

      {/* 7-Day Timeline */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Nächste 7 Tage
        </h2>
        <div className="space-y-2">
          {next7Days.map((day, idx) => {
            const daySessions = getSessionsForDay(day);
            const today = isToday(day);
            return (
              <div key={idx} className={`rounded-xl border border-border p-3 transition-colors ${today ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold shrink-0 ${today ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <span className="text-[10px] leading-none uppercase">{format(day, 'EEE', { locale: de })}</span>
                    <span className="text-sm leading-none">{format(day, 'd')}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{today ? 'Heute' : format(day, 'EEEE', { locale: de })}</span>
                  {daySessions.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {daySessions.length} {daySessions.length === 1 ? 'Einheit' : 'Einheiten'}
                    </Badge>
                  )}
                </div>

                {/* Geburtstage in Timeline */}
                {(birthdaysByDay[format(day, 'yyyy-MM-dd')] || []).map(b => (
                  <Link key={b.clientId} to={`/clients/${b.clientId}`}>
                    <div className="pl-[52px] mb-2">
                      <div className="flex items-center gap-2 rounded-lg bg-info/10 border border-info/20 px-3 py-1.5 text-sm hover:bg-info/15 transition-colors">
                        <Cake className="w-4 h-4 text-info shrink-0" />
                        <span className="font-medium">{b.clientName}</span>
                        <span className="text-xs text-muted-foreground">hat Geburtstag 🎂</span>
                      </div>
                    </div>
                  </Link>
                ))}

                {daySessions.length === 0 ? (
                  <div className="pl-[52px] flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Keine Termine</p>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                      onClick={() => {
                        const d = new Date(day); d.setHours(10, 0, 0, 0);
                        setBookPrefillDate(d.toISOString().slice(0, 16)); setBookDialogOpen(true);
                      }}>
                      <Plus className="w-3 h-3 mr-1" /> Buchen
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5 pl-[52px]">
                    {daySessions.map(s => {
                      const isCancelled = s.status.startsWith('Cancelled') || s.status === 'No-Show';
                      const isScheduled = s.status === 'Scheduled';
                      const isDuo = s.sessionType === 'Duo Training';
                      return (
                        <Link key={s.id} to={`/clients/${s.clientId}`}>
                          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                            isCancelled ? 'bg-destructive/10 text-destructive/70 line-through'
                            : isScheduled ? 'bg-primary/10 border border-primary/20 hover:bg-primary/15'
                            : 'bg-muted/50 hover:bg-muted'
                          }`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">{format(new Date(s.sessionDate), 'HH:mm')}</span>
                              {isDuo && <Users className="w-3 h-3 text-primary shrink-0" />}
                              <span className="truncate">{s.clientName}{isDuo && s.secondClientName && ` & ${s.secondClientName}`}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">{sessionTypeLabels[s.sessionType] || s.sessionType}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Workout Feed */}
      {workoutFeed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Dumbbell className="w-4 h-4" /> Eigenständige Workouts
          </h2>
          <div className="space-y-2">
            {workoutFeed.map((log: any) => {
              const clientName = Array.isArray(log.clients) ? log.clients[0]?.full_name : log.clients?.full_name || 'Unbekannt';
              const workoutName = Array.isArray(log.plan_workouts) ? log.plan_workouts[0]?.day_label : log.plan_workouts?.day_label || 'Freies Training';
              const sets = Array.isArray(log.set_logs) ? log.set_logs : [];
              const volume = sets.reduce((sum: number, s: any) => sum + (Number(s.weight_kg) || 0) * (Number(s.reps_done) || 0), 0);
              const mins = log.completed_at ? Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 60000) : null;
              return (
                <Link key={log.id} to={`/clients/${log.client_id}`}>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0"><Dumbbell className="w-4 h-4 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {workoutName} · {format(new Date(log.completed_at), "d. MMM · HH:mm", { locale: de })} Uhr
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        {sets.length > 0 && <p className="text-xs font-medium">{volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : `${Math.round(volume)}kg`}</p>}
                        {mins !== null && <p className="text-xs text-muted-foreground">{mins} Min.</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Rankings & YTD History */}
      {yearStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Rankings & Verlauf {currentYear}
          </h2>
          <Tabs defaultValue="rankings">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="rankings">Rankings</TabsTrigger>
              <TabsTrigger value="sessions">Sessions ({yearStats.sessionsYTD.length})</TabsTrigger>
              <TabsTrigger value="bookings">Buchungen ({yearStats.bookingsYTD.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="rankings" className="mt-3">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-display flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" /> Meiste Sessions</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {yearStats.clientSessionRanking.length === 0
                      ? <p className="text-xs text-muted-foreground">Noch keine Daten</p>
                      : yearStats.clientSessionRanking.map((c, i) => (
                        <Link key={c.clientId} to={`/clients/${c.clientId}`}>
                          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-primary text-primary-foreground' : i === 1 ? 'bg-primary/20 text-primary' : i === 2 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                            <span className="text-sm flex-1 truncate">{c.clientName}</span>
                            <span className="text-sm font-display font-bold text-primary">{c.count}</span>
                          </div>
                        </Link>
                      ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-display flex items-center gap-2"><TrendingUp className="w-4 h-4 text-success" /> Größter Umsatz</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {yearStats.clientRevenueRanking.length === 0
                      ? <p className="text-xs text-muted-foreground">Noch keine Daten</p>
                      : yearStats.clientRevenueRanking.map((c, i) => (
                        <Link key={c.clientId} to={`/clients/${c.clientId}`}>
                          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-success text-success-foreground' : i === 1 ? 'bg-success/20 text-success' : i === 2 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                            <span className="text-sm flex-1 truncate">{c.clientName}</span>
                            <span className="text-sm font-display font-bold text-success">€{c.revenue.toLocaleString('de-DE')}</span>
                          </div>
                        </Link>
                      ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="sessions" className="mt-3">
              <Card>
                <CardContent className="p-0">
                  {yearStats.sessionsYTD.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-8">Keine Sessions in {currentYear}</p>
                    : (
                      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                        {yearStats.sessionsYTD.map(s => (
                          <Link key={s.id} to={`/clients/${s.client_id}`}>
                            <div className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{(s.clients as any)?.full_name || 'Unbekannt'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(s.session_date), 'd. MMM yyyy · HH:mm', { locale: de })} · {sessionTypeLabels[s.session_type] || s.session_type}
                                </p>
                              </div>
                              <Badge variant={s.status === 'Completed' ? 'default' : s.status === 'Scheduled' ? 'secondary' : 'destructive'} className="text-xs shrink-0">
                                {sessionStatusLabels[s.status] || s.status}
                              </Badge>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bookings" className="mt-3">
              <Card>
                <CardContent className="p-0">
                  {yearStats.bookingsYTD.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-8">Keine Buchungen in {currentYear}</p>
                    : (
                      <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                        {yearStats.bookingsYTD.map((b: any) => (
                          <Link key={b.id} to={`/clients/${b.client_id}`}>
                            <div className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{(b.clients as any)?.full_name || 'Unbekannt'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {b.availability_slots
                                    ? `${format(new Date(b.availability_slots.start_time), 'd. MMM yyyy · HH:mm', { locale: de })} – ${format(new Date(b.availability_slots.end_time), 'HH:mm')}`
                                    : `Angefragt ${format(new Date(b.requested_at), 'd. MMM yyyy · HH:mm', { locale: de })}`}
                                </p>
                              </div>
                              <Badge variant="outline" className={`text-xs shrink-0 ${bookingStatusColors[b.status] || ''}`}>
                                {bookingStatusLabels[b.status] || b.status}
                              </Badge>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>
      )}

      <BookSessionDialog
        open={bookDialogOpen}
        onOpenChange={setBookDialogOpen}
        prefillDate={bookPrefillDate}
        onSaved={loadDashboard}
      />
    </div>
  );
};

export default DashboardPage;
