/**
 * lib/assessment/api.ts
 * 
 * Supabase API-Funktionen für Assessment-System
 */

import { supabase } from '@/integrations/supabase/client';
import type { ClientMetrics, ProgressPhoto, AssessmentWithPhotos, AssessmentChanges } from '@/types/assessment';
import { calculateBodyFat, calculateAge } from './calculations';

// ══════════════════════════════════════════════════════════════════════
// CREATE ASSESSMENT
// ══════════════════════════════════════════════════════════════════════

export interface CreateAssessmentInput {
  client_id: string;
  weight_kg?: number;
  height_cm?: number;
  body_fat_percent?: number;
  chest_cm?: number;
  waist_cm?: number;
  hip_cm?: number;
  arm_cm?: number;
  thigh_cm?: number;
  caliper_triceps_mm?: number;
  caliper_suprailiac_mm?: number;
  caliper_thigh_mm?: number;
  caliper_chest_mm?: number;
  caliper_midaxillary_mm?: number;
  caliper_subscapular_mm?: number;
  caliper_abdominal_mm?: number;
  notes?: string;
}

export async function createAssessment(
  data: CreateAssessmentInput,
  recordedBy: 'coach' | 'client' = 'coach'
): Promise<ClientMetrics> {
  // Hole Client-Daten für KF%-Berechnung
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('date_of_birth, gender')
    .eq('id', data.client_id)
    .single();

  if (clientError) throw clientError;

  // Berechne KF% aus Caliper (falls vorhanden)
  let bodyFatPercent = data.body_fat_percent;

  if (
    data.caliper_triceps_mm &&
    data.caliper_suprailiac_mm &&
    data.caliper_thigh_mm &&
    client.date_of_birth &&
    client.gender
  ) {
    const age = calculateAge(client.date_of_birth);
    const calculatedBF = calculateBodyFat(
      client.gender as 'male' | 'female' | 'other',
      age,
      {
        triceps_mm: data.caliper_triceps_mm,
        suprailiac_mm: data.caliper_suprailiac_mm,
        thigh_mm: data.caliper_thigh_mm,
        chest_mm: data.caliper_chest_mm,
        midaxillary_mm: data.caliper_midaxillary_mm,
        subscapular_mm: data.caliper_subscapular_mm,
        abdominal_mm: data.caliper_abdominal_mm,
      }
    );

    if (calculatedBF !== null) {
      bodyFatPercent = calculatedBF;
    }
  }

  // Assessment speichern
  const { data: assessment, error } = await supabase
    .from('client_metrics')
    .insert({
      client_id: data.client_id,
      recorded_at: new Date().toISOString(),
      recorded_by: recordedBy,
      weight_kg: data.weight_kg || null,
      height_cm: data.height_cm || null,
      body_fat_percent: bodyFatPercent || null,
      chest_cm: data.chest_cm || null,
      waist_cm: data.waist_cm || null,
      hip_cm: data.hip_cm || null,
      arm_cm: data.arm_cm || null,
      thigh_cm: data.thigh_cm || null,
      caliper_triceps_mm: data.caliper_triceps_mm || null,
      caliper_suprailiac_mm: data.caliper_suprailiac_mm || null,
      caliper_thigh_mm: data.caliper_thigh_mm || null,
      caliper_chest_mm: data.caliper_chest_mm || null,
      caliper_midaxillary_mm: data.caliper_midaxillary_mm || null,
      caliper_subscapular_mm: data.caliper_subscapular_mm || null,
      caliper_abdominal_mm: data.caliper_abdominal_mm || null,
      notes: data.notes || null,
    })
    .select()
    .single();

  if (error) throw error;

  return assessment;
}

// ══════════════════════════════════════════════════════════════════════
// GET ASSESSMENTS
// ══════════════════════════════════════════════════════════════════════

