import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Cron-Job-Authentifizierung
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Alle Clients mit aktivierter Weekly Summary
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, full_name, email")
      .eq("email_weekly_summary", true)
      .not("email", "is", null)
      .neq("email", "");

    if (clientsError) {
      return res.status(500).json({ error: "DB error (clients)", detail: clientsError.message });
    }

    if (!clients || clients.length === 0) {
      return res.status(200).json({ sent: [], note: "No clients with weekly summary enabled" });
    }

    // Zeitraum: letzte 7 Tage
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceISO = since.toISOString();

    const results: Array<{ client: string; status: number }> = [];

    for (const client of clients) {
      // Sessions des Clients in den letzten 7 Tagen
      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select("session_date, session_type, notes")
        .eq("client_id", client.id)
        .gte("session_date", sinceISO)
        .order("session_date", { ascending: true });

      if (sessionsError) {
        results.push({ client: client.email!, status: 500 });
        continue;
      }

      const count = sessions?.length ?? 0;

      // HTML-Mail bauen
      const sessionsList =
        count === 0
          ? "<p>In dieser Woche wurden keine Trainingseinheiten geloggt.</p>"
          : "<ul>" +
            sessions!
              .map((s) => {
                const date = new Date(s.session_date).toLocaleDateString("de-DE");
                const type = s.session_type ?? "Training";
                return `<li><strong>${date}</strong> – ${type}</li>`;
              })
              .join("") +
            "</ul>";

      const html = `
        <h2>Hallo ${client.full_name ?? ""}!</h2>
        <p>Hier ist deine Wochenzusammenfassung:</p>
        <p><strong>${count}</strong> Trainingseinheit(en) in den letzten 7 Tagen.</p>
        ${sessionsList}
        <p>Weiter so! 💪</p>
      `;

      // Mail an /api/send-email
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "https://buchung.jakob-neumann.net";

      const mailRes = await fetch(`${baseUrl}/api/send-email`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Origin": "https://buchung.jakob-neumann.net"
  },
  body: JSON.stringify({
    to: client.email,
    subject: "Deine Wochenzusammenfassung 💪",
    html,
  }),
});


      results.push({ client: client.email!, status: mailRes.status });
    }

    return res.status(200).json({ sent: results });
  } catch (err: any) {
    return res.status(500).json({ error: "Handler crashed", detail: err?.message ?? String(err) });
  }
}
