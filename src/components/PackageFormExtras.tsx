// ================================================================
// NEUE DATEI: src/components/PackageFormExtras.tsx
// Enthält zwei Drop-in Komponenten für das Paket-Formular:
//   1. PackagePresetSelector – wählt Paketvorlagen (inkl. Test-Duo)
//   2. DiscountSection – Prozentual- oder Absolut-Rabatt
//
// ================================================================
// EINBAU ins Paket-Formular:
//
// 1. Import am Dateianfang:
//    import { PackagePresetSelector, DiscountSection, calcFinalPrice }
//      from '@/components/PackageFormExtras';
//
// 2. State hinzufügen:
//    const [discountType,  setDiscountType]  = useState<'percent'|'absolute'|''>('');
//    const [discountValue, setDiscountValue] = useState<number>(0);
//    const [discountReason,setDiscountReason]= useState('');
//
// 3. PackagePresetSelector einbauen (ganz oben im Formular):
//    <PackagePresetSelector onSelect={(preset) => {
//      setPackageName(preset.package_name);
//      setSessions(preset.sessions_included);
//      setCheckinCalls(preset.checkin_calls_included);
//      setPrice(preset.package_price);
//      setIsDuo(preset.is_duo);
//    }} />
//
// 4. DiscountSection einbauen (nach dem Preis-Feld):
//    <DiscountSection
//      basePrice={Number(packagePrice)}
//      discountType={discountType}
//      discountValue={discountValue}
//      discountReason={discountReason}
//      onTypeChange={setDiscountType}
//      onValueChange={setDiscountValue}
//      onReasonChange={setDiscountReason}
//    />
//
// 5. Beim Speichern mitgeben:
//    discount_type:  discountType || null,
//    discount_value: discountValue,
//    discount_reason: discountReason || null,
//    deal_discounted_price: discountType ? calcFinalPrice(basePrice, discountType, discountValue) : null,
//    is_deal: !!discountType,
// ================================================================

// ── Paketvorlagen ────────────────────────────────────────────────

export interface PackagePreset {
  package_name: string;
  sessions_included: number;
  checkin_calls_included: number;
  package_price: number;
  is_duo: boolean;
  duration_weeks: number | null;
  label: string;       // Anzeige-Name im Selector
  description: string; // Kurzbeschreibung
}

export const PACKAGE_PRESETS: PackagePreset[] = [
  {
    package_name:          'Testkunde',
    sessions_included:     3,
    checkin_calls_included: 0,
    package_price:         0,
    is_duo:                false,
    duration_weeks:        null,
    label:                 'Testkunde',
    description:           '3 Sessions · kostenlos · Solo',
  },
  {
    package_name:          'Test-Duo',
    sessions_included:     3,
    checkin_calls_included: 0,
    package_price:         0,
    is_duo:                true,
    duration_weeks:        null,
    label:                 'Test-Duo',
    description:           '3 Sessions · kostenlos · Duo',
  },
  {
    package_name:          'Starter',
    sessions_included:     5,
    checkin_calls_included: 2,
    package_price:         470,
    is_duo:                false,
    duration_weeks:        6,
    label:                 'Starter',
    description:           '5 Sessions · 2 Calls · 470 €',
  },
  {
    package_name:          'Transformation',
    sessions_included:     10,
    checkin_calls_included: 6,
    package_price:         890,
    is_duo:                false,
    duration_weeks:        8,
    label:                 'Transformation',
    description:           '10 Sessions · 6 Calls · 890 €',
  },
  {
    package_name:          'Intensiv',
    sessions_included:     20,
    checkin_calls_included: 10,
    package_price:         1700,
    is_duo:                false,
    duration_weeks:        12,
    label:                 'Intensiv',
    description:           '20 Sessions · 10 Calls · 1.700 €',
  },
  {
    package_name:          'Starter Duo',
    sessions_included:     5,
    checkin_calls_included: 2,
    package_price:         705,  // ~75% von 2× 470
    is_duo:                true,
    duration_weeks:        6,
    label:                 'Starter Duo',
    description:           '5 Sessions · Duo · 705 €',
  },
  {
    package_name:          'Transformation Duo',
    sessions_included:     10,
    checkin_calls_included: 6,
    package_price:         1335, // ~75% von 2× 890
    is_duo:                true,
    duration_weeks:        8,
    label:                 'Transformation Duo',
    description:           '10 Sessions · Duo · 1.335 €',
  },
  {
    package_name:          'Intensiv Duo',
    sessions_included:     20,
    checkin_calls_included: 10,
    package_price:         2550, // ~75% von 2× 1.700
    is_duo:                true,
    duration_weeks:        12,
    label:                 'Intensiv Duo',
    description:           '20 Sessions · Duo · 2.550 €',
  },
];

// ── Hilfsfunktion Endpreis ───────────────────────────────────────

