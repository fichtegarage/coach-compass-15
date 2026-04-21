// ============================================
// COACH-COMPASS: TypeScript Types (für clients)
// ============================================
// Datei: src/types/onboarding.ts

export type ClientStatus = 'prospect' | 'trial' | 'active' | 'paused' | 'inactive';
export type PersonalityType = 'success_oriented' | 'avoidance_oriented' | 'unclear';

// ============================================
// TRAINING PREFERENCES (NEW)
// ============================================

export interface TrainingPreferences {
  equipment?: string[];  // ['machines', 'free_weights_barbell', 'free_weights_dumbbell', 'bodyweight']
  location?: string[];   // ['gym_indoor', 'outdoor', 'hybrid']
  cardio_preference?: 'love_it' | 'minimal' | 'dislike';
  mobility_interest?: boolean;
}

// ============================================
// EXISTING CLIENT TABLE (deine bestehende Struktur)
// ============================================

export interface Client {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_link: string | null;
  status: ClientStatus | null;
  fitness_goals: string | null;
  fitness_goal_text: string | null;
  starting_date: string | null;
  profile_photo: string | null;
  booking_code: string | null;
  booking_code_active: boolean | null;
  pinned_note: string | null;
  general_note: string | null;
  health_notes: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  acquisition_resource: string | null;
  occupation: string | null;
  training_experience: string | null;
  preffered_training_time: string | null;
  preffered_location: string | null;
  contract_signed: boolean | null;
  contract_signed_date: string | null;
  reffereal_source: string | null;
  instagram_handle: string | null;
  notes_internal: string | null;
  created_at: string;
  
  // ✅ NEU - Adresse
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  
  // ✅ NEU - Verfügbare Zeit
  available_sessions_per_week: number | null;
  max_session_duration_minutes: number | null;
  
  // ✅ NEU - Trainingspräferenzen (JSONB)
  training_preferences: TrainingPreferences | null;
}

// ============================================
// NEW ONBOARDING TABLES
// ============================================

export interface ClientConversation {
  id: string;
  client_id: string;
  user_id: string;
  
  // Kontakt & Motivation
  contact_source: string | null;
  motivation: string | null;
  previous_experience: string | null;
  
  // Ist-Zustand: Alltag
  stress_level: string | null;
  sleep_quality: string | null;
  daily_activity: string | null;
  
  // Ist-Zustand: Training & Ernährung
  current_training: string | null;
  nutrition_habits: string | null;
  
  // Ziele
  goal_importance: string | null;
  success_criteria: string | null;
  
  // Einschätzung & Notizen
  personality_type: PersonalityType | null;
  next_steps: string | null;
  notes: string | null;
  
  // ✅ NEU - Tiefenfragen
  body_awareness: string | null;
  injury_concerns: string | null;
  past_successes: string | null;
  barriers: string | null;
  support_system: string | null;
  
  // Meta
  conversation_date: string;
  created_at: string;
  updated_at: string;
}

export interface ClientHealthRecord {
  id: string;
  client_id: string;
  user_id: string;
  conversation_id: string | null;
  
  cardiovascular: string | null;
  musculoskeletal: string | null;
  surgeries: string | null;
  sports_injuries: string | null;
  other_conditions: string | null;
  medications: string | null;
  current_pain: string | null;
  substances: string | null;
  
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface ClientBodyData {
  id: string;
  client_id: string;
  user_id: string;
  
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_percent: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  resting_heart_rate: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  
  measured_at: string;
  notes: string | null;
  created_at: string;
}

// ============================================
// FORM TYPES
// ============================================

export interface NewClientForm {
  full_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  occupation?: string;
  instagram_handle?: string;
  
  // ✅ NEU - Adresse
  street_address?: string;
  postal_code?: string;
  city?: string;
}

export interface ConversationForm {
  contact_source?: string;
  motivation?: string;
  previous_experience?: string;
  stress_level?: string;
  sleep_quality?: string;
  daily_activity?: string;
  current_training?: string;
  nutrition_habits?: string;
  goal_importance?: string;
  success_criteria?: string;
  personality_type?: PersonalityType;
  next_steps?: string;
  notes?: string;
  
