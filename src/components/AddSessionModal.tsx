// ============================================================
// NEUE DATEI: src/components/AddSessionModal.tsx
// Vollständiges Session-Buchungs-Formular mit Duo-Support.
// ============================================================
//
// EINBAU (4 Schritte):
//
// 1. Import hinzufügen:
//    import AddSessionModal from '@/components/AddSessionModal';
//
// 2. State hinzufügen:
//    const [showAddSession, setShowAddSession] = useState(false);
//
// 3. Button zum Öffnen (wo immer passend):
//    <button onClick={() => setShowAddSession(true)}>
//      + Session buchen
//    </button>
//
// 4. Modal ins JSX einbauen (vor dem letzten </div>):
//    {showAddSession && (
//      <AddSessionModal
//        defaultClientId={client?.id}
//        onClose={() => setShowAddSession(false)}
//        onSaved={() => { setShowAddSession(false); refetch(); }}
//      />
//    )}
// ============================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Client { id: string; full_name: string; }
interface Package { id: string; package_name: string; is_duo: boolean; }

interface Props {
  defaultClientId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const SESSION_TYPES = [
  'In-Person Training',
  'Free Intro',
  'Check-In Call',
  'Online Training',
  'Outdoor Training',
];
const LOCATIONS   = ['Gym', 'Online', 'Outdoor', 'Studio'];
const STATUSES    = ['Scheduled', 'Completed', 'Cancelled'];
const DURATIONS   = [30, 45, 60, 75, 90, 120];

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AddSessionModal({ defaultClientId, onClose, onSaved }: Props) {
  // Form state
  const [clientId,       setClientId]       = useState(defaultClientId ?? '');
  const [secondClientId, setSecondClientId] = useState('');
  const [isDuo,          setIsDuo]          = useState(false);
  const [packageId,      setPackageId]      = useState('');
  const [sessionDate,    setSessionDate]    = useState(toLocalDatetimeValue(new Date()));
  const [duration,       setDuration]       = useState(60);
  const [sessionType,    setSessionType]    = useState('In-Person Training');
  const [status,         setStatus]         = useState('Scheduled');
  const [location,       setLocation]       = useState('Gym');
  const [notes,          setNotes]          = useState('');
  const [tag,            setTag]            = useState('');

  // Data
  const [clients,  setClients]  = useState<Client[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    // Alle aktiven Kunden laden
    supabase.from('clients').select('id, full_name')
      .eq('status', 'Active').order('full_name')
      .then(({ data }) => setClients(data ?? []));
  }, []);

  useEffect(() => {
    if (!clientId) { setPackages([]); return; }
    // Pakete des Kunden laden
    supabase.from('packages').select('id, package_name, is_duo')
      .or(`client_id.eq.${clientId},partner_client_id.eq.${clientId}`)
      .order('package_name')
      .then(({ data }) => setPackages(data ?? []));
  }, [clientId]);

  async function handleSave() {
    if (!clientId) { setError('Bitte eine/n Kunden/in wählen.'); return; }
    if (isDuo && !secondClientId) { setError('Bitte Duo-Partner/in wählen.'); return; }

    setSaving(true);
    setError(null);

    const { error: dbErr } = await supabase.from('sessions').insert({
      client_id:        clientId,
      second_client_id: isDuo ? secondClientId : null,
      package_id:       packageId || null,
      session_date:     new Date(sessionDate).toISOString(),
      duration_minutes: duration,
      session_type:     sessionType,
      status,
      location,
      notes:            notes.trim() || null,
      tag:              tag.trim() || null,
    });

    if (dbErr) {
      setError(dbErr.message);
      setSaving(false);
      return;
    }

    onSaved();
  }

  const otherClients = clients.filter(c => c.id !== clientId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg flex flex-col rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800 shrink-0">
          <h2 className="text-white font-semibold text-lg">Session buchen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700/50 px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Klient */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Kund:in *</label>
              <select
                value={clientId}
                onChange={e => { setClientId(e.target.value); setSecondClientId(''); setPackageId(''); }}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Bitte wählen —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>

            {/* Paket */}
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Paket</label>
              <select
                value={packageId}
                onChange={e => setPackageId(e.target.value)}
                disabled={!clientId}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">— Kein Paket —</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.package_name}{p.is_duo ? ' (Duo)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Duo-Training Toggle */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <div>
                  <p className="text-white text-sm font-medium">Duo-Training</p>
                  <p className="text-gray-400 text-xs">Zweite/n Kund:in buchen</p>
                </div>
              </div>
              <div className="relative" onClick={() => { setIsDuo(d => !d); setSecondClientId(''); }}>
                <div className={`w-11 h-6 rounded-full transition-colors ${isDuo ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${isDuo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>
            </label>

            {isDuo && (
              <div className="space-y-1.5">
                <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Duo-Partner/in *</label>
                <select
                  value={secondClientId}
                  onChange={e => setSecondClientId(e.target.value)}
                  className={`w-full rounded-lg bg-gray-800 border text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!secondClientId ? 'border-amber-600/60' : 'border-gray-600'}`}
                >
                  <option value="">— Bitte wählen —</option>
                  {otherClients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
                {otherClients.length === 0 && (
                  <p className="text-xs text-gray-500">Keine weiteren aktiven Kunden gefunden.</p>
                )}
              </div>
            )}
          </div>

          {/* Datum & Uhrzeit */}
          <div className="space-y-1.5">
            <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Datum & Uhrzeit *</label>
            <input
              type="datetime-local"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Typ, Dauer, Location */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Typ</label>
              <select value={sessionType} onChange={e => setSessionType(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {SESSION_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Dauer</label>
              <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Ort</label>
              <select value={location} onChange={e => setLocation(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {LOCATIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Tag (optional)</label>
              <input
                type="text"
                value={tag}
                onChange={e => setTag(e.target.value)}
                placeholder="z.B. Beine, Push, Pull …"
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
              />
            </div>
          </div>

          {/* Notizen */}
          <div className="space-y-1.5">
            <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Notizen (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Besonderheiten, Fokus, Hinweise …"
              rows={2}
              className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700 bg-gray-800 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !clientId || (isDuo && !secondClientId)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95"
          >
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Speichern…</>
            ) : (
              '✓ Session speichern'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
