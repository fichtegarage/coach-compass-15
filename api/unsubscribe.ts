import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { client_id, secret } = req.query;

  // Einfache Absicherung über CRON_SECRET
  if (!client_id || secret !== process.env.CRON_SECRET) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
        <p>❌ Ungültiger Abmeldelink.</p>
      </body></html>
    `);
  }

  const { error } = await supabase
    .from('clients')
    .update({ email_weekly_summary: false })
    .eq('id', client_id);

  if (error) {
    return res.status(500).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
        <p>❌ Abmeldung fehlgeschlagen. Bitte kontaktiere Jakob direkt.</p>
      </body></html>
    `);
  }

  return res.status(200).send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
      <h2>✅ Erfolgreich abgemeldet</h2>
      <p>Du erhältst keine wöchentlichen Zusammenfassungen mehr.</p>
      <p style="margin-top:24px;">
        <a href="https://buchung.jakob-neumann.net" style="color:#10b981;">Zurück zur App</a>
      </p>
    </body></html>
  `);
}
