// api/send-email.ts
// Gehärteter E-Mail-Endpoint mit:
// - Origin-Check (nur Aufrufe von buchung.jakob-neumann.net)
// - Trainer-JWT (volle Empfänger-Freiheit) ODER
// - Recipient-Whitelist (Trainer-Mail oder existierende clients.email)

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const ALLOWED_ORIGIN_HOST = 'buchung.jakob-neumann.net';
const TRAINER_EMAIL = 'jakob.neumann@posteo.de';

const resend = new Resend(process.env.RESEND_API_KEY!);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function originAllowed(req: any): boolean {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  try {
    if (origin) {
      const u = new URL(origin);
      if (u.hostname === ALLOWED_ORIGIN_HOST) return true;
    }
    if (referer) {
      const u = new URL(referer);
      if (u.hostname === ALLOWED_ORIGIN_HOST) return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function isAuthenticatedTrainer(req: any): Promise<boolean> {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return false;
    // Optional: weitere Trainer-Rolle-Prüfung (falls nur du als Trainer existierst, reicht das hier)
    return true;
  } catch {
    return false;
  }
}

async function recipientAllowed(to: string): Promise<boolean> {
  if (!to) return false;
  const normalized = to.trim().toLowerCase();
  if (normalized === TRAINER_EMAIL.toLowerCase()) return true;

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id')
    .ilike('email', normalized)
    .limit(1);

  if (error) {
    console.warn('[send-email] clients lookup failed:', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) Origin-Check
  if (!originAllowed(req)) {
    console.warn('[send-email] BLOCKED bad origin', {
      origin: req.headers.origin,
      referer: req.headers.referer,
      ip: req.headers['x-forwarded-for'],
    });
    return res.status(403).json({ error: 'Forbidden (origin)' });
  }

  const { to, subject, html, from } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing fields: to, subject, html' });
  }

  // 2) Auth: Trainer-JWT (frei) ODER Whitelist
  const trainerOk = await isAuthenticatedTrainer(req);

  if (!trainerOk) {
    const ok = await recipientAllowed(to);
    if (!ok) {
      console.warn('[send-email] BLOCKED unauthorized recipient', {
        to,
        ip: req.headers['x-forwarded-for'],
        ua: req.headers['user-agent'],
      });
      return res.status(403).json({ error: 'Forbidden (recipient)' });
    }
  }

  // === RESEND === (ggf. an deinen aktuellen Resend-Code anpassen)
  try {
    const result = await resend.emails.send({
      from: from || 'Jakob Neumann <hallo@jakob-neumann.net>',
      to,
      subject,
      html,
    });
    return res.status(200).json({ ok: true, id: (result as any)?.data?.id });
  } catch (err: any) {
    console.error('[send-email] resend error:', err?.message || err);
    return res.status(500).json({ error: 'Send failed' });
  }
}
