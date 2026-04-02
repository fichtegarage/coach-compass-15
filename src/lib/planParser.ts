/**
 * planParser.ts
 *
 * Parst den strukturierten Markdown-Output von Claude (generiert durch exportForClaude.ts)
 * in ein strukturiertes Objekt, das direkt in die Supabase-Tabellen geschrieben werden kann.
 *
 * Unterstütztes Format:
 *   # Trainingsplan: [Name]
 *   ## Zeitraum: [Start] – [Ende]
 *   ## Ziel: [Text]
 *   ## Trainingstage pro Woche: [Zahl]
 *
 *   ## Zyklus 1: Aufbauphase (optional)
 *   ## Woche 1–2: Load – Fundament
 *   ### Einheit A – Push
 *   | Übung | Sätze | Wdh. | Pause | Hinweis |
 *   |-------|-------|------|-------|---------|
 *   | Bankdrücken | 4 | 8-10 | 90s | Ellbogen nicht voll strecken |
 *
 *   ## Woche 3: Deload
 *   ...
 *
 *   ## Progressionslogik
 *   [Text]
 *
 *   ## Coaching-Hinweise
 *   [Text]
 *
 * Phase Types:
 *   - 'load': Normale Trainingswochen (default)
 *   - 'deload': Entlastungswoche
 *   - 'test': Testwochen (1RM, Assessment)
 *   - 'intro': Einführungswoche (Technik, leicht)
 */

export type PhaseType = 'load' | 'deload' | 'test' | 'intro';

export interface ParsedExercise {
  name: string;
  sets: number | null;
  reps_target: string;
  weight_target: string;
  rest_seconds: number | null;
  notes: string;
  order_in_workout: number;
}

export interface ParsedWorkout {
  week_number: number;
  week_label: string;
  day_label: string;
  notes: string;
  order_in_week: number;
  exercises: ParsedExercise[];
  // New fields for cycles
  session_order: number;      // Global position in plan (1, 2, 3, ...)
  phase_type: PhaseType;      // Type of training phase
  cycle_number: number;       // Which cycle this belongs to
}

