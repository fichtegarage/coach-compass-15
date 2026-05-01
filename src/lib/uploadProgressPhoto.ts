import { supabase } from '@/integrations/supabase/client';

export async function uploadProgressPhoto(
  clientId: string,
  file: File
): Promise<{ url: string; error?: string }> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${clientId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('progress-photos')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    // ⚠️ KEIN getPublicUrl mehr — wir speichern den reinen Pfad in der DB.
    const { error: dbError } = await supabase
      .from('progress_photos')
      .insert({
        client_id: clientId,
        photo_url: fileName, // ← reiner Pfad statt Public-URL
        taken_at: new Date().toISOString().split('T')[0],
        uploaded_by: 'coach',
      });

    if (dbError) throw dbError;

    return { url: fileName };
  } catch (error: any) {
    console.error('Upload Error:', error);
    return { url: '', error: error.message };
  }
}
