import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Supabase-Client mit Service-Role-Key, nur server-seitig.
// Wird genutzt, um den vom Browser mitgesendeten JWT zu verifizieren.
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // --- Auth-Check: JWT aus Authorization-Header lesen und verifizieren ---
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    console.warn('claude-proxy: invalid token', userError?.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Ab hier: userData.user.id ist die UUID des eingeloggten Trainers.
  // --- Auth-Check Ende ---

  const { messages, max_tokens = 1000 } = req.body;
  if (!messages) return res.status(400).json({ error: 'Missing messages' });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Claude proxy error:', error);
    return res.status(500).json({ error });
  }

  const data = await response.json();
  return res.status(200).json(data);
}
