/**
 * CycleWidget.tsx
 * Coach-seitige Anzeige der Zyklusphase einer Kundin.
 * Rendert nur wenn gender === 'female'.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getCyclePhase, type CyclePhaseInfo } from '@/components/CycleTracker';

interface Props {
  clientId: string;
  clientName: string;
}

const CycleWidget: React.FC<Props> = ({ clientId, clientName }) => {
  const [phaseInfo, setPhaseInfo] = useState<CyclePhaseInfo | null>(null);
  const [cycleLength, setCycleLength] = useState<number>(28);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('clients')
        .select('gender, last_cycle_start_date, avg_cycle_length')
        .eq('id', clientId)
        .maybeSingle();

      // Nur für weibliche Klientinnen
      if (!data || data.gender !== 'female' || !data.last_cycle_start_date) {
        setLoaded(true);
        return;
      }

      const len = data.avg_cycle_length || 28;
      setCycleLength(len);
      setPhaseInfo(getCyclePhase(new Date(data.last_cycle_start_date), len));
      setLoaded(true);
    };
    load();
  }, [clientId]);

  if (!loaded || !phaseInfo) return null;

  const isHighIntensity = phaseInfo.phase === 'follicular' || phaseInfo.phase === 'ovulation';
  const isLowIntensity = phaseInfo.phase === 'late_luteal' || phaseInfo.phase === 'early_follicular';

  return (
    <div className={`rounded-xl border p-3 ${
      isHighIntensity ? 'border-primary/30 bg-primary/5'
        : isLowIntensity ? 'border-muted bg-muted/30'
        : 'border-blue-500/20 bg-blue-500/5'
    }`}>
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0 mt-0.5">{phaseInfo.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-foreground">{phaseInfo.label}</p>
            <span className="text-[10px] text-muted-foreground">· Tag {phaseInfo.dayInCycle} von {cycleLength}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              isHighIntensity ? 'bg-primary/10 text-primary'
                : isLowIntensity ? 'bg-muted text-muted-foreground'
                : 'bg-blue-500/10 text-blue-500'
            }`}>
              {phaseInfo.intensityAdvice}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {phaseInfo.trainingRecommendation}
          </p>
          <div className="mt-2">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isHighIntensity ? 'bg-primary' : isLowIntensity ? 'bg-muted-foreground/40' : 'bg-blue-500'
                }`}
                style={{ width: `${(phaseInfo.dayInCycle / cycleLength) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
              <span>Follikelphase</span>
              <span>Lutealphase</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CycleWidget;
