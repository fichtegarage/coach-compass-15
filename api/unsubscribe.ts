import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request) {
  const { searchParams } = new URL(
    req.url,
    "https://buchung.jakob-neumann.net"
  );

  const clientId = searchParams.get("client_id");
  const token = searchParams.get("token");

  if (!clientId || !token) {
    return new Response("Fehlende Parameter.", { status: 400 });
  }

  // Kundin anhand ID laden und Token prüfen
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, unsubscribe_token")
    .eq("id", clientId)
    .single();

  if (error || !client) {
    return new Response("Ungültiger Abmelde-Link.", { status: 403 });
  }

  if (client.unsubscribe_token !== token) {
    return new Response("Ungültiger Abmelde-Link.", { status: 403 });
  }

  // Token stimmt — abmelden
  const { error: updateError } = await supabase
    .from("clients")
    .update({ email_weekly_summary: false })
    .eq("id", clientId);

  if (updateError) {
    return new Response("Fehler beim Abmelden.", { status: 500 });
  }

  return new Response(
    "Du wurdest erfolgreich abgemeldet. Du erhältst keine Wochen-Zusammenfassungen mehr.",
    { status: 200 }
  );
}
