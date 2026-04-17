/**
 * aiPlanGenerator.ts
 *
 * Generiert optimierte Prompts für Claude basierend auf Kundendaten.
 * Die API-Kommunikation erfolgt direkt im AIBuilderDialog.
 *
 * Schritt 3: Übungsbibliothek wird jetzt gefiltert und strukturiert
 * an den Prompt übergeben – nach Kundenziel, Phase, Kontraindikationen
 * und Schwierigkeitsgrad.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface ClientData {
  full_name: string;
  date_of_birth?: string | null;
  fitness_goal?: string | null;
  fitness_goal_text?: string | null;
  training_experience?: string | null;
  health_notes?: string | null;
}

interface ConversationData {
  motivation?: string | null;
  previous_experience?: string | null;
  stress_level?: string | null;
  sleep_quality?: string | null;
  daily_activity?: string | null;
  current_training?: string | null;
  goal_importance?: string | null;
  success_criteria?: string | null;
  personality_type?: string | null;
}

interface HealthData {
  cardiovascular?: string | null;
  musculoskeletal?: string | null;
  surgeries?: string | null;
  sports_injuries?: string | null;
  current_pain?: string | null;
}

interface AssessmentData {
  squat_score?: number;
  hinge_score?: number;
  push_score?: number;
  pull_score?: number;
  rotation_score?: number;
  stability_score?: number;
  strengths?: string;
  focus_points?: string;
}

interface EquipmentItem {
  name_de: string;
  location: 'home' | 'gym' | 'both';
}

/** Übung mit allen Metadaten aus der Datenbank */
interface ExerciseWithMeta {
  id: string;
  name: string;
  name_de: string;
  movement_pattern: string;
  difficulty: number;
  technique_complexity: string;
  cns_demand: string;
  session_position: string;
  muscle_groups: string[];
  goal_tags: string[];
  phase_suitability: string[];
  contraindications: string[];
  metabolic_demand: string;
  cardio_compatible: boolean;
  is_timed: boolean;
}

export type MesocyclePhase = 'accumulation' | 'intensification' | 'realization' | 'deload';

export interface PlanConfig {
  weeks: number;
  sessionsPerWeek: number;
  includeDeload: boolean;
  focus?: string;
  /** Mesozyklusphase – beeinflusst Übungsauswahl */
  phase?: MesocyclePhase;
  /** Cardio-Übungen einschließen */
  includeCardio?: boolean;
}

// ─── Mapping-Hilfsfunktionen ──────────────────────────────────────────────────

function goalToTags(fitnessGoal: string | null | undefined): string[] {
  if (!fitnessGoal) return ['hypertrophy'];
  const g = fitnessGoal.toLowerCase();
  if (g.includes('abnehm') || g.includes('gewicht') || g.includes('fett')) return ['fat_loss', 'hypertrophy'];
  if (g.includes('definition')) return ['hypertrophy', 'fat_loss'];
  if (g.includes('kraft') || g.includes('strength')) return ['strength', 'hypertrophy'];
  if (g.includes('ausdauer') || g.includes('endurance')) return ['endurance', 'fat_loss'];
  if (g.includes('muskel') || g.includes('aufbau') || g.includes('hyper')) return ['hypertrophy'];
  return ['hypertrophy'];
}

function experienceToMaxDifficulty(experience: string | null | undefined): number {
  if (!experience) return 2;
  const e = experience.toLowerCase();
  if (e.includes('anf') || e.includes('keine') || e.includes('beginn') || e.includes('selten')) return 1;
  if (e.includes('fortg') || e.includes('erfahren') || e.includes('regelmäßig')) return 2;
  if (e.includes('advanced') || e.includes('profi') || e.includes('wettkampf')) return 3;
  return 2;
}

