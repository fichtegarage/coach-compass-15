import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function formatICalDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const sessionTypeLabels: Record<string, string> = {
  'In-Person Training': 'Präsenz-Training',
  'Online Training': 'Online-Training',
  'Phone Call': 'Telefonat',
  'Check-In Call': 'Check-In Call',
  'Free Intro': 'Kostenloses Erstgespräch',
  'Duo Training': 'Duo Training',
};

const statusLabels: Record<string, string> = {
  'Completed': 'Abgeschlossen',
  'No-Show': 'Nicht erschienen',
  'Cancelled by Client': 'Vom Kunden abgesagt',
  'Cancelled by Trainer': 'Vom Trainer abgesagt',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = req.query.user_id as string;
  if (!userId) {
    return res.status(400).send('Missing user_id');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*, clients!sessions_client_id_fkey(full_name), second_client:clients!sessions_second_client_id_fkey(full_name)')
    .eq('user_id', userId)
    .order('session_date', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const { data: packages } = await supabase
    .from('packages')
    .select('id, sessions_included')
    .eq('user_id', userId);

  const pkgMap = new Map((packages || []).map((p: any) => [p.id, p.sessions_included]));

  const pkgSessionCount = new Map<string, number>();
  for (const s of sessions || []) {
    if (s.package_id && ['Completed', 'No-Show'].includes(s.status)) {
      pkgSessionCount.set(s.package_id, (pkgSessionCount.get(s.package_id) || 0) + 1);
    }
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CoachHub//Training Sessions//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Trainings',
    'X-WR-TIMEZONE:Europe/Berlin',
  ];

  for (const s of sessions || []) {
    const start = new Date(s.session_date);
    const end = new Date(start.getTime() + (s.duration_minutes || 60) * 60000);
    const clientName = (s.clients as any)?.full_name || 'Unbekannt';
    const secondClientName = (s.second_client as any)?.full_name;
    const loc = s.location || 'Gym';
    const isDuo = s.session_type === 'Duo Training';

    let countStr = '';
    if (s.package_id && pkgMap.has(s.package_id)) {
      const used = pkgSessionCount.get(s.package_id) || 0;
      const total = pkgMap.get(s.package_id);
      countStr = ` (${used}/${total})`;
    }

    const displayName = isDuo && secondClientName
      ? `${clientName} & ${secondClientName}`
      : clientName;

    const summary = `${displayName} – ${sessionTypeLabels[s.session_type] || s.session_type}${countStr}`;
    const description = `${statusLabels[s.status] || s.status}${s.notes ? '\\n' + s.notes : ''}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`DTSTART:${formatICalDate(start)}`);
    lines.push(`DTEND:${formatICalDate(end)}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`LOCATION:${loc}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push(`UID:${s.id}@coachhub`);
    lines.push(`DTSTAMP:${formatICalDate(new Date())}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="trainings.ics"');
  return res.status(200).send(lines.join('\r\n'));
}
