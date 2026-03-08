import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays, AlertTriangle, DollarSign, Plus, Clock,
  ChevronRight, Package,
} from 'lucide-react';
import BookSessionDialog from '@/components/BookSessionDialog';
import {
  format, addDays, isSameDay, isToday, differenceInDays, differenceInWeeks,
} from 'date-fns';
import { de } from 'date-fns/locale';

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Präsenz-Training',
  'Online Training': 'Online-Training',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In Call',
  'Free Intro': 'Erstgespräch',
};

interface TimelineSession {
  id: string;
  clientName: string;
  clientId: string;
  sessionType: string;
  sessionDate: string;
  status: string;
  location: string | null;
  durationMinutes: number;
}

interface Reminder {
  type: 'unpaid' | 'expiring';
  clientName: string;
  clientId: string;
  packageName: string;
  detail: string;
  severity: 'warning' | 'destructive';
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [timelineSessions, setTimelineSessions] = useState<TimelineSession[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookPrefillDate, setBookPrefillDate] = useState<string | undefined>();

  const next7Days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');

    const [sessionsRes, packagesRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('*, clients(full_name, id)')
        .gte('session_date', today + 'T00:00:00')
        .lte('session_date', weekEnd + 'T23:59:59')
        .order('session_date'),
      supabase
        .from('packages')
        .select('*, clients(full_name, id)'),
    ]);

    // Timeline sessions
    const sessions: TimelineSession[] = (sessionsRes.data || []).map(s => ({
      id: s.id,
      clientName: (s.clients as any)?.full_name || 'Unbekannt',
      clientId: s.client_id,
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

      // Unpaid reminder
      if (pkg.payment_status !== 'Paid in full') {
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

      // Expiring: <33% of total runtime remaining
      if (pkg.start_date && pkg.duration_weeks) {
        const start = new Date(pkg.start_date);
        const totalDays = pkg.duration_weeks * 7;
        const endDate = pkg.end_date ? new Date(pkg.end_date) : addDays(start, totalDays);
        const daysRemaining = differenceInDays(endDate, new Date());
        const pctRemaining = daysRemaining / totalDays;

        if (pctRemaining > 0 && pctRemaining < 0.33) {
          // Count used sessions
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

    setReminders(reminderList);
    setLoading(false);
  };

  const getSessionsForDay = (day: Date) =>
    timelineSessions.filter(s => isSameDay(new Date(s.sessionDate), day));

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
                className={`rounded-xl border border-border p-3 transition-colors ${
                  today ? 'bg-primary/5 border-primary/20' : 'bg-card'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold shrink-0 ${
                      today
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <span className="text-[10px] leading-none uppercase">
                      {format(day, 'EEE', { locale: de })}
                    </span>
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

                {daySessions.length === 0 ? (
                  <div className="pl-[52px] flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">Keine Termine</p>
                    <Button
                      variant="ghost"
                      size="sm"
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
                      return (
                        <Link key={s.id} to={`/clients/${s.clientId}`}>
                          <div
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                              isCancelled
                                ? 'bg-destructive/10 text-destructive/70 line-through'
                                : 'bg-muted/50 hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">
                                {format(new Date(s.sessionDate), 'HH:mm')}
                              </span>
                              <span className="truncate">{s.clientName}</span>
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
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        r.severity === 'destructive'
                          ? 'bg-destructive/10'
                          : 'bg-warning/10'
                      }`}
                    >
                      {r.type === 'unpaid' ? (
                        <DollarSign
                          className={`w-4 h-4 ${
                            r.severity === 'destructive' ? 'text-destructive' : 'text-warning'
                          }`}
                        />
                      ) : (
                        <Package
                          className={`w-4 h-4 ${
                            r.severity === 'destructive' ? 'text-destructive' : 'text-warning'
                          }`}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.clientName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.packageName} · {r.detail}
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