function extractContraindications(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.toLowerCase();
  const result: string[] = [];
  if (t.includes('knie') || t.includes('knee')) result.push('knee');
  if (t.includes('schulter') || t.includes('shoulder')) result.push('shoulder');
  if (t.includes('rücken') || t.includes('lower back') || t.includes('wirbel')) result.push('lower_back');
  if (t.includes('nacken') || t.includes('neck')) result.push('neck');
  if (t.includes('handgelenk') || t.includes('wrist')) result.push('wrist');
  if (t.includes('hüfte') || t.includes('hip')) result.push('hip');
  return [...new Set(result)];
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  squat:           'Squat / Kniebeuge',
  lunge:           'Lunge / Ausfallschritt',
  hinge:           'Hinge / Hüftstreckung',
  push_horizontal: 'Push horizontal (Brust/Trizeps)',
  push_vertical:   'Push vertikal (Schultern)',
  pull_vertical:   'Pull vertikal (Klimmzug/Latzug)',
  pull_horizontal: 'Pull horizontal (Rudern)',
  core:            'Core / Rumpfstabilität',
  carry:           'Carry / Tragen',
  isolation:       'Isolation',
  cardio:          'Cardio',
  mobility:        'Mobility / Beweglichkeit',
};

const PHASE_LABELS: Record<string, string> = {
  accumulation:    'Akkumulation (hohes Volumen, 60–75% 1RM, RPE 6–7)',
  intensification: 'Intensivierung (mittleres Volumen, 75–87% 1RM, RPE 7–9)',
  realization:     'Realisierung / Peak (geringes Volumen, 87–95% 1RM, RPE 9–10)',
  deload:          'Deload (50–60% Intensität, aktive Erholung)',
};

const personalityDescriptions: Record<string, string> = {
  success_oriented:   'Erfolgsorientiert: Liebt Herausforderungen, ist ehrgeizig. Setze anspruchsvolle Ziele.',
  avoidance_oriented: 'Sicherheitsorientiert: Braucht klare Struktur. Setze realistische Ziele.',
  unclear:            'Noch unklar.',
};

// ─── Daten laden ──────────────────────────────────────────────────────────────

export async function loadClientDataForPrompt(
  clientId: string,
  config?: Partial<PlanConfig>
): Promise<{
  client: ClientData | null;
  conversation: ConversationData | null;
  health: HealthData | null;
  assessment: AssessmentData | null;
  equipment: EquipmentItem[];
  exercises: string[];
  filteredExercises: ExerciseWithMeta[];
  progression: Map<string, { sessionCount: number; unlocked: boolean }>;
}> {
  const { data: clientData } = await supabase
    .from('clients')
    .select('full_name, date_of_birth, fitness_goal, fitness_goal_text, training_experience, health_notes')
    .eq('id', clientId)
    .single();

  const { data: convData } = await supabase
    .from('onboarding_conversations')
    .select('*')
    .eq('client_id', clientId)
    .order('conversation_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: healthData } = await supabase
    .from('health_records')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: assessmentData } = await supabase
    .from('assessments')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: equipmentData } = await supabase
    .from('client_equipment')
    .select('equipment_id, location, equipment_catalog(name_de)')
    .eq('client_id', clientId);

  const equipment: EquipmentItem[] = (equipmentData || []).map((e: any) => ({
    name_de: e.equipment_catalog?.name_de || 'Unbekannt',
    location: e.location,
  }));

  // Übungen mit allen Metadaten
  const { data: exerciseData } = await supabase
    .from('exercises')
    .select(`
      id, name, name_de, movement_pattern, difficulty, technique_complexity,
      cns_demand, session_position, muscle_groups, goal_tags,
      phase_suitability, contraindications, metabolic_demand,
      cardio_compatible, is_timed
    `)
    .order('movement_pattern')
    .order('difficulty');

  const allExercises: ExerciseWithMeta[] = (exerciseData || []).map((e: any) => ({
    id:                   e.id,
    name:                 e.name,
    name_de:              e.name_de || e.name,
    movement_pattern:     e.movement_pattern || 'other',
    difficulty:           e.difficulty || 1,
    technique_complexity: e.technique_complexity || 'simple',
    cns_demand:           e.cns_demand || 'low',
    session_position:     e.session_position || 'main',
    muscle_groups:        e.muscle_groups || [],
    goal_tags:            e.goal_tags || [],
    phase_suitability:    e.phase_suitability || [],
    contraindications:    e.contraindications || [],
    metabolic_demand:     e.metabolic_demand || 'medium',
    cardio_compatible:    e.cardio_compatible || false,
    is_timed:             e.is_timed || false,
  }));

  // Filter aufbauen
  const goalTags   = goalToTags(clientData?.fitness_goal_text || clientData?.fitness_goal);
  const maxDiff    = experienceToMaxDifficulty(
    clientData?.training_experience || convData?.previous_experience
  );
  const contraList = extractContraindications(
    [clientData?.health_notes, healthData?.musculoskeletal, healthData?.current_pain, healthData?.sports_injuries]
      .filter(Boolean).join(' ')
  );
  const phase      = config?.phase || 'accumulation';
  const inclCardio = config?.includeCardio ?? false;

  const filtered = allExercises.filter(ex => {
    if (ex.movement_pattern === 'mobility') return true;
    if (ex.movement_pattern === 'cardio' && !inclCardio) return false;
    if (ex.difficulty > maxDiff + 1) return false;
    if (ex.phase_suitability.length > 0 && !ex.phase_suitability.includes(phase)) return false;
    if (contraList.length > 0 && ex.contraindications.some(c => contraList.includes(c))) return false;
    if (ex.goal_tags.length > 0) return ex.goal_tags.some(t => goalTags.includes(t));
    return true;
  });

  const exercises = filtered.map(e => e.name_de);

  // Progressionsdaten laden
  const { data: progressionData } = await supabase
    .from('client_exercise_progression')
    .select('exercise_id, session_count, progression_unlocked')
    .eq('client_id', clientId);

  const progression = new Map<string, { sessionCount: number; unlocked: boolean }>();
  (progressionData || []).forEach((p: any) => {
    progression.set(p.exercise_id, {
      sessionCount: p.session_count,
      unlocked:     p.progression_unlocked,
    });
  });

  return { client: clientData, conversation: convData, health: healthData, assessment: assessmentData, equipment, exercises, filteredExercises: filtered, progression };
}

