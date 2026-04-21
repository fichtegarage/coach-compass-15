/**
 * types/assessment.ts
 * 
 * TypeScript Types für Assessment-System
 */

// ══════════════════════════════════════════════════════════════════════
// CLIENT METRICS (aus Datenbank)
// ══════════════════════════════════════════════════════════════════════

export interface ClientMetrics {
  id: string;
  client_id: string;
  recorded_at: string;  // ISO timestamp
  recorded_by: 'coach' | 'client';
  
  // Basis-Metriken
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_percent: number | null;
  
  // Umfänge (cm)
  chest_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  
  // Caliper-Messungen 3-Falten (mm)
  caliper_triceps_mm: number | null;
  caliper_suprailiac_mm: number | null;
  caliper_thigh_mm: number | null;
  
  // Caliper-Messungen 7-Falten (mm) - optional
  caliper_chest_mm: number | null;
  caliper_midaxillary_mm: number | null;
  caliper_subscapular_mm: number | null;
  caliper_abdominal_mm: number | null;
  
  notes: string | null;
  created_at: string;
}

// ══════════════════════════════════════════════════════════════════════
// PROGRESS PHOTOS
// ══════════════════════════════════════════════════════════════════════

export interface ProgressPhoto {
  id: string;
  client_id: string;
  user_id: string | null;
  photo_url: string;
  taken_at: string;  // ISO date
  note: string | null;
  uploaded_by: 'coach' | 'client';
  created_at: string;
}

// ══════════════════════════════════════════════════════════════════════
// FORM TYPES
// ══════════════════════════════════════════════════════════════════════

export type CaliperMethod = '3fold' | '7fold';

export interface CaliperMeasurements {
  // 3-Falten (Standard)
  triceps_mm?: number;
  suprailiac_mm?: number;
  thigh_mm?: number;
  
  // 7-Falten (Erweitert)
  chest_mm?: number;
  midaxillary_mm?: number;
  subscapular_mm?: number;
  abdominal_mm?: number;
}

export interface AssessmentFormData {
  // Basis
  weight_kg?: number;
  height_cm?: number;
  body_fat_percent?: number;
  
  // Umfänge
  chest_cm?: number;
  waist_cm?: number;
  hip_cm?: number;
  arm_cm?: number;
  thigh_cm?: number;
  
  // Caliper
  caliper_method?: CaliperMethod;
  caliper_triceps_mm?: number;
  caliper_suprailiac_mm?: number;
  caliper_thigh_mm?: number;
  caliper_chest_mm?: number;
  caliper_midaxillary_mm?: number;
  caliper_subscapular_mm?: number;
  caliper_abdominal_mm?: number;
  
  notes?: string;
}

// ══════════════════════════════════════════════════════════════════════
// ASSESSMENT WITH PHOTOS & CHANGES
// ══════════════════════════════════════════════════════════════════════

export interface AssessmentChanges {
  weight_delta: number | null;      // kg Veränderung
  bodyfat_delta: number | null;     // % Veränderung
  chest_delta: number | null;       // cm Veränderung
  waist_delta: number | null;
  hip_delta: number | null;
  arm_delta: number | null;
  thigh_delta: number | null;
  days_since_last: number | null;   // Tage seit letztem Assessment
}

export interface AssessmentWithPhotos {
  metrics: ClientMetrics;
  photos: ProgressPhoto[];
  changes: AssessmentChanges | null;  // null wenn erstes Assessment
}

// ══════════════════════════════════════════════════════════════════════
// TIMELINE ENTRY
// ══════════════════════════════════════════════════════════════════════

export interface AssessmentTimelineEntry {
  id: string;
  date: string;
  metrics: ClientMetrics;
  photos: ProgressPhoto[];
  changes: AssessmentChanges | null;
  isPrimary: boolean;  // Markiert Initial-Assessment oder Milestone
}

