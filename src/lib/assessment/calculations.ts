/**
 * assessment/calculations.ts
 * 
 * Körperfett-Berechnungen nach Jackson-Pollock Methode
 * 3-Falten und 7-Falten Formeln für Männer und Frauen
 */

// ══════════════════════════════════════════════════════════════════════
// 3-FALTEN-METHODE (Standard, am praktikabelsten)
// ══════════════════════════════════════════════════════════════════════

/**
 * Berechnet Körperfett% für Männer (3-Falten Jackson-Pollock)
 * @param triceps_mm - Trizeps Hautfalte in mm
 * @param suprailiac_mm - Beckenkamm Hautfalte in mm  
 * @param thigh_mm - Oberschenkel Hautfalte in mm
 * @param age - Alter in Jahren
 * @returns Körperfett% (1 Dezimalstelle)
 */
export function calculateBodyFatMale3Fold(
  triceps_mm: number,
  suprailiac_mm: number,
  thigh_mm: number,
  age: number
): number {
  const sum = triceps_mm + suprailiac_mm + thigh_mm;
  const density = 1.10938 - (0.0008267 * sum) + (0.0000016 * sum * sum) - (0.0002574 * age);
  const bodyFat = ((4.95 / density) - 4.50) * 100;
  return Math.round(bodyFat * 10) / 10;
}

/**
 * Berechnet Körperfett% für Frauen (3-Falten Jackson-Pollock)
 * @param triceps_mm - Trizeps Hautfalte in mm
 * @param suprailiac_mm - Beckenkamm Hautfalte in mm
 * @param thigh_mm - Oberschenkel Hautfalte in mm
 * @param age - Alter in Jahren
 * @returns Körperfett% (1 Dezimalstelle)
 */
export function calculateBodyFatFemale3Fold(
  triceps_mm: number,
  suprailiac_mm: number,
  thigh_mm: number,
  age: number
): number {
  const sum = triceps_mm + suprailiac_mm + thigh_mm;
  const density = 1.0994921 - (0.0009929 * sum) + (0.0000023 * sum * sum) - (0.0001392 * age);
  const bodyFat = ((4.95 / density) - 4.50) * 100;
  return Math.round(bodyFat * 10) / 10;
}

// ══════════════════════════════════════════════════════════════════════
// 7-FALTEN-METHODE (Erweitert, präziser)
// ══════════════════════════════════════════════════════════════════════

/**
 * Berechnet Körperfett% für Männer (7-Falten Jackson-Pollock)
 * @param chest_mm - Brust Hautfalte in mm
 * @param midaxillary_mm - Mittelachsel Hautfalte in mm
 * @param triceps_mm - Trizeps Hautfalte in mm
 * @param subscapular_mm - Schulterblatt Hautfalte in mm
 * @param abdominal_mm - Bauch Hautfalte in mm
 * @param suprailiac_mm - Beckenkamm Hautfalte in mm
 * @param thigh_mm - Oberschenkel Hautfalte in mm
 * @param age - Alter in Jahren
 * @returns Körperfett% (1 Dezimalstelle)
 */
export function calculateBodyFatMale7Fold(
  chest_mm: number,
  midaxillary_mm: number,
  triceps_mm: number,
  subscapular_mm: number,
  abdominal_mm: number,
  suprailiac_mm: number,
  thigh_mm: number,
  age: number
): number {
  const sum = chest_mm + midaxillary_mm + triceps_mm + subscapular_mm + abdominal_mm + suprailiac_mm + thigh_mm;
  const density = 1.112 - (0.00043499 * sum) + (0.00000055 * sum * sum) - (0.00028826 * age);
  const bodyFat = ((4.95 / density) - 4.50) * 100;
  return Math.round(bodyFat * 10) / 10;
}

/**
 * Berechnet Körperfett% für Frauen (7-Falten Jackson-Pollock)
 * @param chest_mm - Brust Hautfalte in mm
 * @param midaxillary_mm - Mittelachsel Hautfalte in mm
 * @param triceps_mm - Trizeps Hautfalte in mm
 * @param subscapular_mm - Schulterblatt Hautfalte in mm
 * @param abdominal_mm - Bauch Hautfalte in mm
 * @param suprailiac_mm - Beckenkamm Hautfalte in mm
 * @param thigh_mm - Oberschenkel Hautfalte in mm
 * @param age - Alter in Jahren
 * @returns Körperfett% (1 Dezimalstelle)
 */
export function calculateBodyFatFemale7Fold(
  chest_mm: number,
  midaxillary_mm: number,
  triceps_mm: number,
  subscapular_mm: number,
  abdominal_mm: number,
  suprailiac_mm: number,
  thigh_mm: number,
  age: number
): number {
  const sum = chest_mm + midaxillary_mm + triceps_mm + subscapular_mm + abdominal_mm + suprailiac_mm + thigh_mm;
  const density = 1.097 - (0.00046971 * sum) + (0.00000056 * sum * sum) - (0.00012828 * age);
  const bodyFat = ((4.95 / density) - 4.50) * 100;
  return Math.round(bodyFat * 10) / 10;
}