// ─── Übungsbibliothek-Abschnitt ───────────────────────────────────────────────

function buildExerciseLibrarySection(
  exercises: ExerciseWithMeta[],
  progression?: Map<string, { sessionCount: number; unlocked: boolean }>
): string {
  if (exercises.length === 0) return '';

  const groups: Record<string, ExerciseWithMeta[]> = {};
  for (const ex of exercises) {
    const p = ex.movement_pattern || 'other';
    if (!groups[p]) groups[p] = [];
    groups[p].push(ex);
  }

  const ORDER = [
    'squat','lunge','hinge',
    'push_horizontal','push_vertical',
    'pull_vertical','pull_horizontal',
    'core','carry','isolation','cardio','mobility',
  ];

  let section = '## Verfügbare Übungsbibliothek\n';
  section += '> **Pflicht:** Nur diese Übungen verwenden. Exakter Name wie angegeben.\n';
  section += '> Format: `Name | Schwierigkeit★ | Technik | Position | Primärmuskeln`\n\n';

  for (const pattern of ORDER) {
    const list = groups[pattern];
    if (!list?.length) continue;

    section += `### ${PATTERN_LABELS[pattern] || pattern}\n`;
    list.sort((a, b) => a.difficulty - b.difficulty);

    for (const ex of list) {
      const stars   = '★'.repeat(ex.difficulty) + '☆'.repeat(3 - ex.difficulty);
      const muscles = ex.muscle_groups.slice(0, 2).join(', ') || '—';
      const timed   = ex.is_timed ? ' ⏱' : '';
      // Progressionssignal: wie oft schon trainiert, Progression bereit?
      const prog    = progression?.get(ex.id);
      let progTag   = '';
      if (prog) {
        if (prog.unlocked) progTag = ' 🔼';
        else progTag = ' (' + prog.sessionCount + '×)';
      }
      section += '- **' + ex.name_de + '**' + timed + progTag + ' | ' + stars + ' | ' + ex.technique_complexity + ' | ' + ex.session_position + ' | ' + muscles + '\n';
    }
    section += '\n';
  }

  return section;
}

