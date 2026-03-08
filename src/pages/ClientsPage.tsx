import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, User, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
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

  useEffect(() => {
    if (!user) return;
    loadClients();
  }, [user]);

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('full_name');
    setClients(data || []);
    setLoading(false);
  };

  const filtered = clients.filter(c => {
    const matchesSearch = c.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColor = (s: string) => {
    if (s === 'Active') return 'bg-success/10 text-success border-success/20';
    if (s === 'Paused') return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-muted text-muted-foreground';
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
        <div className="grid gap-3">
          {filtered.map(client => (
            <Link key={client.id} to={`/clients/${client.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
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
                      {client.fitness_goal || 'Kein Ziel gesetzt'}
                      {client.starting_date && ` · Kunde seit ${formatDistanceToNow(new Date(client.starting_date), { locale: de })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {client.whatsapp_link && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-success"
                        onClick={(e) => { e.preventDefault(); window.open(client.whatsapp_link!, '_blank'); }}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Badge variant="outline" className={statusColor(client.status)}>{statusLabelsDE[client.status] || client.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientsPage;
