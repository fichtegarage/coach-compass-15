// api/send-email.ts
// Gesichert gegen offenes E-Mail-Relay:
//   1. Origin-Check: nur Aufrufe von buchung.jakob-neumann.net
//   2. Trainer-JWT (Authorization: Bearer ...): freie Empfänger erlaubt
//   3. Kein JWT: Empfänger muss jakob.neumann@posteo.de oder in clients.email sein

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const ALLOWED_ORIGIN_HOST = 'buchung.jakob-neumann.net';
const TRAINER_EMAIL = 'jakob.neumann@posteo.de';

const resend = new Resend(process.env.RESEND_API_KEY!);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Prüft ob Origin oder Referer von unserer Domain kommt
function originAllowed(req: any): boolean {
  const origin: string = req.headers['origin'] || '';
  const referer: string = req.headers['referer'] || '';
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

// Prüft ob ein gültiger Supabase-JWT im Authorization-Header steckt
async function isAuthenticatedTrainer(req: any): Promise<boolean> {
  const auth: string = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return false;
    return true;
  } catch {
    return false;
  }
}

// Prüft ob Empfänger-Adresse in clients.email vorkommt (oder Trainer-Mail ist)
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
    console.warn('[send-email] DB-Lookup fehlgeschlagen:', error.message);
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
    console.warn('[send-email] BLOCKED — unerlaubter Origin', {
      origin: req.headers['origin'],
      referer: req.headers['referer'],
      ip: req.headers['x-forwarded-for'],
      ua: req.headers['user-agent'],
    });
    return res.status(403).json({ error: 'Forbidden (origin)' });
  }

  const { to, subject, html, from } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Fehlende Felder: to, subject, html' });
  }

  // 2) Trainer-JWT vorhanden → volle Freiheit. Sonst: Whitelist prüfen.
  const trainerAuthenticated = await isAuthenticatedTrainer(req);

  if (!trainerAuthenticated) {
    const allowed = await recipientAllowed(to);
    if (!allowed) {
      console.warn('[send-email] BLOCKED — Empfänger nicht in Whitelist', {
        to,
        ip: req.headers['x-forwarded-for'],
        ua: req.headers['user-agent'],
      });
      return res.status(403).json({ error: 'Forbidden (recipient)' });
    }
  }

  // 3) Mail absenden
  try {
    const result = await resend.emails.send({
      from: from || 'Jakob Neumann <hallo@jakob-neumann.net>',
      to,
      subject,
      html,
    });
    return res.status(200).json({ ok: true, id: (result as any)?.data?.id });
  } catch (err: any) {
    console.error('[send-email] Resend-Fehler:', err?.message || err);
    return res.status(500).json({ error: 'Versand fehlgeschlagen' });
  }
}
