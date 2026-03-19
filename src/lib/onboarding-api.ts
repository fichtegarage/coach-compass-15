// ============================================
// COACH-COMPASS: Onboarding API (für clients)
// ============================================
// Datei: src/lib/onboarding-api.ts

import { supabase } from './supabase'; // Passe den Import an
import type {
  Client,
  ClientConversation,
  ClientHealthRecord,
  ClientBodyData,
  NewClientForm,
  ConversationForm,
  HealthRecordForm,
  BodyDataForm,
  ClientOverview,
} from '../types/onboarding';

import {
  PERSONALITY_MAPPING,
} from '../types/onboarding';

// ============================================
// CLIENTS
// ============================================

export async function createClient(data: NewClientForm): Promise<Client> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Nicht eingeloggt');

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      ...data,
      user_id: user.user.id,
      status: 'prospect',
    })
    .select()
    .single();

  if (error) throw error;
  return client;
}

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  const { data: client, error } = await supabase
    .from('clients')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return client;
}

export async function updateClientStatus(id: string, status: Client['status']): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ status })
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// CONVERSATIONS
// ============================================

export async function createConversation(
  clientId: string,
  data: ConversationForm
): Promise<ClientConversation> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Nicht eingeloggt');

  const { data: conversation, error } = await supabase
    .from('client_conversations')
    .insert({
      ...data,
      client_id: clientId,
      user_id: user.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return conversation;
}

export async function getConversations(clientId: string): Promise<ClientConversation[]> {
  const { data, error } = await supabase
    .from('client_conversations')
    .select('*')
    .eq('client_id', clientId)
    .order('conversation_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getLatestConversation(clientId: string): Promise<ClientConversation | null> {
  const { data, error } = await supabase
    .from('client_conversations')
    .select('*')
    .eq('client_id', clientId)
    .order('conversation_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function updateConversation(
  id: string,
  data: Partial<ConversationForm>
): Promise<ClientConversation> {
  const { data: conversation, error } = await supabase
    .from('client_conversations')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return conversation;
}

// ============================================
// HEALTH RECORDS
// ============================================

export async function createHealthRecord(
  clientId: string,
  data: HealthRecordForm,
  conversationId?: string
): Promise<ClientHealthRecord> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Nicht eingeloggt');

  const { data: record, error } = await supabase
    .from('client_health_records')
    .insert({
      ...data,
      client_id: clientId,
      user_id: user.user.id,
      conversation_id: conversationId || null,
    })
    .select()
    .single();

  if (error) throw error;
  return record;
}

export async function getHealthRecord(clientId: string): Promise<ClientHealthRecord | null> {
  const { data, error } = await supabase
    .from('client_health_records')
    .select('*')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function updateHealthRecord(
  id: string,
  data: Partial<HealthRecordForm>
): Promise<ClientHealthRecord> {
  const { data: record, error } = await supabase
    .from('client_health_records')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return record;
}

// ============================================
// BODY DATA
// ============================================

export async function createBodyData(
  clientId: string,
  data: BodyDataForm
): Promise<ClientBodyData> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Nicht eingeloggt');

  const { data: bodyData, error } = await supabase
    .from('client_body_data')
    .insert({
      ...data,
      client_id: clientId,
      user_id: user.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return bodyData;
}

export async function getBodyDataHistory(clientId: string): Promise<ClientBodyData[]> {
  const { data, error } = await supabase
    .from('client_body_data')
    .select('*')
    .eq('client_id', clientId)
    .order('measured_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getLatestBodyData(clientId: string): Promise<ClientBodyData | null> {
  const { data, error } = await supabase
    .from('client_body_data')
    .select('*')
    .eq('client_id', clientId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

// ============================================
// OVERVIEW
// ============================================

export async function getClientOverview(): Promise<ClientOverview[]> {
  const { data, error } = await supabase
    .from('client_overview')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getClientWithDetails(clientId: string) {
  const [client, conversation, healthRecord, bodyData] = await Promise.all([
    getClient(clientId),
    getLatestConversation(clientId),
    getHealthRecord(clientId),
    getLatestBodyData(clientId),
  ]);

  if (!client) return null;

  return {
    ...client,
    latest_conversation: conversation,
    health_record: healthRecord,
    latest_body_data: bodyData,
  };
}

// ============================================
// ONBOARDING FLOW (Komplettes Erstgespräch speichern)
// ============================================

export interface OnboardingData {
  client: NewClientForm;
  conversation: ConversationForm;
  health: HealthRecordForm;
}

/**
 * Speichert ein komplettes Erstgespräch
 * - Legt neuen Client an (oder nutzt bestehenden)
 * - Speichert Gesprächsdaten
 * - Speichert Gesundheitsdaten
 * - Aktualisiert Client-Felder (occupation, fitness_goal_text)
 */
export async function saveOnboarding(
  data: OnboardingData,
  existingClientId?: string
): Promise<{
  client: Client;
  conversation: ClientConversation;
  healthRecord: ClientHealthRecord;
}> {
  let client: Client;

  if (existingClientId) {
    // Bestehenden Client aktualisieren
    client = await updateClient(existingClientId, {
      occupation: data.client.occupation,
      // Weitere Felder bei Bedarf
    });
  } else {
    // Neuen Client anlegen
    client = await createClient(data.client);
  }

  // Gespräch speichern
  const conversation = await createConversation(client.id, data.conversation);

  // Gesundheitsdaten speichern
  const healthRecord = await createHealthRecord(client.id, data.health, conversation.id);

  // Status auf "trial" setzen wenn neu
  if (!existingClientId) {
    await updateClientStatus(client.id, 'trial');
  }

  return { client, conversation, healthRecord };
}

/**
 * Mappt Prototyp-Feldnamen zu Datenbank-Spalten
 */
export function mapPrototypeToDb(prototypeData: Record<string, any>): {
  client: Partial<NewClientForm>;
  conversation: ConversationForm;
  health: HealthRecordForm;
} {
  return {
    client: {
      full_name: prototypeData.kundenName || '',
      occupation: prototypeData.beruf,
    },
    conversation: {
      contact_source: prototypeData.kontakt_herkunft,
      motivation: prototypeData.motivation,
      previous_experience: prototypeData.bisherige_erfahrung,
      stress_level: prototypeData.stress,
      sleep_quality: prototypeData.schlaf,
      daily_activity: prototypeData.bewegung_alltag,
      current_training: prototypeData.training_aktuell,
      nutrition_habits: prototypeData.ernaehrung,
      goal_importance: prototypeData.warum_wichtig,
      success_criteria: prototypeData.erfolgskriterium,
      personality_type: prototypeData.personalityType 
        ? PERSONALITY_MAPPING[prototypeData.personalityType as keyof typeof PERSONALITY_MAPPING]
        : null,
      next_steps: prototypeData.naechste_schritte,
      notes: prototypeData.notizen,
    },
    health: {
      cardiovascular: prototypeData.herz_kreislauf,
      musculoskeletal: prototypeData.bewegungsapparat,
      surgeries: prototypeData.operationen,
      sports_injuries: prototypeData.verletzungen,
      other_conditions: prototypeData.weitere_erkrankungen,
      medications: prototypeData.medikamente,
      current_pain: prototypeData.schmerzen_aktuell,
      substances: prototypeData.genussmittel,
    },
  };
}

// ============================================
// DSGVO
// ============================================

export async function exportClientData(clientId: string): Promise<object> {
  const [client, conversations, healthRecords, bodyData] = await Promise.all([
    getClient(clientId),
    getConversations(clientId),
    supabase.from('client_health_records').select('*').eq('client_id', clientId),
    getBodyDataHistory(clientId),
  ]);

  return {
    exportDate: new Date().toISOString(),
    client,
    conversations,
    healthRecords: healthRecords.data || [],
    bodyData,
  };
}

export async function deleteAllClientData(clientId: string): Promise<void> {
  // Durch ON DELETE CASCADE reicht es, den Client zu löschen
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId);

  if (error) throw error;
}
