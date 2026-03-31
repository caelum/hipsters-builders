/**
 * Cloudflare Worker — Newsletter subscribe with email confirmation
 *
 * POST /subscribe       — Create contact (pending) + send confirmation email
 * GET  /confirm?t=xxx   — Verify token, activate contact, redirect to thank you page
 *
 * Deploy: npx wrangler deploy -c workers/wrangler.toml
 * Secret: npx wrangler secret put RESEND_API_KEY -c workers/wrangler.toml
 */

const AUDIENCE_ID = '1f0625e7-1208-4c1b-8a94-60c2ca2437e8';
const SITE_URL = 'https://caelum.github.io/hipsters-builders';
const FROM_EMAIL = 'Hipsters Builders <onboarding@resend.dev>';
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface Env { RESEND_API_KEY: string }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === '/subscribe' && req.method === 'POST') return subscribe(req, env);
    if (url.pathname === '/confirm') return confirm(url, env);
    return json({ error: 'Not found' }, 404);
  },
};

// ── Subscribe ──────────────────────────────────────────

async function subscribe(req: Request, env: Env): Promise<Response> {
  let email: string | undefined;
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('json')) {
    email = ((await req.json()) as { email?: string }).email;
  } else {
    email = (await req.formData()).get('email')?.toString();
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, message: 'E-mail invalido.' }, 400);
  }

  const normalized = email.toLowerCase().trim();

  try {
    // Try to send confirmation email first
    const token = await makeToken(normalized, env.RESEND_API_KEY);
    const workerOrigin = new URL(req.url).origin;
    const confirmUrl = `${workerOrigin}/confirm?t=${token}`;

    let emailSent = false;
    try {
      await resend(env, '/emails', 'POST', {
        from: FROM_EMAIL,
        to: normalized,
        subject: 'Confirme sua inscricao no Hipsters Builders',
        html: confirmHtml(confirmUrl),
        text: confirmText(confirmUrl),
      });
      emailSent = true;
    } catch (emailErr) {
      // Domain not verified yet — fall back to direct subscribe
      console.error('Email send failed (domain not verified?):', emailErr);
    }

    // Create contact: pending if email sent, active if not
    await resend(env, `/audiences/${AUDIENCE_ID}/contacts`, 'POST', {
      email: normalized, unsubscribed: emailSent,
    });

    if (emailSent) {
      return json({ success: true, message: 'Enviamos um e-mail de confirmacao. Confere sua inbox!' });
    } else {
      return json({ success: true, message: 'Inscricao confirmada! Voce vai receber a proxima edicao.' });
    }
  } catch (err: any) {
    if (err?.message?.includes('already exists') || err?.message?.includes('409')) {
      return json({ success: true, message: 'Voce ja esta inscrito!' });
    }
    console.error('subscribe:', err);
    return json({ success: false, message: 'Erro ao inscrever. Tente novamente.' }, 500);
  }
}

// ── Confirm ────────────────────────────────────────────

async function confirm(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get('t');
  if (!token) return redirect('?confirmed=error');

  const email = await verifyToken(token, env.RESEND_API_KEY);
  if (!email) return redirect('?confirmed=expired');

  try {
    // Find contact and activate
    const resp = await resend(env, `/audiences/${AUDIENCE_ID}/contacts?email=${encodeURIComponent(email)}`, 'GET');
    const data = (await resp.json()) as { data?: { id: string }[] };
    const id = data.data?.[0]?.id;

    if (id) {
      await resend(env, `/audiences/${AUDIENCE_ID}/contacts/${id}`, 'PATCH', { unsubscribed: false });
    }

    return redirect('/obrigado');
  } catch (err) {
    console.error('confirm:', err);
    return redirect('?confirmed=error');
  }
}

// ── HMAC Token ─────────────────────────────────────────

async function makeToken(email: string, secret: string): Promise<string> {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const payload = `${email}|${expiry}`;
  const sig = await hmac(payload, secret);
  return btoa(`${payload}|${sig}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
    const [email, exp, sig] = decoded.split('|');
    if (Date.now() > parseInt(exp)) return null;
    if (sig !== await hmac(`${email}|${exp}`, secret)) return null;
    return email;
  } catch { return null; }
}

async function hmac(msg: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret.slice(0, 32)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Resend API ─────────────────────────────────────────

async function resend(env: Env, path: string, method: string, body?: unknown): Promise<Response> {
  const resp = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!resp.ok && resp.status !== 409) {
    const text = await resp.text();
    throw new Error(`Resend ${resp.status}: ${text}`);
  }
  return resp;
}

// ── Helpers ────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function redirect(path: string): Response {
  return Response.redirect(`${SITE_URL}${path}`, 302);
}

// ── Email template ─────────────────────────────────────

function confirmHtml(url: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e8;">
<tr><td align="center" style="padding:48px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

  <!-- Brand -->
  <tr><td style="padding-bottom:28px;">
    <span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1e1e1a;">Hipsters</span><span style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#c4342d;">.</span><span style="font-family:Georgia,serif;font-size:22px;font-weight:400;color:#35342f;">builders</span>
  </td></tr>

  <!-- Card -->
  <tr><td style="background:#fefbf4;border-top:3px solid #c56e4a;padding:36px 32px;">
    <p style="margin:0 0 8px;font-family:monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#c56e4a;">Confirmacao</p>
    <h1 style="margin:0 0 20px;font-size:24px;font-weight:700;color:#1e1e1a;line-height:1.25;">Falta so um clique.</h1>
    <p style="margin:0 0 28px;font-size:16px;line-height:1.65;color:#35342f;">
      Voce se inscreveu na newsletter do Hipsters Builders. Confirme clicando no botao abaixo:
    </p>

    <!-- Button -->
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#c56e4a;border-radius:6px;">
        <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
          Confirmar inscricao
        </a>
      </td>
    </tr></table>

    <p style="margin:28px 0 0;font-size:13px;line-height:1.55;color:#8a8578;">
      Se voce nao se inscreveu, pode ignorar este e-mail.<br>O link expira em 48 horas.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding-top:20px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#8a8578;">
      Hipsters Builders &middot; <a href="https://hipsters.tech" style="color:#8a8578;">Hipsters Network</a> &middot; <a href="https://alura.com.br" style="color:#8a8578;">Alura</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function confirmText(url: string): string {
  return `Confirme sua inscricao no Hipsters Builders

Voce se inscreveu na newsletter do Hipsters Builders.
Acesse o link abaixo para confirmar:

${url}

Se voce nao se inscreveu, pode ignorar este e-mail.
O link expira em 48 horas.

--
Hipsters Builders - Hipsters Network - Alura`;
}
