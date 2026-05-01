import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { client_id, token } = req.query;

  if (!client_id || !token) {
    return res.status(400).send("Fehlende Parameter");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("clients")
    .select("id, unsubscribe_token")
    .eq("id", client_id)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).send("Nicht gefunden");
  }

  if (data.unsubscribe_token !== token) {
    return res.status(403).send("Ungültiger Token");
  }

  const { error: updateError } = await supabase
    .from("clients")
    .update({ email_weekly_summary: false })
    .eq("id", client_id);

  if (updateError) {
    return res.status(500).send("Datenbankfehler");
  }

  return res.status(200).send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:50px">
      <h1>✅ Erfolgreich abgemeldet</h1>
      <p>Du wirst keine wöchentlichen Zusammenfassungen mehr erhalten.</p>
    </body></html>
  `);
}
