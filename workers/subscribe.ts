/**
 * Cloudflare Worker — Newsletter subscribe + double opt-in
 *
 * Endpoints:
 *   POST /subscribe     — Start subscription (sends confirmation email)
 *   GET  /confirm?t=xxx — Confirm subscription via HMAC token
 *
 * Environment variables (set in Cloudflare dashboard):
 *   RESEND_API_KEY     — Resend API key
 *   RESEND_AUDIENCE_ID — Resend audience ID
 *   SITE_URL           — https://hipsters.builders
 *   FROM_EMAIL          — e.g. "Hipsters Builders <newsletter@hipsters.builders>"
 *
 * Deploy:
 *   npx wrangler deploy workers/subscribe.ts --name hipsters-subscribe
 *
 * Token format (no database needed):
 *   base64url(email + "|" + expiry_unix + "|" + hmac_hex)
 *   HMAC key = first 32 chars of RESEND_API_KEY
 *   Expiry = 48 hours from creation
 */

interface Env {
  RESEND_API_KEY: string;
  RESEND_AUDIENCE_ID: string;
  SITE_URL: string;
  FROM_EMAIL: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TOKEN_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env);
    }

    if (url.pathname === '/confirm' && request.method === 'GET') {
      return handleConfirm(url, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};

// --- Subscribe ---

async function handleSubscribe(request: Request, env: Env): Promise<Response> {
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

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Create contact as unsubscribed (pending confirmation)
    await resendFetch(env, '/audiences/' + env.RESEND_AUDIENCE_ID + '/contacts', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, unsubscribed: true }),
    });

    // Generate HMAC token
    const token = await createToken(normalizedEmail, env.RESEND_API_KEY);
    const confirmUrl = `${env.SITE_URL || 'https://hipsters.builders'}/confirmar?t=${token}`;

    // Send confirmation email
    await resendFetch(env, '/emails', {
      method: 'POST',
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'Hipsters Builders <onboarding@resend.dev>',
        to: normalizedEmail,
        subject: 'Confirme sua inscricao no Hipsters Builders',
        html: confirmationEmailHtml(confirmUrl),
        text: confirmationEmailText(confirmUrl),
      }),
    });

    return json({ success: true, message: 'Enviamos um e-mail de confirmacao. Confere sua inbox!' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('already exists') || msg.includes('409')) {
      return json({ success: true, message: 'Enviamos um e-mail de confirmacao. Confere sua inbox!' });
    }
    console.error('Subscribe error:', msg);
    return json({ success: false, message: 'Erro ao processar. Tente novamente.' }, 500);
  }
}

// --- Confirm ---

async function handleConfirm(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get('t');
  if (!token) {
    return redirectToSite(env, '?confirmed=error');
  }

  const email = await verifyToken(token, env.RESEND_API_KEY);
  if (!email) {
    return redirectToSite(env, '?confirmed=expired');
  }

  try {
    // Get contact ID
    const contacts = await resendFetch(env,
      `/audiences/${env.RESEND_AUDIENCE_ID}/contacts?email=${encodeURIComponent(email)}`,
      { method: 'GET' },
    );
    const contactData = await contacts.json() as { data?: { id: string }[] };
    const contactId = contactData.data?.[0]?.id;

    if (contactId) {
      // Mark as subscribed
      await resendFetch(env,
        `/audiences/${env.RESEND_AUDIENCE_ID}/contacts/${contactId}`,
        { method: 'PATCH', body: JSON.stringify({ unsubscribed: false }) },
      );
    }

    // Send welcome email
    await resendFetch(env, '/emails', {
      method: 'POST',
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'Hipsters Builders <onboarding@resend.dev>',
        to: email,
        subject: 'Bem-vindo ao Hipsters Builders!',
        html: welcomeEmailHtml(),
        text: welcomeEmailText(),
      }),
    });

    return redirectToSite(env, '?confirmed=ok');
  } catch (err) {
    console.error('Confirm error:', err);
    return redirectToSite(env, '?confirmed=error');
  }
}

// --- HMAC Token ---

