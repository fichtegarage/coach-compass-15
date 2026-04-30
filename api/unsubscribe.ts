import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const token = url.searchParams.get("token");

  if (!clientId || !token) {
    return new Response("Missing parameters", { status: 400 });
  }

  // Token und client_id gemeinsam prüfen — kein Treffer = kein Update
  const { data: client, error: fetchError } = await supabase
    .from("clients")
    .select("id, email_weekly_summary")
    .eq("id", clientId)
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (fetchError) {
    console.error("Unsubscribe fetch error:", fetchError);
    return new Response("Interner Fehler", { status: 500 });
  }

  if (!client) {
    // Kein Match → Token falsch, client_id falsch oder beides
    return new Response("Ungültiger Abmelde-Link.", { status: 403 });
  }

  if (!client.email_weekly_summary) {
    // Bereits abgemeldet — idempotent, kein Fehler
    return new Response(
      "Du bist bereits abgemeldet und erhältst keine wöchentlichen Zusammenfassungen.",
      { status: 200 }
    );
  }

  const { error: updateError } = await supabase
    .from("clients")
    .update({ email_weekly_summary: false })
    .eq("id", clientId)
    .eq("unsubscribe_token", token); // doppelte Absicherung im UPDATE

  if (updateError) {
    console.error("Unsubscribe update error:", updateError);
    return new Response("Fehler beim Abmelden.", { status: 500 });
  }

  return new Response(
    "Du wurdest erfolgreich abgemeldet. Du erhältst keine wöchentlichen Zusammenfassungen mehr.",
    { status: 200 }
  );
}
