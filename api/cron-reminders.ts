import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth via query parameter: ?secret=...
  const secret = Array.isArray(req.query.secret) ? req.query.secret[0] : req.query.secret;
  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Missing RESEND_API_KEY' });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  const sessionsRes = await fetch(
    `${supabaseUrl}/rest/v1/sessions?select=id,session_date,duration_minutes,session_type,client_id,reminder_sent,clients(full_name,email)&status=eq.Scheduled&reminder_sent=eq.false&session_date=gte.${windowStart.toISOString()}&session_date=lte.${windowEnd.toISOString()}`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!sessionsRes.ok) {
    const err = await sessionsRes.text();
    return res.status(500).json({ error: 'Supabase fetch failed', details: err });
  }

  const sessions: any[] = await sessionsRes.json();

  if (sessions.length === 0) {
    return res.status(200).json({ sent: 0, message: 'No sessions in window' });
  }

  const sessionTypeLabels: Record<string, string> = {
    'In-Person Training': 'Präsenz-Training',
    'Online Training': 'Online-Training',
    'Phone Call': 'Telefonat',
    'Check-In Call': 'Check-In Call',
    'Free Intro': 'Erstgespräch',
  };

  let sent = 0;
  for (const session of sessions) {
    const client = session.clients;
    if (!client?.email) continue;

    const startDate = new Date(session.session_date);
    const timeStr = startDate.toLocaleString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Berlin',
    });
    const typeLabel = sessionTypeLabels[session.session_type] || session.session_type;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Jakob Neumann Training <noreply@jakob-neumann.net>',
        to: client.email,
        subject: '⏰ Erinnerung: Dein Training in 2 Stunden',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <p>Hallo ${client.full_name},</p>
            <p>nur eine kurze Erinnerung: dein Training findet in ca. 2 Stunden statt.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0;font-weight:bold;font-size:1.1em;">📅 ${timeStr} Uhr</p>
              <p style="margin:4px 0 0;color:#555;">${typeLabel} · ${session.duration_minutes} Minuten</p>
            </div>
            <p>Bis gleich!<br/>Jakob Neumann Personal Training</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) continue;

    await fetch(`${supabaseUrl}/rest/v1/sessions?id=eq.${session.id}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ reminder_sent: true }),
    });

    sent++;
  }

  return res.status(200).json({ sent, message: `${sent} reminder(s) sent` });
}
