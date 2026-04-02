/**
 * exerciseMatching.ts
 * 
 * Utility für das Matchen von Übungsnamen aus importierten Plänen
 * mit dem Übungskatalog. Nutzt Fuzzy-Matching und fügt neue Übungen
 * automatisch zum Katalog hinzu.
 */

import { supabase } from '@/integrations/supabase/client';

interface CatalogExercise {
  id: string;
  name: string;
  name_de: string;
}

interface MatchResult {
  exerciseId: string | null;
  isNew: boolean;
  originalName: string;
  matchedName: string | null;
}

// Normalisiere Namen für Vergleich
function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Umlaute
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    // Sonderzeichen entfernen
    .replace(/[^a-z0-9]/g, ' ')
    // Mehrfache Leerzeichen
    .replace(/\s+/g, ' ')
    .trim();
}

// Berechne Ähnlichkeit (Levenshtein-basiert, vereinfacht)
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  
  // Exakter Match
  if (na === nb) return 1.0;
  
  // Einer enthält den anderen
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  
  // Wort-basierter Match
  const wordsA = na.split(' ').filter(w => w.length > 2);
  const wordsB = nb.split(' ').filter(w => w.length > 2);
  
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  
  const commonWords = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  const matchRatio = commonWords.length / Math.max(wordsA.length, wordsB.length);
  
  return matchRatio * 0.8;
}

// Lade Übungskatalog
async function loadCatalog(): Promise<CatalogExercise[]> {
  const { data } = await supabase
    .from('exercises')
    .select('id, name, name_de');
  return data || [];
}

// Finde beste Übereinstimmung
function findBestMatch(
  exerciseName: string, 
  catalog: CatalogExercise[],
  threshold = 0.6
): { exercise: CatalogExercise; score: number } | null {
  let bestMatch: CatalogExercise | null = null;
  let bestScore = 0;
  
  for (const ex of catalog) {
    // Vergleiche mit name (englisch) und name_de (deutsch)
    const scoreEn = similarity(exerciseName, ex.name);
    const scoreDe = similarity(exerciseName, ex.name_de);
    const score = Math.max(scoreEn, scoreDe);
    
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = ex;
    }
  }
  
  return bestMatch ? { exercise: bestMatch, score: bestScore } : null;
}

// Bewegungsmuster aus Übungsname ableiten
function inferMovementPattern(name: string): string {
  const n = normalize(name);
  
  if (n.includes('press') || n.includes('drueck') || n.includes('push')) {
    if (n.includes('shoulder') || n.includes('schulter') || n.includes('overhead')) {
      return 'push_vertical';
    }
    return 'push_horizontal';
  }
  
  if (n.includes('row') || n.includes('rudern') || n.includes('pull') || n.includes('zug')) {
    if (n.includes('lat') || n.includes('klimmzug') || n.includes('pulldown')) {
      return 'pull_vertical';
    }
    return 'pull_horizontal';
  }
  
  if (n.includes('squat') || n.includes('kniebeuge') || n.includes('leg press') || n.includes('beinpresse')) {
    return 'squat';
  }
  
  if (n.includes('deadlift') || n.includes('kreuzheben') || n.includes('hinge') || n.includes('hip thrust')) {
    return 'hinge';
  }
  
  if (n.includes('lunge') || n.includes('ausfallschritt') || n.includes('split')) {
    return 'lunge';
  }
  
  if (n.includes('plank') || n.includes('crunch') || n.includes('core') || n.includes('bauch') || n.includes('twist')) {
    return 'core';
  }
  
  if (n.includes('curl') || n.includes('extension') || n.includes('raise') || n.includes('fly') || n.includes('flieg')) {
    return 'isolation';
  }
  
  return 'compound';
}

