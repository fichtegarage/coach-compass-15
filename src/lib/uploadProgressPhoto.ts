import { supabase } from '@/integrations/supabase/client';

export async function uploadProgressPhoto(
  clientId: string,
  file: File
): Promise<{ url: string; error?: string }> {
  try {
    // 1. Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${clientId}/${Date.now()}.${fileExt}`;
    
    // 2. Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('progress-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 3. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('progress-photos')
      .getPublicUrl(fileName);

    // 4. Save to progress_photos table
    const { error: dbError } = await supabase
      .from('progress_photos')
      .insert({
        client_id: clientId,
        photo_url: publicUrl,
        taken_at: new Date().toISOString().split('T')[0],
        uploaded_by: 'coach'
      });

    if (dbError) throw dbError;

    return { url: publicUrl };
  } catch (error: any) {
    console.error('Upload Error:', error);
    return { url: '', error: error.message };
  }
}
