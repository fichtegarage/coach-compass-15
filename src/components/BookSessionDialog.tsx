import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Dumbbell, Phone } from 'lucide-react';

interface BookSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  clientName?: string;
  /** Pre-fill date (ISO string, e.g. "2026-03-10T10:00") */
  prefillDate?: string;
  onSaved?: () => void;
}

const bookingTypes = [
  { value: 'training', label: 'Trainingssession', icon: Dumbbell, dbType: 'In-Person Training' },
  { value: 'call', label: 'Call', icon: Phone, dbType: 'Check-In Call' },
] as const;

type BookingType = typeof bookingTypes[number]['value'];

const trainingSubTypes = [
  { value: 'In-Person Training', label: 'Präsenz-Training' },
  { value: 'Online Training', label: 'Online-Training' },
];

const callSubTypes = [
  { value: 'Check-In Call', label: 'Check-In Call' },
  { value: 'Phone Call', label: 'Telefonat' },
  { value: 'Free Intro', label: 'Kostenloses Erstgespräch' },
];

const locations = ['Gym', 'Outdoor', 'Online'];

const BookSessionDialog: React.FC<BookSessionDialogProps> = ({
  open, onOpenChange, clientId, clientName, prefillDate, onSaved,
}) => {
  const { user } = useAuth();
  const [bookingType, setBookingType] = useState<BookingType>('training');
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId || '');
  const [sessionType, setSessionType] = useState('In-Person Training');
  const [sessionDate, setSessionDate] = useState(prefillDate || '');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [location, setLocation] = useState('Gym');
  const [packageId, setPackageId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Load clients list if no clientId is provided
  useEffect(() => {
    if (!open || !user) return;
    if (!clientId) {
      supabase.from('clients').select('id, full_name').eq('status', 'Active').order('full_name')
        .then(({ data }) => setClients(data || []));
    }
    // Reset form
    setBookingType('training');
    setSelectedClientId(clientId || '');
    setSessionType('In-Person Training');
    setSessionDate(prefillDate || new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    setDurationMinutes('60');
    setLocation('Gym');
    setPackageId('');
    setNotes('');
  }, [open, user, clientId, prefillDate]);

  // Load packages for selected client
  useEffect(() => {
    if (!selectedClientId || !open) { setPackages([]); return; }
    supabase.from('packages').select('id, package_name, sessions_included')
      .eq('client_id', selectedClientId)
      .then(({ data }) => {
        const pkgs = data || [];
        setPackages(pkgs);
        if (pkgs.length === 1) setPackageId(pkgs[0].id);
      });
  }, [selectedClientId, open]);

  const handleTypeChange = (type: BookingType) => {
    setBookingType(type);
    if (type === 'training') {
      setSessionType('In-Person Training');
      setDurationMinutes('60');
      setLocation('Gym');
    } else {
      setSessionType('Check-In Call');
      setDurationMinutes('30');
      setLocation('Online');
    }
  };

  const save = async () => {
    if (!user || !selectedClientId || !sessionDate) {
      toast.error('Bitte alle Pflichtfelder ausfüllen');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('sessions').insert({
      client_id: selectedClientId,
      user_id: user.id,
      session_date: sessionDate,
      duration_minutes: Number(durationMinutes),
      session_type: sessionType,
      status: 'Scheduled',
      location,
      notes: notes || null,
      package_id: packageId || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Fehler beim Buchen');
      return;
    }
    toast.success('Session gebucht');
    onOpenChange(false);
    onSaved?.();
  };

  const subTypes = bookingType === 'training' ? trainingSubTypes : callSubTypes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Session buchen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            {bookingTypes.map(bt => {
              const Icon = bt.icon;
              const active = bookingType === bt.value;
              return (
                <button
                  key={bt.value}
                  type="button"
                  onClick={() => handleTypeChange(bt.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {bt.label}
                </button>
              );
            })}
          </div>

          {/* Client selector (only if not pre-set) */}
          {!clientId && (
            <div className="space-y-2">
              <Label>Kunde *</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {clientId && clientName && (
            <div className="text-sm text-muted-foreground">
              Kunde: <span className="font-medium text-foreground">{clientName}</span>
            </div>
          )}

          {/* Sub-type */}
          <div className="space-y-2">
            <Label>Art</Label>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {subTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Date & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Datum & Uhrzeit *</Label>
              <Input type="datetime-local" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dauer (Min.)</Label>
              <Input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} />
            </div>
          </div>

          {/* Location (only for training) */}
          {bookingType === 'training' && (
            <div className="space-y-2">
              <Label>Ort</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Package */}
          {packages.length > 0 && (
            <div className="space-y-2">
              <Label>Paket</Label>
              <Select value={packageId} onValueChange={setPackageId}>
                <SelectTrigger><SelectValue placeholder="Paket wählen (optional)" /></SelectTrigger>
                <SelectContent>
                  {packages.map(p => <SelectItem key={p.id} value={p.id}>{p.package_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notizen</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional..." />
          </div>

          <Button onClick={save} className="w-full" disabled={saving}>
            {saving ? 'Wird gebucht...' : 'Session buchen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BookSessionDialog;