export async function getAssessments(clientId: string): Promise<ClientMetrics[]> {
  const { data, error } = await supabase
    .from('client_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function getLatestAssessment(clientId: string): Promise<ClientMetrics | null> {
  const { data, error } = await supabase
    .from('client_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

  return data || null;
}

// ══════════════════════════════════════════════════════════════════════
// GET ASSESSMENT WITH PHOTOS
// ══════════════════════════════════════════════════════════════════════

export async function getAssessmentWithPhotos(
  clientId: string,
  assessmentDate: string
): Promise<AssessmentWithPhotos | null> {
  // 1. Hole Assessment
  const { data: metrics, error: metricsError } = await supabase
    .from('client_metrics')
    .select('*')
    .eq('client_id', clientId)
    .eq('recorded_at', assessmentDate)
    .single();

  if (metricsError) {
    if (metricsError.code === 'PGRST116') return null;
    throw metricsError;
  }

  // 2. Hole Fotos vom gleichen Tag (±24h)
  const recordedDate = new Date(assessmentDate);
  const dayBefore = new Date(recordedDate.getTime() - 86400000).toISOString();
  const dayAfter = new Date(recordedDate.getTime() + 86400000).toISOString();

  const { data: photos, error: photosError } = await supabase
    .from('progress_photos')
    .select('*')
    .eq('client_id', clientId)
    .gte('taken_at', dayBefore)
    .lte('taken_at', dayAfter)
    .order('taken_at', { ascending: true });

  if (photosError) throw photosError;

  // 3. Berechne Änderungen zum vorherigen Assessment
  const { data: previousAssessments } = await supabase
    .from('client_metrics')
    .select('*')
    .eq('client_id', clientId)
    .lt('recorded_at', assessmentDate)
    .order('recorded_at', { ascending: false })
    .limit(1);

  let changes: AssessmentChanges | null = null;

  if (previousAssessments && previousAssessments.length > 0) {
    const prev = previousAssessments[0];
    const current = metrics;

    changes = {
      weight_delta: current.weight_kg && prev.weight_kg ? current.weight_kg - prev.weight_kg : null,
      bodyfat_delta: current.body_fat_percent && prev.body_fat_percent ? current.body_fat_percent - prev.body_fat_percent : null,
      chest_delta: current.chest_cm && prev.chest_cm ? current.chest_cm - prev.chest_cm : null,
      waist_delta: current.waist_cm && prev.waist_cm ? current.waist_cm - prev.waist_cm : null,
      hip_delta: current.hip_cm && prev.hip_cm ? current.hip_cm - prev.hip_cm : null,
      arm_delta: current.arm_cm && prev.arm_cm ? current.arm_cm - prev.arm_cm : null,
      thigh_delta: current.thigh_cm && prev.thigh_cm ? current.thigh_cm - prev.thigh_cm : null,
      days_since_last: Math.floor(
        (new Date(current.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 86400000
      ),
    };
  }

  return {
    metrics,
    photos: photos || [],
    changes,
  };
}

// ══════════════════════════════════════════════════════════════════════
// LOG WEIGHT (Quick-Entry für Kunde)
// ══════════════════════════════════════════════════════════════════════

export async function logWeight(clientId: string, weight: number): Promise<ClientMetrics> {
  const { data, error } = await supabase
    .from('client_metrics')
    .insert({
      client_id: clientId,
      recorded_at: new Date().toISOString(),
      recorded_by: 'client',
      weight_kg: weight,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

// ══════════════════════════════════════════════════════════════════════
// UPLOAD PHOTO FOR ASSESSMENT
// ══════════════════════════════════════════════════════════════════════

export async function uploadAssessmentPhoto(
  clientId: string,
  file: File,
  assessmentDate: string,
  uploadedBy: 'coach' | 'client' = 'coach'
): Promise<ProgressPhoto> {
  // 1. Upload zu Supabase Storage
  const fileExt = file.name.split('.').pop();
  const fileName = `${clientId}/${Date.now()}.${fileExt}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('progress-photos')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  // 2. Hole Public URL
  const { data: urlData } = supabase.storage
    .from('progress-photos')
    .getPublicUrl(fileName);

  // 3. Speichere Foto-Eintrag
  const { data, error } = await supabase
    .from('progress_photos')
    .insert({
      client_id: clientId,
      photo_url: urlData.publicUrl,
      taken_at: assessmentDate,
      uploaded_by: uploadedBy,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

// ══════════════════════════════════════════════════════════════════════
// DELETE ASSESSMENT
// ══════════════════════════════════════════════════════════════════════

export async function deleteAssessment(assessmentId: string): Promise<void> {
  const { error } = await supabase
    .from('client_metrics')
    .delete()
    .eq('id', assessmentId);

  if (error) throw error;
}
