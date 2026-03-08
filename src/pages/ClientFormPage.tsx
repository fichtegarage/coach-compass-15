import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const fitnessGoals = ['Weight Loss', 'Muscle Gain', 'Endurance', 'Rehab', 'General Fitness', 'Competition Prep'];
const acquisitionSources = ['Referral', 'Instagram', 'Website', 'Google', 'Walk-in', 'Other'];

const ClientFormPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '', date_of_birth: '', email: '', phone: '', whatsapp_link: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    health_notes: '', fitness_goal: '', fitness_goal_text: '',
    starting_date: new Date().toISOString().split('T')[0],
    status: 'Active', acquisition_source: '',
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('clients').insert({
      ...form,
      user_id: user.id,
      date_of_birth: form.date_of_birth || null,
      whatsapp_link: form.phone ? `https://wa.me/${form.phone.replace(/\D/g, '')}` : null,
    });
    if (error) {
      toast.error('Failed to create client');
    } else {
      toast.success('Client created');
      navigate('/clients');
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back
      </Button>
      <h1 className="text-2xl font-display font-bold">New Client</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base font-display">Personal Info</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input type="date" value={form.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone (with country code)</Label>
                <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+49..." />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-display">Emergency Contact</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.emergency_contact_name} onChange={e => update('emergency_contact_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.emergency_contact_phone} onChange={e => update('emergency_contact_phone', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-display">Training Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fitness Goal</Label>
                <Select value={form.fitness_goal} onValueChange={v => update('fitness_goal', v)}>
                  <SelectTrigger><SelectValue placeholder="Select goal" /></SelectTrigger>
                  <SelectContent>
                    {fitnessGoals.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Starting Date</Label>
                <Input type="date" value={form.starting_date} onChange={e => update('starting_date', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Goal Details (free text)</Label>
              <Textarea value={form.fitness_goal_text} onChange={e => update('fitness_goal_text', e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Health Notes (injuries, conditions, contraindications)</Label>
              <Textarea value={form.health_notes} onChange={e => update('health_notes', e.target.value)} rows={3} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => update('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Paused">Paused</SelectItem>
                    <SelectItem value="Churned">Churned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>How they found me</Label>
                <Select value={form.acquisition_source} onValueChange={v => update('acquisition_source', v)}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
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
            Create Client
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClientFormPage;
