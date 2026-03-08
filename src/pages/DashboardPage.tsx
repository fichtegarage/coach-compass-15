import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, CalendarDays, DollarSign, TrendingUp, AlertTriangle, Plus, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface DashboardStats {
  activeClients: number;
  sessionsThisMonth: number;
  sessionsLastMonth: number;
  revenueThisMonth: number;
  outstandingAmount: number;
  expiringPackages: Array<{ clientName: string; packageName: string; sessionsRemaining: number; endDate: string | null }>;
  unpaidPackages: Array<{ clientName: string; packageName: string; paymentStatus: string; price: number }>;
  todaySessions: Array<{ clientName: string; sessionType: string; sessionDate: string; status: string }>;
}

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    activeClients: 0, sessionsThisMonth: 0, sessionsLastMonth: 0,
    revenueThisMonth: 0, outstandingAmount: 0,
    expiringPackages: [], unpaidPackages: [], todaySessions: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    const now = new Date();
    const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
    const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
    const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
    const today = format(now, 'yyyy-MM-dd');

    const [clientsRes, sessionsThisRes, sessionsLastRes, packagesRes, todaySessionsRes] = await Promise.all([
      supabase.from('clients').select('id').eq('status', 'Active'),
      supabase.from('sessions').select('id').gte('session_date', thisMonthStart).lte('session_date', thisMonthEnd).eq('status', 'Completed'),
      supabase.from('sessions').select('id').gte('session_date', lastMonthStart).lte('session_date', lastMonthEnd).eq('status', 'Completed'),
      supabase.from('packages').select('*, clients(full_name)'),
      supabase.from('sessions').select('*, clients(full_name)').gte('session_date', today + 'T00:00:00').lte('session_date', today + 'T23:59:59').order('session_date'),
    ]);

    const packages = packagesRes.data || [];
    
    // Calculate revenue and expiring packages
    const paidThisMonth = packages
      .filter(p => p.payment_status === 'Paid in full' && p.payment_date && p.payment_date >= thisMonthStart && p.payment_date <= thisMonthEnd)
      .reduce((sum, p) => sum + Number(p.is_deal && p.deal_discounted_price ? p.deal_discounted_price : p.package_price), 0);

    const outstanding = packages
      .filter(p => p.payment_status !== 'Paid in full')
      .reduce((sum, p) => sum + Number(p.is_deal && p.deal_discounted_price ? p.deal_discounted_price : p.package_price), 0);

    // For expiring packages, we need session counts
    const expiringPkgs: DashboardStats['expiringPackages'] = [];
    for (const pkg of packages.filter(p => p.payment_status !== 'Paid in full' || true)) {
      const { count } = await supabase.from('sessions').select('id', { count: 'exact', head: true })
        .eq('package_id', pkg.id).in('status', ['Completed', 'No-Show']);
      const used = count || 0;
      const remaining = pkg.sessions_included - used;
      const endingSoon = pkg.end_date && new Date(pkg.end_date) <= new Date(Date.now() + 14 * 86400000);
      if (remaining <= 2 || endingSoon) {
        expiringPkgs.push({
          clientName: (pkg.clients as any)?.full_name || 'Unknown',
          packageName: pkg.package_name,
          sessionsRemaining: remaining,
          endDate: pkg.end_date,
        });
      }
    }

    const unpaidPkgs = packages
      .filter(p => p.payment_status !== 'Paid in full')
      .map(p => ({
        clientName: (p.clients as any)?.full_name || 'Unknown',
        packageName: p.package_name,
        paymentStatus: p.payment_status,
        price: Number(p.is_deal && p.deal_discounted_price ? p.deal_discounted_price : p.package_price),
      }));

    const todaySess = (todaySessionsRes.data || []).map(s => ({
      clientName: (s.clients as any)?.full_name || 'Unknown',
      sessionType: s.session_type,
      sessionDate: s.session_date,
      status: s.status,
    }));

    setStats({
      activeClients: clientsRes.data?.length || 0,
      sessionsThisMonth: sessionsThisRes.data?.length || 0,
      sessionsLastMonth: sessionsLastRes.data?.length || 0,
      revenueThisMonth: paidThisMonth,
      outstandingAmount: outstanding,
      expiringPackages: expiringPkgs,
      unpaidPackages: unpaidPkgs,
      todaySessions: todaySess,
    });
    setLoading(false);
  };

  const sessionDelta = stats.sessionsThisMonth - stats.sessionsLastMonth;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <Link to="/sessions/new">
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Log Session
          </Button>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="stat-glow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{stats.activeClients}</p>
                <p className="text-xs text-muted-foreground">Active Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-info/10"><CalendarDays className="w-5 h-5 text-info" /></div>
              <div>
                <p className="text-2xl font-display font-bold">{stats.sessionsThisMonth}</p>
                <p className="text-xs text-muted-foreground">
                  Sessions this month
                  {sessionDelta !== 0 && (
                    <span className={sessionDelta > 0 ? 'text-success ml-1' : 'text-destructive ml-1'}>
                      ({sessionDelta > 0 ? '+' : ''}{sessionDelta})
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10"><DollarSign className="w-5 h-5 text-success" /></div>
              <div>
                <p className="text-2xl font-display font-bold">€{stats.revenueThisMonth.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Revenue this month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10"><TrendingUp className="w-5 h-5 text-warning" /></div>
              <div>
                <p className="text-2xl font-display font-bold">€{stats.outstandingAmount.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Outstanding</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's Sessions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Today's Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.todaySessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions scheduled for today.</p>
            ) : (
              <div className="space-y-2">
                {stats.todaySessions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{s.clientName}</p>
                      <p className="text-xs text-muted-foreground">{s.sessionType} · {format(new Date(s.sessionDate), 'HH:mm')}</p>
                    </div>
                    <Badge variant={s.status === 'Completed' ? 'default' : 'secondary'}>{s.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring Packages */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Expiring Packages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.expiringPackages.length === 0 ? (
              <p className="text-sm text-muted-foreground">All packages are in good standing.</p>
            ) : (
              <div className="space-y-2">
                {stats.expiringPackages.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{p.clientName}</p>
                      <p className="text-xs text-muted-foreground">{p.packageName}</p>
                    </div>
                    <Badge variant="outline" className="text-warning border-warning/30">{p.sessionsRemaining} left</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unpaid Packages */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-destructive" /> Unpaid / Partially Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.unpaidPackages.length === 0 ? (
              <p className="text-sm text-muted-foreground">All packages are paid in full.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {stats.unpaidPackages.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{p.clientName}</p>
                      <p className="text-xs text-muted-foreground">{p.packageName} · €{p.price}</p>
                    </div>
                    <Badge variant="outline" className="text-destructive border-destructive/30">{p.paymentStatus}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