export function calcFinalPrice(
  basePrice: number,
  type: 'percent' | 'absolute' | '',
  value: number
): number {
  if (!type || value <= 0) return basePrice;
  if (type === 'percent')  return Math.round(basePrice * (1 - value / 100) * 100) / 100;
  if (type === 'absolute') return Math.max(0, basePrice - value);
  return basePrice;
}

export function formatEur(amount: number): string {
  return amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// ── KOMPONENTE 1: PackagePresetSelector ─────────────────────────

interface PresetSelectorProps {
  onSelect: (preset: PackagePreset) => void;
  disabled?: boolean;
}

export function PackagePresetSelector({ onSelect, disabled }: PresetSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-800 border border-indigo-600/50 text-indigo-300 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
      >
        <div className="flex items-center gap-2">
          <span>📦</span>
          <span>Paketvorlage wählen</span>
        </div>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-20 rounded-xl bg-gray-800 border border-gray-600 shadow-xl overflow-hidden">
          {/* Trennlinien zwischen Solo und Duo */}
          {['Solo', 'Duo'].map(group => {
            const presets = PACKAGE_PRESETS.filter(p =>
              group === 'Duo' ? p.is_duo : !p.is_duo
            );
            return (
              <div key={group}>
                <div className="px-3 py-1.5 text-xs text-gray-500 font-medium uppercase tracking-wider bg-gray-900/50">
                  {group}
                </div>
                {presets.map(preset => (
                  <button
                    key={preset.package_name}
                    type="button"
                    onClick={() => { onSelect(preset); setOpen(false); }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-700 text-left transition-colors"
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{preset.label}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{preset.description}</p>
                    </div>
                    {preset.is_duo && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/50 shrink-0">
                        Duo
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── KOMPONENTE 2: DiscountSection ────────────────────────────────

interface DiscountSectionProps {
  basePrice: number;
  discountType: 'percent' | 'absolute' | '';
  discountValue: number;
  discountReason: string;
  onTypeChange:   (t: 'percent' | 'absolute' | '') => void;
  onValueChange:  (v: number) => void;
  onReasonChange: (r: string) => void;
  disabled?: boolean;
}

export function DiscountSection({
  basePrice,
  discountType,
  discountValue,
  discountReason,
  onTypeChange,
  onValueChange,
  onReasonChange,
  disabled = false,
}: DiscountSectionProps) {
  const finalPrice = calcFinalPrice(basePrice, discountType, discountValue);
  const hasDiscount = !!discountType && discountValue > 0;

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-800/40 p-4">
      {/* Toggle Rabatt aktiv */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">Rabatt gewähren</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              checked={!!discountType}
              onChange={e => onTypeChange(e.target.checked ? 'percent' : '')}
              disabled={disabled}
              className="sr-only"
            />
            <div className={`w-10 h-5 rounded-full transition-colors ${
              discountType ? 'bg-indigo-600' : 'bg-gray-600'
            }`}>
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                discountType ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </div>
          </div>
        </label>
      </div>

      {discountType && (
        <>
          {/* Typ: Prozentual / Absolut */}
          <div className="grid grid-cols-2 gap-2">
            {(['percent', 'absolute'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => onTypeChange(t)}
                disabled={disabled}
                className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                  discountType === t
                    ? 'border-indigo-500 bg-indigo-900/40 text-indigo-300'
                    : 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500'
                }`}
              >
                {t === 'percent' ? '% Prozentual' : '€ Absolut'}
              </button>
            ))}
          </div>

          {/* Wert */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                max={discountType === 'percent' ? 100 : basePrice}
                step={discountType === 'percent' ? 1 : 5}
                value={discountValue || ''}
                onChange={e => onValueChange(Number(e.target.value))}
                disabled={disabled}
                placeholder={discountType === 'percent' ? 'z.B. 10' : 'z.B. 50'}
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                {discountType === 'percent' ? '%' : '€'}
              </span>
            </div>
          </div>

          {/* Grund */}
          <input
            type="text"
            value={discountReason}
            onChange={e => onReasonChange(e.target.value)}
            disabled={disabled}
            placeholder="Grund (optional): z.B. Empfehlung, Treue-Bonus …"
            className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
          />

          {/* Endpreis-Anzeige */}
          {hasDiscount && (
            <div className="flex items-center justify-between rounded-lg bg-green-900/20 border border-green-700/40 px-4 py-2.5">
              <div className="text-sm">
                <span className="text-gray-400">Grundpreis: </span>
                <span className="text-gray-300 line-through">{formatEur(basePrice)}</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-green-400">
                  {discountType === 'percent'
                    ? `−${discountValue} %`
                    : `−${formatEur(discountValue)}`}
                </span>
                <p className="text-green-300 font-semibold text-sm">{formatEur(finalPrice)}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
