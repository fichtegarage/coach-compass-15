import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

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
      model: 'claude-sonnet-4-20250514',
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