// ══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════

/**
 * Berechnet Alter aus Geburtsdatum
 * @param dateOfBirth - Geburtsdatum als ISO String oder Date
 * @returns Alter in Jahren
 */
export function calculateAge(dateOfBirth: string | Date): number {
  const birthDate = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Korrigiere wenn Geburtstag in diesem Jahr noch nicht war
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Universelle Körperfett-Berechnung (erkennt automatisch Methode)
 * @param gender - Geschlecht ('male' | 'female' | 'other')
 * @param age - Alter in Jahren
 * @param measurements - Caliper-Messwerte
 * @returns Körperfett% oder null wenn nicht genug Daten
 */
export function calculateBodyFat(
  gender: 'male' | 'female' | 'other',
  age: number,
  measurements: {
    triceps_mm?: number;
    suprailiac_mm?: number;
    thigh_mm?: number;
    chest_mm?: number;
    midaxillary_mm?: number;
    subscapular_mm?: number;
    abdominal_mm?: number;
  }
): number | null {
  const { triceps_mm, suprailiac_mm, thigh_mm, chest_mm, midaxillary_mm, subscapular_mm, abdominal_mm } = measurements;
  
  // 7-Falten-Methode (alle Werte vorhanden)
  if (triceps_mm && suprailiac_mm && thigh_mm && chest_mm && midaxillary_mm && subscapular_mm && abdominal_mm) {
    if (gender === 'male') {
      return calculateBodyFatMale7Fold(chest_mm, midaxillary_mm, triceps_mm, subscapular_mm, abdominal_mm, suprailiac_mm, thigh_mm, age);
    } else if (gender === 'female') {
      return calculateBodyFatFemale7Fold(chest_mm, midaxillary_mm, triceps_mm, subscapular_mm, abdominal_mm, suprailiac_mm, thigh_mm, age);
    }
  }
  
  // 3-Falten-Methode (Standard)
  if (triceps_mm && suprailiac_mm && thigh_mm) {
    if (gender === 'male') {
      return calculateBodyFatMale3Fold(triceps_mm, suprailiac_mm, thigh_mm, age);
    } else if (gender === 'female') {
      return calculateBodyFatFemale3Fold(triceps_mm, suprailiac_mm, thigh_mm, age);
    }
  }
  
  // Nicht genug Daten
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// VALIDIERUNG
// ══════════════════════════════════════════════════════════════════════

/**
 * Prüft ob Caliper-Werte plausibel sind
 * @param value - Hautfalten-Wert in mm
 * @returns true wenn plausibel
 */
export function isValidCaliperMeasurement(value: number): boolean {
  // Hautfalten sollten zwischen 2mm und 50mm liegen
  return value >= 2 && value <= 50;
}

/**
 * Prüft ob alle benötigten 3-Falten-Werte vorhanden sind
 */
export function hasComplete3FoldData(measurements: {
  triceps_mm?: number;
  suprailiac_mm?: number;
  thigh_mm?: number;
}): boolean {
  return !!(measurements.triceps_mm && measurements.suprailiac_mm && measurements.thigh_mm);
}

/**
 * Prüft ob alle benötigten 7-Falten-Werte vorhanden sind
 */
export function hasComplete7FoldData(measurements: {
  triceps_mm?: number;
  suprailiac_mm?: number;
  thigh_mm?: number;
  chest_mm?: number;
  midaxillary_mm?: number;
  subscapular_mm?: number;
  abdominal_mm?: number;
}): boolean {
  return !!(
    measurements.triceps_mm &&
    measurements.suprailiac_mm &&
    measurements.thigh_mm &&
    measurements.chest_mm &&
    measurements.midaxillary_mm &&
    measurements.subscapular_mm &&
    measurements.abdominal_mm
  );
}

// ══════════════════════════════════════════════════════════════════════
// USAGE EXAMPLES
// ══════════════════════════════════════════════════════════════════════

/*

// Beispiel 1: 3-Falten-Methode für Mann
const bodyFatMale = calculateBodyFatMale3Fold(
  15, // Trizeps
  20, // Beckenkamm
  18, // Oberschenkel
  30  // Alter
);
console.log(`Körperfett: ${bodyFatMale}%`); // z.B. 12.3%

// Beispiel 2: Auto-Erkennung mit gender
const client = {
  gender: 'female',
  date_of_birth: '1990-05-15',
};

const age = calculateAge(client.date_of_birth);

const measurements = {
  triceps_mm: 18,
  suprailiac_mm: 22,
  thigh_mm: 25,
};

const bodyFat = calculateBodyFat(client.gender, age, measurements);
console.log(`Körperfett: ${bodyFat}%`); // z.B. 24.1%

// Beispiel 3: Validierung
if (hasComplete3FoldData(measurements)) {
  console.log('Alle 3-Falten-Werte vorhanden');
}

*/
