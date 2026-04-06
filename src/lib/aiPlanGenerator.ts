import { supabase } from '@/lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type MesocyclePhase =
  | 'accumulation'
  | 'intensification'
  | 'realization'
  | 'deload';

export type TrainingGoal =
  | 'hypertrophy'
  | 'fat_loss'
  | 'strength'
  | 'endurance'
  | 'mobility';

export type DifficultyLevel = 1 | 2 | 3;

export interface PlanOptions {
  sessionsPerWeek: number;
  weeksTotal: number;
  phase: MesocyclePhase;
  sessionDurationMinutes?: number;
  includeCardio?: boolean;
  isDuoTraining?: boolean;
  duoPartnerClientId?: string; // Client-ID des Partners – wird intern zu Alias
  coachInstructions?: string;  // Freitext vom Coach (wird sanitiert vor API-Call)
}

interface ExerciseRecord {
  id: string;
  name: string;
  name_de: string;
  exercise_type: string;
  movement_pattern: string;
  difficulty: number;
  technique_complexity: string;
  cns_demand: string;
  session_position: string;
  muscle_groups: string[];
  muscle_secondary: string[];
  goal_tags: string[];
  metabolic_demand: string;
  cardio_compatible: boolean;
  cardio_type: string | null;
  contraindications: string[];
  phase_suitability: string[];
}

interface AnonymizedClientContext {
  alias: string;
  goal: TrainingGoal[];
  goalText: string;
  maxDifficulty: DifficultyLevel;
  experienceLabel: string;
  gender: string | null;
  contraindications: string[];
  goalFreeText: string; // sanitierter fitness_goal_text
}

