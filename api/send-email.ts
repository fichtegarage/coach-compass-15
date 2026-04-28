import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const OWNER_EMAIL = 'jakob.neumann@posteo.de';
const ALLOWED_ORIGIN = 'https://buchung.jakob-neumann.net';

// Simple in-memory rate limit (pro Lambda-Instanz; reicht als Schutzschicht)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 Min
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, subject, html } = req.body ?? {};
  if (!to || !subject || !html) return res.status(400).json({ error: 'Missing fields' });
  if (typeof to !== 'string' || typeof subject !== 'string' || typeof html !== 'string') {
    return res.status(400).json({ error: 'Invalid field types' });
  }

  const authHeader = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // ─── Pfad A: Authentifizierter Trainer ──────────────────────────────────
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
    // Trainer darf an beliebige Empfänger senden → durchwinken
  } else {
    // ─── Pfad B: Public-Booking-Modus ─────────────────────────────────────
    const origin = req.headers.origin || req.headers.referer || '';
    if (!origin.startsWith(ALLOWED_ORIGIN)) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Empfänger-Whitelist: Owner ODER existierender Client in DB
    if (to !== OWNER_EMAIL) {
      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: client } = await adminSupabase
        .from('clients')
        .select('id')
        .eq('email', to)
        .maybeSingle();
      if (!client) {
        return res.status(403).json({ error: 'Recipient not allowed' });
      }
    }
  }

  // ─── Mail senden (beide Pfade) ──────────────────────────────────────────
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Jakob Neumann Training <hallo@jakob-neumann.net>',
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    return res.status(500).json({ error });
  }

  return res.status(200).json({ success: true });
}
