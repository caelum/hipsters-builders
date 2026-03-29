import type { APIRoute } from 'astro';
import { subscribe } from '../../utils/resend';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';

  let email: string | undefined;

  if (contentType.includes('application/json')) {
    const body = await request.json();
    email = body.email;
  } else {
    // FormData (progressive enhancement fallback)
    const form = await request.formData();
    email = form.get('email')?.toString();
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ success: false, message: 'E-mail invalido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const result = await subscribe(email);

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};
