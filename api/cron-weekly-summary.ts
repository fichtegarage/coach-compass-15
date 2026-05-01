import { createClient } from "@supabase/supabase-js";
import { buildEmail } from "../src/lib/emailTemplate";
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
      .select("id, full_name, email, unsubscribe_token")
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

    const results: Array<{ client: string; status: number }> = [];

    for (const client of clients) {
      // 1. Workout-Logs der letzten 7 Tage
      const { data: workoutLogs, error: wlError } = await supabase
        .from("workout_logs")
        .select("id, started_at, rating")
        .eq("client_id", client.id)
        .gte("started_at", sinceISO)
        .order("started_at", { ascending: true });

      if (wlError) {
        results.push({ client: client.email!, status: 500 });
        continue;
      }

      const workoutCount = workoutLogs?.length ?? 0;
      let totalVolume = 0;
      let totalPRs = 0;

      // 2. Set-Logs separat abfragen (Supabase Nested-Select-Eigenart)
      if (workoutCount > 0) {
        const workoutLogIds = workoutLogs!.map((w) => w.id);
        const { data: setLogs, error: slError } = await supabase
          .from("set_logs")
          .select("reps_done, weight_kg, is_pr")
          .in("workout_log_id", workoutLogIds);

        if (!slError && setLogs) {
          for (const set of setLogs) {
            totalVolume += (Number(set.reps_done) || 0) * (Number(set.weight_kg) || 0);
            if (set.is_pr) totalPRs++;
          }
        }
      }

      // 3. Mail aufbauen
      const firstName = (client.full_name || "").split(" ")[0] || "du";
      const unsubscribeUrl = `https://buchung.jakob-neumann.net/api/unsubscribe?client_id=${client.id}&token=${client.unsubscribe_token}`;

      const workoutListHtml =
        workoutCount === 0
          ? `<p style="color:#71717a;">In dieser Woche wurden keine Trainingseinheiten geloggt.</p>`
          : "<ul style='padding-left:20px;margin:8px 0;'>" +
            workoutLogs!
              .map((w) => {
                const date = new Date(w.started_at).toLocaleDateString("de-DE", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                });
                const rating = w.rating ? ` · ${w.rating}/10 ⭐` : "";
                return `<li style="margin-bottom:4px;"><strong>${date}</strong>${rating}</li>`;
              })
              .join("") +
            "</ul>";

      const contentHtml = `
        <p>Hallo ${firstName}! 👋</p>
        <p>Hier ist deine <strong>Wochenzusammenfassung</strong>:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:10px 14px;background:#f4f4f5;border-radius:8px;width:33%;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#18181b;">${workoutCount}</div>
              <div style="font-size:12px;color:#71717a;margin-top:2px;">Einheiten</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:10px 14px;background:#f4f4f5;border-radius:8px;width:33%;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#18181b;">${Math.round(totalVolume).toLocaleString("de-DE")}</div>
              <div style="font-size:12px;color:#71717a;margin-top:2px;">kg Volumen</div>
            </td>
            <td style="width:8px;"></td>
            <td style="padding:10px 14px;background:#f4f4f5;border-radius:8px;width:33%;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#18181b;">${totalPRs > 0 ? `${totalPRs} 🏆` : "–"}</div>
              <div style="font-size:12px;color:#71717a;margin-top:2px;">Neue PRs</div>
            </td>
          </tr>
        </table>
        ${workoutListHtml}
        ${workoutCount > 0 ? "<p>Stark gemacht – weiter so! 💪</p>" : "<p>Nächste Woche wieder angreifen! 💪</p>"}
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 16px;" />
        <p style="font-size:12px;color:#a1a1aa;margin:0;">
          Du erhältst diese Mail, weil wöchentliche Zusammenfassungen für dich aktiviert sind.<br/>
          <a href="${unsubscribeUrl}" style="color:#a1a1aa;">Vom Newsletter abmelden</a>
        </p>
      `;

      const mailRes = await fetch("https://buchung.jakob-neumann.net/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.CRON_SECRET!,
        },
        body: JSON.stringify({
          to: client.email!,
          subject: "Deine Wochenzusammenfassung 💪",
          html: buildEmail(contentHtml),
        }),
      });

      results.push({ client: client.email!, status: mailRes.status });
    }

    return res.status(200).json({ sent: results });
  } catch (err: any) {
    return res.status(500).json({ error: "Handler crashed", detail: err?.message ?? String(err) });
  }
}
