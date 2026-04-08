// ============================================================
// NEUE DATEI: src/components/PackageFormModal.tsx
// Vollständiges Paket-Formular mit Vorlagen, Duo-Support
// und prozentualen / absoluten Rabatten.
// ============================================================
//
// EINBAU (4 Schritte):
//
// 1. Import hinzufügen:
//    import PackageFormModal from '@/components/PackageFormModal';
//
// 2. State hinzufügen:
//    const [showPackageForm, setShowPackageForm] = useState(false);
//
// 3. Button zum Öffnen:
//    <button onClick={() => setShowPackageForm(true)}>
//      + Paket erstellen
//    </button>
//
// 4. Modal ins JSX einbauen (vor dem letzten </div>):
//    {showPackageForm && (
//      <PackageFormModal
//        defaultClientId={client?.id}
//        onClose={() => setShowPackageForm(false)}
//        onSaved={() => { setShowPackageForm(false); refetch(); }}
//      />
//    )}
// ============================================================

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Paketvorlagen ────────────────────────────────────────────────

interface Preset {
  package_name: string;
  sessions: number;
  calls: number;
  price: number;
  is_duo: boolean;
  weeks: number | null;
  emoji: string;
}

const PRESETS: Preset[] = [
  { package_name:'Testkunde',           sessions:3,  calls:0,  price:0,    is_duo:false, weeks:null, emoji:'🧪' },
  { package_name:'Test-Duo',            sessions:3,  calls:0,  price:0,    is_duo:true,  weeks:null, emoji:'🧪' },
  { package_name:'Starter',             sessions:5,  calls:2,  price:470,  is_duo:false, weeks:6,   emoji:'🚀' },
  { package_name:'Transformation',      sessions:10, calls:6,  price:890,  is_duo:false, weeks:8,   emoji:'⚡' },
  { package_name:'Intensiv',            sessions:20, calls:10, price:1700, is_duo:false, weeks:12,  emoji:'🔥' },
  { package_name:'Starter Duo',         sessions:5,  calls:2,  price:705,  is_duo:true,  weeks:6,   emoji:'👥' },
  { package_name:'Transformation Duo',  sessions:10, calls:6,  price:1335, is_duo:true,  weeks:8,   emoji:'👥' },
  { package_name:'Intensiv Duo',        sessions:20, calls:10, price:2550, is_duo:true,  weeks:12,  emoji:'👥' },
];

function calcFinal(base: number, type: string, val: number): number {
  if (!type || val <= 0) return base;
  if (type === 'percent')  return Math.round(base * (1 - val / 100) * 100) / 100;
  if (type === 'absolute') return Math.max(0, base - val);
  return base;
}

function formatEur(n: number) {
  return n.toLocaleString('de-DE', { style:'currency', currency:'EUR' });
}

// ─── Client interface ─────────────────────────────────────────────
interface Client { id: string; full_name: string; }