// ─── System-Prompt ────────────────────────────────────────────────────────────

export function generateSystemPrompt(
  data: Awaited<ReturnType<typeof loadClientDataForPrompt>>,
  config: PlanConfig
): string {
  const { client, conversation, health, assessment, equipment, filteredExercises } = data;
  if (!client) return '';

  const gymEquipment = equipment.filter(e => e.location === 'gym' || e.location === 'both').map(e => e.name_de);
  const phase        = config.phase || 'accumulation';
  const phaseLabel   = PHASE_LABELS[phase] || phase;

  let context = `Du bist ein erfahrener Personal Trainer. Erstelle einen **${config.weeks}-Wochen-Trainingsplan**.

## Kundenprofil
- Alter: ${calculateAge(client.date_of_birth)}
- Ziel: ${client.fitness_goal_text || client.fitness_goal || 'Allgemeine Fitness'}
- Trainingstage/Woche: ${config.sessionsPerWeek}
- Mesozyklusphase: **${phaseLabel}**
${config.focus ? `- Fokus: ${config.focus}` : ''}
- Trainingsstruktur: ${config.sessionsPerWeek <= 4 ? '**GANZKÖRPERTRAINING** – jede Einheit trainiert den gesamten Körper (Upper + Lower + Core). Kein Split!' : '**SPLIT erlaubt** – z.B. Push/Pull/Legs oder Upper/Lower'}
`;

  if (conversation) {
    if (conversation.previous_experience) context += `- Erfahrung: ${conversation.previous_experience}\n`;
    if (conversation.stress_level)        context += `- Stresslevel: ${conversation.stress_level}\n`;
    if (conversation.personality_type)    context += `- Typ: ${personalityDescriptions[conversation.personality_type] || ''}\n`;
  }

  if (health) {
    const issues = [health.musculoskeletal, health.sports_injuries, health.current_pain].filter(Boolean);
    if (issues.length > 0) {
      context += `\n## ⚠️ Einschränkungen (unbedingt beachten)\n${issues.join(' | ')}\n`;
    }
  }

  if (assessment?.focus_points) {
    context += `\n## Bewegungsqualität\nFokus: ${assessment.focus_points}\n`;
  }

  if (gymEquipment.length > 0) {
    context += `\n## Verfügbares Equipment\n${gymEquipment.join(', ')}\n`;
  }

  context += '\n' + buildExerciseLibrarySection(filteredExercises || [], data.progression);

  return context;
}

// ─── User-Prompt ──────────────────────────────────────────────────────────────

export function generateUserPrompt(clientName: string, config: PlanConfig): string {
  return `Erstelle jetzt den Trainingsplan.

**WICHTIG – Exaktes Format für den Import:**

# Trainingsplan: ${clientName}

## Ziel: [Hauptziel]
## Trainingstage pro Woche: ${config.sessionsPerWeek}
## Wochen: ${config.weeks}

---

## Woche 1: [Label z.B. "Aufbau Basis"]

### Tag 1: [Name der Einheit, z.B. "Unterkörper Push"]
| Übung | Sätze | Wdh. | Pause | Hinweis |
|-------|-------|------|-------|---------|
| [Übungsname exakt aus Bibliothek] | [3-4] | [8-12] | [60s] | [optional] |

### Tag 2: [Name]
| Übung | Sätze | Wdh. | Pause | Hinweis |
|-------|-------|------|-------|---------|
...

---

## Woche 2: [Label]
...
${config.includeDeload ? `
---

## Woche ${config.weeks}: Deload
(50–60% Intensität, Volumen halbieren, gleiche Übungen wie Woche 1)
` : ''}
---

## Progressionslogik
[Wie wird gesteigert? z.B. "+2,5 kg sobald alle Sätze sauber"]

## Coaching-Hinweise
[Worauf besonders achten?]

**REGELN – ZWINGEND EINHALTEN:**
1. Nur Übungen aus der Bibliothek oben verwenden – exakter Name!
2. JEDE Einheit (### Tag X) MUSS eine Tabelle mit mindestens 3 Übungen haben
3. Keine leeren Einheiten
4. Tabellenformat mit | immer einhalten
5. 4. Pausenangaben immer mit "s" (z.B. 90s)
5. ${config.sessionsPerWeek <= 4 ? 'PFLICHT: Jede Einheit ist ein GANZKÖRPERTRAINING mit Übungen für Beine, Rücken/Bizeps, Brust/Trizeps und Core. KEIN reiner Oberkörper- oder Unterkörpertag!' : 'Split-Struktur möglich: z.B. Push/Pull/Legs, Upper/Lower oder Muskelgruppen-Split'}`;
6. Bei zeitbasierten Übungen (⏱) statt Wdh. die Sekunden eintragen (z.B. "30s")`;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function calculateAge(dob: string | null | undefined): string {
  if (!dob) return 'unbekannt';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} Jahre`;
}

