/**
 * WeeklyCheckin.tsx
 *
 * Erscheint automatisch wenn der Kunde die App öffnet
 * und noch keinen Check-in für diese Woche gemacht hat.
 *
 * UX: Große Tipp-Flächen, 3 Fragen, optional eine Notiz.
 * Kann übersprungen werden (wird nicht erneut gezeigt diese Woche).
 */

import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { startOfWeek, format } from 'date-fns';

interface WeeklyCheckinProps {
  clientId: string;
  clientName: string;
  onDone: () => void; // schließt das Modal (gespeichert oder übersprungen)
}

const EMOJIS_ENERGY = ['😴', '😐', '🙂', '😊', '🔥'];
const EMOJIS_SLEEP  = ['😩', '😪', '😌', '😴', '⭐'];
const EMOJIS_MOOD   = ['😔', '😕', '😐', '😊', '😄'];

const LABELS_ENERGY = ['Sehr niedrig', 'Niedrig', 'Mittel', 'Gut', 'Top'];
const LABELS_SLEEP  = ['Sehr schlecht', 'Schlecht', 'Ok', 'Gut', 'Sehr gut'];
const LABELS_MOOD   = ['Nicht gut', 'Eher schlecht', 'Ok', 'Gut', 'Super'];

const ScaleSelector: React.FC<{
  value: number;
  onChange: (v: number) => void;
  emojis: string[];
  labels: string[];
}> = ({ value, onChange, emojis, labels }) => (
  <div className="flex gap-2 justify-between">
    {[1, 2, 3, 4, 5].map(v => (
      <button
        key={v}
        onClick={() => onChange(v)}
        className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all active:scale-95 ${
          value === v
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <span className="text-2xl">{emojis[v - 1]}</span>
        <span className={`text-[10px] font-medium leading-tight text-center ${value === v ? 'text-emerald-700' : 'text-slate-400'}`}>
          {labels[v - 1]}
        </span>
      </button>
    ))}
  </div>
);

const WeeklyCheckin: React.FC<WeeklyCheckinProps> = ({ clientId, clientName, onDone }) => {
  const [energy, setEnergy] = useState(0);
  const [sleep, setSleep] = useState(0);
  const [mood, setMood] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'energy' | 'sleep' | 'mood' | 'notes'>('energy');

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const handleSave = async () => {
    if (!energy || !sleep || !mood) return;
    setSaving(true);

    const { error } = await supabase.from('weekly_checkins').upsert({
      client_id: clientId,
      week_start: weekStart,
      energy_level: energy,
      sleep_quality: sleep,
      mood,
      notes: notes.trim() || null,
    }, { onConflict: 'client_id,week_start' });

    if (error) {
      toast.error('Check-in konnte nicht gespeichert werden.');
      setSaving(false);
      return;
    }

    toast.success('Check-in gespeichert! 💪');
    onDone();
  };

  const handleSkip = () => {
    // In sessionStorage merken, nicht erneut zeigen diese Woche
    sessionStorage.setItem(`checkin_skipped_${weekStart}`, '1');
    onDone();
  };

  const canAdvance =
    (step === 'energy' && energy > 0) ||
    (step === 'sleep' && sleep > 0) ||
    (step === 'mood' && mood > 0) ||
    step === 'notes';

  const steps = ['energy', 'sleep', 'mood', 'notes'] as const;
  const stepIndex = steps.indexOf(step);
  const progress = (stepIndex / (steps.length - 1)) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4">
      <div
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
        style={{ fontFamily: "'Montserrat', sans-serif" }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Wöchentlicher Check-in</p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {step === 'energy' && 'Wie war dein Energielevel diese Woche?'}
              {step === 'sleep' && 'Wie hast du diese Woche geschlafen?'}
              {step === 'mood' && 'Wie geht es dir gerade?'}
              {step === 'notes' && 'Noch etwas für Jakob?'}
            </h2>
          </div>

          {/* Fragen */}
          {step === 'energy' && (
            <ScaleSelector value={energy} onChange={setEnergy} emojis={EMOJIS_ENERGY} labels={LABELS_ENERGY} />
          )}
          {step === 'sleep' && (
            <ScaleSelector value={sleep} onChange={setSleep} emojis={EMOJIS_SLEEP} labels={LABELS_SLEEP} />
          )}
          {step === 'mood' && (
            <ScaleSelector value={mood} onChange={setMood} emojis={EMOJIS_MOOD} labels={LABELS_MOOD} />
          )}
          {step === 'notes' && (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="z.B. Knie macht noch Probleme, oder: War eine gute Woche!"
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              autoFocus
            />
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            {step !== 'energy' && (
              <button
                onClick={() => setStep(steps[stepIndex - 1])}
                className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                ←
              </button>
            )}

            {step !== 'notes' ? (
              <button
                onClick={() => canAdvance && setStep(steps[stepIndex + 1])}
                disabled={!canAdvance}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors active:scale-95"
              >
                Weiter →
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || !energy || !sleep || !mood}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold text-sm transition-colors active:scale-95 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check-in abschicken ✓'}
              </button>
            )}
          </div>

          {/* Überspringen */}
          <button
            onClick={handleSkip}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors py-1"
          >
            Jetzt überspringen
          </button>
        </div>
      </div>
    </div>
  );
};

export default WeeklyCheckin;