interface Props {
  defaultClientId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function PackageFormModal({ defaultClientId, onClose, onSaved }: Props) {
  // Form fields
  const [clientId,       setClientId]       = useState(defaultClientId ?? '');
  const [partnerClientId,setPartnerClientId]= useState('');
  const [packageName,    setPackageName]    = useState('');
  const [sessions,       setSessions]       = useState('');
  const [calls,          setCalls]          = useState('0');
  const [price,          setPrice]          = useState('');
  const [isDuo,          setIsDuo]          = useState(false);
  const [weeks,          setWeeks]          = useState('');
  const [startDate,      setStartDate]      = useState('');
  const [paymentStatus,  setPaymentStatus]  = useState('Unpaid');
  const [partnerPayment, setPartnerPayment] = useState('Unpaid');

  // Discount
  const [discountType,   setDiscountType]   = useState<'percent'|'absolute'|''>('');
  const [discountValue,  setDiscountValue]  = useState<number>(0);
  const [discountReason, setDiscountReason] = useState('');

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    supabase.from('clients').select('id, full_name')
      .eq('status','Active').order('full_name')
      .then(({ data }) => setClients(data ?? []));
  }, []);

  function applyPreset(p: Preset) {
    setPackageName(p.package_name);
    setSessions(String(p.sessions));
    setCalls(String(p.calls));
    setPrice(String(p.price));
    setIsDuo(p.is_duo);
    setWeeks(p.weeks ? String(p.weeks) : '');
    setShowPresets(false);
    // Rabatt zurücksetzen bei neuem Preset
    setDiscountType('');
    setDiscountValue(0);
    setDiscountReason('');
  }

  const basePrice    = Number(price) || 0;
  const finalPrice   = calcFinal(basePrice, discountType, discountValue);
  const hasDiscount  = !!discountType && discountValue > 0 && finalPrice !== basePrice;

  async function handleSave() {
    if (!clientId)    { setError('Bitte eine/n Kunden/in wählen.'); return; }
    if (!packageName) { setError('Bitte einen Paketnamen eingeben.'); return; }
    if (isDuo && !partnerClientId) { setError('Bitte Duo-Partner/in wählen.'); return; }

    setSaving(true);
    setError(null);

    const endDate = (() => {
      if (!startDate || !weeks) return null;
      const d = new Date(startDate);
      d.setDate(d.getDate() + Number(weeks) * 7);
      return d.toISOString().slice(0, 10);
    })();

    const { error: dbErr } = await supabase.from('packages').insert({
      client_id:              clientId,
      partner_client_id:      isDuo ? partnerClientId : null,
      package_name:           packageName,
      sessions_included:      Number(sessions) || 0,
      checkin_calls_included: Number(calls)    || 0,
      package_price:          basePrice,
      is_duo:                 isDuo,
      duration_weeks:         weeks ? Number(weeks) : null,
      start_date:             startDate || null,
      end_date:               endDate,
      payment_status:         paymentStatus,
      partner_payment_status: isDuo ? partnerPayment : null,
      is_deal:                hasDiscount,
      deal_reason:            discountReason || null,
      deal_discounted_price:  hasDiscount ? finalPrice : null,
      discount_type:          discountType  || null,
      discount_value:         discountValue || 0,
      discount_reason:        discountReason || null,
    });

    if (dbErr) { setError(dbErr.message); setSaving(false); return; }
    onSaved();
  }

  const otherClients = clients.filter(c => c.id !== clientId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg flex flex-col rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800 shrink-0">
          <h2 className="text-white font-semibold text-lg">Paket erstellen</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700/50 px-4 py-3 text-red-300 text-sm">{error}</div>
          )}

          {/* Paketvorlage */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresets(p => !p)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg bg-gray-800 border border-indigo-600/50 text-indigo-300 text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2"><span>📦</span> Vorlage wählen (optional)</div>
              <svg className={`w-4 h-4 transition-transform ${showPresets?'rotate-180':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            {showPresets && (
              <div className="absolute top-full mt-1 left-0 right-0 z-20 rounded-xl bg-gray-800 border border-gray-600 shadow-xl overflow-hidden">
                {['Solo','Duo'].map(grp => (
                  <div key={grp}>
                    <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider bg-gray-900/60">{grp}</div>
                    {PRESETS.filter(p => grp==='Duo' ? p.is_duo : !p.is_duo).map(p => (
                      <button key={p.package_name} type="button" onClick={() => applyPreset(p)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-700 text-left transition-colors">
                        <div>
                          <p className="text-white text-sm font-medium">{p.emoji} {p.package_name}</p>
                          <p className="text-gray-400 text-xs mt-0.5">
                            {p.sessions}× Sessions · {p.calls > 0 ? `${p.calls} Calls · ` : ''}
                            {p.price > 0 ? formatEur(p.price) : 'kostenlos'}
                            {p.weeks ? ` · ${p.weeks} Wo.` : ''}
                          </p>
                        </div>
                        {p.is_duo && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/50">Duo</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Klient */}
          <div className="space-y-1.5">
            <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Kund:in *</label>
            <select value={clientId} onChange={e => { setClientId(e.target.value); setPartnerClientId(''); }}
              className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Bitte wählen —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>

          {/* Duo-Toggle */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <div>
                  <p className="text-white text-sm font-medium">Duo-Training</p>
                  <p className="text-gray-400 text-xs">Zweite/n Kund:in einschließen</p>
                </div>
              </div>
              <div className="relative" onClick={() => { setIsDuo(d => !d); setPartnerClientId(''); }}>
                <div className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${isDuo ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${isDuo ? 'translate-x-5' : 'translate-x-0.5'}`}/>
                </div>
              </div>
            </label>
            {isDuo && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-gray-300 text-xs font-medium">Partner/in *</label>
                  <select value={partnerClientId} onChange={e => setPartnerClientId(e.target.value)}
                    className={`w-full rounded-lg bg-gray-800 border text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!partnerClientId ? 'border-amber-600/60' : 'border-gray-600'}`}>
                    <option value="">— Bitte wählen —</option>
                    {otherClients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-gray-300 text-xs font-medium">Zahlung Partner/in</label>
                  <select value={partnerPayment} onChange={e => setPartnerPayment(e.target.value)}
                    className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option>Unpaid</option>
                    <option>Paid in full</option>
                    <option>Partial</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Paketname */}
          <div className="space-y-1.5">
            <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Paketname *</label>
            <input type="text" value={packageName} onChange={e => setPackageName(e.target.value)}
              placeholder="z.B. Transformation"
              className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"/>
          </div>

          {/* Sessions, Calls, Wochen */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Sessions</label>
              <input type="number" min="0" value={sessions} onChange={e => setSessions(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Check-In Calls</label>
              <input type="number" min="0" value={calls} onChange={e => setCalls(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Wochen</label>
              <input type="number" min="0" value={weeks} onChange={e => setWeeks(e.target.value)}
                placeholder="–"
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"/>
            </div>
          </div>

          {/* Preis */}
          <div className="space-y-1.5">
            <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Grundpreis (€)</label>
            <div className="relative">
              <input type="number" min="0" step="1" value={price} onChange={e => setPrice(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"/>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
            </div>
          </div>

          {/* Rabatt-Sektion */}
          <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">🏷️ Rabatt</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative" onClick={() => { setDiscountType(discountType ? '' : 'percent'); setDiscountValue(0); }}>
                  <div className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${discountType ? 'bg-indigo-600' : 'bg-gray-600'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${discountType ? 'translate-x-5' : 'translate-x-0.5'}`}/>
                  </div>
                </div>
              </label>
            </div>

            {discountType && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(['percent','absolute'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setDiscountType(t)}
                      className={`py-2 rounded-lg border text-sm font-medium transition-colors ${discountType===t ? 'border-indigo-500 bg-indigo-900/40 text-indigo-300' : 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500'}`}>
                      {t === 'percent' ? '% Prozentual' : '€ Absolut'}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <input type="number" min="0"
                    max={discountType==='percent' ? 100 : basePrice}
                    step={discountType==='percent' ? 1 : 5}
                    value={discountValue || ''}
                    onChange={e => setDiscountValue(Number(e.target.value))}
                    placeholder={discountType==='percent' ? 'z.B. 10' : 'z.B. 50'}
                    className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"/>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    {discountType==='percent' ? '%' : '€'}
                  </span>
                </div>

                <input type="text" value={discountReason} onChange={e => setDiscountReason(e.target.value)}
                  placeholder="Grund (optional): Empfehlung, Treue-Bonus …"
                  className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"/>

                {hasDiscount && (
                  <div className="flex items-center justify-between rounded-lg bg-green-900/20 border border-green-700/40 px-4 py-2.5">
                    <div className="text-sm">
                      <span className="text-gray-400">Grundpreis: </span>
                      <span className="text-gray-300 line-through">{formatEur(basePrice)}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-green-400">
                        {discountType==='percent' ? `−${discountValue} %` : `−${formatEur(discountValue)}`}
                      </p>
                      <p className="text-green-300 font-semibold text-sm">{formatEur(finalPrice)}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Start, Zahlung */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Startdatum</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
            </div>
            <div className="space-y-1.5">
              <label className="text-gray-300 text-xs font-medium uppercase tracking-wider">Zahlungsstatus</label>
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Unpaid</option>
                <option>Paid in full</option>
                <option>Partial</option>
                <option>Invoice sent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700 bg-gray-800 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={saving || !clientId || !packageName || (isDuo && !partnerClientId)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all active:scale-95">
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Speichern…</>
            ) : '✓ Paket speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
