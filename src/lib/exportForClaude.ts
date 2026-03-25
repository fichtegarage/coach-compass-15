/**
 * exportForClaude.ts
 *
 * Exports onboarding conversation data as a structured Markdown file
 * optimised for use as a Claude prompt to generate a personalised training plan.
 *
 * Design principle: the format is both human-readable AND machine-parseable,
 * so that a future CoachHub feature can import Claude's structured plan output
 * directly into the app (assign to client, track workouts, collect feedback).
 */

export interface ExportClientData {
  // Profile
  full_name: string;
  date_of_birth?: string | null;
  occupation?: string | null;
  fitness_goal?: string | null;
  fitness_goal_text?: string | null;
  starting_date?: string | null;

  // Conversation
  contact_source?: string | null;
  motivation?: string | null;
  previous_experience?: string | null;
  stress_level?: string | null;
  sleep_quality?: string | null;
  daily_activity?: string | null;
  current_training?: string | null;
  nutrition_habits?: string | null;
  goal_importance?: string | null;
  success_criteria?: string | null;
  personality_type?: string | null;
  next_steps?: string | null;
  notes?: string | null;
  conversation_date?: string | null;

  // Health record
  cardiovascular?: string | null;
  musculoskeletal?: string | null;
  surgeries?: string | null;
  sports_injuries?: string | null;
  other_conditions?: string | null;
  medications?: string | null;
  current_pain?: string | null;
  substances?: string | null;
}

const personalityLabels: Record<string, string> = {
  success_oriented: 'Erfolgsorientiert – optimistisch, aktiv, zielorientiert. Herausfordernde Ziele setzen, Eigenverantwortung betonen.',
  avoidance_oriented: 'Meidungsorientiert – vorsichtig, braucht Sicherheit. Realistische Erwartungen, mehr Begleitung und Sicherheit geben.',
  unclear: 'Noch unklar – im Training weiter beobachten.',
};

function age(dob: string | null | undefined): string {
  if (!dob) return 'unbekannt';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} Jahre`;
}

function line(label: string, value: string | null | undefined): string {
  if (!value || value.trim() === '') return '';
  return `- **${label}:** ${value.trim()}\n`;
}

function section(title: string, content: string): string {
  const body = content.trim();
  if (!body) return '';
  return `\n## ${title}\n\n${body}\n`;
}

function buildClientBlock(data: ExportClientData): string {
  let out = '';

  // ── PROFIL ──────────────────────────────────────────────────────────────
  out += section('Klientenprofil', [
    line('Name', data.full_name),
    line('Alter', age(data.date_of_birth)),
    line('Beruf', data.occupation),
    line('Fitnessziel (Kategorie)', data.fitness_goal),
    line('Ziel (Freitext)', data.fitness_goal_text),
    line('Erstgespräch am', data.conversation_date
      ? new Date(data.conversation_date).toLocaleDateString('de-DE')
      : null),
  ].filter(Boolean).join(''));

  // ── MOTIVATION & HINTERGRUND ─────────────────────────────────────────────
  out += section('Motivation & Hintergrund', [
    line('Wie gefunden', data.contact_source),
    line('Motivation', data.motivation),
    line('Bisherige Erfahrung', data.previous_experience),
  ].filter(Boolean).join(''));

  // ── IST-ZUSTAND ──────────────────────────────────────────────────────────
  out += section('Ist-Zustand', [
    line('Stresslevel', data.stress_level),
    line('Schlafqualität', data.sleep_quality),
    line('Bewegung im Alltag', data.daily_activity),
    line('Aktuelles Training', data.current_training),
    line('Ernährung (grob)', data.nutrition_habits),
  ].filter(Boolean).join(''));

  // ── ZIELE & ERFOLGSKRITERIEN ─────────────────────────────────────────────
  out += section('Ziele & Erfolgskriterien', [
    line('Warum wichtig', data.goal_importance),
    line('Woran erkennbar', data.success_criteria),
  ].filter(Boolean).join(''));

  // ── PERSÖNLICHKEITSTYP ───────────────────────────────────────────────────
  if (data.personality_type) {
    out += section('Persönlichkeitstyp & Coaching-Hinweis', [
      `- **Typ:** ${personalityLabels[data.personality_type] ?? data.personality_type}\n`,
    ].join(''));
  }

  // ── GESUNDHEIT / ANAMNESE ────────────────────────────────────────────────
  const healthLines = [
    line('Herz-Kreislauf', data.cardiovascular),
    line('Bewegungsapparat', data.musculoskeletal),
    line('Operationen', data.surgeries),
    line('Sportverletzungen', data.sports_injuries),
    line('Sonstige Erkrankungen', data.other_conditions),
    line('Medikamente', data.medications),
    line('Aktuelle Schmerzen / Einschränkungen', data.current_pain),
    line('Genussmittel', data.substances),
  ].filter(Boolean).join('');

  out += section(
    'Gesundheit & Anamnese',
    healthLines || '- Keine Einschränkungen dokumentiert.\n',
  );

  // ── VEREINBARTES / NOTIZEN ───────────────────────────────────────────────
  out += section('Vereinbartes & Notizen', [
    line('Nächste Schritte', data.next_steps),
    line('Sonstiges', data.notes),
  ].filter(Boolean).join(''));

  return out;
}

