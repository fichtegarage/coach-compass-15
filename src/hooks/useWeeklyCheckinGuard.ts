// ================================================================
// NEUE DATEI: src/hooks/useWeeklyCheckinGuard.ts
// Verhindert, dass der wöchentliche Check-In mehrmals pro Woche
// erscheint. Nutzt DB als Quelle der Wahrheit + localStorage als
// schnellen Vorab-Check.
//
// EINBAU: In der Komponente, die den Check-In Modal zeigt:
//
//   import { useWeeklyCheckinGuard } from '@/hooks/useWeeklyCheckinGuard';
//   const { shouldShow, markShown } = useWeeklyCheckinGuard(clientId);
//
//   // Statt: setShowCheckin(true);
//   // So:    if (shouldShow) setShowCheckin(true);
//
//   // Nach Absenden des Check-Ins:
//   markShown();
// ================================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Gibt den Montag der aktuellen Woche als YYYY-MM-DD zurück */
function getCurrentWeekMonday(): string {
  const now  = new Date();
  const day  = now.getDay(); // 0=So, 1=Mo, ..., 6=Sa
  const diff = (day === 0 ? -6 : 1 - day); // Rückversatz auf Montag
  const mon  = new Date(now);
  mon.setDate(now.getDate() + diff);
  return mon.toISOString().slice(0, 10); // YYYY-MM-DD
}

const LS_KEY = (clientId: string, weekStart: string) =>
  `checkin_done_${clientId}_${weekStart}`;

interface GuardResult {
  /** true = Check-In noch nicht eingereicht, Modal darf gezeigt werden */
  shouldShow: boolean;
  /** Nachdem der Check-In eingereicht wurde, aufrufen */
  markShown: () => void;
  /** true während der DB-Abfrage läuft */
  loading: boolean;
  /** Der Montag der aktuellen Woche (YYYY-MM-DD) */
  currentWeekStart: string;
}

export function useWeeklyCheckinGuard(clientId: string | undefined): GuardResult {
  const weekStart = getCurrentWeekMonday();
  const [shouldShow, setShouldShow] = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    // Schneller Check via localStorage – verhindert DB-Roundtrip
    const lsKey = LS_KEY(clientId, weekStart);
    if (localStorage.getItem(lsKey) === 'done') {
      setShouldShow(false);
      setLoading(false);
      return;
    }

    // DB-Check: gibt es schon einen Eintrag für diese Woche?
    (async () => {
      try {
        const { data, error } = await supabase
          .from('weekly_checkins')
          .select('id')
          .eq('client_id', clientId)
          .eq('week_start', weekStart)
          .maybeSingle();

        if (error) {
          // Im Fehlerfall lieber nicht anzeigen als Endlos-Loop
          setShouldShow(false);
        } else if (data) {
          // Eintrag gefunden → bereits eingereicht
          localStorage.setItem(lsKey, 'done'); // für nächstes Mal cachen
          setShouldShow(false);
        } else {
          // Kein Eintrag → Modal zeigen
          setShouldShow(true);
        }
      } catch {
        setShouldShow(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId, weekStart]);

  function markShown() {
    if (!clientId) return;
    localStorage.setItem(LS_KEY(clientId, weekStart), 'done');
    setShouldShow(false);
  }

  return { shouldShow, markShown, loading, currentWeekStart: weekStart };
}
