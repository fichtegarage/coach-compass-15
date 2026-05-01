/**
 * api/sign-photo-url.ts
 *
 * Stellt signed URLs für Fotos aus, wenn die anfragende Kundin
 * den passenden Buchungscode hat.
 *
 * Body: { bucket: 'progress-photos'|'client-photos', path: string, booking_code: string }
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bucket, path, booking_code } = req.body || {};

    if (!bucket || !path || !booking_code) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (bucket !== 'progress-photos' && bucket !== 'client-photos') {
      return res.status(400).json({ error: 'Invalid bucket' });
    }

    // 1. Buchungscode → Client-ID auflösen
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id')
      .eq('booking_code', booking_code)
      .eq('booking_code_active', true)
      .maybeSingle();

    if (clientErr || !client) {
      return res.status(403).json({ error: 'Invalid booking code' });
    }

    // 2. Pfad muss zur Client-ID passen
    // progress-photos: <clientId>/... ODER <userId>/<clientId>/... ODER client/<clientId>/...
    // client-photos:   <userId>/<clientId>-<ts>.<ext>
    const pathContainsClientId = path.includes(client.id);
    if (!pathContainsClientId) {
      return res.status(403).json({ error: 'Path does not match client' });
    }

    // 3. Signed URL ausstellen
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data) {
      return res.status(500).json({ error: error?.message || 'Sign failed' });
    }

    return res.status(200).json({ signedUrl: data.signedUrl });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
