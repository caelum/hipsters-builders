/**
 * Cloudflare Worker — Newsletter subscribe (single opt-in)
 *
 * POST /subscribe  { "email": "..." }
 *
 * Deploy:
 *   cd workers && npx wrangler deploy
 *
 * Environment variables (set in Cloudflare dashboard):
 *   RESEND_API_KEY — Resend API key
 */

const AUDIENCE_ID = '1f0625e7-1208-4c1b-8a94-60c2ca2437e8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface Env {
  RESEND_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let email: string | undefined;
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      const body = await request.json() as { email?: string };
      email = body.email;
    } else {
      const form = await request.formData();
      email = form.get('email')?.toString();
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, message: 'E-mail invalido.' }, 400);
    }

    try {
      const resp = await fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.toLowerCase().trim(), unsubscribed: false }),
      });

      if (resp.ok || resp.status === 409) {
        return json({ success: true, message: 'Inscricao confirmada! Voce vai receber a proxima edicao.' });
      }

      const err = await resp.text();
      console.error('Resend error:', err);
      return json({ success: false, message: 'Erro ao inscrever. Tente novamente.' }, 500);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ success: false, message: 'Erro ao inscrever. Tente novamente.' }, 500);
    }
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
