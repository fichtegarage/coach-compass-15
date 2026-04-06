import { useState } from 'react';
import {
  generateAIPlan,
  verifyPlanOwnership,
  type PlanOptions,
  type MesocyclePhase,
} from '@/lib/aiPlanGenerator';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  client: Record<string, any>;
  duoPartnerClientId?: string; // optional: bei Duo-Training
  onPlanGenerated: (markdown: string) => void; // übergibt fertigen Plan ans Parent
  onClose: () => void;
}

type Step = 'config' | 'generating' | 'preview';

interface FormValues {
  sessionsPerWeek: number;
  weeksTotal: number;
  phase: MesocyclePhase;
  sessionDurationMinutes: number | '';
  includeCardio: boolean;
  isDuoTraining: boolean;
  coachInstructions: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_OPTIONS: { value: MesocyclePhase; label: string; hint: string }[] = [
  {
    value: 'accumulation',
    label: 'Akkumulation',
    hint: 'Hohes Volumen · moderate Intensität · Basis aufbauen',
  },
  {
    value: 'intensification',
    label: 'Intensivierung',
    hint: 'Mittleres Volumen · hohe Intensität · Stärke ausbauen',
  },
  {
    value: 'realization',
    label: 'Realisierung / Peak',
    hint: 'Geringes Volumen · maximale Intensität · Leistung abrufen',
  },
  {
    value: 'deload',
    label: 'Deload',
    hint: 'Deutlich reduziert · aktive Erholung · Regeneration',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function KIWorkoutBuilderModal({
  client,
  duoPartnerClientId,
  onPlanGenerated,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>('config');
  const [form, setForm] = useState<FormValues>({
    sessionsPerWeek: 3,
    weeksTotal: 6,
    phase: 'accumulation',
    sessionDurationMinutes: 60,
    includeCardio: false,
    isDuoTraining: !!duoPartnerClientId,
    coachInstructions: '',
  });
  const [generatedMarkdown, setGeneratedMarkdown] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Generate ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setStep('generating');
    setError(null);

    const options: PlanOptions = {
      sessionsPerWeek: form.sessionsPerWeek,
      weeksTotal: form.weeksTotal,
      phase: form.phase,
      sessionDurationMinutes:
        typeof form.sessionDurationMinutes === 'number'
          ? form.sessionDurationMinutes
          : undefined,
      includeCardio: form.includeCardio,
      isDuoTraining: form.isDuoTraining,
      duoPartnerClientId: form.isDuoTraining ? duoPartnerClientId : undefined,
      coachInstructions: form.coachInstructions || undefined,
    };

    try {
      const result = await generateAIPlan(client, options);

      // Sicherheitscheck: Alias im Plan muss zum aktuellen Kunden passen
      if (!verifyPlanOwnership(result.markdown, client.id)) {
        throw new Error(
          'Alias-Mismatch: Der generierte Plan konnte nicht dem Kunden zugeordnet werden. Bitte erneut versuchen.'
        );
      }

      setGeneratedMarkdown(result.markdown);
      setStep('preview');
    } catch (err: any) {
      setError(err.message ?? 'Unbekannter Fehler. Bitte erneut versuchen.');
      setStep('config');
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleImport() {
    onPlanGenerated(generatedMarkdown);
    onClose();
  }

  // ── Copy ────────────────────────────────────────────────────────────────────

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    // Overlay
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-gray-900 shadow-2xl border border-gray-700 overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <h2 className="text-white font-semibold text-lg leading-tight">
                KI-Workout-Builder
              </h2>
              <p className="text-gray-400 text-xs">
                {step === 'config' && 'Plan konfigurieren'}
                {step === 'generating' && 'Plan wird generiert …'}
                {step === 'preview' && 'Vorschau & Import'}
              </p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mr-8">
            {(['config', 'generating', 'preview'] as Step[]).map((s, i) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all duration-300 ${
                  step === s
                    ? 'w-6 bg-indigo-500'
                    : i < (['config', 'generating', 'preview'] as Step[]).indexOf(step)
                    ? 'w-2 bg-indigo-700'
                    : 'w-2 bg-gray-600'
                }`}
              />
            ))}
          </div>

          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors"
            aria-label="Schließen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ STEP 1: CONFIG ══ */}
          {step === 'config' && (
            <div className="p-6 space-y-6">

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 rounded-lg bg-red-900/40 border border-red-700 p-4 text-red-300 text-sm">
                  <span className="text-lg leading-none mt-0.5">⚠️</span>
                  <p>{error}</p>
                </div>
              )}

              {/* Client hint */}
              <div className="rounded-lg bg-indigo-900/30 border border-indigo-700/50 px-4 py-3 text-indigo-300 text-sm">
                Ziel & Level werden automatisch aus dem Kundenprofil gelesen.
                Nur der Alias <span className="font-mono font-bold">
                  CLIENT_{client.id?.replace(/-/g, '').substring(0, 8).toUpperCase()}
                </span> wird an die KI übergeben – kein Klarname.
              </div>

              {/* Form grid */}
              <div className="grid grid-cols-2 gap-4">

                {/* Sessions/Woche */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 text-sm font-medium">
                    Sessions / Woche
                  </label>
                  <select
                    value={form.sessionsPerWeek}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sessionsPerWeek: Number(e.target.value) }))
                    }
                    className="rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n}× pro Woche</option>
                    ))}
                  </select>
                </div>

                {/* Wochen */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 text-sm font-medium">
                    Gesamtdauer (Wochen)
                  </label>
                  <select
                    value={form.weeksTotal}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, weeksTotal: Number(e.target.value) }))
                    }
                    className="rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                      <option key={n} value={n}>{n} Wochen</option>
                    ))}
                  </select>
                </div>

                {/* Session-Dauer */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 text-sm font-medium">
                    Session-Dauer (Min.)
                  </label>
                  <select
                    value={form.sessionDurationMinutes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        sessionDurationMinutes:
                          e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    className="rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Keine Angabe</option>
                    {[30, 45, 60, 75, 90].map((n) => (
                      <option key={n} value={n}>{n} Min.</option>
                    ))}
                  </select>
                </div>

                {/* Cardio */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-gray-300 text-sm font-medium">
                    Optionen
                  </label>
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.includeCardio}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, includeCardio: e.target.checked }))
                        }
                        className="w-4 h-4 rounded accent-indigo-500"
                      />
                      <span className="text-gray-300 text-sm">Cardio einschließen</span>
                    </label>
                    {duoPartnerClientId && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.isDuoTraining}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, isDuoTraining: e.target.checked }))
                          }
                          className="w-4 h-4 rounded accent-indigo-500"
                        />
                        <span className="text-gray-300 text-sm">Duo-Training</span>
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Phase */}
              <div className="flex flex-col gap-2">
                <label className="text-gray-300 text-sm font-medium">
                  Mesozyklusphase
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PHASE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setForm((f) => ({ ...f, phase: opt.value }))}
                      className={`text-left rounded-lg border px-4 py-3 transition-all ${
                        form.phase === opt.value
                          ? 'border-indigo-500 bg-indigo-900/40 text-white'
                          : 'border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs mt-0.5 opacity-70">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Coach-Hinweise */}
              <div className="flex flex-col gap-1.5">
                <label className="text-gray-300 text-sm font-medium">
                  Coach-Hinweise{' '}
                  <span className="text-gray-500 font-normal">(optional – keine Namen)</span>
                </label>
                <textarea
                  value={form.coachInstructions}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, coachInstructions: e.target.value }))
                  }
                  placeholder="z.B. Fokus auf Posterior Chain, Kniebeugen vorerst nur als Goblet…"
                  rows={3}
                  className="rounded-lg bg-gray-800 border border-gray-600 text-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
                />
              </div>
            </div>
          )}

          {/* ══ STEP 2: GENERATING ══ */}
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-20 gap-6 px-6">
              {/* Animated spinner */}
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-gray-700" />
                <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-xl">
                  🏋️
                </div>
              </div>
              <div className="text-center">
                <p className="text-white font-medium text-lg">Plan wird generiert …</p>
                <p className="text-gray-400 text-sm mt-1">
                  Die KI wählt passende Übungen aus der Bibliothek.<br />
                  Das dauert ca. 15–30 Sekunden.
                </p>
              </div>
              {/* Animated dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ══ STEP 3: PREVIEW ══ */}
          {step === 'preview' && (
            <div className="flex flex-col h-full">
              {/* Preview header */}
              <div className="flex items-center justify-between px-6 py-3 bg-gray-800/50 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 13l4 4L19 7" />
                  </svg>
                  Plan erfolgreich generiert
                </div>
                <button
                  onClick={handleCopy}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    copied
                      ? 'border-green-600 bg-green-900/30 text-green-400'
                      : 'border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {copied ? '✓ Kopiert' : 'In Zwischenablage'}
                </button>
              </div>

              {/* Markdown raw text */}
              <div className="flex-1 overflow-y-auto p-6">
                <pre className="text-gray-300 text-xs leading-relaxed font-mono whitespace-pre-wrap bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  {generatedMarkdown}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer / Actions ── */}
        <div className="shrink-0 border-t border-gray-700 bg-gray-800 px-6 py-4 flex items-center justify-between gap-3">

          {step === 'config' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-900/40"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Plan generieren
              </button>
            </>
          )}

          {step === 'generating' && (
            <div className="w-full text-center text-gray-500 text-sm">
              Bitte nicht schließen …
            </div>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => {
                  setStep('config');
                  setGeneratedMarkdown('');
                }}
                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
              >
                ← Neu generieren
              </button>
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium text-sm transition-colors shadow-lg shadow-green-900/40"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Plan importieren
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
