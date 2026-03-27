import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { buildEmail } from '../src/lib/emailTemplate';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sendEmail = async (to: string, subject: string, html: string) => {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Jakob Neumann Training <hallo@jakob-neumann.net>',
      to,
      subject,
      html,
    }),
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Secret prüfen
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Zeitraum: letzte 7 Tage
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Alle Kunden mit aktivem Plan und E-Mail-Opt-in laden
  const { data: clients } = await supabase
    .from('clients')
    .select('id, full_name, email')
    .eq('email_weekly_summary', true)
    .not('email', 'is', null);

  if (!clients || clients.length === 0) {
    return res.status(200).json({ sent: 0 });
  }

  let sentCount = 0;

  for (const client of clients) {
    if (!client.email) continue;

    // Workouts der letzten Woche laden
    const { data: logs } = await supabase
      .from('workout_logs')
      .select('id, started_at, completed_at, plan_workouts ( day_label )')
      .eq('client_id', client.id)
      .not('completed_at', 'is', null)
      .gte('started_at', weekAgo.toISOString())
      .order('started_at');

    // Kein Workout diese Woche → kein Mail (kein Spam bei Inaktivität)
    if (!logs || logs.length === 0) continue;

    const logIds = logs.map(l => l.id);

    // Set-Logs für Volumen + PRs
    const { data: sets } = await supabase
      .from('set_logs')
      .select('workout_log_id, weight_kg, reps_done, is_pr, exercise_name')
      .in('workout_log_id', logIds);

    const totalVolume = (sets || []).reduce(
      (sum, s) => sum + (Number(s.weight_kg) || 0) * (Number(s.reps_done) || 0), 0
    );
    const totalSets = (sets || []).length;
    const prs = (sets || []).filter(s => s.is_pr);

    // Workout-Liste für E-Mail
    const workoutLines = logs.map(log => {
      const name = Array.isArray(log.plan_workouts)
        ? log.plan_workouts[0]?.day_label
        : (log.plan_workouts as any)?.day_label || 'Freies Training';
      const date = new Date(log.started_at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
      const logSets = (sets || []).filter(s => s.workout_log_id === log.id);
      const vol = logSets.reduce((s, x) => s + (Number(x.weight_kg) || 0) * (Number(x.reps_done) || 0), 0);
      return `<li style="margin-bottom:6px;"><strong>${date}</strong> · ${name} · ${logSets.length} Sätze · ${Math.round(vol)}kg</li>`;
    }).join('');

    const prLines = prs.length > 0
      ? `<p style="margin-top:16px;"><strong>🏆 Neue Personal Records:</strong></p>
         <ul style="margin:8px 0 0 0;padding-left:18px;">${prs.map(p => `<li>${p.exercise_name}: ${Number(p.weight_kg)}kg × ${p.reps_done} Wdh.</li>`).join('')}</ul>`
      : '';

    const volumeFormatted = totalVolume >= 1000
      ? `${(totalVolume / 1000).toFixed(1)}t`
      : `${Math.round(totalVolume)}kg`;

    const unsubscribeUrl = `https://buchung.jakob-neumann.net/api/unsubscribe?client_id=${client.id}&secret=${process.env.CRON_SECRET}`;

    const html = buildEmail(`
      <p>Hallo ${client.full_name},</p>
      <p>hier ist deine Trainings-Zusammenfassung der letzten Woche:</p>

      <div style="background:#f0fdf4;border-radius:12px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 8px 0;font-weight:600;">📊 Diese Woche</p>
        <p style="margin:0;font-size:15px;">
          <strong>${logs.length}</strong> Workout${logs.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
          <strong>${totalSets}</strong> Sätze &nbsp;·&nbsp;
          <strong>${volumeFormatted}</strong> Gesamtvolumen
        </p>
      </div>

      <p><strong>Deine Einheiten:</strong></p>
      <ul style="margin:8px 0 0 0;padding-left:18px;">${workoutLines}</ul>

      ${prLines}

      <p style="margin-top:20px;">Weiter so – jede Einheit zählt! 💪</p>
      <p>Bis bald,<br>Jakob</p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="font-size:12px;color:#94a3b8;text-align:center;">
        Du möchtest keine wöchentlichen Zusammenfassungen mehr?
        <a href="${unsubscribeUrl}" style="color:#94a3b8;">Hier abmelden</a>
      </p>
    `);

    await sendEmail(client.email, `Deine Trainingswoche – ${logs.length} Workout${logs.length !== 1 ? 's' : ''} ✅`, html);
    sentCount++;
  }

  return res.status(200).json({ sent: sentCount });
}
