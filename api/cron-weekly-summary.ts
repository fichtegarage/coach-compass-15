import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
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

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceISO = since.toISOString();

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://buchung.jakob-neumann.net";

    const results: Array<{ client: string; status: number }> = [];

    for (const client of clients) {
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

      const mailRes = await fetch(`${baseUrl}/api/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.CRON_SECRET!,
        },
        body: JSON.stringify({
          to: client.email!,
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
