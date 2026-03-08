import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const fitnessGoals = ['Abnehmen', 'Muskelaufbau', 'Ausdauer', 'Reha', 'Allgemeine Fitness', 'Wettkampfvorbereitung'];
const acquisitionSources = ['Empfehlung', 'Instagram', 'Website', 'Google', 'Laufkundschaft', 'Sonstiges'];

const ClientFormPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const [saving, setSaving] = useState(false);
  const [loadingClient, setLoadingClient] = useState(isEdit);
  const [form, setForm] = useState({
    full_name: '', date_of_birth: '', email: '', phone: '', whatsapp_link: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    health_notes: '', fitness_goal: '', fitness_goal_text: '',
    starting_date: new Date().toISOString().split('T')[0],
    status: 'Active', acquisition_source: '',
  });

  useEffect(() => {
    if (!isEdit || !id || !user) return;
    supabase.from('clients').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setForm({
          full_name: data.full_name || '',
          date_of_birth: data.date_of_birth || '',
          email: data.email || '',
          phone: data.phone || '',
          whatsapp_link: data.whatsapp_link || '',
          emergency_contact_name: data.emergency_contact_name || '',
          emergency_contact_phone: data.emergency_contact_phone || '',
          health_notes: data.health_notes || '',
          fitness_goal: data.fitness_goal || '',
          fitness_goal_text: data.fitness_goal_text || '',
          starting_date: data.starting_date || '',
          status: data.status || 'Active',
          acquisition_source: data.acquisition_source || '',
        });
      }
      setLoadingClient(false);
    });
  }, [id, isEdit, user]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const payload = {
      ...form,
      date_of_birth: form.date_of_birth || null,
      whatsapp_link: form.phone ? `https://wa.me/${form.phone.replace(/\D/g, '')}` : null,
    };

    if (isEdit && id) {
      const { error } = await supabase.from('clients').update(payload).eq('id', id);
      if (error) {
        toast.error('Kunde konnte nicht aktualisiert werden');
      } else {
        toast.success('Kunde aktualisiert');
        navigate(`/clients/${id}`);
      }
    } else {
      const { error } = await supabase.from('clients').insert({ ...payload, user_id: user.id });
      if (error) {
        toast.error('Kunde konnte nicht erstellt werden');
      } else {
        toast.success('Kunde erstellt');
        navigate('/clients');
      }
    }
    setSaving(false);
  };

  if (loadingClient) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Zurück
      </Button>
      <h1 className="text-2xl font-display font-bold">{isEdit ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-display">Persönliche Daten</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vollständiger Name *</Label>
                <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Geburtsdatum</Label>
                <Input type="date" value={form.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefon (mit Vorwahl)</Label>
                <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+49..." />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-display">Notfallkontakt</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.emergency_contact_name} onChange={e => update('emergency_contact_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input value={form.emergency_contact_phone} onChange={e => update('emergency_contact_phone', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-display">Trainingsdetails</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fitnessziel</Label>
                <Select value={form.fitness_goal} onValueChange={v => update('fitness_goal', v)}>
                  <SelectTrigger><SelectValue placeholder="Ziel wählen" /></SelectTrigger>
                  <SelectContent>
                    {fitnessGoals.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Startdatum</Label>
                <Input type="date" value={form.starting_date} onChange={e => update('starting_date', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ziel-Details (Freitext)</Label>
              <Textarea value={form.fitness_goal_text} onChange={e => update('fitness_goal_text', e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Gesundheitsnotizen (Verletzungen, Vorerkrankungen, Kontraindikationen)</Label>
              <Textarea value={form.health_notes} onChange={e => update('health_notes', e.target.value)} rows={3} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => update('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Aktiv</SelectItem>
                    <SelectItem value="Paused">Pausiert</SelectItem>
                    <SelectItem value="Churned">Abgemeldet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Wie hat er/sie mich gefunden?</Label>
                <Select value={form.acquisition_source} onValueChange={v => update('acquisition_source', v)}>
                  <SelectTrigger><SelectValue placeholder="Quelle wählen" /></SelectTrigger>
                  <SelectContent>
                    {acquisitionSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? 'Änderungen speichern' : 'Kunde erstellen'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClientFormPage;