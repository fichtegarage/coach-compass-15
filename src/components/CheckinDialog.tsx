import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  clientId: string;
  clientName: string;
}

const STEPS = [
  { id: 1, title: 'Fortschritt & Wahrnehmung', emoji: '📈' },
  { id: 2, title: 'Energie & Alltag', emoji: '⚡' },
  { id: 3, title: 'Motivation', emoji: '🔥' },
  { id: 4, title: 'Ziele', emoji: '🎯' },
  { id: 5, title: 'Feedback & Zusammenarbeit', emoji: '💬' },
  { id: 6, title: 'Ausblick', emoji: '🚀' },
];

const defaultForm = {
  conversation_date: new Date().toISOString().split('T')[0],
  progress_rating: 0,
  noticed_changes: '',
  training_intensity: '',
  energy_level: '',
  life_changes: '',
  recovery_quality: '',
  current_motivation: '',
  doubt_moments: '',
  training_purpose: '',
  goal_importance_rating: 0,
  goals_changed: '',
  next_goal: '',
  next_milestone: '',
  whats_working: '',
  what_to_improve: '',
  what_is_missing: '',
  needs_from_coach: '',
  next_phase_readiness: '',
  coach_notes: '',
};

const RatingSelector: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div>
    <div className="flex gap-1.5 flex-wrap mt-2">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
        <button
          type="button"
          key={n}
          onClick={() => onChange(n)}
          className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
            value === n
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
    {value > 0 && (
      <p className="text-xs text-muted-foreground mt-1.5">
        {value <= 3 ? '😔 Nicht so gut' : value <= 5 ? '😐 Geht so' : value <= 7 ? '🙂 Gut' : value <= 9 ? '😊 Sehr gut' : '🔥 Top!'}
      </p>
    )}
  </div>
);