  // ✅ NEU - Tiefenfragen
  body_awareness?: string;
  injury_concerns?: string;
  past_successes?: string;
  barriers?: string;
  support_system?: string;
}

export interface HealthRecordForm {
  cardiovascular?: string;
  musculoskeletal?: string;
  surgeries?: string;
  sports_injuries?: string;
  other_conditions?: string;
  medications?: string;
  current_pain?: string;
  substances?: string;
}

export interface BodyDataForm {
  height_cm?: number;
  weight_kg?: number;
  body_fat_percent?: number;
  waist_cm?: number;
  hip_cm?: number;
  resting_heart_rate?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  notes?: string;
}

// ✅ NEU - Preferences Form
export interface PreferencesForm {
  available_sessions_per_week?: number;
  max_session_duration_minutes?: number;
  training_preferences?: TrainingPreferences;
}

// ============================================
// VIEW TYPE
// ============================================

export interface ClientOverview {
  id: string;
  full_name: string;
  email: string | null;
  status: ClientStatus | null;
  fitness_goal_text: string | null;
  created_at: string;
  last_conversation: string | null;
  personality_type: PersonalityType | null;
  has_health_record: boolean;
  has_body_data: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export const getStatusLabel = (status: ClientStatus | null): string => {
  if (!status) return 'Kein Status';
  const labels: Record<ClientStatus, string> = {
    prospect: 'Interessent',
    trial: 'Probetraining',
    active: 'Aktiver Kunde',
    paused: 'Pausiert',
    inactive: 'Inaktiv',
  };
  return labels[status];
};

export const getPersonalityTypeLabel = (type: PersonalityType | null): string => {
  if (!type) return 'Noch nicht eingeschätzt';
  const labels: Record<PersonalityType, string> = {
    success_oriented: 'Erfolgsorientiert',
    avoidance_oriented: 'Meidungsorientiert',
    unclear: 'Noch unklar',
  };
  return labels[type];
};

export const getPersonalityTypeStrategy = (type: PersonalityType | null): string => {
  if (!type || type === 'unclear') return 'Im Probetraining genauer beobachten';
  const strategies: Record<Exclude<PersonalityType, 'unclear'>, string> = {
    success_oriented: 'Herausfordernde Ziele, Eigenverantwortung betonen, positive Bestärkung mit Substanz',
    avoidance_oriented: 'Realistische Erwartungen, Misserfolge als Lernchance rahmen, mehr Begleitung geben',
  };
  return strategies[type];
};

// Mapping: Prototyp-Felder → DB-Spalten
export const FIELD_MAPPING = {
  // Conversation
  kontakt_herkunft: 'contact_source',
  motivation: 'motivation',
  bisherige_erfahrung: 'previous_experience',
  stress: 'stress_level',
  schlaf: 'sleep_quality',
  bewegung_alltag: 'daily_activity',
  training_aktuell: 'current_training',
  ernaehrung: 'nutrition_habits',
  warum_wichtig: 'goal_importance',
  erfolgskriterium: 'success_criteria',
  naechste_schritte: 'next_steps',
  notizen: 'notes',
  
  // ✅ NEU - Tiefenfragen
  koerperwahrnehmung: 'body_awareness',
  verletzungsangst: 'injury_concerns',
  fruehere_erfolge: 'past_successes',
  hindernisse: 'barriers',
  unterstuetzung: 'support_system',
  
  // Health
  herz_kreislauf: 'cardiovascular',
  bewegungsapparat: 'musculoskeletal',
  operationen: 'surgeries',
  verletzungen: 'sports_injuries',
  weitere_erkrankungen: 'other_conditions',
  medikamente: 'medications',
  schmerzen_aktuell: 'current_pain',
  genussmittel: 'substances',
  
  // Client (bestehende Felder)
  beruf: 'occupation',
  primaerziel: 'fitness_goal_text',
} as const;

// Personality Type Mapping
export const PERSONALITY_MAPPING = {
  erfolgsorientiert: 'success_oriented',
  meidungsorientiert: 'avoidance_oriented',
  unklar: 'unclear',
} as const;