export interface ParsedPlan {
  name: string;
  goal: string;
  weeks_total: number | null;
  sessions_per_week: number | null;
  total_cycles: number;        // NEW: Total number of cycles
  progression_notes: string;
  coaching_notes: string;
  nutrition_notes: string;
  workouts: ParsedWorkout[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRestSeconds(restStr: string): number | null {
  if (!restStr || restStr.trim() === '' || restStr.trim() === '—' || restStr.trim() === '-') return null;
  const s = restStr.trim().toLowerCase();
  // "90s" or "90 s"
  const secMatch = s.match(/^(\d+)\s*s(?:ek)?\.?$/);
  if (secMatch) return parseInt(secMatch[1]);
  // "2min" or "2 min"
  const minMatch = s.match(/^(\d+)\s*min\.?$/);
  if (minMatch) return parseInt(minMatch[1]) * 60;
  // "1:30"
  const colonMatch = s.match(/^(\d+):(\d{2})$/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  // plain number = seconds
  const plain = s.match(/^(\d+)$/);
  if (plain) return parseInt(plain[1]);
  return null;
}

function parseSets(setsStr: string): number | null {
  const n = parseInt(setsStr.trim());
  return isNaN(n) ? null : n;
}

function extractTextBlock(lines: string[], startPattern: RegExp): string {
  let inBlock = false;
  const collected: string[] = [];
  for (const line of lines) {
    if (startPattern.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      // Stop at next ## heading
      if (/^##\s/.test(line)) break;
      collected.push(line);
    }
  }
  return collected.join('\n').trim();
}

function parseTableRow(row: string): string[] {
  return row
    .split('|')
    .map(cell => cell.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
}

function isTableSeparator(row: string): boolean {
  return /^\|[\s\-|]+\|$/.test(row.trim());
}

/**
 * Detect phase type from week label
 * Examples:
 *   "Woche 1–2: Load – Fundament" → 'load'
 *   "Woche 3: Deload" → 'deload'
 *   "Woche 4: Test" → 'test'
 *   "Woche 5: Intro – Technikfokus" → 'intro'
 *   "Woche 6: Entlastung" → 'deload'
 */
function detectPhaseType(weekLabel: string): PhaseType {
  const lower = weekLabel.toLowerCase();
  
  if (lower.includes('deload') || lower.includes('entlastung') || lower.includes('recovery') || lower.includes('erholung')) {
    return 'deload';
  }
  if (lower.includes('test') || lower.includes('1rm') || lower.includes('max')) {
    return 'test';
  }
  if (lower.includes('intro') || lower.includes('einführung') || lower.includes('technik') || lower.includes('onboarding')) {
    return 'intro';
  }
  // Default to load
  return 'load';
}

// ── Main Parser ───────────────────────────────────────────────────────────────

export function parsePlan(markdown: string): ParsedPlan | null {
  if (!markdown || markdown.trim() === '') return null;

  // Strip the system prompt section before the actual plan
  const planStart = markdown.indexOf('# Trainingsplan:');
  const cleanedMarkdown = planStart >= 0 ? markdown.slice(planStart) : markdown;

  const lines = cleanedMarkdown.split('\n');

  // ── Extract plan-level metadata ────────────────────────────────────────────
  let name = '';
  let goal = '';
  let sessions_per_week: number | null = null;

  for (const line of lines) {
    const h1 = line.match(/^#\s+Trainingsplan:\s*(.+)/i);
    if (h1) { name = h1[1].trim(); continue; }

    const goalMatch = line.match(/^##\s*Ziel:\s*(.+)/i);
    if (goalMatch) { goal = goalMatch[1].trim(); continue; }

    const spwMatch = line.match(/^##\s*Trainingstage\s+pro\s+Woche:\s*(\d+)/i);
    if (spwMatch) { sessions_per_week = parseInt(spwMatch[1]); continue; }
  }

  if (!name) return null;

  // ── Extract text blocks ────────────────────────────────────────────────────
  const progression_notes = extractTextBlock(lines, /^##\s*Progressionslogik/i);
  const coaching_notes = extractTextBlock(lines, /^##\s*Coaching-Hinweise/i);
  const nutrition_notes = extractTextBlock(lines, /^##\s*Ernährungs/i);

  // ── Parse workouts with cycle tracking ─────────────────────────────────────
  const workouts: ParsedWorkout[] = [];
  let currentWeekNumber = 0;
  let currentWeekLabel = '';
  let currentPhaseType: PhaseType = 'load';
  let currentCycleNumber = 1;
  let currentWorkout: ParsedWorkout | null = null;
  let inTable = false;
  let tableHeaderParsed = false;
  let exerciseOrder = 0;
  let workoutOrder = 0;
  let globalSessionOrder = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ## Zyklus X: Label  →  new cycle
    const cycleMatch = line.match(/^##\s*Zyklus\s+(\d+)/i);
    if (cycleMatch) {
      if (currentWorkout) {
        workouts.push(currentWorkout);
        currentWorkout = null;
      }
      currentCycleNumber = parseInt(cycleMatch[1]);
      inTable = false;
      tableHeaderParsed = false;
      continue;
    }

    // ## Woche X–Y: Label  →  new week block
    const weekMatch = line.match(/^##\s*(Woche\s+[\d\-–]+[:\s]+.+)/i);
    if (weekMatch) {
      if (currentWorkout) {
        workouts.push(currentWorkout);
        currentWorkout = null;
      }
      currentWeekLabel = weekMatch[1].trim();
      // Extract week number from "Woche 1–2" or "Woche 3–4"
      const wnMatch = currentWeekLabel.match(/\d+/);
      currentWeekNumber = wnMatch ? parseInt(wnMatch[0]) : currentWeekNumber + 1;
      // Detect phase type from label
      currentPhaseType = detectPhaseType(currentWeekLabel);
      inTable = false;
      tableHeaderParsed = false;
      workoutOrder = 0; // Reset workout order within week
      continue;
    }

    // Also handle simplified format: ## Woche 1 (without colon)
    const simpleWeekMatch = line.match(/^##\s*(Woche\s+\d+)\s*$/i);
    if (simpleWeekMatch) {
      if (currentWorkout) {
        workouts.push(currentWorkout);
        currentWorkout = null;
      }
      currentWeekLabel = simpleWeekMatch[1].trim();
      const wnMatch = currentWeekLabel.match(/\d+/);
      currentWeekNumber = wnMatch ? parseInt(wnMatch[0]) : currentWeekNumber + 1;
      currentPhaseType = 'load'; // Default for unlabeled weeks
      inTable = false;
      tableHeaderParsed = false;
      workoutOrder = 0;
      continue;
    }

    // ### Einheit A – Push  →  new workout within week
    const workoutMatch = line.match(/^###\s*(.+)/);
    if (workoutMatch) {
      if (currentWorkout) {
        workouts.push(currentWorkout);
      }
      globalSessionOrder++;
      currentWorkout = {
        week_number: currentWeekNumber,
        week_label: currentWeekLabel,
        day_label: workoutMatch[1].trim(),
        notes: '',
        order_in_week: workoutOrder++,
        exercises: [],
        session_order: globalSessionOrder,
        phase_type: currentPhaseType,
        cycle_number: currentCycleNumber,
      };
      exerciseOrder = 0;
      inTable = false;
      tableHeaderParsed = false;
      continue;
    }

    // Skip if not in a workout context
    if (!currentWorkout) continue;

    // Table header row: | Übung | Sätze | ...
    if (line.trim().startsWith('|') && !inTable) {
      inTable = true;
      tableHeaderParsed = false;
      continue;
    }

    // Separator row: |---|---|...
    if (inTable && isTableSeparator(line)) {
      tableHeaderParsed = true;
      continue;
    }

    // Data row
    if (inTable && tableHeaderParsed && line.trim().startsWith('|')) {
      const cells = parseTableRow(line);
      if (cells.length >= 2) {
        const exerciseName = cells[0];
        if (!exerciseName || exerciseName === '...' || exerciseName === '') continue;

        const exercise: ParsedExercise = {
          name: exerciseName,
          sets: cells[1] ? parseSets(cells[1]) : null,
          reps_target: cells[2] || '',
          weight_target: '',
          rest_seconds: cells[3] ? parseRestSeconds(cells[3]) : null,
          notes: cells[4] || '',
          order_in_workout: exerciseOrder++,
        };
        currentWorkout.exercises.push(exercise);
      }
      continue;
    }

    // Non-table line after table started = table ended
    if (inTable && !line.trim().startsWith('|') && line.trim() !== '') {
      inTable = false;
      tableHeaderParsed = false;
      if (!/^##/.test(line) && !/^###/.test(line)) {
        currentWorkout.notes += (currentWorkout.notes ? '\n' : '') + line.trim();
      }
    }
  }

  // Save last workout
  if (currentWorkout) {
    workouts.push(currentWorkout);
  }

  // WICHTIG: Leere Workouts (ohne Übungen) herausfiltern
  const validWorkouts = workouts.filter(w => w.exercises.length > 0);

  // Calculate weeks_total and total_cycles from parsed data
  const maxWeek = validWorkouts.reduce((max, w) => Math.max(max, w.week_number), 0);
  const weeks_total = maxWeek > 0 ? maxWeek : null;
  const total_cycles = validWorkouts.reduce((max, w) => Math.max(max, w.cycle_number), 1);

  return {
    name,
    goal,
    weeks_total,
    sessions_per_week,
    total_cycles,
    progression_notes,
    coaching_notes,
    nutrition_notes,
    workouts: validWorkouts,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ParseValidation {
  valid: boolean;
  warnings: string[];
  stats: {
    workouts: number;
    exercises: number;
    weeks: number[];
    cycles: number;
    phases: { load: number; deload: number; test: number; intro: number };
  };
}

export function validateParsedPlan(plan: ParsedPlan): ParseValidation {
  const warnings: string[] = [];

  if (!plan.name) warnings.push('Kein Planname gefunden.');
  if (plan.workouts.length === 0) warnings.push('Keine Trainingseinheiten erkannt. Prüfe das Format der Überschriften (### Einheit A ...).');

  const emptyWorkouts = plan.workouts.filter(w => w.exercises.length === 0);
  if (emptyWorkouts.length > 0) {
    warnings.push(`${emptyWorkouts.length} Einheit(en) ohne Übungen: ${emptyWorkouts.map(w => w.day_label).join(', ')}`);
  }

  const weeks = [...new Set(plan.workouts.map(w => w.week_number))].sort((a, b) => a - b);
  const totalExercises = plan.workouts.reduce((sum, w) => sum + w.exercises.length, 0);
  
  // Count phase types
  const phases = { load: 0, deload: 0, test: 0, intro: 0 };
  plan.workouts.forEach(w => phases[w.phase_type]++);

  return {
    valid: warnings.length === 0 || (plan.workouts.length > 0 && totalExercises > 0),
    warnings,
    stats: {
      workouts: plan.workouts.length,
      exercises: totalExercises,
      weeks,
      cycles: plan.total_cycles,
      phases,
    },
  };
}
