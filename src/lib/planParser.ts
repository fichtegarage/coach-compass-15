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
 *   ## Woche 1–2: Fundament
 *   ### Einheit A – Push
 *   | Übung | Sätze | Wdh. | Pause | Hinweis |
 *   |-------|-------|------|-------|---------|
 *   | Bankdrücken | 4 | 8-10 | 90s | Ellbogen nicht voll strecken |
 *
 *   ## Progressionslogik
 *   [Text]
 *
 *   ## Coaching-Hinweise
 *   [Text]
 *
 *   ## Ernährungs-Empfehlungen (optional)
 *   [Text]
 */

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
}

export interface ParsedPlan {
  name: string;
  goal: string;
  weeks_total: number | null;
  sessions_per_week: number | null;
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

function parseWeeksTotal(planName: string, lines: string[]): number | null {
  // Try to find "## Zeitraum: ..." line
  for (const line of lines) {
    const m = line.match(/^##\s*Zeitraum[:\s]/i);
    if (m) return null; // date range, not week count
  }
  // Try to infer from highest week_number in workouts
  return null; // will be calculated after parsing workouts
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
    .filter((_, i, arr) => i > 0 && i < arr.length - 1); // remove empty first/last from leading/trailing |
}

function isTableSeparator(row: string): boolean {
  return /^\|[\s\-|]+\|$/.test(row.trim());
}

// ── Main Parser ───────────────────────────────────────────────────────────────

export function parsePlan(markdown: string): ParsedPlan | null {
  if (!markdown || markdown.trim() === '') return null;

  // Strip the system prompt section before the actual plan
  // The Claude output format starts with "# Trainingsplan:"
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

  // ── Parse workouts ─────────────────────────────────────────────────────────
  const workouts: ParsedWorkout[] = [];
  let currentWeekNumber = 0;
  let currentWeekLabel = '';
  let currentWorkout: ParsedWorkout | null = null;
  let inTable = false;
  let tableHeaderParsed = false;
  let exerciseOrder = 0;
  let workoutOrder = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ## Woche X–Y: Label  →  new week block
    const weekMatch = line.match(/^##\s*(Woche\s+[\d\-–]+[:\s]+.+)/i);
    if (weekMatch) {
      // Save previous workout
      if (currentWorkout) {
        workouts.push(currentWorkout);
        currentWorkout = null;
      }
      currentWeekLabel = weekMatch[1].trim();
      // Extract week number from "Woche 1–2" or "Woche 3–4"
      const wnMatch = currentWeekLabel.match(/\d+/);
      currentWeekNumber = wnMatch ? parseInt(wnMatch[0]) : currentWeekNumber + 1;
      inTable = false;
      tableHeaderParsed = false;
      continue;
    }

    // ### Einheit A – Push  →  new workout within week
    const workoutMatch = line.match(/^###\s*(.+)/);
    if (workoutMatch) {
      // Save previous workout
      if (currentWorkout) {
        workouts.push(currentWorkout);
      }
      currentWorkout = {
        week_number: currentWeekNumber,
        week_label: currentWeekLabel,
        day_label: workoutMatch[1].trim(),
        notes: '',
        order_in_week: workoutOrder++,
        exercises: [],
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
      continue; // this is the header row, skip it
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
      // Could be workout-level notes
      if (!/^##/.test(line) && !/^###/.test(line)) {
        currentWorkout.notes += (currentWorkout.notes ? '\n' : '') + line.trim();
      }
    }
  }

  // Save last workout
  if (currentWorkout) {
    workouts.push(currentWorkout);
  }

  // Calculate weeks_total from parsed data
  const maxWeek = workouts.reduce((max, w) => Math.max(max, w.week_number), 0);
  const weeks_total = maxWeek > 0 ? maxWeek + 1 : null; // e.g. week 3–4 → 4 weeks total

  return {
    name,
    goal,
    weeks_total,
    sessions_per_week,
    progression_notes,
    coaching_notes,
    nutrition_notes,
    workouts,
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

  return {
    valid: warnings.length === 0 || (plan.workouts.length > 0 && totalExercises > 0),
    warnings,
    stats: {
      workouts: plan.workouts.length,
      exercises: totalExercises,
      weeks,
    },
  };
}
