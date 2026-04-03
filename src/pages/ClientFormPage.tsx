import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Camera, User } from 'lucide-react';
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
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    full_name: '',
    date_of_birth: '',
    gender: '',
    email: '',
    phone: '',
    whatsapp_link: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    health_notes: '',
    fitness_goal: '',
    fitness_goal_text: '',
    starting_date: new Date().toISOString().split('T')[0],
    status: 'Active',
    acquisition_source: '',
  });

  useEffect(() => {
    if (!isEdit || !id || !user) return;
    supabase.from('clients').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setForm({
          full_name: data.full_name || '',
          date_of_birth: data.date_of_birth || '',
          gender: data.gender || '',
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
        setProfilePhotoUrl(data.profile_photo_url || null);
      }
      setLoadingClient(false);
    });
  }, [id, isEdit, user]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/${id || 'new'}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('client-photos').upload(filePath, file, { upsert: true });
    if (error) { toast.error('Foto konnte nicht hochgeladen werden'); setUploadingPhoto(false); return; }
    const { data: urlData } = supabase.storage.from('client-photos').getPublicUrl(filePath);
    setProfilePhotoUrl(urlData.publicUrl);
    if (isEdit && id) {
      await supabase.from('clients').update({ profile_photo_url: urlData.publicUrl }).eq('id', id);
      toast.success('Profilbild aktualisiert');
    }
    setUploadingPhoto(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const payload = {
      ...form,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      whatsapp_link: form.phone ? `https://wa.me/${form.phone.replace(/\D/g, '')}` : null,
      profile_photo_url: profilePhotoUrl,
    };
    if (isEdit && id) {
      const { error } = await supabase.from('clients').update(payload).eq('id', id);
      if (error) { toast.error('Kunde konnte nicht aktualisiert werden'); }
      else { toast.success('Kunde aktualisiert'); navigate(`/clients/${id}`); }
    } else {
      const { error } = await supabase.from('clients').insert({ ...payload, user_id: user.id });
      if (error) { toast.error('Kunde konnte nicht erstellt werden'); }
      else { toast.success('Kunde erstellt'); navigate('/clients'); }
    }
    setSaving(false);
  };

  // Dynamische Ansprache basierend auf Geschlecht
  const clientLabel = form.gender === 'female' ? 'Kundin' : form.gender === 'male' ? 'Kunde' : 'Kunde/Kundin';
  const pronounLabel = form.gender === 'female' ? 'Sie' : form.gender === 'male' ? 'Er' : 'Er/Sie';
  const foundLabel = form.gender === 'female'
    ? 'Wie hat sie mich gefunden?'
    : form.gender === 'male'
    ? 'Wie hat er mich gefunden?'
    : 'Wie hat er/sie mich gefunden?';

  if (loadingClient) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Zurück
      </Button>
      <h1 className="text-2xl font-display font-bold">
        {isEdit ? `${clientLabel} bearbeiten` : `Neue${form.gender === 'female' ? ' Kundin' : 'r Kunde'} anlegen`}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Profilbild */}
        <Card>
          <CardHeader><CardTitle className="text-base font-display">Profilbild</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div
                className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center overflow-hidden cursor-pointer relative group"
                onClick={() => fileInputRef.current?.click()}
              >
                {profilePhotoUrl
                  ? <img src={profilePhotoUrl} alt="Profilbild" className="w-full h-full object-cover" />
                  : <User className="w-8 h-8 text-muted-foreground" />}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploadingPhoto ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Klicke auf das Bild, um ein Profilbild hochzuladen.</p>
                <p className="text-xs mt-1">JPG, PNG · max. 5 MB</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
          </CardContent>
        </Card>

        {/* Persönliche Daten */}
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

            {/* Geschlecht */}
            <div className="space-y-2">
              <Label>Geschlecht</Label>
              <Select value={form.gender} onValueChange={v => update('gender', v)}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Weiblich</SelectItem>
                  <SelectItem value="male">Männlich</SelectItem>
                  <SelectItem value="other">Divers / keine Angabe</SelectItem>
                </SelectContent>
              </Select>
              {form.gender === 'female' && (
                <p className="text-xs text-muted-foreground">
                  ↳ Zyklus-Tracking wird für diese Kundin aktiviert.
                </p>
              )}
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

        {/* Notfallkontakt */}
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

        {/* Trainingsdetails */}
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
                <Label>{foundLabel}</Label>
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
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Änderungen speichern' : `${form.gender === 'female' ? 'Kundin' : 'Kunde'} erstellen`}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClientFormPage;
