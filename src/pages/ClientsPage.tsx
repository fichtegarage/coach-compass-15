import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, User, MessageCircle, ChevronDown, ChevronUp, CalendarDays, Check, Circle, Phone } from 'lucide-react';
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
}

interface SessionCount {
  client_id: string;
  count: number;
}

// Package features based on the actual offerings
const packageFeatures: Record<string, string[]> = {
  'Starter': [
    'Persönliches Erstgespräch & Zielsetzung',
    '5 individuelle 1:1-Trainingseinheiten',
    'Trainingsplan passend zu deinen Zielen',
    'Fortschrittsdokumentation',
  ],
  'Transformation': [
    'Alles aus Paket Starter',
    'Monatlicher Check-in-Call (15 Min.)',
    'Angepasster Ernährungsleitfaden',
    'Fortschrittsfotos & Messung',
  ],
  'Intensiv': [
    'Alles aus Paket Transformation',
    'WhatsApp-Support zwischen den Einheiten',
    'Priorisierte Terminbuchung',
    'Eine Gratis-Einheit bei Weiterempfehlung',
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

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const [clientsRes, packagesRes, sessionsRes, checkinsRes] = await Promise.all([
      supabase.from('clients').select('*').order('full_name'),
      supabase.from('packages').select('*').order('start_date', { ascending: false }),
      supabase.from('sessions').select('client_id, id').eq('status', 'Completed').neq('session_type', 'Check-In Call'),
      supabase.from('sessions').select('client_id, id').eq('status', 'Completed').eq('session_type', 'Check-In Call'),
    ]);

    setClients(clientsRes.data || []);

    // Map latest package per client
    const pkgMap: Record<string, PackageData> = {};
    (packagesRes.data || []).forEach((p: any) => {
      if (!pkgMap[p.client_id]) pkgMap[p.client_id] = p;
    });
    setPackages(pkgMap);

    // Count completed sessions per client
    const sMap: Record<string, number> = {};
    (sessionsRes.data || []).forEach((s: any) => {
      sMap[s.client_id] = (sMap[s.client_id] || 0) + 1;
    });
    setSessionCounts(sMap);

    // Count check-in calls per client
    const cMap: Record<string, number> = {};
    (checkinsRes.data || []).forEach((s: any) => {
      cMap[s.client_id] = (cMap[s.client_id] || 0) + 1;
    });
    setCheckinCounts(cMap);

    setLoading(false);
  };

  const sortByFirstName = (a: Client, b: Client) => a.full_name.localeCompare(b.full_name, 'de');

  const filtered = clients.filter(c => {
    const matchesSearch = c.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Active = has an active package AND status is Active
  const activeClients = filtered
    .filter(c => c.status === 'Active' && packages[c.id])
    .sort(sortByFirstName);

  // Archived = Churned, Paused, or no active package
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

  const renderClientCard = (client: Client) => {
    const pkg = packages[client.id];
    const isExpanded = expandedClient === client.id;
    const usedSessions = sessionCounts[client.id] || 0;
    const usedCheckins = checkinCounts[client.id] || 0;
    const features = pkg ? (packageFeatures[pkg.package_name] || []) : [];

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
                {client.whatsapp_link && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-success"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(client.whatsapp_link!, '_blank'); }}
                  >
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                )}
                <Badge variant="outline" className={statusColor(client.status)}>{statusLabelsDE[client.status] || client.status}</Badge>
                {pkg && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => toggleExpand(e, client.id)}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </CardContent>
          </Link>

          {isExpanded && pkg && (
            <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Paket {pkg.package_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pkg.package_price}€
                    {pkg.sessions_included > 0 && ` · ${Math.round(pkg.package_price / pkg.sessions_included)}€ je Session`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>
                    {format(new Date(pkg.start_date), 'dd.MM.yy')}
                    {pkg.end_date && ` – ${format(new Date(pkg.end_date), 'dd.MM.yy')}`}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Einheiten</span>
                  <span className="font-medium">{usedSessions} / {pkg.sessions_included}</span>
                </div>
                <Progress value={pkg.sessions_included > 0 ? (usedSessions / pkg.sessions_included) * 100 : 0} className="h-2" />
              </div>

              {pkg.checkin_calls_included > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Check-in Calls</span>
                    <span className="font-medium">{usedCheckins} / {pkg.checkin_calls_included}</span>
                  </div>
                  <Progress value={(usedCheckins / pkg.checkin_calls_included) * 100} className="h-2" />
                </div>
              )}

              {features.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paketinhalte</p>
                  <ul className="space-y-1">
                    {features.map((feat, i) => {
                      const isDone = i === 0;
                      return (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDone ? 'text-success' : 'text-muted-foreground/40'}`} />
                          <span className={isDone ? 'text-foreground' : 'text-muted-foreground'}>{feat}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {client.whatsapp_link && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-success border-success/30 hover:bg-success/10"
                  onClick={() => window.open(client.whatsapp_link!, '_blank')}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp-Chat öffnen
                </Button>
              )}
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
          {/* Active clients */}
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

          {/* Archived clients */}
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
