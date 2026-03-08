import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CalendarDays } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const sessionTypes = ['In-Person Training', 'Online Training', 'Phone Call', 'Check-In Call', 'Free Intro'];
const sessionStatuses = ['Completed', 'No-Show', 'Cancelled by Client', 'Cancelled by Trainer'];

const SessionsPage: React.FC = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    client_id: '', session_date: new Date().toISOString().slice(0, 16),
    duration_minutes: '60', session_type: 'In-Person Training',
    status: 'Completed', notes: '', late_cancellation: false,
  });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const now = new Date();
    const [sRes, cRes] = await Promise.all([
      supabase.from('sessions').select('*, clients(full_name)').gte('session_date', format(startOfMonth(now), 'yyyy-MM-dd')).lte('session_date', format(endOfMonth(now), 'yyyy-MM-dd') + 'T23:59:59').order('session_date', { ascending: false }),
      supabase.from('clients').select('id, full_name').eq('status', 'Active').order('full_name'),
    ]);
    setSessions(sRes.data || []);
    setClients(cRes.data || []);
    setLoading(false);
  };

  const save = async () => {
    if (!user || !form.client_id) return;
    await supabase.from('sessions').insert({
      client_id: form.client_id, user_id: user.id,
      session_date: form.session_date,
      duration_minutes: Number(form.duration_minutes),
      session_type: form.session_type,
      status: form.status,
      notes: form.notes || null,
      late_cancellation: form.late_cancellation,
    });
    setDialogOpen(false);
    toast.success('Session logged');
    loadData();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-display font-bold">Sessions</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Log Session</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Log Session</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date & Time</Label>
                <Input type="datetime-local" value={form.session_date} onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duration (min)</Label>
                  <Input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.session_type} onValueChange={v => setForm(f => ({ ...f, session_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sessionTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sessionStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.late_cancellation} onCheckedChange={v => setForm(f => ({ ...f, late_cancellation: v }))} />
                <Label>Late Cancellation (&lt;24h)</Label>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
              <Button onClick={save} className="w-full">Save Session</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-sm text-muted-foreground">{format(new Date(), 'MMMM yyyy')} · {sessions.length} sessions</p>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <CalendarDays className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No sessions this month</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <Link key={s.id} to={`/clients/${s.client_id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{(s.clients as any)?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(s.session_date), 'MMM d · HH:mm')} · {s.session_type} · {s.duration_minutes}min
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.late_cancellation && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">Late</Badge>}
                    <Badge variant={s.status === 'Completed' ? 'default' : s.status === 'No-Show' ? 'destructive' : 'secondary'}>{s.status}</Badge>
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

export default SessionsPage;
