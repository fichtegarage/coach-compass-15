// ============================================================
// NEUE DATEI: src/components/WeeklyCheckinModal.tsx
// Wöchentlicher Check-In – erscheint nur EINMAL pro Woche.
// Einbau: In ClientDetailPage.tsx oder dem Client-Dashboard
// ============================================================
//
// EINBAU (3 Schritte):
//
// 1. Import hinzufügen (ganz oben in der Zieldatei):
//    import WeeklyCheckinModal from '@/components/WeeklyCheckinModal';
//
// 2. Komponente im JSX einbauen (am Ende der return-Anweisung,
//    direkt vor dem letzten </div>):
//    <WeeklyCheckinModal clientId={client.id} />
//
// Das Modal kümmert sich selbst darum, wann es erscheint.
// Kein zusätzlicher State nötig.
// ============================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  clientId: string | undefined;
}

// Gibt den Montag der aktuellen Woche als YYYY-MM-DD zurück
function getWeekMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=So, 1=Mo...
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

const LS_KEY = (id: string, w: string) => `checkin_done_${id}_${w}`;

function ScoreButton({ value, selected, onClick }: {
  value: number; selected: boolean; onClick: () => void;
}) {
  const colors: Record<number, string> = {
    1: 'bg-red-900/60 border-red-700 text-red-300',
    2: 'bg-red-900/40 border-red-800 text-red-400',
    3: 'bg-orange-900/50 border-orange-700 text-orange-300',
    4: 'bg-orange-900/30 border-orange-800 text-orange-400',
    5: 'bg-yellow-900/40 border-yellow-700 text-yellow-300',
    6: 'bg-yellow-900/30 border-yellow-800 text-yellow-400',
    7: 'bg-lime-900/40 border-lime-700 text-lime-300',
    8: 'bg-green-900/40 border-green-700 text-green-300',
    9: 'bg-green-900/60 border-green-600 text-green-200',
    10:'bg-emerald-900/60 border-emerald-500 text-emerald-200',
  };
  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 rounded-lg border text-sm font-bold transition-all ${
        selected
          ? `${colors[value]} ring-2 ring-white/30 scale-110`
          : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-400'
      }`}
    >
      {value}
    </button>
  );
}

export default function WeeklyCheckinModal({ clientId }: Props) {
  const weekStart = getWeekMonday();
  const [show, setShow]           = useState(false);
  const [energy, setEnergy]       = useState<number | null>(null);
  const [sleep, setSleep]         = useState<number | null>(null);
  const [mood, setMood]           = useState<number | null>(null);
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;

    // Schnell-Check via localStorage
    if (localStorage.getItem(LS_KEY(clientId, weekStart)) === 'done') return;

    // DB-Check: schon eingereicht?
    supabase
      .from('weekly_checkins')
      .select('id')
      .eq('client_id', clientId)
      .eq('week_start', weekStart)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          // Kleine Verzögerung damit die App sich erst aufbaut
          setTimeout(() => setShow(true), 1500);
        } else {
          localStorage.setItem(LS_KEY(clientId, weekStart), 'done');
        }
      });
  }, [clientId, weekStart]);

  async function handleSubmit() {
    if (!clientId || energy === null || sleep === null || mood === null) return;
    setSaving(true);
    setError(null);

    const { error: dbError } = await supabase
      .from('weekly_checkins')
      .insert({
        client_id:    clientId,
        week_start:   weekStart,
        energy_level: energy,
        sleep_quality: sleep,
        mood:         mood,
        notes:        notes.trim() || null,
      });

    if (dbError) {
      setError('Speichern fehlgeschlagen. Bitte nochmal versuchen.');
      setSaving(false);
      return;
    }

    localStorage.setItem(LS_KEY(clientId, weekStart), 'done');
    setSaved(true);
    setSaving(false);
    setTimeout(() => setShow(false), 2000);
  }

  function handleSkip() {
    // Nur für diese Session überspringen (nicht permanent speichern)
    setShow(false);
  }

  if (!show) return null;

  const canSubmit = energy !== null && sleep !== null && mood !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-br from-indigo-900/60 to-gray-900 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <div>
              <h2 className="text-white font-semibold text-lg">Wöchentlicher Check-In</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                Woche ab {new Date(weekStart).toLocaleDateString('de-DE', {
                  day: '2-digit', month: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {saved ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="text-4xl">✅</span>
              <p className="text-white font-medium">Danke für dein Feedback!</p>
              <p className="text-gray-400 text-sm">Bis nächste Woche 💪</p>
            </div>
          ) : (
            <>
              {error && (
                <p className="text-red-400 text-sm bg-red-900/20 border border-red-700/50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Energie */}
              <div className="space-y-2">
                <label className="text-gray-200 text-sm font-medium flex items-center gap-2">
                  <span>⚡</span> Energie-Level
                  {energy !== null && <span className="text-xs text-gray-400 ml-auto">{energy}/10</span>}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({length:10},(_,i)=>i+1).map(n => (
                    <ScoreButton key={n} value={n} selected={energy===n} onClick={()=>setEnergy(n)} />
                  ))}
                </div>
              </div>

              {/* Schlaf */}
              <div className="space-y-2">
                <label className="text-gray-200 text-sm font-medium flex items-center gap-2">
                  <span>😴</span> Schlafqualität
                  {sleep !== null && <span className="text-xs text-gray-400 ml-auto">{sleep}/10</span>}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({length:10},(_,i)=>i+1).map(n => (
                    <ScoreButton key={n} value={n} selected={sleep===n} onClick={()=>setSleep(n)} />
                  ))}
                </div>
              </div>

              {/* Stimmung */}
              <div className="space-y-2">
                <label className="text-gray-200 text-sm font-medium flex items-center gap-2">
                  <span>😊</span> Stimmung
                  {mood !== null && <span className="text-xs text-gray-400 ml-auto">{mood}/10</span>}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({length:10},(_,i)=>i+1).map(n => (
                    <ScoreButton key={n} value={n} selected={mood===n} onClick={()=>setMood(n)} />
                  ))}
                </div>
              </div>

              {/* Notizen */}
              <div className="space-y-1.5">
                <label className="text-gray-300 text-sm font-medium">
                  Notizen <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Verletzungen, besondere Umstände, Fortschritte …"
                  rows={2}
                  className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!saved && (
          <div className="flex items-center justify-between gap-3 px-6 pb-6">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Später
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Speichern…</>
              ) : (
                <>✓ Absenden</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
