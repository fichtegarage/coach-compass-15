// ================================================================
// NEUE DATEI: src/components/DuoSessionField.tsx
// Drop-in Komponente für das Session-Buchungs-Formular.
// Fügt "Duo-Training" Toggle + Partner-Auswahl hinzu.
//
// EINBAU ins Session-Formular:
//   1. Import am Dateianfang hinzufügen:
//      import DuoSessionField from '@/components/DuoSessionField';
//
//   2. State hinzufügen:
//      const [secondClientId, setSecondClientId] = useState<string>('');
//
//   3. Komponente in das Formular einbauen (nach dem Client-Feld):
//      <DuoSessionField
//        primaryClientId={clientId}
//        value={secondClientId}
//        onChange={setSecondClientId}
//      />
//
//   4. Beim Speichern der Session:
//      second_client_id: secondClientId || null
// ================================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Client {
  id: string;
  full_name: string;
}

interface Props {
  primaryClientId?: string;    // Hauptkunde – wird aus der Liste ausgeschlossen
  value: string;               // Aktuelle second_client_id (leer = kein Duo)
  onChange: (id: string) => void;
  disabled?: boolean;
}

export default function DuoSessionField({
  primaryClientId,
  value,
  onChange,
  disabled = false,
}: Props) {
  const [isDuo, setIsDuo]       = useState(!!value);
  const [clients, setClients]   = useState<Client[]>([]);
  const [loading, setLoading]   = useState(false);

  // Wenn value von außen gesetzt wird (z.B. beim Bearbeiten), Duo-Toggle aktivieren
  useEffect(() => { if (value) setIsDuo(true); }, [value]);

  // Aktive Kunden laden (außer dem Hauptkunden)
  useEffect(() => {
    if (!isDuo) return;
    setLoading(true);
    supabase
      .from('clients')
      .select('id, full_name')
      .eq('status', 'Active')
      .order('full_name')
      .then(({ data }) => {
        setClients((data ?? []).filter(c => c.id !== primaryClientId));
        setLoading(false);
      });
  }, [isDuo, primaryClientId]);

  function handleToggle(checked: boolean) {
    setIsDuo(checked);
    if (!checked) onChange(''); // Partner-ID zurücksetzen
  }

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div className="relative">
          <input
            type="checkbox"
            checked={isDuo}
            onChange={e => handleToggle(e.target.checked)}
            disabled={disabled}
            className="sr-only"
          />
          <div className={`w-10 h-5 rounded-full transition-colors ${
            isDuo ? 'bg-indigo-600' : 'bg-gray-600'
          } ${disabled ? 'opacity-50' : ''}`}>
            <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
              isDuo ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-200">Duo-Training</span>
          <p className="text-xs text-gray-400">Zweite/n Kund:in für diese Session buchen</p>
        </div>
      </label>

      {/* Partner-Auswahl */}
      {isDuo && (
        <div className="ml-13 pl-1">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-1">
              <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              Lade Kunden …
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Duo-Partner / Duo-Partnerin</label>
              <select
                value={value}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                className={`w-full rounded-lg bg-gray-800 border text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  !value ? 'border-amber-600/50 text-gray-400' : 'border-gray-600'
                }`}
              >
                <option value="">— Bitte auswählen —</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
              {!value && (
                <p className="text-xs text-amber-400">Bitte eine/n Partner/in auswählen.</p>
              )}
              {clients.length === 0 && (
                <p className="text-xs text-gray-500">Keine weiteren aktiven Kunden gefunden.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
