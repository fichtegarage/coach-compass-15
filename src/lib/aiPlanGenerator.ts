/**
 * aiPlanGenerator.ts
 * 
 * Generiert optimierte Prompts für Claude basierend auf:
 * - Erstgespräch-Daten
 * - Equipment-Profil
 * - Übungskatalog (verfügbare Übungen)
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
  coach_notes?: string;
}

interface EquipmentItem {
  name_de: string;
  location: 'home' | 'gym' | 'both';
}

interface PlanConfig {
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
  // Client-Daten
  const { data: clientData } = await supabase
    .from('clients')
    .select('full_name, date_of_birth, fitness_goal, fitness_goal_text')
    .eq('id', clientId)
    .single();

  // Erstgespräch
  const { data: convData } = await supabase
    .from('onboarding_conversations')
    .select('*')
    .eq('client_id', clientId)
    .order('conversation_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Gesundheit
  const { data: healthData } = await supabase
    .from('health_records')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Assessment
  const { data: assessmentData } = await supabase
    .from('assessments')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Equipment
  const { data: equipmentData } = await supabase
    .from('client_equipment')
    .select('equipment_id, location, equipment_catalog(name_de)')
    .eq('client_id', clientId);

  const equipment: EquipmentItem[] = (equipmentData || []).map((e: any) => ({
    name_de: e.equipment_catalog?.name_de || 'Unbekannt',
    location: e.location,
  }));

  // Verfügbare Übungen
  const { data: exerciseData } = await supabase
    .from('exercises')
    .select('name_de')
    .order('name_de');

  const exercises = (exerciseData || []).map((e: any) => e.name_de);

  return {
    client: clientData,
    conversation: convData,
    health: healthData,
    assessment: assessmentData,
    equipment,
    exercises,
  };
}

/**
 * Berechne Alter aus Geburtsdatum
 */