function systemPrompt(isDuo: boolean): string {
  return `# CoachHub – Trainingsplan-Anfrage

Du bist ein erfahrener Personal Trainer und Trainingsplan-Experte.
Auf Basis des folgenden Erstgespräch-Protokolls erstellst du einen **individuellen Trainingsplan**.

## Deine Aufgabe

1. Analysiere das Erstgespräch-Protokoll sorgfältig.
2. Erstelle einen **4-Wochen-Trainingsplan** (Mesozyklus), der zu Zielen, Alltag und Gesundheit der Person passt.
3. Beachte dabei: Stresslevel, Schlaf, Alltags-Aktivität und Anamnese – diese bestimmen die Trainingsbelastung.
4. Berücksichtige den Persönlichkeitstyp für Ton und Struktur des Plans.
5. ${isDuo ? 'Es handelt sich um ein **Duo-Training**: Erstelle einen gemeinsamen Plan, der für beide Personen gleichzeitig durchführbar ist. Hebe individuelle Anpassungen (z.B. bei unterschiedlichen Einschränkungen) klar hervor.' : 'Erstelle den Plan für eine Einzelperson.'}

## Format der Ausgabe

Bitte antworte **ausschließlich im folgenden Markdown-Format** (wichtig für spätere App-Integration):

\`\`\`
# Trainingsplan: [Name]
## Zeitraum: [Startdatum] – [Enddatum]
## Ziel: [Hauptziel]
## Trainingstage pro Woche: [Zahl]

---

## Woche 1–2: Fundament

### Einheit A – [Bezeichnung]
| Übung | Sätze | Wdh. | Pause | Hinweis |
|-------|-------|------|-------|---------|
| ...   | ...   | ...  | ...   | ...     |

### Einheit B – [Bezeichnung]
...

---

## Woche 3–4: Progression

### Einheit A – [Bezeichnung]
...

---

## Progressionslogik
[Wie soll gesteigert werden?]

## Coaching-Hinweise
[Auf was soll der Trainer besonders achten? Motivationsansatz laut Persönlichkeitstyp?]

## Ernährungs-Empfehlungen (optional)
[Kurze Hinweise, keine detaillierte Diät]
\`\`\`

---

`;
}

/**
 * Generates a single Markdown export string for one client.
 */
export function generateExportMarkdown(data: ExportClientData, isDuo = false): string {
  return systemPrompt(isDuo) + buildClientBlock(data);
}

/**
 * Triggers a file download in the browser.
 */
function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30);
}

/**
 * Export for a single (non-duo) client.
 */
export function exportSingleClient(data: ExportClientData) {
  const md = generateExportMarkdown(data, false);
  const filename = `trainingsplan-prompt_${slugName(data.full_name)}_${new Date().toISOString().split('T')[0]}.md`;
  downloadFile(filename, md);
}

/**
 * Export for a duo session – downloads two separate files.
 */
export function exportDuoClients(dataA: ExportClientData, dataB: ExportClientData) {
  const date = new Date().toISOString().split('T')[0];

  [dataA, dataB].forEach((data) => {
    const md = generateExportMarkdown(data, true);
    const filename = `trainingsplan-prompt_${slugName(data.full_name)}_duo_${date}.md`;
    downloadFile(filename, md);
  });
}
