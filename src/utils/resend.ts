import { Resend } from 'resend';

const apiKey = import.meta.env.RESEND_API_KEY;
const fromEmail = import.meta.env.RESEND_FROM_EMAIL || 'Hipsters Builders <onboarding@resend.dev>';

/** Returns null when API key is not configured (dev mode / pre-launch) */
export function getResendClient(): Resend | null {
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Get or create the Hipsters Builders audience in Resend.
 * Caches the audience ID after first lookup.
 */
let cachedAudienceId: string | null = null;

export async function getAudienceId(resend: Resend): Promise<string> {
  // Use env var if provided
  const envId = import.meta.env.RESEND_AUDIENCE_ID;
  if (envId) return envId;

  // Use cache
  if (cachedAudienceId) return cachedAudienceId;

  // Look up existing audience
  const { data: audiences } = await resend.audiences.list();
  const existing = audiences?.data?.find(a => a.name === 'Hipsters Builders');
  if (existing) {
    cachedAudienceId = existing.id;
    return existing.id;
  }

  // Create new audience
  const { data: created } = await resend.audiences.create({
    name: 'Hipsters Builders',
  });
  if (!created) throw new Error('Failed to create Resend audience');
  cachedAudienceId = created.id;
  return created.id;
}

/**
 * Subscribe an email to the newsletter audience.
 * Returns { success, message }.
 */
export async function subscribe(email: string): Promise<{ success: boolean; message: string }> {
  const resend = getResendClient();
  if (!resend) {
    return { success: false, message: 'Newsletter ainda nao esta configurada. Tente novamente em breve.' };
  }

  try {
    const audienceId = await getAudienceId(resend);

    await resend.contacts.create({
      audienceId,
      email,
      unsubscribed: false,
    });

    // Send welcome email
    await sendWelcomeEmail(resend, email);

    return { success: true, message: 'Inscricao confirmada! Voce vai receber a proxima edicao.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    // Resend returns 409 if contact already exists — treat as success
    if (message.includes('already exists') || message.includes('409')) {
      return { success: true, message: 'Voce ja esta inscrito! Fique de olho no seu e-mail.' };
    }
    console.error('Resend subscribe error:', message);
    return { success: false, message: 'Erro ao inscrever. Tente novamente.' };
  }
}

/**
 * Send a welcome email to new subscribers.
 * Uses Resend's send API with a simple, well-formatted HTML template.
 */
async function sendWelcomeEmail(resend: Resend, email: string): Promise<void> {
  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Bem-vindo ao Hipsters Builders!',
      html: welcomeEmailHtml(),
      text: welcomeEmailText(),
    });
  } catch (err) {
    // Don't fail the subscription if welcome email fails
    console.error('Welcome email failed:', err instanceof Error ? err.message : err);
  }
}

function welcomeEmailHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f5f1e8; font-family:'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f1e8;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;">

          <!-- Brand -->
          <tr>
            <td style="padding-bottom: 32px;">
              <span style="font-family:Georgia, 'Times New Roman', serif; font-size:24px; font-weight:700; color:#1e1e1a;">Hipsters</span><span style="font-family:Georgia, serif; font-size:24px; font-weight:700; color:#c4342d;">.</span><span style="font-family:Georgia, serif; font-size:24px; font-weight:400; color:#35342f;">builders</span>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background-color:#fefbf4; padding:32px; border-top:3px solid #c56e4a;">
              <h1 style="margin:0 0 16px; font-family:'Source Sans 3', -apple-system, sans-serif; font-size:22px; font-weight:700; color:#1e1e1a; line-height:1.3;">
                Bem-vindo ao Hipsters Builders!
              </h1>
              <p style="margin:0 0 16px; font-size:16px; line-height:1.65; color:#35342f;">
                Voce agora faz parte da comunidade de quem esta buildando software no Brasil.
              </p>
              <p style="margin:0 0 20px; font-size:16px; line-height:1.65; color:#35342f;">
                Toda semana voce vai receber:
              </p>
              <ul style="margin:0 0 20px; padding-left:20px; font-size:15px; line-height:1.7; color:#35342f;">
                <li style="margin-bottom:6px;">Destaques dos podcasts Hipsters Ponto Tech e IA Sob Controle</li>
                <li style="margin-bottom:6px;">As melhores discussoes dos grupos Builders SP e Clauders</li>
                <li style="margin-bottom:6px;">Eventos e encontros de builders pelo Brasil</li>
                <li>Os links mais compartilhados da semana</li>
              </ul>
              <p style="margin:0; font-size:16px; line-height:1.65; color:#35342f;">
                A primeira edicao chega em breve. Enquanto isso, acompanhe a comunidade em
                <a href="https://hipsters.builders" style="color:#c56e4a; text-decoration:underline;">hipsters.builders</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px; text-align:center;">
              <p style="margin:0; font-size:13px; color:#8a8578; line-height:1.5;">
                Hipsters Builders &middot; parte da <a href="https://hipsters.tech" style="color:#8a8578;">Hipsters Network</a> &middot; <a href="https://alura.com.br" style="color:#8a8578;">Alura</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function welcomeEmailText(): string {
  return `Bem-vindo ao Hipsters Builders!

Voce agora faz parte da comunidade de quem esta buildando software no Brasil.

Toda semana voce vai receber:
- Destaques dos podcasts Hipsters Ponto Tech e IA Sob Controle
- As melhores discussoes dos grupos Builders SP e Clauders
- Eventos e encontros de builders pelo Brasil
- Os links mais compartilhados da semana

A primeira edicao chega em breve. Enquanto isso, acompanhe a comunidade em https://hipsters.builders

--
Hipsters Builders - parte da Hipsters Network - Alura`;
}
