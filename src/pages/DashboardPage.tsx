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
  CalendarCheck, Dumbbell,
} from 'lucide-react';
import BookSessionDialog from '@/components/BookSessionDialog';
import {
  format, addDays, isSameDay, isToday, differenceInDays, getMonth, getDate,
} from 'date-fns';
import { de } from 'date-fns/locale';

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Präsenz-Training',
  'Online Training': 'Online-Training',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In Call',
  'Free Intro': 'Erstgespräch',
  'Duo Training': 'Duo Training',
};

const sessionStatusLabels: Record<string, string> = {
  'Scheduled': 'Geplant',
  'Completed': 'Abgeschlossen',
  'No-Show': 'Nicht erschienen',
  'Cancelled by Client': 'Abgesagt',
  'Cancelled by Trainer': 'Abgesagt',
};

const bookingStatusLabels: Record<string, string> = {
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
  type: 'unpaid' | 'expiring' | 'birthday';
  clientName: string;
  clientId: string;
  packageName: string;
  detail: string;
  severity: 'warning' | 'destructive' | 'info';
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
  sessionsYTD: any[];
  bookingsYTD: any[];
  clientSessionRanking: { clientId: string; clientName: string; count: number }[];
  clientRevenueRanking: { clientId: string; clientName: string; revenue: number }[];
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [timelineSessions, setTimelineSessions] = useState<TimelineSession[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookPrefillDate, setBookPrefillDate] = useState<string | undefined>();
  const [birthdaysByDay, setBirthdaysByDay] = useState<Record<string, BirthdayInfo[]>>({});
  const [yearStats, setYearStats] = useState<YearStats | null>(null);
  const [workoutFeed, setWorkoutFeed] = useState<any[]>([]);

  const next7Days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
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
      // ── FIX: explizite FK-Namen wegen second_client_id ──
      supabase
        .from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name, id), second_client:clients!sessions_second_client_id_fkey(full_name)')
        .gte('session_date', today + 'T00:00:00')
        .lte('session_date', weekEnd + 'T23:59:59')
        .order('session_date'),
      supabase
        .from('packages')
        .select('*, clients(full_name, id)'),
      supabase
        .from('clients')
        .select('id, full_name, date_of_birth')
        .eq('status', 'Active')
        .not('date_of_birth', 'is', null),
      // YTD sessions – gleiches Fix
      supabase
        .from('sessions')
        .select('*, clients!sessions_client_id_fkey(full_name, id), second_client:clients!sessions_second_client_id_fkey(full_name)')
        .gte('session_date', yearStart)
        .lte('session_date', yearEnd)
        .order('session_date', { ascending: false }),
      // YTD bookings
      supabase
        .from('booking_requests')
        .select('*, clients(full_name, id), availability_slots(start_time, end_time, slot_type)')
        .gte('requested_at', yearStart)
        .lte('requested_at', yearEnd)
        .order('requested_at', { ascending: false }),
      // All clients for count
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true }),
    ]);

    // Timeline sessions
    const sessions: TimelineSession[] = (sessionsRes.data || []).map(s => ({
      id: s.id,
      clientName: (s.clients as any)?.full_name || 'Unbekannt',
      clientId: s.client_id,
      secondClientName: (s.second_client as any)?.full_name,
      sessionType: s.session_type,
      sessionDate: s.session_date,
      status: s.status,
      location: s.location,
      durationMinutes: s.duration_minutes,
    }));
    setTimelineSessions(sessions);

    // Reminders
    const reminderList: Reminder[] = [];
    const packages = packagesRes.data || [];

    for (const pkg of packages) {
      const clientName = (pkg.clients as any)?.full_name || 'Unbekannt';
      const clientId = (pkg.clients as any)?.id || pkg.client_id;

      // Kein Zahlungs-Reminder für Testkunden
      if (pkg.package_name !== 'Testkunde' && pkg.payment_status !== 'Paid in full') {
        const price = pkg.is_deal && pkg.deal_discounted_price
          ? pkg.deal_discounted_price
          : pkg.package_price;
        reminderList.push({
          type: 'unpaid',
          clientName,
          clientId,
          packageName: pkg.package_name,
          detail: `€${Number(price).toFixed(0)} · ${pkg.payment_status === 'Unpaid' ? 'Unbezahlt' : 'Teilweise bezahlt'}`,
          severity: 'destructive',
        });
      }

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
              clientName,
              clientId,
              packageName: pkg.package_name,
              detail: `${remaining} von ${pkg.sessions_included} Einheiten offen · noch ${weeksLeft} Wo.`,
              severity: 'warning',
            });
          }
        }
      }
    }

    // Birthday reminders
    const bdayMap: Record<string, BirthdayInfo[]> = {};
    const clients = clientsRes.data || [];
    for (const day of next7Days) {
      const dayKey = format(day, 'yyyy-MM-dd');
      bdayMap[dayKey] = [];
    }
    for (const c of clients) {
      if (!c.date_of_birth) continue;
      const dob = new Date(c.date_of_birth);
      const dobMonth = getMonth(dob);
      const dobDay = getDate(dob);
      for (const day of next7Days) {
        if (getMonth(day) === dobMonth && getDate(day) === dobDay) {
          const dayKey = format(day, 'yyyy-MM-dd');
          bdayMap[dayKey].push({ clientName: c.full_name, clientId: c.id, date: day });
          if (isToday(day)) {
            const age = new Date().getFullYear() - dob.getFullYear();
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
    setReminders(reminderList);

    // Year stats
    const ytdSessions = ytdSessionsRes.data || [];
    const ytdBookings = ytdBookingsRes.data || [];

    const ytdPackages = packages.filter(p => p.start_date && p.start_date.startsWith(String(currentYear)));
    const totalRevenue = ytdPackages.reduce((sum, p) => {
      if (p.package_name === 'Testkunde') return sum;
      const price = p.is_deal && p.deal_discounted_price ? Number(p.deal_discounted_price) : Number(p.package_price);
      return sum + price;
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
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    setYearStats({
      totalRevenue,
      totalClients: allClientsRes.count || 0,
      totalSessions: completedSessions.length,
      totalBookings: ytdBookings.length,
      sessionsYTD: ytdSessions,
      bookingsYTD: ytdBookings,
      clientSessionRanking,
      clientRevenueRanking,
    });
// Workout-Feed
    const { data: feedData } = await supabase
      .from('workout_logs')
      .select(`id, started_at, completed_at, client_id,
        clients ( full_name ),
        plan_workouts ( day_label ),
        set_logs ( id )`)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(10);
    setWorkoutFeed(feedData || []);

    setLoading(false);   // ← diese Zeile kommt zuletzt
  };                     // ← dann erst die schließende Klammer
     

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

      {/* YTD Stats Cards */}
      {yearStats && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Jahresübersicht {currentYear}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="stat-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Umsatz</span>
                </div>
                <p className="text-2xl font-display font-bold">€{yearStats.totalRevenue.toLocaleString('de-DE')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-info" />
                  <span className="text-xs text-muted-foreground">Kunden gesamt</span>
                </div>
                <p className="text-2xl font-display font-bold">{yearStats.totalClients}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="w-4 h-4 text-success" />
                  <span className="text-xs text-muted-foreground">Sessions (YTD)</span>
                </div>
                <p className="text-2xl font-display font-bold">{yearStats.totalSessions}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarCheck className="w-4 h-4 text-warning" />
                  <span className="text-xs text-muted-foreground">Buchungen (YTD)</span>
                </div>
                <p className="text-2xl font-display font-bold">{yearStats.totalBookings}</p>
              </CardContent>
            </Card>
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
              <div
                key={idx}
                className={`rounded-xl border border-border p-3 transition-colors ${today ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold shrink-0 ${today ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <span className="text-[10px] leading-none uppercase">{format(day, 'EEE', { locale: de })}</span>
                    <span className="text-sm leading-none">{format(day, 'd')}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {today ? 'Heute' : format(day, 'EEEE', { locale: de })}
                  </span>
                  {daySessions.length > 0 && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {daySessions.length} {daySessions.length === 1 ? 'Einheit' : 'Einheiten'}
                    </Badge>
                  )}
                </div>

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
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                      onClick={() => {
                        const d = new Date(day);
                        d.setHours(10, 0, 0, 0);
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
                            isCancelled
                              ? 'bg-destructive/10 text-destructive/70 line-through'
                              : isScheduled
                              ? 'bg-primary/10 border border-primary/20 hover:bg-primary/15'
                              : 'bg-muted/50 hover:bg-muted'
                          }`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">
                                {format(new Date(s.sessionDate), 'HH:mm')}
                              </span>
                              {isDuo && <Users className="w-3 h-3 text-primary shrink-0" />}
                              <span className="truncate">
                                {s.clientName}
                                {isDuo && s.secondClientName && ` & ${s.secondClientName}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">
                                {sessionTypeLabels[s.sessionType] || s.sessionType}
                              </span>
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

      {workoutFeed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Dumbbell className="w-4 h-4" /> Eigenständige Workouts
          </h2>
          <div className="space-y-2">
            {workoutFeed.map((log: any) => {
              const clientName = Array.isArray(log.clients) ? log.clients[0]?.full_name : log.clients?.full_name || 'Unbekannt';
              const workoutName = Array.isArray(log.plan_workouts) ? log.plan_workouts[0]?.day_label : log.plan_workouts?.day_label || 'Freies Training';
              const setCount = Array.isArray(log.set_logs) ? log.set_logs.length : 0;
              const mins = log.completed_at ? Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 60000) : null;
              return (
                <Link key={log.id} to={`/clients/${log.client_id}`}>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <Dumbbell className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {workoutName} · {format(new Date(log.completed_at), "d. MMM · HH:mm", { locale: de })} Uhr
                        </p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        {setCount > 0 && <p className="text-xs font-medium">{setCount} Sätze</p>}
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

      {/* Reminders */}
      {reminders.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Erinnerungen
          </h2>
          <div className="space-y-2">
            {reminders.map((r, i) => (
              <Link key={i} to={`/clients/${r.clientId}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`p-2 rounded-lg shrink-0 ${r.severity === 'destructive' ? 'bg-destructive/10' : r.severity === 'info' ? 'bg-info/10' : 'bg-warning/10'}`}>
                      {r.type === 'birthday' ? (
                        <Cake className="w-4 h-4 text-info" />
                      ) : r.type === 'unpaid' ? (
                        <DollarSign className={`w-4 h-4 ${r.severity === 'destructive' ? 'text-destructive' : 'text-warning'}`} />
                      ) : (
                        <Package className={`w-4 h-4 ${r.severity === 'destructive' ? 'text-destructive' : 'text-warning'}`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.packageName ? `${r.packageName} · ` : ''}{r.detail}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* YTD Rankings & History */}
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
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" /> Meiste Sessions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {yearStats.clientSessionRanking.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Noch keine Daten</p>
                    ) : yearStats.clientSessionRanking.map((c, i) => (
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
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-display flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-success" /> Größter Umsatz
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {yearStats.clientRevenueRanking.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Noch keine Daten</p>
                    ) : yearStats.clientRevenueRanking.map((c, i) => (
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
                  {yearStats.sessionsYTD.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Keine Sessions in {currentYear}</p>
                  ) : (
                    <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                      {yearStats.sessionsYTD.map(s => {
                        const isDuo = s.session_type === 'Duo Training';
                        const secondName = (s.second_client as any)?.full_name;
                        return (
                          <Link key={s.id} to={`/clients/${s.client_id}`}>
                            <div className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {isDuo && <Users className="w-3.5 h-3.5 text-primary shrink-0" />}
                                  {(s.clients as any)?.full_name || 'Unbekannt'}
                                  {isDuo && secondName && <span className="text-muted-foreground">& {secondName}</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(s.session_date), 'd. MMM yyyy · HH:mm', { locale: de })} · {sessionTypeLabels[s.session_type] || s.session_type}
                                </p>
                              </div>
                              <Badge variant={s.status === 'Completed' ? 'default' : s.status === 'Scheduled' ? 'secondary' : 'destructive'} className="text-xs shrink-0">
                                {sessionStatusLabels[s.status] || s.status}
                              </Badge>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bookings" className="mt-3">
              <Card>
                <CardContent className="p-0">
                  {yearStats.bookingsYTD.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Keine Buchungen in {currentYear}</p>
                  ) : (
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
                              {b.client_message && <p className="text-xs text-muted-foreground truncate">„{b.client_message}"</p>}
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
