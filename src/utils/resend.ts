import { Resend } from 'resend';

const apiKey = import.meta.env.RESEND_API_KEY;

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