export interface GeneratedPlan {
  markdown: string;
  alias: string;
  clientId: string;
  exercisesUsed: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ALIAS-SYSTEM
// Deterministisch: gleiche UUID → gleicher Alias → kein State nötig
// Format: CLIENT_XXXXXXXX (8 Hex-Zeichen, uppercase)
// ─────────────────────────────────────────────────────────────────────────────

export function generateClientAlias(clientId: string): string {
  return `CLIENT_${clientId.replace(/-/g, '').substring(0, 8).toUpperCase()}`;
}

export function validateAlias(alias: string, clientId: string): boolean {
  return alias === generateClientAlias(clientId);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL / EXPERIENCE / CONTRAINDICATION MAPPING
// ─────────────────────────────────────────────────────────────────────────────

function mapGoalToTags(fitnessGoal: string | null): TrainingGoal[] {
  if (!fitnessGoal) return ['hypertrophy'];
  const g = fitnessGoal.toLowerCase();
  if (g.includes('abnehm') || g.includes('gewicht') || g.includes('fett') || g.includes('fat'))
    return ['fat_loss', 'hypertrophy'];
  if (g.includes('definition'))
    return ['hypertrophy', 'fat_loss'];
  if (g.includes('kraft') || g.includes('strength') || g.includes('stärke'))
    return ['strength', 'hypertrophy'];
  if (g.includes('ausdauer') || g.includes('endurance'))
    return ['endurance', 'fat_loss'];
  if (g.includes('muskel') || g.includes('aufbau') || g.includes('hyper'))
    return ['hypertrophy'];
  return ['hypertrophy'];
}

function mapExperienceToDifficulty(experience: string | null): DifficultyLevel {
  if (!experience) return 1;
  const e = experience.toLowerCase();
  if (
    e.includes('anf') || e.includes('keine erfahrung') ||
    e.includes('beginn') || e.includes('selten')
  ) return 1;
  if (
    e.includes('fortg') || e.includes('erfahren') ||
    e.includes('regelmäßig') || e.includes('mehrere jahre')
  ) return 2;
  if (
    e.includes('advanced') || e.includes('profi') ||
    e.includes('wettkampf') || e.includes('kompetitiv')
  ) return 3;
  return 1;
}

const EXPERIENCE_LABELS: Record<DifficultyLevel, string> = {
  1: 'Anfänger/in',
  2: 'Fortgeschrittene/r',
  3: 'Könner/in',
};

const GOAL_LABELS: Record<TrainingGoal, string> = {
  hypertrophy: 'Muskelaufbau',
  fat_loss: 'Fettabbau / Definition',
  strength: 'Maximalkraft',
  endurance: 'Ausdauer',
  mobility: 'Mobilität',
};

function extractContraindications(healthNotes: string | null): string[] {
  if (!healthNotes) return [];
  const text = healthNotes.toLowerCase();
  const map: Record<string, string> = {
    knie: 'knee', knee: 'knee',
    schulter: 'shoulder', shoulder: 'shoulder',
    rücken: 'lower_back', rücken: 'lower_back', 'lower back': 'lower_back',
    nacken: 'neck', neck: 'neck',
    handgelenk: 'wrist', wrist: 'wrist',
    hüfte: 'hip', hip: 'hip',
  };
  const result: string[] = [];
  for (const [keyword, tag] of Object.entries(map)) {
    if (text.includes(keyword) && !result.includes(tag)) result.push(tag);
  }
  return result;
}

/**
 * Entfernt PII aus Freitext: E-Mails, Telefonnummern, kürzt auf 300 Zeichen.
 */
function sanitizeFreeText(text: string | null): string {
  if (!text) return '';
  return text
    .replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, '[E-Mail]')
    .replace(/(\+?\d[\d\s\-().]{6,}\d)/g, '[Tel.]')
    .substring(0, 300)
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE FETCHING
// ─────────────────────────────────────────────────────────────────────────────

interface FetchExercisesOptions {
  goalTags: TrainingGoal[];
  maxDifficulty: DifficultyLevel;
  contraindications: string[];
  phase: MesocyclePhase;
  includeCardio?: boolean;
}

async function fetchFilteredExercises(
  opts: FetchExercisesOptions
): Promise<ExerciseRecord[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(`
      id, name, name_de, exercise_type, movement_pattern,
      difficulty, technique_complexity, cns_demand, session_position,
      muscle_groups, muscle_secondary, goal_tags, metabolic_demand,
      cardio_compatible, cardio_type, contraindications, phase_suitability
    `)
    .lte('difficulty', opts.maxDifficulty + 1) // +1 Puffer: etwas anspruchsvollere Übungen anbieten
    .eq('is_custom', false);

  if (error || !data) return [];

  return (data as ExerciseRecord[]).filter((ex) => {
    // Mobility immer einschließen
    if (ex.exercise_type === 'mobility') return true;

    // Cardio nur wenn explizit gewünscht
    if (ex.exercise_type === 'cardio' && !opts.includeCardio) return false;

    // Phasen-Check: Übung muss zur aktuellen Mesozyklusphase passen
    if (ex.phase_suitability?.length > 0 && !ex.phase_suitability.includes(opts.phase)) {
      return false;
    }

    // Kontraindikationen-Check: kein Overlap zwischen Übung und Kundenproblemen
    if (opts.contraindications.length > 0 && ex.contraindications?.length > 0) {
      const conflict = ex.contraindications.some((c) => opts.contraindications.includes(c));
      if (conflict) return false;
    }

    // Ziel-Matching: min. ein gemeinsamer Tag
    if (ex.goal_tags?.length > 0 && opts.goalTags.length > 0) {
      return ex.goal_tags.some((t) => opts.goalTags.includes(t as TrainingGoal));
    }

    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE LIBRARY → PROMPT CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  squat: 'Squat',
  lunge: 'Lunge',
  hinge: 'Hinge / Hüftstreckung',
  push_horizontal: 'Push horizontal (Drücken)',
  push_vertical: 'Push vertikal (Schulterdrücken)',
  pull_vertical: 'Pull vertikal (Ziehen)',
  pull_horizontal: 'Pull horizontal (Rudern)',
  core: 'Core / Rumpf',
  carry: 'Carry / Tragen',
  isolation: 'Isolation',
  compound: 'Compound / Plyometrik',
  cardio: 'Cardio',
  mobility: 'Mobility / Beweglichkeit',
};

function buildExerciseLibraryContext(exercises: ExerciseRecord[]): string {
  const groups: Record<string, ExerciseRecord[]> = {};
  for (const ex of exercises) {
    const pat = ex.movement_pattern || 'other';
    if (!groups[pat]) groups[pat] = [];
    groups[pat].push(ex);
  }

  let ctx = '## Verfügbare Übungsbibliothek\n';
  ctx += '> **Pflicht:** Nur diese Übungen verwenden. Exakter Name wie angegeben.\n';
  ctx += '> Format: `Name | Schwierigkeit | Technik | ZNS | Position | Muskeln`\n\n';

  const order = [
    'squat', 'lunge', 'hinge', 'push_horizontal', 'push_vertical',
    'pull_vertical', 'pull_horizontal', 'core', 'carry', 'isolation',
    'compound', 'cardio', 'mobility',
  ];

  for (const pat of order) {
    const exList = groups[pat];
    if (!exList?.length) continue;
    ctx += `### ${PATTERN_LABELS[pat] || pat}\n`;
    for (const ex of exList.sort((a, b) => a.difficulty - b.difficulty)) {
      const muscles = [
        ...(ex.muscle_groups ?? []),
        ...(ex.muscle_secondary ?? []),
      ].slice(0, 3).join(', ');
      const displayName = ex.name_de || ex.name;
      ctx += `- **${displayName}** | diff:${ex.difficulty} | ${ex.technique_complexity} | cns:${ex.cns_demand} | ${ex.session_position} | [${muscles}]\n`;
    }
    ctx += '\n';
  }

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANONYMIZED CLIENT CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

function buildAnonymizedClientContext(
  client: Record<string, any>,
  options: PlanOptions
): AnonymizedClientContext {
  const goal = mapGoalToTags(client.fitness_goal);
  const maxDifficulty = mapExperienceToDifficulty(client.training_experience);
  const contraindications = extractContraindications(client.health_notes);

  return {
    alias: generateClientAlias(client.id),
    goal,
    goalText: goal.map((g) => GOAL_LABELS[g]).join(' + '),
    maxDifficulty,
    experienceLabel: EXPERIENCE_LABELS[maxDifficulty],
    gender: client.gender ?? null,
    contraindications,
    goalFreeText: sanitizeFreeText(client.fitness_goal_text),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<MesocyclePhase, string> = {
  accumulation: 'Akkumulation – hohes Volumen, moderate Intensität (60–75 % 1RM / RPE 6–7)',
  intensification: 'Intensivierung – mittleres Volumen, hohe Intensität (75–87 % 1RM / RPE 7–9)',
  realization: 'Realisierung / Peak – geringes Volumen, maximale Intensität (87–95 % 1RM / RPE 9–10)',
  deload: 'Deload – deutlich reduziertes Volumen & Intensität, aktive Erholung',
};

function buildAIPlanPrompt(
  ctx: AnonymizedClientContext,
  exerciseLib: string,
  options: PlanOptions
): string {
  const duoPartnerAlias = options.duoPartnerClientId
    ? generateClientAlias(options.duoPartnerClientId)
    : null;

  const genderNote =
    ctx.gender === 'female'
      ? '\n- **Zyklusphase:** Kraftfokus in Follikelphase bevorzugen; etwas weniger Volumen in Lutealphase.'
      : '';

  const duoNote = options.isDuoTraining
    ? `\n- **Duo-Training:** Plan gilt gleichzeitig für beide. ${duoPartnerAlias ? `Partner-Alias: ${duoPartnerAlias}.` : ''} Equipment-Konflikte vermeiden.`
    : '';

  const coachNote = options.coachInstructions
    ? `\n- **Coach-Hinweise:** ${sanitizeFreeText(options.coachInstructions)}`
    : '';

  const contraNote =
    ctx.contraindications.length > 0
      ? ctx.contraindications.join(', ')
      : 'keine bekannt';

  return `Du bist erfahrener Personal Trainer und erstellst einen strukturierten Trainingsplan im CoachHub-Format.

---

## REGELN (unbedingt einhalten)
1. Verwende **ausschließlich** Übungen aus der unten stehenden Bibliothek – exakter Name wie angegeben.
2. Schreibe **keine Klarnamen**. Die Kundin/der Kunde wird ausschließlich als Alias referenziert.
3. Füge im Plan-Header die Zeile \`CLIENT_ID: ${ctx.alias}\` ein – exakt so.
4. Halte das Markdown-Ausgabeformat strikt ein (wird automatisch importiert).
5. Wähle Übungen passend zur **aktuellen Mesozyklusphase** (siehe unten).
6. Beachte **Kontraindikationen** – keine Übungen, die diese Körperstellen belasten.

---

## KUNDEN-PROFIL (anonymisiert)
- Alias: \`${ctx.alias}\`
- Ziel: ${ctx.goalText}
- Erfahrungslevel: ${ctx.experienceLabel}
- Kontraindikationen: ${contraNote}${ctx.goalFreeText ? `\n- Zusatzinfo: ${ctx.goalFreeText}` : ''}${genderNote}${duoNote}${coachNote}

## PLAN-PARAMETER
- Sessions/Woche: ${options.sessionsPerWeek}
- Gesamtdauer: ${options.weeksTotal} Wochen${options.sessionDurationMinutes ? `\n- Session-Dauer: ca. ${options.sessionDurationMinutes} Min.` : ''}
- Phase: ${PHASE_LABELS[options.phase]}

---

${exerciseLib}

---

## AUSGABE-FORMAT (strikt einhalten – kein Abweichen)

\`\`\`markdown
# Trainingsplan
CLIENT_ID: ${ctx.alias}
Ziel: ${ctx.goalText}
Phase: ${options.phase}
Dauer: ${options.weeksTotal} Wochen | ${options.sessionsPerWeek}x/Woche

---

## Session A – [Fokus, z.B. Unterkörper Push]

### Aufwärmen
- [Mobility-/Core-Übung aus Bibliothek] | 2 × 10 Wdh. | kein Gewicht

### Hauptteil
1. **[Übungsname]** | [X] × [Y–Z] Wdh. | [RPE X oder % 1RM] | Pause: [X s]
2. **[Übungsname]** | ...
(min. 4, max. 7 Hauptübungen)

### Finisher (optional, bei fat_loss / endurance)
- [Übung] | [Parameter]

---

## Session B – [Fokus]
...
\`\`\`

Erstelle jetzt den vollständigen Plan für **alle ${options.sessionsPerWeek} Sessions**.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT – generateAIPlan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️  SICHERHEITSHINWEIS:
 * Der Anthropic-API-Key darf NICHT client-seitig exponiert werden.
 * Für Production: diesen Call in eine Vercel Serverless Function oder
 * Supabase Edge Function auslagern und den Key als Server-Env-Variable führen.
 *
 * Für die Entwicklungsphase kann VITE_ANTHROPIC_API_KEY genutzt werden –
 * aber niemals in ein öffentlich zugängliches Deployment deployen.
 */
export async function generateAIPlan(
  client: Record<string, any>,
  options: PlanOptions
): Promise<GeneratedPlan> {
  // 1. Kundenprofil anonymisieren
  const ctx = buildAnonymizedClientContext(client, options);

  // 2. Gefilterte Übungsbibliothek aus Supabase laden
  const exercises = await fetchFilteredExercises({
    goalTags: ctx.goal,
    maxDifficulty: ctx.maxDifficulty,
    contraindications: ctx.contraindications,
    phase: options.phase,
    includeCardio: options.includeCardio,
  });

  if (exercises.length < 5) {
    throw new Error(
      `Zu wenige passende Übungen (${exercises.length}) gefunden. ` +
      'Bitte Kundenprofil oder Kontraindikationen prüfen.'
    );
  }

  // 3. Prompt bauen
  const exerciseLib = buildExerciseLibraryContext(exercises);
  const prompt = buildAIPlanPrompt(ctx, exerciseLib, options);

  // 4. Anthropic API Call
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY nicht gesetzt.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',  // Opus für maximale Plan-Qualität; Sonnet für Kostensparung
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API Fehler ${response.status}: ${err}`);
  }

  const data = await response.json();
  const markdown: string = data.content?.[0]?.text ?? '';

  if (!markdown) throw new Error('Leere Antwort von der AI erhalten.');

  // 5. Verwendete Übungen für Logging/Audit erfassen
  const exercisesUsed = exercises
    .map((ex) => ex.name_de || ex.name)
    .filter((name) => markdown.includes(name));

  return {
    markdown,
    alias: ctx.alias,
    clientId: client.id,
    exercisesUsed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT HELPERS
// Werden von der ClientDetailPage beim Plan-Import genutzt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liest den Client-Alias aus einem importierten Markdown-Plan.
 * Sucht nach der Zeile: CLIENT_ID: CLIENT_XXXXXXXX
 */
export function extractAliasFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/CLIENT_ID:\s*(CLIENT_[A-F0-9]{8})/);
  return match?.[1] ?? null;
}

/**
 * Prüft beim Import, ob der Plan zur geöffneten Kundin/zum geöffneten Kunden gehört.
 * Gibt false zurück wenn kein Alias im Markdown oder Alias stimmt nicht.
 *
 * Verwendung in ClientDetailPage:
 *   if (!verifyPlanOwnership(pastedMarkdown, client.id)) {
 *     alert('Dieser Plan gehört nicht zu diesem Kunden.');
 *     return;
 *   }
 */
export function verifyPlanOwnership(markdown: string, clientId: string): boolean {
  const alias = extractAliasFromMarkdown(markdown);
  if (!alias) return false;
  return validateAlias(alias, clientId);
}  exercise_type: string;
  movement_pattern: string;
  difficulty: number;
  technique_complexity: string;
  cns_demand: string;
  session_position: string;
  muscle_groups: string[];
  muscle_secondary: string[];
  goal_tags: string[];
  metabolic_demand: string;
  cardio_compatible: boolean;
  cardio_type: string | null;
  contraindications: string[];
  phase_suitability: string[];
}

interface AnonymizedClientContext {
  alias: string;
  goal: TrainingGoal[];
  goalText: string;
  maxDifficulty: DifficultyLevel;
  experienceLabel: string;
  gender: string | null;
  contraindications: string[];
  goalFreeText: string; // sanitierter fitness_goal_text
}

export interface GeneratedPlan {
  markdown: string;
  alias: string;
  clientId: string;
  exercisesUsed: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ALIAS-SYSTEM
// Deterministisch: gleiche UUID → gleicher Alias → kein State nötig
// Format: CLIENT_XXXXXXXX (8 Hex-Zeichen, uppercase)
// ─────────────────────────────────────────────────────────────────────────────

export function generateClientAlias(clientId: string): string {
  return `CLIENT_${clientId.replace(/-/g, '').substring(0, 8).toUpperCase()}`;
}

export function validateAlias(alias: string, clientId: string): boolean {
  return alias === generateClientAlias(clientId);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL / EXPERIENCE / CONTRAINDICATION MAPPING
// ─────────────────────────────────────────────────────────────────────────────

function mapGoalToTags(fitnessGoal: string | null): TrainingGoal[] {
  if (!fitnessGoal) return ['hypertrophy'];
  const g = fitnessGoal.toLowerCase();
  if (g.includes('abnehm') || g.includes('gewicht') || g.includes('fett') || g.includes('fat'))
    return ['fat_loss', 'hypertrophy'];
  if (g.includes('definition'))
    return ['hypertrophy', 'fat_loss'];
  if (g.includes('kraft') || g.includes('strength') || g.includes('stärke'))
    return ['strength', 'hypertrophy'];
  if (g.includes('ausdauer') || g.includes('endurance'))
    return ['endurance', 'fat_loss'];
  if (g.includes('muskel') || g.includes('aufbau') || g.includes('hyper'))
    return ['hypertrophy'];
  return ['hypertrophy'];
}

function mapExperienceToDifficulty(experience: string | null): DifficultyLevel {
  if (!experience) return 1;
  const e = experience.toLowerCase();
  if (
    e.includes('anf') || e.includes('keine erfahrung') ||
    e.includes('beginn') || e.includes('selten')
  ) return 1;
  if (
    e.includes('fortg') || e.includes('erfahren') ||
    e.includes('regelmäßig') || e.includes('mehrere jahre')
  ) return 2;
  if (
    e.includes('advanced') || e.includes('profi') ||
    e.includes('wettkampf') || e.includes('kompetitiv')
  ) return 3;
  return 1;
}

const EXPERIENCE_LABELS: Record<DifficultyLevel, string> = {
  1: 'Anfänger/in',
  2: 'Fortgeschrittene/r',
  3: 'Könner/in',
};

const GOAL_LABELS: Record<TrainingGoal, string> = {
  hypertrophy: 'Muskelaufbau',
  fat_loss: 'Fettabbau / Definition',
  strength: 'Maximalkraft',
  endurance: 'Ausdauer',
  mobility: 'Mobilität',
};

function extractContraindications(healthNotes: string | null): string[] {
  if (!healthNotes) return [];
  const text = healthNotes.toLowerCase();
  const map: Record<string, string> = {
    knie: 'knee', knee: 'knee',
    schulter: 'shoulder', shoulder: 'shoulder',
    rücken: 'lower_back', rücken: 'lower_back', 'lower back': 'lower_back',
    nacken: 'neck', neck: 'neck',
    handgelenk: 'wrist', wrist: 'wrist',
    hüfte: 'hip', hip: 'hip',
  };
  const result: string[] = [];
  for (const [keyword, tag] of Object.entries(map)) {
    if (text.includes(keyword) && !result.includes(tag)) result.push(tag);
  }
  return result;
}

/**
 * Entfernt PII aus Freitext: E-Mails, Telefonnummern, kürzt auf 300 Zeichen.
 */
function sanitizeFreeText(text: string | null): string {
  if (!text) return '';
  return text
    .replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, '[E-Mail]')
    .replace(/(\+?\d[\d\s\-().]{6,}\d)/g, '[Tel.]')
    .substring(0, 300)
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE FETCHING
// ─────────────────────────────────────────────────────────────────────────────

interface FetchExercisesOptions {
  goalTags: TrainingGoal[];
  maxDifficulty: DifficultyLevel;
  contraindications: string[];
  phase: MesocyclePhase;
  includeCardio?: boolean;
}

async function fetchFilteredExercises(
  opts: FetchExercisesOptions
): Promise<ExerciseRecord[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select(`
      id, name, name_de, exercise_type, movement_pattern,
      difficulty, technique_complexity, cns_demand, session_position,
      muscle_groups, muscle_secondary, goal_tags, metabolic_demand,
      cardio_compatible, cardio_type, contraindications, phase_suitability
    `)
    .lte('difficulty', opts.maxDifficulty + 1) // +1 Puffer: etwas anspruchsvollere Übungen anbieten
    .eq('is_custom', false);

  if (error || !data) return [];

  return (data as ExerciseRecord[]).filter((ex) => {
    // Mobility immer einschließen
    if (ex.exercise_type === 'mobility') return true;

    // Cardio nur wenn explizit gewünscht
    if (ex.exercise_type === 'cardio' && !opts.includeCardio) return false;

    // Phasen-Check: Übung muss zur aktuellen Mesozyklusphase passen
    if (ex.phase_suitability?.length > 0 && !ex.phase_suitability.includes(opts.phase)) {
      return false;
    }

    // Kontraindikationen-Check: kein Overlap zwischen Übung und Kundenproblemen
    if (opts.contraindications.length > 0 && ex.contraindications?.length > 0) {
      const conflict = ex.contraindications.some((c) => opts.contraindications.includes(c));
      if (conflict) return false;
    }

    // Ziel-Matching: min. ein gemeinsamer Tag
    if (ex.goal_tags?.length > 0 && opts.goalTags.length > 0) {
      return ex.goal_tags.some((t) => opts.goalTags.includes(t as TrainingGoal));
    }

    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXERCISE LIBRARY → PROMPT CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  squat: 'Squat',
  lunge: 'Lunge',
  hinge: 'Hinge / Hüftstreckung',
  push_horizontal: 'Push horizontal (Drücken)',
  push_vertical: 'Push vertikal (Schulterdrücken)',
  pull_vertical: 'Pull vertikal (Ziehen)',
  pull_horizontal: 'Pull horizontal (Rudern)',
  core: 'Core / Rumpf',
  carry: 'Carry / Tragen',
  isolation: 'Isolation',
  compound: 'Compound / Plyometrik',
  cardio: 'Cardio',
  mobility: 'Mobility / Beweglichkeit',
};

function buildExerciseLibraryContext(exercises: ExerciseRecord[]): string {
  const groups: Record<string, ExerciseRecord[]> = {};
  for (const ex of exercises) {
    const pat = ex.movement_pattern || 'other';
    if (!groups[pat]) groups[pat] = [];
    groups[pat].push(ex);
  }

  let ctx = '## Verfügbare Übungsbibliothek\n';
  ctx += '> **Pflicht:** Nur diese Übungen verwenden. Exakter Name wie angegeben.\n';
  ctx += '> Format: `Name | Schwierigkeit | Technik | ZNS | Position | Muskeln`\n\n';

  const order = [
    'squat', 'lunge', 'hinge', 'push_horizontal', 'push_vertical',
    'pull_vertical', 'pull_horizontal', 'core', 'carry', 'isolation',
    'compound', 'cardio', 'mobility',
  ];

  for (const pat of order) {
    const exList = groups[pat];
    if (!exList?.length) continue;
    ctx += `### ${PATTERN_LABELS[pat] || pat}\n`;
    for (const ex of exList.sort((a, b) => a.difficulty - b.difficulty)) {
      const muscles = [
        ...(ex.muscle_groups ?? []),
        ...(ex.muscle_secondary ?? []),
      ].slice(0, 3).join(', ');
      const displayName = ex.name_de || ex.name;
      ctx += `- **${displayName}** | diff:${ex.difficulty} | ${ex.technique_complexity} | cns:${ex.cns_demand} | ${ex.session_position} | [${muscles}]\n`;
    }
    ctx += '\n';
  }

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANONYMIZED CLIENT CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

function buildAnonymizedClientContext(
  client: Record<string, any>,
  options: PlanOptions
): AnonymizedClientContext {
  const goal = mapGoalToTags(client.fitness_goal);
  const maxDifficulty = mapExperienceToDifficulty(client.training_experience);
  const contraindications = extractContraindications(client.health_notes);

  return {
    alias: generateClientAlias(client.id),
    goal,
    goalText: goal.map((g) => GOAL_LABELS[g]).join(' + '),
    maxDifficulty,
    experienceLabel: EXPERIENCE_LABELS[maxDifficulty],
    gender: client.gender ?? null,
    contraindications,
    goalFreeText: sanitizeFreeText(client.fitness_goal_text),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<MesocyclePhase, string> = {
  accumulation: 'Akkumulation – hohes Volumen, moderate Intensität (60–75 % 1RM / RPE 6–7)',
  intensification: 'Intensivierung – mittleres Volumen, hohe Intensität (75–87 % 1RM / RPE 7–9)',
  realization: 'Realisierung / Peak – geringes Volumen, maximale Intensität (87–95 % 1RM / RPE 9–10)',
  deload: 'Deload – deutlich reduziertes Volumen & Intensität, aktive Erholung',
};

function buildAIPlanPrompt(
  ctx: AnonymizedClientContext,
  exerciseLib: string,
  options: PlanOptions
): string {
  const duoPartnerAlias = options.duoPartnerClientId
    ? generateClientAlias(options.duoPartnerClientId)
    : null;

  const genderNote =
    ctx.gender === 'female'
      ? '\n- **Zyklusphase:** Kraftfokus in Follikelphase bevorzugen; etwas weniger Volumen in Lutealphase.'
      : '';

  const duoNote = options.isDuoTraining
    ? `\n- **Duo-Training:** Plan gilt gleichzeitig für beide. ${duoPartnerAlias ? `Partner-Alias: ${duoPartnerAlias}.` : ''} Equipment-Konflikte vermeiden.`
    : '';

  const coachNote = options.coachInstructions
    ? `\n- **Coach-Hinweise:** ${sanitizeFreeText(options.coachInstructions)}`
    : '';

  const contraNote =
    ctx.contraindications.length > 0
      ? ctx.contraindications.join(', ')
      : 'keine bekannt';

  return `Du bist erfahrener Personal Trainer und erstellst einen strukturierten Trainingsplan im CoachHub-Format.

---

## REGELN (unbedingt einhalten)
1. Verwende **ausschließlich** Übungen aus der unten stehenden Bibliothek – exakter Name wie angegeben.
2. Schreibe **keine Klarnamen**. Die Kundin/der Kunde wird ausschließlich als Alias referenziert.
3. Füge im Plan-Header die Zeile \`CLIENT_ID: ${ctx.alias}\` ein – exakt so.
4. Halte das Markdown-Ausgabeformat strikt ein (wird automatisch importiert).
5. Wähle Übungen passend zur **aktuellen Mesozyklusphase** (siehe unten).
6. Beachte **Kontraindikationen** – keine Übungen, die diese Körperstellen belasten.

---

## KUNDEN-PROFIL (anonymisiert)
- Alias: \`${ctx.alias}\`
- Ziel: ${ctx.goalText}
- Erfahrungslevel: ${ctx.experienceLabel}
- Kontraindikationen: ${contraNote}${ctx.goalFreeText ? `\n- Zusatzinfo: ${ctx.goalFreeText}` : ''}${genderNote}${duoNote}${coachNote}

## PLAN-PARAMETER
- Sessions/Woche: ${options.sessionsPerWeek}
- Gesamtdauer: ${options.weeksTotal} Wochen${options.sessionDurationMinutes ? `\n- Session-Dauer: ca. ${options.sessionDurationMinutes} Min.` : ''}
- Phase: ${PHASE_LABELS[options.phase]}

---

${exerciseLib}

---

## AUSGABE-FORMAT (strikt einhalten – kein Abweichen)

\`\`\`markdown
# Trainingsplan
CLIENT_ID: ${ctx.alias}
Ziel: ${ctx.goalText}
Phase: ${options.phase}
Dauer: ${options.weeksTotal} Wochen | ${options.sessionsPerWeek}x/Woche

---

## Session A – [Fokus, z.B. Unterkörper Push]

### Aufwärmen
- [Mobility-/Core-Übung aus Bibliothek] | 2 × 10 Wdh. | kein Gewicht

### Hauptteil
1. **[Übungsname]** | [X] × [Y–Z] Wdh. | [RPE X oder % 1RM] | Pause: [X s]
2. **[Übungsname]** | ...
(min. 4, max. 7 Hauptübungen)

### Finisher (optional, bei fat_loss / endurance)
- [Übung] | [Parameter]

---

## Session B – [Fokus]
...
\`\`\`

Erstelle jetzt den vollständigen Plan für **alle ${options.sessionsPerWeek} Sessions**.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT – generateAIPlan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️  SICHERHEITSHINWEIS:
 * Der Anthropic-API-Key darf NICHT client-seitig exponiert werden.
 * Für Production: diesen Call in eine Vercel Serverless Function oder
 * Supabase Edge Function auslagern und den Key als Server-Env-Variable führen.
 *
 * Für die Entwicklungsphase kann VITE_ANTHROPIC_API_KEY genutzt werden –
 * aber niemals in ein öffentlich zugängliches Deployment deployen.
 */
export async function generateAIPlan(
  client: Record<string, any>,
  options: PlanOptions
): Promise<GeneratedPlan> {
  // 1. Kundenprofil anonymisieren
  const ctx = buildAnonymizedClientContext(client, options);

  // 2. Gefilterte Übungsbibliothek aus Supabase laden
  const exercises = await fetchFilteredExercises({
    goalTags: ctx.goal,
    maxDifficulty: ctx.maxDifficulty,
    contraindications: ctx.contraindications,
    phase: options.phase,
    includeCardio: options.includeCardio,
  });

  if (exercises.length < 5) {
    throw new Error(
      `Zu wenige passende Übungen (${exercises.length}) gefunden. ` +
      'Bitte Kundenprofil oder Kontraindikationen prüfen.'
    );
  }

  // 3. Prompt bauen
  const exerciseLib = buildExerciseLibraryContext(exercises);
  const prompt = buildAIPlanPrompt(ctx, exerciseLib, options);

  // 4. Anthropic API Call
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY nicht gesetzt.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',  // Opus für maximale Plan-Qualität; Sonnet für Kostensparung
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API Fehler ${response.status}: ${err}`);
  }

  const data = await response.json();
  const markdown: string = data.content?.[0]?.text ?? '';

  if (!markdown) throw new Error('Leere Antwort von der AI erhalten.');

  // 5. Verwendete Übungen für Logging/Audit erfassen
  const exercisesUsed = exercises
    .map((ex) => ex.name_de || ex.name)
    .filter((name) => markdown.includes(name));

  return {
    markdown,
    alias: ctx.alias,
    clientId: client.id,
    exercisesUsed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT HELPERS
// Werden von der ClientDetailPage beim Plan-Import genutzt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Liest den Client-Alias aus einem importierten Markdown-Plan.
 * Sucht nach der Zeile: CLIENT_ID: CLIENT_XXXXXXXX
 */
export function extractAliasFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/CLIENT_ID:\s*(CLIENT_[A-F0-9]{8})/);
  return match?.[1] ?? null;
}

/**
 * Prüft beim Import, ob der Plan zur geöffneten Kundin/zum geöffneten Kunden gehört.
 * Gibt false zurück wenn kein Alias im Markdown oder Alias stimmt nicht.
 *
 * Verwendung in ClientDetailPage:
 *   if (!verifyPlanOwnership(pastedMarkdown, client.id)) {
 *     alert('Dieser Plan gehört nicht zu diesem Kunden.');
 *     return;
 *   }
 */
export function verifyPlanOwnership(markdown: string, clientId: string): boolean {
  const alias = extractAliasFromMarkdown(markdown);
  if (!alias) return false;
  return validateAlias(alias, clientId);
}