// ══════════════════════════════════════════════════════════════════════
// FILTER & QUERY OPTIONS
// ══════════════════════════════════════════════════════════════════════

export interface AssessmentFilters {
  clientId: string;
  startDate?: string;   // ISO date
  endDate?: string;     // ISO date
  recordedBy?: 'coach' | 'client' | 'both';
  includePhotos?: boolean;
  limit?: number;
}

// ══════════════════════════════════════════════════════════════════════
// STATISTICS
// ══════════════════════════════════════════════════════════════════════

export interface AssessmentStatistics {
  totalAssessments: number;
  firstAssessmentDate: string | null;
  lastAssessmentDate: string | null;
  
  // Trends (positive = Zunahme, negative = Abnahme)
  weightTrend: {
    start: number | null;
    current: number | null;
    change: number | null;
    changePercent: number | null;
  };
  
  bodyfatTrend: {
    start: number | null;
    current: number | null;
    change: number | null;
    changePercent: number | null;
  };
  
  waistTrend: {
    start: number | null;
    current: number | null;
    change: number | null;
    changePercent: number | null;
  };
}

// ══════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS (Zod-kompatibel)
// ══════════════════════════════════════════════════════════════════════

export const ASSESSMENT_VALIDATION = {
  weight_kg: {
    min: 30,
    max: 300,
  },
  height_cm: {
    min: 100,
    max: 250,
  },
  body_fat_percent: {
    min: 3,
    max: 60,
  },
  circumference_cm: {
    min: 10,
    max: 200,
  },
  caliper_mm: {
    min: 2,
    max: 50,
  },
} as const;

// ══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════

export const CALIPER_SITES = {
  '3fold': [
    { id: 'triceps', label: 'Trizeps', description: 'Rückseite Oberarm, vertikal' },
    { id: 'suprailiac', label: 'Beckenkamm', description: 'Über Beckenkamm, diagonal' },
    { id: 'thigh', label: 'Oberschenkel', description: 'Vorderseite, vertikal' },
  ],
  '7fold': [
    { id: 'triceps', label: 'Trizeps', description: 'Rückseite Oberarm, vertikal' },
    { id: 'suprailiac', label: 'Beckenkamm', description: 'Über Beckenkamm, diagonal' },
    { id: 'thigh', label: 'Oberschenkel', description: 'Vorderseite, vertikal' },
    { id: 'chest', label: 'Brust', description: 'Diagonal zwischen Achsel und Brustwarze' },
    { id: 'midaxillary', label: 'Mittelachsel', description: 'Horizontal auf Höhe Brustbein' },
    { id: 'subscapular', label: 'Schulterblatt', description: 'Unter Schulterblatt, diagonal' },
    { id: 'abdominal', label: 'Bauch', description: '2cm neben Nabel, vertikal' },
  ],
} as const;

export const CIRCUMFERENCE_SITES = [
  { id: 'chest', label: 'Brust', unit: 'cm', description: 'Auf Höhe der Brustwarzen' },
  { id: 'waist', label: 'Taille', unit: 'cm', description: 'Schmalste Stelle oder Bauchnabel' },
  { id: 'hip', label: 'Hüfte', unit: 'cm', description: 'Breiteste Stelle des Gesäßes' },
  { id: 'arm', label: 'Oberarm', unit: 'cm', description: 'Dickste Stelle, entspannt' },
  { id: 'thigh', label: 'Oberschenkel', unit: 'cm', description: 'Dickste Stelle, stehend' },
] as const;

export const RECOMMENDED_ASSESSMENT_INTERVALS = [
  { weeks: 0, label: 'Initial-Assessment', description: 'Baseline vor Trainingsstart' },
  { weeks: 4, label: 'Block 1 Ende', description: 'Nach erstem Trainingsblock' },
  { weeks: 8, label: 'Block 2 Ende', description: 'Nach zweitem Block' },
  { weeks: 12, label: 'Quartal', description: 'Quartalsmessung' },
] as const;
