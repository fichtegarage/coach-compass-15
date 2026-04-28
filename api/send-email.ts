import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const OWNER_EMAIL = 'jakob.neumann@posteo.de';
const ALLOWED_ORIGIN = 'https://buchung.jakob-neumann.net';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+ $ /;
const MAX_HTML_LENGTH = 100_000; // 100 KB
const MAX_SUBJECT_LENGTH = 200;

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

function getClientIp(req: VercelRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, subject, html } = req.body ?? {};
  if (!to || !subject || !html) return res.status(400).json({ error: 'Missing fields' });
  if (typeof to !== 'string' || typeof subject !== 'string' || typeof html !== 'string') {
    return res.status(400).json({ error: 'Invalid field types' });
  }
  if (!EMAIL_REGEX.test(to)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return res.status(400).json({ error: 'Subject too long' });
  }
  if (html.length > MAX_HTML_LENGTH) {
    return res.status(400).json({ error: 'HTML payload too large' });
  }

  const ip = getClientIp(req);
  const authHeader = req.headers.authorization;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // ─── Pfad A: Authentifizierter Trainer ──────────────────────────────────
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.warn(`[send-email] 401 invalid token from ip= $ {ip} to=${to}`);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Trainer darf an beliebige Empfänger senden → durchwinken
  } else {
    // ─── Pfad B: Public-Booking-Modus ─────────────────────────────────────
    const origin = req.headers.origin || req.headers.referer || '';
    if (!origin.startsWith(ALLOWED_ORIGIN)) {
      console.warn(`[send-email] 403 origin-mismatch ip=${ip} origin="${origin}" to=${to}`);
      return res.status(403).json({ error: 'Forbidden origin' });
    }

    if (!