// ─── Exporte für KIWorkoutBuilderModal ───────────────────────────────────────
// Exakte Signatur wie vom Modal erwartet.

/**
 * Optionen aus KIWorkoutBuilderModal – entspricht dem PlanOptions-Interface
 * das dort verwendet wird.
 */
export interface PlanOptions {
  sessionsPerWeek: number;
  weeksTotal: number;
  phase: MesocyclePhase;
  sessionDurationMinutes?: number;
  includeCardio: boolean;
  isDuoTraining: boolean;
  duoPartnerClientId?: string;
  coachInstructions?: string;
}

/**
 * Erzeugt einen vollständigen Trainingsplan via Claude.
 * Signatur: generateAIPlan(client, options) → { markdown }
 *
 * @param client  - Kundendaten-Objekt mit mindestens { id, full_name }
 * @param options - Konfiguration aus dem KIWorkoutBuilderModal
 */
export async function generateAIPlan(
  client: Record<string, any>,
  options: PlanOptions
): Promise<{ markdown: string }> {

  // 1. Kundendaten + gefilterte Übungsliste laden
  const data = await loadClientDataForPrompt(client.id, {
    phase:        options.phase,
    includeCardio: options.includeCardio,
  });

  // 2. Alias für Datenschutz (kein Klarname an KI)
  const alias = 'CLIENT_' + (client.id || '').replace(/-/g, '').substring(0, 8).toUpperCase();

  // 3. PlanConfig aus PlanOptions zusammenbauen
  const planConfig: PlanConfig = {
    weeks:           options.weeksTotal,
    sessionsPerWeek: options.sessionsPerWeek,
    includeDeload:   options.phase === 'deload',
    phase:           options.phase,
    includeCardio:   options.includeCardio,
    focus: [
      options.isDuoTraining ? 'Duo-Training (zwei Personen gleichzeitig)' : '',
      options.sessionDurationMinutes
        ? options.sessionDurationMinutes + ' Min. pro Session'
        : '',
      options.coachInstructions || '',
    ].filter(Boolean).join(' · ') || undefined,
  };

  // 4. Prompts aufbauen (client.full_name wird durch Alias ersetzt)
  const systemPrompt = generateSystemPrompt(
    { ...data, client: { ...data.client, full_name: alias } as any },
    planConfig
  );
  const userPrompt = generateUserPrompt(alias, planConfig);

  // 5. Claude via Proxy aufrufen
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 8000,
      messages: [
        { role: 'user', content: systemPrompt + '\n\n' + userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Claude-Proxy-Fehler: ' + errText);
  }

  const result = await response.json();

  // Anthropic gibt content[0].text zurück
  const markdown: string =
    result?.content?.[0]?.text ?? result?.completion ?? '';

  if (!markdown) {
    throw new Error('Leere Antwort von Claude erhalten.');
  }

  return { markdown };
}

/**
 * Prüft ob der generierte Plan den Client-Alias enthält.
 * Verhindert dass ein Plan versehentlich dem falschen Kunden zugeordnet wird.
 */
export function verifyPlanOwnership(
  markdown: string,
  clientId: string
): boolean {
  if (!markdown || !clientId) return false;
  const alias = 'CLIENT_' + clientId.replace(/-/g, '').substring(0, 8).toUpperCase();
  return markdown.includes(alias);
}
