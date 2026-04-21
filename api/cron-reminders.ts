import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── E-Mail Template (inline, da kein @/-Alias in Vercel Serverless Functions) ─
const LOGO_URL = 'https://buchung.jakob-neumann.net/Logo.png';

function buildEmail(contentHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding:32px 40px 24px;">
              <img
                src="${LOGO_URL}"
                alt="Jakob Neumann Training"
                width="180"
                style="display:block;height:auto;max-width:180px;"
              />
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;color:#18181b;font-size:16px;line-height:1.7;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0;" />
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding:20px 40px 32px;">
              <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#18181b;">Jakob</p>
              <p style="margin:0 0 1px;font-size:13px;color:#71717a;">Jakob Neumann Personal Training</p>
              <p style="margin:0;font-size:13px;color:#71717a;font-style:italic;">Stronger Every Day</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ─────────────────────────────────────────────────────────────────────────────

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
    'Duo Training': 'Duo-Training',
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
    
    const firstName = (booking.customer_name || '').split(' ')[0] || 'Kunde';
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Jakob Neumann Training <hallo@jakob-neumann.net>',
        to: client.email,
        subject: '⏰ Erinnerung: Dein Training in 2 Stunden',
        html: buildEmail(`
          <h1>Hallo ${firstName}</h1>
          <p>nur eine kurze Erinnerung: dein Training findet in ca. 2 Stunden statt.</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:0;font-weight:bold;font-size:1.05em;">📅 ${timeStr} Uhr</p>
            <p style="margin:6px 0 0;color:#555;font-size:14px;">${typeLabel} · ${session.duration_minutes} Minuten</p>
          </div>
          <p>Bis gleich!</p>
        `),
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
