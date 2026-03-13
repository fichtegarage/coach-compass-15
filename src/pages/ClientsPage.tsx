import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, User, ChevronDown, ChevronUp, CalendarDays, Check, Circle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_link: string | null;
  status: string;
  fitness_goal: string | null;
  starting_date: string | null;
  profile_photo_url: string | null;
}

interface PackageData {
  id: string;
  client_id: string;
  package_name: string;
  sessions_included: number;
  checkin_calls_included: number;
  start_date: string;
  end_date: string | null;
  package_price: number;
  payment_status: string | null;
}

interface SessionCount {
  client_id: string;
  count: number;
}

interface PackageFeature {
  label: string;
  key: 'erstgespraech' | 'sessions' | 'trainingsplan' | 'fortschrittsdoku' | 'checkin_calls' | 'ernaehrung' | 'fortschrittsfotos' | 'whatsapp_support' | 'prio_buchung' | 'gratis_einheit';
  manual?: boolean;
}

const packageFeaturesMap: Record<string, PackageFeature[]> = {
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

const statusLabelsDE: Record<string, string> = {
  'Active': 'Aktiv',
  'Paused': 'Pausiert',
  'Churned': 'Abgemeldet',
};

const ClientsPage: React.FC = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [packages, setPackages] = useState<Record<string, PackageData>>({});
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [checkinCounts, setCheckinCounts] = useState<Record<string, number>>({});
  const [metricCounts, setMetricCounts] = useState<Record<string, number>>({});
  const [manualCompletions, setManualCompletions] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const [clientsRes, packagesRes, sessionsRes, checkinsRes, metricsRes, completionsRes] = await Promise.all([
      supabase.from('clients').select('*').order('full_name'),
      supabase.from('packages').select('*').order('start_date', { ascending: false }),
      supabase.from('sessions').select('client_id, id').eq('status', 'Completed').neq('session_type', 'Check-In Call'),
      supabase.from('sessions').select('client_id, id').eq('status', 'Completed').eq('session_type', 'Check-In Call'),
      supabase.from('body_metrics').select('client_id, id'),
      supabase.from('package_feature_completions').select('package_id, feature_key'),
    ]);

    setClients(clientsRes.data || []);

    const pkgMap: Record<string, PackageData> = {};
    (packagesRes.data || []).forEach((p: any) => {
      if (!pkgMap[p.client_id]) pkgMap[p.client_id] = p;
    });
    setPackages(pkgMap);

    const sMap: Record<string, number> = {};
    (sessionsRes.data || []).forEach((s: any) => {
      sMap[s.client_id] = (sMap[s.client_id] || 0) + 1;
    });
    setSessionCounts(sMap);

    const cMap: Record<string, number> = {};
    (checkinsRes.data || []).forEach((s: any) => {
      cMap[s.client_id] = (cMap[s.client_id] || 0) + 1;
    });
    setCheckinCounts(cMap);

    const mMap: Record<string, number> = {};
    (metricsRes.data || []).forEach((m: any) => {
      mMap[m.client_id] = (mMap[m.client_id] || 0) + 1;
    });
    setMetricCounts(mMap);

    const mcMap: Record<string, Set<string>> = {};
    (completionsRes.data || []).forEach((c: any) => {
      if (!mcMap[c.package_id]) mcMap[c.package_id] = new Set();
      mcMap[c.package_id].add(c.feature_key);
    });
    setManualCompletions(mcMap);

    setLoading(false);
  };

  const toggleManualCompletion = useCallback(async (packageId: string, featureKey: string, currentlyDone: boolean) => {
    if (!user) return;
    if (currentlyDone) {
      await supabase
        .from('package_feature_completions')
        .delete()
        .eq('package_id', packageId)
        .eq('feature_key', featureKey);
      setManualCompletions(prev => {
        const next = { ...prev };
        const s = new Set(next[packageId]);
        s.delete(featureKey);
        next[packageId] = s;
        return next;
      });
    } else {
      await supabase
        .from('package_feature_completions')
        .insert({ user_id: user.id, package_id: packageId, feature_key: featureKey });
      setManualCompletions(prev => {
        const next = { ...prev };
        const s = new Set(next[packageId] || []);
        s.add(featureKey);
        next[packageId] = s;
        return next;
      });
    }
  }, [user]);

  const deleteClient = async (e: React.MouseEvent, clientId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Kunden wirklich löschen? Alle zugehörigen Daten (Einheiten, Pakete, Metriken) werden unwiderruflich gelöscht.')) return;
    const { error } = await supabase.from('clients').delete().eq('id', clientId);
    if (error) {
      alert('Fehler beim Löschen: ' + error.message);
      return;
    }
    setClients(prev => prev.filter(c => c.id !== clientId));
  };

  const sortByFirstName = (a: Client, b: Client) => a.full_name.localeCompare(b.full_name, 'de');

  const filtered = clients.filter(c => {
    const matchesSearch = c.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeClients = filtered
    .filter(c => c.status === 'Active' && packages[c.id])
    .sort(sortByFirstName);

  const archivedClients = filtered
    .filter(c => c.status !== 'Active' || !packages[c.id])
    .sort(sortByFirstName);

  const statusColor = (s: string) => {
    if (s === 'Active') return 'bg-success/10 text-success border-success/20';
    if (s === 'Paused') return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-muted text-muted-foreground';
  };

  const toggleExpand = (e: React.MouseEvent, clientId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedClient(prev => prev === clientId ? null : clientId);
  };

  const getFeatureStatus = (key: string, pkg: PackageData, usedSessions: number, usedCheckins: number, hasMetrics: boolean): { done: boolean; detail?: string; manual?: boolean } => {
    const manualDone = manualCompletions[pkg.id]?.has(key) || false;
    switch (key) {
      case 'erstgespraech': return { done: manualDone, manual: true };
      case 'sessions': return { done: usedSessions >= pkg.sessions_included, detail: `${usedSessions} / ${pkg.sessions_included}` };
      case 'trainingsplan': return { done: manualDone, manual: true };
      case 'fortschrittsdoku': return { done: hasMetrics };
      case 'checkin_calls': return { done: usedCheckins >= pkg.checkin_calls_included, detail: `${usedCheckins} / ${pkg.checkin_calls_included}` };
      case 'ernaehrung': return { done: manualDone, manual: true };
      case 'fortschrittsfotos': return { done: hasMetrics };
      case 'whatsapp_support': return { done: true };
      case 'prio_buchung': return { done: true };
      case 'gratis_einheit': return { done: manualDone, manual: true };
      default: return { done: false };
    }
  };

  const renderClientCard = (client: Client) => {
    const pkg = packages[client.id];
    const isExpanded = expandedClient === client.id;
    const usedSessions = sessionCounts[client.id] || 0;
    const usedCheckins = checkinCounts[client.id] || 0;
    const hasMetrics = (metricCounts[client.id] || 0) > 0;
    const features = pkg ? (packageFeaturesMap[pkg.package_name] || []) : [];

    return (
      <div key={client.id}>
        <Card className={`transition-colors ${isExpanded ? 'ring-1 ring-primary/20' : 'hover:bg-accent/50'}`}>
          <Link to={`/clients/${client.id}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {client.profile_photo_url ? (
                  <img src={client.profile_photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{client.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {pkg ? pkg.package_name : 'Kein Paket'}
                  {client.starting_date && ` · Kunde seit ${formatDistanceToNow(new Date(client.starting_date), { locale: de })}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="outline" className={statusColor(client.status)}>{statusLabelsDE[client.status] || client.status}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => toggleExpand(e, client.id)}
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Link>

          {isExpanded && (
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
              {pkg && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">Paket {pkg.package_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {pkg.package_price}€
                        {pkg.sessions_included > 0 && ` · ${Math.round(pkg.package_price / pkg.sessions_included)}€ je Einheit`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={pkg.payment_status || 'unpaid'}
                        onValueChange={async (val) => {
                          await supabase.from('packages').update({ payment_status: val }).eq('id', pkg.id);
                          setPackages(prev => ({
                            ...prev,
                            [client.id]: { ...prev[client.id], payment_status: val }
                          }));
                        }}
                      >
                        <SelectTrigger className={`h-7 text-xs w-36 ${
                          (pkg.payment_status || 'unpaid') === 'paid'
                            ? 'border-success/40 text-success bg-success/5'
                            : (pkg.payment_status || 'unpaid') === 'partial'
                            ? 'border-warning/40 text-warning bg-warning/5'
                            : 'border-destructive/40 text-destructive bg-destructive/5'
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">✓ Bezahlt</SelectItem>
                          <SelectItem value="partial">◑ Teilweise</SelectItem>
                          <SelectItem value="unpaid">✗ Unbezahlt</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>
                        {format(new Date(pkg.start_date), 'dd.MM.yy')}
                        {pkg.end_date && ` – ${format(new Date(pkg.end_date), 'dd.MM.yy')}`}
                      </span>
                    </div>
                  </div>

                  {features.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paketinhalte</p>
                      <ul className="space-y-1.5">
                        {features.map((feat, i) => {
                          const status = getFeatureStatus(feat.key, pkg, usedSessions, usedCheckins, hasMetrics);
                          const isManual = feat.manual === true;
                          return (
                            <li
                              key={i}
                              className={`flex items-center gap-2.5 text-sm ${isManual ? 'cursor-pointer hover:bg-accent/50 -mx-1 px-1 rounded' : ''}`}
                              onClick={isManual ? (e) => { e.preventDefault(); e.stopPropagation(); toggleManualCompletion(pkg.id, feat.key, status.done); } : undefined}
                            >
                              {isManual ? (
                                <Checkbox
                                  checked={status.done}
                                  className="flex-shrink-0"
                                  onCheckedChange={() => toggleManualCompletion(pkg.id, feat.key, status.done)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : status.done ? (
                                <Check className="w-4 h-4 flex-shrink-0 text-success" />
                              ) : (
                                <Circle className="w-4 h-4 flex-shrink-0 text-muted-foreground/30" />
                              )}
                              <span className={status.done ? 'text-foreground' : 'text-muted-foreground'}>
                                {feat.label}
                              </span>
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
                </>
              )}

              <div className="pt-2 flex justify-end border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                  onClick={(e) => deleteClient(e, client.id)}
                >
                  Kunde löschen
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-display font-bold">Kunden</h1>
        <Link to="/clients/new">
          <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Neuer Kunde</Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Kunden suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Alle Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="Active">Aktiv</SelectItem>
            <SelectItem value="Paused">Pausiert</SelectItem>
            <SelectItem value="Churned">Abgemeldet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Keine Kunden gefunden</p>
        </div>
      ) : (
        <div className="space-y-8">
          {activeClients.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Aktive Kunden
                <Badge variant="secondary" className="font-normal">{activeClients.length}</Badge>
              </h2>
              <div className="grid gap-3">
                {activeClients.map(client => renderClientCard(client))}
              </div>
            </div>
          )}

          {archivedClients.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                Archiv
                <Badge variant="secondary" className="font-normal">{archivedClients.length}</Badge>
              </h2>
              <div className="grid gap-3">
                {archivedClients.map(client => renderClientCard(client))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientsPage;