function calculateAge(dob: string | null | undefined): string {
  if (!dob) return 'unbekannt';
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${years} Jahre`;
}

/**
 * Persönlichkeitstyp-Beschreibung
 */
const personalityDescriptions: Record<string, string> = {
  success_oriented: 'Erfolgsorientiert: Liebt Herausforderungen, ist ehrgeizig und selbstmotiviert. Setze anspruchsvolle Ziele.',
  avoidance_oriented: 'Sicherheitsorientiert: Braucht klare Struktur und mehr Anleitung. Setze realistische Ziele, betone Sicherheit.',
  unclear: 'Noch unklar: Beobachte im Training weiter.',
};

/**
 * Generiere den KI-Prompt
 */
export function generatePlanPrompt(
  data: Awaited<ReturnType<typeof loadClientDataForPrompt>>,
  config: PlanConfig
): string {
  const { client, conversation, health, assessment, equipment, exercises } = data;

  if (!client) {
    return '# Fehler: Keine Kundendaten gefunden';
  }

  // Equipment-Gruppierung
  const gymEquipment = equipment.filter(e => e.location === 'gym' || e.location === 'both').map(e => e.name_de);
  const homeEquipment = equipment.filter(e => e.location === 'home' || e.location === 'both').map(e => e.name_de);

  let prompt = `# Trainingsplan-Anfrage für ${client.full_name}

Du bist ein erfahrener Personal Trainer. Erstelle einen individuellen **${config.weeks}-Wochen-Trainingsplan** basierend auf den folgenden Informationen.

---

## Klientenprofil

- **Name:** ${client.full_name}
- **Alter:** ${calculateAge(client.date_of_birth)}
- **Ziel:** ${client.fitness_goal_text || client.fitness_goal || 'Nicht angegeben'}
- **Trainingstage/Woche:** ${config.sessionsPerWeek}
${config.focus ? `- **Fokus:** ${config.focus}` : ''}

`;

  // Erstgespräch-Daten
  if (conversation) {
    prompt += `## Motivation & Hintergrund

`;
    if (conversation.motivation) prompt += `- **Motivation:** ${conversation.motivation}\n`;
    if (conversation.previous_experience) prompt += `- **Erfahrung:** ${conversation.previous_experience}\n`;
    if (conversation.current_training) prompt += `- **Aktuelles Training:** ${conversation.current_training}\n`;
    if (conversation.goal_importance) prompt += `- **Warum wichtig:** ${conversation.goal_importance}\n`;
    if (conversation.success_criteria) prompt += `- **Erfolgskriterien:** ${conversation.success_criteria}\n`;
    prompt += '\n';

    prompt += `## Ist-Zustand

`;
    if (conversation.stress_level) prompt += `- **Stresslevel:** ${conversation.stress_level}\n`;
    if (conversation.sleep_quality) prompt += `- **Schlaf:** ${conversation.sleep_quality}\n`;
    if (conversation.daily_activity) prompt += `- **Alltagsaktivität:** ${conversation.daily_activity}\n`;
    prompt += '\n';

    if (conversation.personality_type) {
      prompt += `## Persönlichkeitstyp

${personalityDescriptions[conversation.personality_type] || conversation.personality_type}

`;
    }
  }

  // Gesundheit
  if (health) {
    const hasIssues = health.cardiovascular || health.musculoskeletal || health.surgeries || health.sports_injuries || health.current_pain;
    if (hasIssues) {
      prompt += `## Gesundheit & Einschränkungen

`;
      if (health.cardiovascular) prompt += `- **Herz-Kreislauf:** ${health.cardiovascular}\n`;
      if (health.musculoskeletal) prompt += `- **Bewegungsapparat:** ${health.musculoskeletal}\n`;
      if (health.surgeries) prompt += `- **Operationen:** ${health.surgeries}\n`;
      if (health.sports_injuries) prompt += `- **Sportverletzungen:** ${health.sports_injuries}\n`;
      if (health.current_pain) prompt += `- **Aktuelle Schmerzen:** ${health.current_pain}\n`;
      prompt += '\n**⚠️ Berücksichtige diese Einschränkungen bei der Übungsauswahl!**\n\n';
    }
  }

  // Assessment
  if (assessment) {
    prompt += `## Bewegungsqualität (Assessment)

| Muster | Score (1-5) |
|--------|-------------|
| Kniebeuge | ${assessment.squat_score || '-'} |
| Hüftbeuge | ${assessment.hinge_score || '-'} |
| Drücken | ${assessment.push_score || '-'} |
| Ziehen | ${assessment.pull_score || '-'} |
| Rotation | ${assessment.rotation_score || '-'} |
| Stabilität | ${assessment.stability_score || '-'} |

`;
    if (assessment.strengths) prompt += `- **Stärken:** ${assessment.strengths}\n`;
    if (assessment.focus_points) prompt += `- **Fokuspunkte:** ${assessment.focus_points}\n`;
    prompt += '\n';
  }

  // Equipment
  prompt += `## Verfügbares Equipment

`;
  if (gymEquipment.length > 0) {
    prompt += `**Im Studio:** ${gymEquipment.join(', ')}\n\n`;
  }
  if (homeEquipment.length > 0) {
    prompt += `**Zuhause:** ${homeEquipment.join(', ')}\n\n`;
  }
  if (equipment.length === 0) {
    prompt += `Keine Angaben – plane für ein voll ausgestattetes Studio.\n\n`;
  }

  // Verfügbare Übungen
  if (exercises.length > 0) {
    prompt += `## Übungskatalog (bevorzugt diese nutzen)

${exercises.slice(0, 50).join(', ')}${exercises.length > 50 ? ` ... und ${exercises.length - 50} weitere` : ''}

`;
  }

  // Ausgabeformat
  prompt += `---

## Ausgabeformat (WICHTIG!)

Antworte **NUR** im folgenden Markdown-Format – das ermöglicht den direkten Import in die App:

\`\`\`
# Trainingsplan: ${client.full_name}

## Ziel: [Hauptziel]
## Trainingstage pro Woche: ${config.sessionsPerWeek}
## Wochen: ${config.weeks}

---

## Woche 1: [Wochenlabel]

### Tag 1: [Trainingsbezeichnung]
- Übung 1 | 3×8-10 | 90s Pause | Notiz
- Übung 2 | 4×6-8 | 120s Pause

### Tag 2: [Trainingsbezeichnung]
- Übung 1 | 3×10-12 | 60s Pause
...

---

## Woche 2: [Wochenlabel]
...
${config.includeDeload ? `
---

## Woche ${config.weeks}: Deload
(Reduzierte Intensität: 50-60% der normalen Gewichte, weniger Sätze)
` : ''}
---

## Progressionslogik
[Wie soll der Kunde steigern? Wann Gewicht erhöhen?]

## Coaching-Hinweise (intern für Coach)
[Worauf achten? Motivationsansatz?]
\`\`\`

**Formatregeln:**
- Jede Übung in einer Zeile: \`Übungsname | Sätze×Wdh | Pause | Notiz (optional)\`
- Nutze bevorzugt Übungen aus dem Katalog oben
- Passe Intensität an Erfahrungslevel und Einschränkungen an
- Plane ${config.includeDeload ? 'eine Deload-Woche am Ende' : 'progressiv aufbauend'}
`;

  return prompt;
}

/**
 * Kopiere Prompt in Zwischenablage
 */
export async function copyPromptToClipboard(prompt: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(prompt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download Prompt als .md Datei
 */
export function downloadPromptAsFile(prompt: string, clientName: string): void {
  const blob = new Blob([prompt], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainingsplan-prompt_${clientName.toLowerCase().replace(/\s+/g, '-')}_${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
