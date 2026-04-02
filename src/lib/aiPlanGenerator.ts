/**
 * aiPlanGenerator.ts
 * 
 * Generiert optimierte Prompts für Claude basierend auf Kundendaten.
 * Die API-Kommunikation erfolgt direkt im AIBuilderDialog.
 */

import { supabase } from '@/integrations/supabase/client';

interface ClientData {
  full_name: string;
  date_of_birth?: string | null;
  fitness_goal?: string | null;
  fitness_goal_text?: string | null;
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

export interface PlanConfig {
  weeks: number;
  sessionsPerWeek: number;
  includeDeload: boolean;
  focus?: string;
}

/**
 * Lade alle Daten für einen Kunden
 */
export async function loadClientDataForPrompt(clientId: string): Promise<{
  client: ClientData | null;
  conversation: ConversationData | null;
  health: HealthData | null;
  assessment: AssessmentData | null;
  equipment: EquipmentItem[];
  exercises: string[];
}> {
  const { data: clientData } = await supabase
    .from('clients')
    .select('full_name, date_of_birth, fitness_goal, fitness_goal_text')
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

  const { data: exerciseData } = await supabase
    .from('exercises')
    .select('name_de')
    .order('name_de');

  const exercises = (exerciseData || []).map((e: any) => e.name_de);

  return { client: clientData, conversation: convData, health: healthData, assessment: assessmentData, equipment, exercises };
}

function calculateAge(dob: string | null | undefined): string {
  if (!dob) return 'unbekannt';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} Jahre`;
}

const personalityDescriptions: Record<string, string> = {
  success_oriented: 'Erfolgsorientiert: Liebt Herausforderungen, ist ehrgeizig. Setze anspruchsvolle Ziele.',
  avoidance_oriented: 'Sicherheitsorientiert: Braucht klare Struktur. Setze realistische Ziele.',
  unclear: 'Noch unklar.',
};

/**
 * Generiere den System-Prompt für Claude
 */
export function generateSystemPrompt(
  data: Awaited<ReturnType<typeof loadClientDataForPrompt>>,
  config: PlanConfig
): string {
  const { client, conversation, health, assessment, equipment, exercises } = data;

  if (!client) return '';

  const gymEquipment = equipment.filter(e => e.location === 'gym' || e.location === 'both').map(e => e.name_de);

  let context = `Du bist ein erfahrener Personal Trainer. Erstelle einen **${config.weeks}-Wochen-Trainingsplan** für ${client.full_name}.

## Kundenprofil
- Alter: ${calculateAge(client.date_of_birth)}
- Ziel: ${client.fitness_goal_text || client.fitness_goal || 'Allgemeine Fitness'}
- Trainingstage/Woche: ${config.sessionsPerWeek}
${config.focus ? `- Fokus: ${config.focus}` : ''}
`;

  if (conversation) {
    if (conversation.previous_experience) context += `- Erfahrung: ${conversation.previous_experience}\n`;
    if (conversation.stress_level) context += `- Stresslevel: ${conversation.stress_level}\n`;
    if (conversation.personality_type) context += `- Typ: ${personalityDescriptions[conversation.personality_type] || ''}\n`;
  }

  if (health) {
    const issues = [health.musculoskeletal, health.sports_injuries, health.current_pain].filter(Boolean);
    if (issues.length > 0) {
      context += `\n## Einschränkungen beachten!\n${issues.join(', ')}\n`;
    }
  }

  if (assessment) {
    context += `\n## Bewegungsqualität\n`;
    if (assessment.focus_points) context += `Fokus: ${assessment.focus_points}\n`;
  }

  if (gymEquipment.length > 0) {
    context += `\n## Equipment: ${gymEquipment.slice(0, 15).join(', ')}\n`;
  }

  if (exercises.length > 0) {
    context += `\n## Nutze bevorzugt diese Übungen:\n${exercises.slice(0, 40).join(', ')}\n`;
  }

  return context;
}

/**
 * Generiere den User-Prompt mit dem exakten Ausgabeformat
 */