const CheckinDialog: React.FC<Props> = ({ open, onClose, onSaved, clientId, clientName }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const set = (field: keyof typeof defaultForm, value: any) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleClose = () => {
    setStep(1);
    setForm(defaultForm);
    onClose();
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('checkin_conversations').insert({
      client_id: clientId,
      user_id: user.id,
      ...form,
      progress_rating: form.progress_rating || null,
      goal_importance_rating: form.goal_importance_rating || null,
    } as any);
    if (error) {
      console.error(error);
      toast.error('Fehler beim Speichern');
    } else {
      toast.success('Check-In gespeichert');
      onSaved();
      handleClose();
    }
    setSaving(false);
  };

  const currentStep = STEPS[step - 1];

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            {currentStep.emoji} Check-In · {clientName}
          </DialogTitle>
        </DialogHeader>

        {/* Fortschrittsanzeige */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="font-medium">{currentStep.title}</span>
            <span>Schritt {step} von {STEPS.length}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(step / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="flex gap-1 pt-0.5">
            {STEPS.map(s => (
              <div
                key={s.id}
                className={`flex-1 h-1 rounded-full transition-colors ${s.id <= step ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
        </div>

        {/* Schrittinhalt */}
        <div className="space-y-5 py-2">

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Datum des Gesprächs</Label>
                <Input type="date" value={form.conversation_date} onChange={e => set('conversation_date', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Wie bewertest du deinen Fortschritt seit unserem letzten Gespräch?</Label>
                <RatingSelector value={form.progress_rating} onChange={v => set('progress_rating', v)} />
              </div>
              <div className="space-y-2">
                <Label>Was hast du an dir wahrgenommen – körperlich, mental oder im Alltag?</Label>
                <Textarea
                  value={form.noticed_changes}
                  onChange={e => set('noticed_changes', e.target.value)}
                  placeholder="z.B. Mehr Kraft beim Alltag, besseres Körpergefühl, ruhigerer Schlaf..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Wie erlebst du die aktuelle Trainingsintensität?</Label>
                <Select value={form.training_intensity} onValueChange={v => set('training_intensity', v)}>
                  <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="too_easy">Zu leicht – ich könnte deutlich mehr</SelectItem>
                    <SelectItem value="right">Genau richtig</SelectItem>
                    <SelectItem value="challenging">Herausfordernd, aber machbar</SelectItem>
                    <SelectItem value="too_hard">Zu schwer – ich komme kaum nach</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Wie würdest du deine Energielevel im Alltag gerade beschreiben?</Label>
                <Select value={form.energy_level} onValueChange={v => set('energy_level', v)}>
                  <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">⚡ Hoch – ich habe Energie für alles</SelectItem>
                    <SelectItem value="good">🙂 Gut – ich komme gut durch den Tag</SelectItem>
                    <SelectItem value="fluctuating">〰️ Schwankend – mal so, mal so</SelectItem>
                    <SelectItem value="low">😴 Niedrig – ich fühle mich oft müde</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Hat sich etwas in deinem Leben verändert, das dein Training oder deine Erholung beeinflusst?</Label>
                <Textarea
                  value={form.life_changes}
                  onChange={e => set('life_changes', e.target.value)}
                  placeholder="z.B. Mehr Stress bei der Arbeit, Urlaub, gesundheitliche Themen, familiäre Veränderungen..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Wie erholst du dich nach den Einheiten?</Label>
                <Select value={form.recovery_quality} onValueChange={v => set('recovery_quality', v)}>
                  <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="very_good">Sehr gut – ich bin schnell erholt</SelectItem>
                    <SelectItem value="good">Gut</SelectItem>
                    <SelectItem value="okay">Okay – dauert manchmal länger als erwartet</SelectItem>
                    <SelectItem value="poor">Schlecht – ich bin oft erschöpft danach</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
                Diese Fragen helfen dir, die echte Motivation deines Kunden zu erkennen. Nimm dir Zeit für die Antworten – hier liegt oft der Kern.
              </div>
              <div className="space-y-2">
                <Label>Was motiviert dich gerade am meisten, weiterzumachen?</Label>
                <Textarea
                  value={form.current_motivation}
                  onChange={e => set('current_motivation', e.target.value)}
                  placeholder="Was zieht dich immer wieder ins Training?"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Gab es Momente, in denen du gezweifelt hast – und was hat dich trotzdem weitermachen lassen?</Label>
                <p className="text-xs text-muted-foreground -mt-1">Diese Frage aktiviert Ressourcen, die der Kunde oft selbst vergisst.</p>
                <Textarea
                  value={form.doubt_moments}
                  onChange={e => set('doubt_moments', e.target.value)}
                  placeholder="Ehrlichkeit hilft hier mehr als die perfekte Antwort..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Wofür oder für wen trainierst du eigentlich gerade?</Label>
                <p className="text-xs text-muted-foreground -mt-1">Klingt einfach – ist oft sehr aufschlussreich. Lass Stille zu.</p>
                <Textarea
                  value={form.training_purpose}
                  onChange={e => set('training_purpose', e.target.value)}
                  placeholder="Für mich selbst, für meine Gesundheit, für ein Event, für meine Familie..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Wie wichtig ist dir dein Ziel gerade – auf einer Skala von 1 bis 10?</Label>
                <RatingSelector value={form.goal_importance_rating} onChange={v => set('goal_importance_rating', v)} />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="space-y-2">
                <Label>Haben sich deine Ziele seit unserem Erstgespräch verändert?</Label>
                <Select value={form.goals_changed} onValueChange={v => set('goals_changed', v)}>
                  <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same">Nein – ich verfolge noch dasselbe Ziel</SelectItem>
                    <SelectItem value="adjusted">Leicht angepasst – die Richtung stimmt noch</SelectItem>
                    <SelectItem value="changed">Komplett verändert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Was ist dein nächstes konkretes Ziel, das du erreichen möchtest?</Label>
                <Textarea
                  value={form.next_goal}
                  onChange={e => set('next_goal', e.target.value)}
                  placeholder="z.B. 5 kg leichter, 100 kg Bankdrücken, 5 km ohne Pause laufen..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Was willst du in den nächsten 4–8 Wochen konkret anders oder besser machen?</Label>
                <Textarea
                  value={form.next_milestone}
                  onChange={e => set('next_milestone', e.target.value)}
                  placeholder="z.B. Ernährung anpassen, früher schlafen, zweimal die Woche Cardio ergänzen..."
                  rows={3}
                />
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="space-y-2">
                <Label>Was läuft in unserem Coaching richtig gut?</Label>
                <Textarea
                  value={form.whats_working}
                  onChange={e => set('whats_working', e.target.value)}
                  placeholder="Was schätzt du besonders? Was hilft dir wirklich weiter?"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Was würdest du dir wünschen, das wir anders oder mehr machen?</Label>
                <Textarea
                  value={form.what_to_improve}
                  onChange={e => set('what_to_improve', e.target.value)}
                  placeholder="Offen und ehrlich – das hilft mir, dich besser zu unterstützen."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Was fehlt dir noch, um dein Ziel wirklich zu erreichen?</Label>
                <p className="text-xs text-muted-foreground -mt-1">Hier kommen oft die stärksten Hinweise für das weitere Coaching.</p>
                <Textarea
                  value={form.what_is_missing}
                  onChange={e => set('what_is_missing', e.target.value)}
                  placeholder="z.B. mehr Ernährungsberatung, flexiblere Termine, andere Übungen, mehr Accountability..."
                  rows={3}
                />
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <div className="space-y-2">
                <Label className="font-semibold">Was brauchst du in der nächsten Phase am meisten von mir?</Label>
                <Textarea
                  value={form.needs_from_coach}
                  onChange={e => set('needs_from_coach', e.target.value)}
                  placeholder="z.B. mehr Accountability, neue Reize im Training, Ernährungssupport, weniger Druck..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Wie bereit fühlst du dich für den nächsten Schritt?</Label>
                <Select value={form.next_phase_readiness} onValueChange={v => set('next_phase_readiness', v)}>
                  <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ready_for_more">🚀 Ich bin bereit für mehr – ich will einen Gang hochschalten</SelectItem>
                    <SelectItem value="continue_same">✅ Weiter wie bisher – das Tempo passt für mich</SelectItem>
                    <SelectItem value="need_something_different">🔄 Ich brauche etwas Anderes – lass uns das besprechen</SelectItem>
                    <SelectItem value="uncertain">🤔 Ich bin noch unsicher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <Label className="text-muted-foreground text-xs">🔒 Coach-Notiz (intern – nicht für den Kunden sichtbar)</Label>
                <Textarea
                  value={form.coach_notes}
                  onChange={e => set('coach_notes', e.target.value)}
                  placeholder="Eigene Beobachtungen, Gesprächseindrücke, Conversion-Chancen, nächste Schritte..."
                  rows={4}
                  className="bg-background"
                />
              </div>
            </>
          )}

        </div>

        {/* Navigation */}
        <div className="flex justify-between gap-2 pt-2 border-t border-border">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(s => s - 1)}>← Zurück</Button>
          ) : (
            <Button variant="ghost" onClick={handleClose}>Abbrechen</Button>
          )}
          {step < STEPS.length ? (
            <Button onClick={() => setStep(s => s + 1)}>Weiter →</Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Check-In speichern
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CheckinDialog;
