import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// HTML-Escape gegen Injection in Mail-Body
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  // session_date ist timestamptz — als deutsches Datum + Uhrzeit ausgeben
  const d = new Date(iso);
  const date = d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const time = d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time} Uhr`;
}

export default async function handler(req: Request) {
  // Cron-Authentifizierung
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://buchung.jakob-neumann.net";

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, full_name, email, trainer_id, unsubscribe_token")
    .eq("email_weekly_summary", true);

  if (error) {
    console.error("Error loading clients:", error);
    return new Response("Error loading clients", { status: 500 });
  }

  if (!clients || clients.length === 0) {
    return new Response(JSON.stringify({ sent: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Aktuelle Kalenderwoche (Montag 00:00 – Sonntag 23:59)
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // So=7
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + 1);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const results: Array<{ client: string; status: number }> = [];

  for (const client of clients) {
    const displayName =
      (client.full_name as string | null) ||
      (client.name as string | null) ||
      "";
    const firstName = displayName.split(" ")[0] || "Kunde";

    // Sessions der Woche aus der korrekten Tabelle
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select("session_date, session_type, status")
      .eq("client_id", client.id)
      .gte("session_date", startOfWeek.toISOString())
      .lte("session_date", endOfWeek.toISOString())
      .order("session_date", { ascending: true });

    if (sessErr) {
      console.error(`Error loading sessions for ${client.email}:`, sessErr);
      results.push({ client: client.email, status: 0 });
      continue;
    }

    const listHtml =
      sessions && sessions.length > 0
        ? `<ul style="padding-left:18px;margin:8px 0;">${sessions
            .map(
              (s) =>
                `<li>${esc(formatDate(s.session_date))} — ${esc(
                  s.session_type || "Training"
                )} <span style="color:#666;">(${esc(s.status)})</span></li>`
            )
            .join("")}</ul>`
        : `<p style="margin:8px 0;color:#666;">Keine Termine diese Woche.</p>`;

    const unsubscribeUrl = `${baseUrl}/api/unsubscribe?client_id=${
      client.id
    }&token=${encodeURIComponent(client.unsubscribe_token ?? "")}`;

    const html = `<!DOCTYPE html>
<html lang="de"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:16px;line-height:1.5;">
  <p>Hallo ${esc(firstName)},</p>
  <p>hier ist deine Wochenzusammenfassung:</p>
  ${listHtml}
  <p>Bis bald,<br>Jakob</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#888;">
    Du möchtest keine Wochenzusammenfassung mehr erhalten?
    <a href="${unsubscribeUrl}" style="color:#888;">Hier abmelden</a>.
  </p>
</body></html>`;

    const res = await fetch(`${baseUrl}/api/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET!,
      },
      body: JSON.stringify({
        to: client.email,
        subject: "Deine Wochenzusammenfassung 💪",
        html,
      }),
    });

    results.push({ client: client.email, status: res.status });
  }

  return new Response(JSON.stringify({ sent: results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