export function generateUserPrompt(clientName: string, config: PlanConfig): string {
  return `Erstelle jetzt den Trainingsplan. 

**WICHTIG - Exaktes Format für den Import:**

# Trainingsplan: ${clientName}

## Ziel: [Hauptziel]
## Trainingstage pro Woche: ${config.sessionsPerWeek}
## Wochen: ${config.weeks}

---

## Woche 1: [Label]

### Tag 1: [Name der Einheit]
| Übung | Sätze | Wdh. | Pause | Hinweis |
|-------|-------|------|-------|---------|
| [Übung] | [3-4] | [8-12] | [60-120s] | [optional] |

### Tag 2: [Name]
| Übung | Sätze | Wdh. | Pause | Hinweis |
...

---

## Woche 2: [Label]
...
${config.includeDeload ? `
---

## Woche ${config.weeks}: Deload
(50-60% Intensität, weniger Sätze)
` : ''}
---

## Progressionslogik
[Wie steigern?]

## Coaching-Hinweise
[Worauf achten?]

**REGELN:**
1. JEDE Einheit (### Tag X) MUSS eine Übungstabelle mit mindestens 3 Übungen haben
2. Keine leeren Einheiten!
3. Nutze das exakte Tabellenformat mit | Trennern
4. Pausenangaben immer mit "s" (z.B. 90s)`;
}interface AssessmentData {
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

export interface PlanConfig {
  weeks: number;
  sessionsPerWeek: number;
  includeDeload: boolean;
  focus?: string;
}

/**
 * Lade alle Daten für einen Kunden
 */
export async function loadClientDataForPrompt(clientId: string): Promise<{
  client: ClientData | null;
  conversation: ConversationData | null;
  health: HealthData | null;
  assessment: AssessmentData | null;
  equipment: EquipmentItem[];
  exercises: string[];
}> {
  const { data: clientData } = await supabase
    .from('clients')
    .select('full_name, date_of_birth, fitness_goal, fitness_goal_text')
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

  const { data: exerciseData } = await supabase
    .from('exercises')
    .select('name_de')
    .order('name_de');

  const exercises = (exerciseData || []).map((e: any) => e.name_de);

  return { client: clientData, conversation: convData, health: healthData, assessment: assessmentData, equipment, exercises };
}

function calculateAge(dob: string | null | undefined): string {
  if (!dob) return 'unbekannt';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} Jahre`;
}

const personalityDescriptions: Record<string, string> = {
  success_oriented: 'Erfolgsorientiert: Liebt Herausforderungen, ist ehrgeizig. Setze anspruchsvolle Ziele.',
  avoidance_oriented: 'Sicherheitsorientiert: Braucht klare Struktur. Setze realistische Ziele.',
  unclear: 'Noch unklar.',
};

/**
 * Generiere den System-Prompt für Claude
 */
export function generateSystemPrompt(
  data: Awaited<ReturnType<typeof loadClientDataForPrompt>>,
  config: PlanConfig
): string {
  const { client, conversation, health, assessment, equipment, exercises } = data;

  if (!client) return '';

  const gymEquipment = equipment.filter(e => e.location === 'gym' || e.location === 'both').map(e => e.name_de);

  let context = `Du bist ein erfahrener Personal Trainer. Erstelle einen **${config.weeks}-Wochen-Trainingsplan** für ${client.full_name}.

## Kundenprofil
- Alter: ${calculateAge(client.date_of_birth)}
- Ziel: ${client.fitness_goal_text || client.fitness_goal || 'Allgemeine Fitness'}
- Trainingstage/Woche: ${config.sessionsPerWeek}
${config.focus ? `- Fokus: ${config.focus}` : ''}
`;

  if (conversation) {
    if (conversation.previous_experience) context += `- Erfahrung: ${conversation.previous_experience}\n`;
    if (conversation.stress_level) context += `- Stresslevel: ${conversation.stress_level}\n`;
    if (conversation.personality_type) context += `- Typ: ${personalityDescriptions[conversation.personality_type] || ''}\n`;
  }

  if (health) {
    const issues = [health.musculoskeletal, health.sports_injuries, health.current_pain].filter(Boolean);
    if (issues.length > 0) {
      context += `\n## Einschränkungen beachten!\n${issues.join(', ')}\n`;
    }
  }

  if (assessment) {
    context += `\n## Bewegungsqualität\n`;
    if (assessment.focus_points) context += `Fokus: ${assessment.focus_points}\n`;
  }

  if (gymEquipment.length > 0) {
    context += `\n## Equipment: ${gymEquipment.slice(0, 15).join(', ')}\n`;
  }

  if (exercises.length > 0) {
    context += `\n## Nutze bevorzugt diese Übungen:\n${exercises.slice(0, 40).join(', ')}\n`;
  }

  return context;
}

/**
 * Generiere den User-Prompt mit dem exakten Ausgabeformat
 */
export function generateUserPrompt(clientName: string, config: PlanConfig): string {
  return `Erstelle jetzt den Trainingsplan. 

**WICHTIG - Exaktes Format für den Import:**

# Trainingsplan: ${clientName}

## Ziel: [Hauptziel]
## Trainingstage pro Woche: ${config.sessionsPerWeek}
## Wochen: ${config.weeks}

---

## Woche 1: [Label]

### Tag 1: [Name der Einheit]
| Übung | Sätze | Wdh. | Pause | Hinweis |
|-------|-------|------|-------|---------|
| [Übung] | [3-4] | [8-12] | [60-120s] | [optional] |

### Tag 2: [Name]
| Übung | Sätze | Wdh. | Pause | Hinweis |
...

---

## Woche 2: [Label]
...
${config.includeDeload ? `
---

## Woche ${config.weeks}: Deload
(50-60% Intensität, weniger Sätze)
` : ''}
---

## Progressionslogik
[Wie steigern?]

## Coaching-Hinweise
[Worauf achten?]

**REGELN:**
1. JEDE Einheit (### Tag X) MUSS eine Übungstabelle mit mindestens 3 Übungen haben
2. Keine leeren Einheiten!
3. Nutze das exakte Tabellenformat mit | Trennern
4. Pausenangaben immer mit "s" (z.B. 90s)`;
}
