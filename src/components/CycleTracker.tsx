/**
 * CycleTracker.tsx
 *
 * Kunden-seitige Eingabe und Anzeige der Zyklusphase.
 * Ermöglicht das Hinterlegen des ersten Tags des aktuellen Zyklus,
 * um trainingsrelevante Empfehlungen zu geben.
 *
 * Terminologie bewusst neutral gehalten:
 * "Erster Tag des Zyklus" statt "Periode/Blutung"
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface CyclePhaseInfo {
  phase: 'early_follicular' | 'follicular' | 'ovulation' | 'early_luteal' | 'luteal' | 'late_luteal';
  label: string;
  emoji: string;
  color: string;
  dayInCycle: number;
  trainingRecommendation: string;
  intensityAdvice: string;
}

function getCyclePhase(lastCycleStart: Date, avgCycleLength: number): CyclePhaseInfo {
  const today = new Date();
  const daysSince = differenceInDays(today, lastCycleStart);
  // Normalisieren auf aktuellen Zyklus (falls mehrere Zyklen vergangen sind)
  const dayInCycle = ((daysSince % avgCycleLength) + avgCycleLength) % avgCycleLength + 1;
  const ovulationDay = Math.round(avgCycleLength / 2);

  if (dayInCycle <= 4) {
    return {
      phase: 'early_follicular',
      label: 'Beginn des Zyklus',
      emoji: '🌱',
      color: 'border-slate-600 bg-slate-800/50',
      dayInCycle,
      trainingRecommendation: 'Sanfter Einstieg – dein Körper regeneriert sich gerade. Beweglichkeit und leichtes Ausdauertraining sind ideal.',
      intensityAdvice: 'Leicht bis moderat',
    };
  }
  if (dayInCycle <= ovulationDay - 1) {
    return {
      phase: 'follicular',
      label: 'Follikelphase',
      emoji: '⚡',
      color: 'border-orange-500/40 bg-orange-500/10',
      dayInCycle,
      trainingRecommendation: 'Dein Körper ist jetzt besonders leistungsfähig. Ideale Zeit für intensive Einheiten, Kraftaufbau und neue Bestleistungen.',
      intensityAdvice: 'Hoch – jetzt Gas geben',
    };
  }
  if (dayInCycle <= ovulationDay + 1) {
    return {
      phase: 'ovulation',
      label: 'Ovulationsphase',
      emoji: '🔥',
      color: 'border-orange-500/60 bg-orange-500/15',
      dayInCycle,
      trainingRecommendation: 'Dein Energiepeak – nutze ihn für deine schwersten Einheiten. Kraft und Ausdauer sind auf dem Höchststand.',
      intensityAdvice: 'Sehr hoch – Bestleistung möglich',
    };
  }
  if (dayInCycle <= ovulationDay + 6) {
    return {
      phase: 'early_luteal',
      label: 'Frühe Lutealphase',
      emoji: '🌊',
      color: 'border-blue-500/30 bg-blue-500/10',
      dayInCycle,
      trainingRecommendation: 'Halte die Intensität aufrecht, aber plane etwas mehr Erholung zwischen den Einheiten ein. Dein Körper braucht jetzt etwas mehr Regenerationszeit.',
      intensityAdvice: 'Moderat bis hoch',
    };
  }
  if (dayInCycle <= avgCycleLength - 4) {
    return {
      phase: 'luteal',
      label: 'Lutealphase',
      emoji: '🔄',
      color: 'border-blue-500/40 bg-blue-500/15',
      dayInCycle,
      trainingRecommendation: 'Moderates Training ist jetzt am sinnvollsten. Fokus auf Technik, Mobilität und Ausdauer statt auf maximale Kraft. Höre auf deinen Körper.',
      intensityAdvice: 'Moderat – Qualität vor Quantität',
    };
  }
  return {
    phase: 'late_luteal',
    label: 'Späte Lutealphase',
    emoji: '🌙',
    color: 'border-slate-500/40 bg-slate-800/50',
    dayInCycle,
    trainingRecommendation: 'Dein Körper bereitet sich auf den nächsten Zyklus vor. Sanftes Training, Yoga, Spaziergänge oder Schwimmen – Bewegung tut gut, ohne zu fordern.',
    intensityAdvice: 'Leicht bis moderat',
  };
}

interface Props {
  clientId: string;
}

const CycleTracker: React.FC<Props> = ({ clientId }) => {
  const [lastCycleStart, setLastCycleStart] = useState<string>('');
  const [avgCycleLength, setAvgCycleLength] = useState<number>(28);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phaseInfo, setPhaseInfo] = useState<CyclePhaseInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('clients')
        .select('last_cycle_start_date, avg_cycle_length')
        .eq('id', clientId)
        .maybeSingle();
      if (data) {
        if (data.last_cycle_start_date) {
          setLastCycleStart(data.last_cycle_start_date);
          const cycleLen = data.avg_cycle_length || 28;
          setAvgCycleLength(cycleLen);
          setPhaseInfo(getCyclePhase(new Date(data.last_cycle_start_date), cycleLen));
        }
      }
      setLoaded(true);
    };
    load();
  }, [clientId]);

  const handleSave = async () => {
    if (!lastCycleStart) return;
    setSaving(true);
    await supabase
      .from('clients')
      .update({
        last_cycle_start_date: lastCycleStart,
        avg_cycle_length: avgCycleLength,
      } as any)
      .eq('id', clientId);
    setPhaseInfo(getCyclePhase(new Date(lastCycleStart), avgCycleLength));
    setSaving(false);
    setExpanded(false);
  };

  if (!loaded) return null;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${phaseInfo ? phaseInfo.color : 'border-slate-700 bg-slate-800'}`}>
      {/* Header – immer sichtbar */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{phaseInfo ? phaseInfo.emoji : '🌙'}</span>
          <div>
            <p className="text-sm font-semibold text-white">
              {phaseInfo ? phaseInfo.label : 'Zyklus-Tracking'}
            </p>
            {phaseInfo ? (
              <p className="text-xs text-slate-400">
                Tag {phaseInfo.dayInCycle} · {phaseInfo.intensityAdvice}
              </p>
            ) : (
              <p className="text-xs text-slate-500">Noch nicht eingerichtet</p>
            )}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
      </button>

      {/* Empfehlung – sichtbar wenn Phase bekannt und nicht expandiert */}
      {phaseInfo && !expanded && (
        <div className="px-4 pb-3">
          <p className="text-xs text-slate-400 leading-relaxed">{phaseInfo.trainingRecommendation}</p>
        </div>
      )}

      {/* Eingabe – expandiert */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/10 pt-4">
          {/* Erklärung */}
          <div className="rounded-lg bg-white/5 px-3 py-2.5">
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-white">Warum ist das sinnvoll?</strong><br />
              Dein Körper arbeitet in Zyklen – und deine Leistungsfähigkeit verändert sich dabei messbar. 
              In der ersten Hälfte deines Zyklus ist dein Körper besonders aufnahmefähig für intensive Belastungen. 
              In der zweiten Hälfte profitiert er mehr von moderatem Training und Erholung.
              Mit dieser Information kann dein Coach dein Training noch gezielter gestalten.
            </p>
          </div>

          {/* Eingabe: Erster Tag */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Erster Tag deines aktuellen Zyklus
            </label>
            <input
              type="date"
              value={lastCycleStart}
              onChange={e => setLastCycleStart(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full rounded-lg bg-slate-700 border border-slate-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Zyklus-Länge */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Durchschnittliche Zykluslänge: <strong className="text-white">{avgCycleLength} Tage</strong>
            </label>
            <input
              type="range"
              min={21}
              max={35}
              value={avgCycleLength}
              onChange={e => setAvgCycleLength(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>21 Tage</span>
              <span>28 Tage (Durchschnitt)</span>
              <span>35 Tage</span>
            </div>
          </div>

          {/* Preview der Phase */}
          {lastCycleStart && (
            <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
              {(() => {
                const preview = getCyclePhase(new Date(lastCycleStart), avgCycleLength);
                return (
                  <>
                    <p className="text-xs font-semibold text-orange-400 mb-1">
                      {preview.emoji} Aktuelle Phase: {preview.label} (Tag {preview.dayInCycle})
                    </p>
                    <p className="text-xs text-slate-400">{preview.trainingRecommendation}</p>
                  </>
                );
              })()}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!lastCycleStart || saving}
            className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            {saving ? 'Wird gespeichert...' : 'Speichern'}
          </button>
        </div>
      )}
    </div>
  );
};

export { getCyclePhase };
export type { CyclePhaseInfo };
export default CycleTracker;