// Muskelgruppen aus Übungsname ableiten
function inferMuscleGroups(name: string): string[] {
  const n = normalize(name);
  const groups: string[] = [];
  
  // Brust
  if (n.includes('bench') || n.includes('bankdrueck') || n.includes('chest') || n.includes('brust') || n.includes('fly') || n.includes('flieg') || n.includes('push up') || n.includes('liegestuetz')) {
    groups.push('chest');
  }
  
  // Schultern
  if (n.includes('shoulder') || n.includes('schulter') || n.includes('press') && !n.includes('bench') || n.includes('raise') || n.includes('delt')) {
    groups.push('shoulders');
  }
  
  // Rücken
  if (n.includes('row') || n.includes('rudern') || n.includes('pull') || n.includes('lat') || n.includes('back') || n.includes('rueck')) {
    groups.push('back');
  }
  
  // Beine
  if (n.includes('squat') || n.includes('kniebeuge') || n.includes('leg') || n.includes('bein') || n.includes('lunge') || n.includes('ausfallschritt')) {
    groups.push('quads');
    groups.push('glutes');
  }
  
  // Hamstrings
  if (n.includes('deadlift') || n.includes('kreuzheben') || n.includes('curl') && n.includes('leg') || n.includes('hamstring') || n.includes('beinbeuger')) {
    groups.push('hamstrings');
  }
  
  // Bizeps
  if (n.includes('bicep') || n.includes('bizeps') || n.includes('curl') && !n.includes('leg')) {
    groups.push('biceps');
  }
  
  // Trizeps
  if (n.includes('tricep') || n.includes('trizeps') || n.includes('pushdown') || n.includes('skull') || n.includes('dip')) {
    groups.push('triceps');
  }
  
  // Core
  if (n.includes('core') || n.includes('ab') || n.includes('bauch') || n.includes('plank') || n.includes('crunch')) {
    groups.push('core');
  }
  
  // Fallback
  if (groups.length === 0) {
    groups.push('compound');
  }
  
  return [...new Set(groups)];
}

// Neue Übung zum Katalog hinzufügen
async function addExerciseToCatalog(name: string): Promise<string | null> {
  const pattern = inferMovementPattern(name);
  const muscles = inferMuscleGroups(name);
  
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: normalize(name).replace(/\s+/g, '_'),
      name_de: name,
      description: `Automatisch hinzugefügt beim Plan-Import.`,
      muscle_groups: muscles,
      movement_pattern: pattern,
      exercise_type: pattern === 'isolation' ? 'isolation' : 'compound',
      difficulty: 2,
      coaching_cues: [],
      context: ['gym'],
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('Error adding exercise:', error);
    return null;
  }
  
  return data?.id || null;
}

/**
 * Hauptfunktion: Matche alle Übungen aus einem Plan mit dem Katalog
 * und füge neue automatisch hinzu.
 */
export async function matchAndAddExercises(exerciseNames: string[]): Promise<Map<string, MatchResult>> {
  const results = new Map<string, MatchResult>();
  const catalog = await loadCatalog();
  
  // Deduplizieren
  const uniqueNames = [...new Set(exerciseNames)];
  
  for (const name of uniqueNames) {
    const match = findBestMatch(name, catalog);
    
    if (match && match.score >= 0.7) {
      // Guter Match gefunden
      results.set(name, {
        exerciseId: match.exercise.id,
        isNew: false,
        originalName: name,
        matchedName: match.exercise.name_de,
      });
    } else {
      // Kein Match - neue Übung hinzufügen
      const newId = await addExerciseToCatalog(name);
      results.set(name, {
        exerciseId: newId,
        isNew: true,
        originalName: name,
        matchedName: null,
      });
    }
  }
  
  return results;
}

/**
 * Aktualisiere plan_exercises mit exercise_id
 */
export async function linkExercisesToCatalog(
  planExerciseIds: { id: string; name: string }[]
): Promise<number> {
  const names = planExerciseIds.map(pe => pe.name);
  const matches = await matchAndAddExercises(names);
  
  let linkedCount = 0;
  
  for (const pe of planExerciseIds) {
    const match = matches.get(pe.name);
    if (match?.exerciseId) {
      const { error } = await supabase
        .from('plan_exercises')
        .update({ exercise_id: match.exerciseId })
        .eq('id', pe.id);
      
      if (!error) linkedCount++;
    }
  }
  
  return linkedCount;
}

/**
 * Generiere Statistik über Matching-Ergebnisse
 */
export function getMatchingStats(results: Map<string, MatchResult>): {
  total: number;
  matched: number;
  added: number;
} {
  let matched = 0;
  let added = 0;
  
  for (const r of results.values()) {
    if (r.isNew) {
      added++;
    } else {
      matched++;
    }
  }
  
  return {
    total: results.size,
    matched,
    added,
  };
}