async function createToken(email: string, apiKey: string): Promise<string> {
  const expiry = Date.now() + TOKEN_EXPIRY_MS;
  const payload = `${email}|${expiry}`;
  const signature = await hmacSign(payload, apiKey);
  const token = btoa(`${payload}|${signature}`);
  return token.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyToken(token: string, apiKey: string): Promise<string | null> {
  try {
    const decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
    const parts = decoded.split('|');
    if (parts.length !== 3) return null;

    const [email, expiryStr, signature] = parts;
    const expiry = parseInt(expiryStr, 10);

    if (Date.now() > expiry) return null;

    const expectedSig = await hmacSign(`${email}|${expiryStr}`, apiKey);
    if (signature !== expectedSig) return null;

    return email;
  } catch {
    return null;
  }
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret.slice(0, 32)),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Resend API ---

async function resendFetch(env: Env, path: string, init: RequestInit): Promise<Response> {
  const resp = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!resp.ok && resp.status !== 409) {
    const body = await resp.text();
    throw new Error(`Resend ${resp.status}: ${body}`);
  }
  return resp;
}

// --- Helpers ---

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function redirectToSite(env: Env, query: string): Response {
  const base = env.SITE_URL || 'https://hipsters.builders';
  return Response.redirect(`${base}${query}`, 302);
}

// --- Email templates ---

function confirmationEmailHtml(confirmUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:'Source Sans 3',-apple-system,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f1e8;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;">
  <tr><td style="padding-bottom:32px;">
    <span style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#1e1e1a;">Hipsters</span><span style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#c4342d;">.</span><span style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#35342f;">builders</span>
  </td></tr>
  <tr><td style="background:#fefbf4;padding:32px;border-top:3px solid #c56e4a;">
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e1e1a;line-height:1.3;">Confirme sua inscricao</h1>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#35342f;">
      Alguem (provavelmente voce) se inscreveu na newsletter do Hipsters Builders com este e-mail. Clique no botao abaixo para confirmar:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#c56e4a;border-radius:6px;">
      <a href="${confirmUrl}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Confirmar inscricao</a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:13px;color:#8a8578;line-height:1.5;">
      Se voce nao se inscreveu, pode ignorar este e-mail. O link expira em 48 horas.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function confirmationEmailText(confirmUrl: string): string {
  return `Confirme sua inscricao no Hipsters Builders

Alguem (provavelmente voce) se inscreveu na newsletter. Acesse o link abaixo para confirmar:

${confirmUrl}

Se voce nao se inscreveu, pode ignorar este e-mail. O link expira em 48 horas.`;
}

function welcomeEmailHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:'Source Sans 3',-apple-system,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f1e8;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;">
  <tr><td style="padding-bottom:32px;">
    <span style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#1e1e1a;">Hipsters</span><span style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#c4342d;">.</span><span style="font-family:Georgia,serif;font-size:24px;font-weight:400;color:#35342f;">builders</span>
  </td></tr>
  <tr><td style="background:#fefbf4;padding:32px;border-top:3px solid #c56e4a;">
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1e1e1a;line-height:1.3;">Bem-vindo ao Hipsters Builders!</h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#35342f;">Voce agora faz parte da comunidade de quem esta buildando software no Brasil.</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#35342f;">Toda semana voce vai receber:</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.7;color:#35342f;">
      <li style="margin-bottom:6px;">Destaques dos podcasts Hipsters Ponto Tech e IA Sob Controle</li>
      <li style="margin-bottom:6px;">As melhores discussoes dos grupos Builders SP e Clauders</li>
      <li style="margin-bottom:6px;">Eventos e encontros de builders pelo Brasil</li>
      <li>Os links mais compartilhados da semana</li>
    </ul>
    <p style="margin:0;font-size:16px;line-height:1.65;color:#35342f;">A primeira edicao chega em breve.</p>
  </td></tr>
  <tr><td style="padding-top:24px;text-align:center;">
    <p style="margin:0;font-size:13px;color:#8a8578;">Hipsters Builders &middot; <a href="https://hipsters.tech" style="color:#8a8578;">Hipsters Network</a> &middot; <a href="https://alura.com.br" style="color:#8a8578;">Alura</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function welcomeEmailText(): string {
  return `Bem-vindo ao Hipsters Builders!

Voce agora faz parte da comunidade de quem esta buildando software no Brasil.

Toda semana voce vai receber:
- Destaques dos podcasts Hipsters Ponto Tech e IA Sob Controle
- As melhores discussoes dos grupos Builders SP e Clauders
- Eventos e encontros de builders pelo Brasil
- Os links mais compartilhados da semana

A primeira edicao chega em breve.

--
Hipsters Builders - Hipsters Network - Alura`;
}
