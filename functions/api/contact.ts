/*
 * `/api/contact`: the contact form's endpoint, and the only server-side code
 * on this site.
 *
 * A Cloudflare Pages Function, so this file must stand on its own: it imports
 * the pure decisions from `src/lib/contact` and uses nothing else - no Astro,
 * no database, no Node API. Pages bundles TypeScript itself, so there is no
 * build step between this file and the deployed route.
 *
 * THE ORDER IS THE ADAPTER'S WHOLE CONTENT, and it is deliberate. Validation
 * (the honeypot included) runs FIRST, before the secret key is spent on a
 * siteverify call: a bot that filled the hidden field, or a person who typed an
 * address with no `@`, gets a 400 without either upstream service being
 * touched. Turnstile runs second, because it is the check that costs a round
 * trip and is only meaningful for a submission that could otherwise be sent.
 * `contact.test.ts` holds that order against a fake global `fetch`; it is the
 * one property no pure function can carry.
 *
 * NOTHING IS STORED. The request is read, forwarded through Resend, answered
 * and dropped - spec §10's "forwards and forgets".
 */
import { sendEmail, validateContact, verifyTurnstile } from '../../src/lib/contact';

/** The Function's environment, as set in the Pages project (handover step K). */
interface Env {
  TURNSTILE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_TO: string;
  /** Optional: the verified sender, when it is not the default below. */
  CONTACT_FROM?: string;
}

export const onRequestPost = async ({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const form = await request.formData();
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const result = validateContact({
    name: form.get('name'),
    email: form.get('email'),
    message: form.get('message'),
    website: form.get('website'),
  });
  if (!result.ok) return json(400, { ok: false, errors: result.errors });

  const turnstileToken = String(form.get('cf-turnstile-response') ?? '');
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!(await verifyTurnstile(turnstileToken, ip, env.TURNSTILE_SECRET_KEY, fetch))) {
    return json(400, { ok: false, error: 'Verificarea de securitate a eșuat.' });
  }

  const sent = await sendEmail(
    { ...result.values, ip },
    {
      apiKey: env.RESEND_API_KEY,
      to: env.CONTACT_TO,
      from: env.CONTACT_FROM ?? 'contact@send.bor-zh.ch',
    },
    fetch,
  );
  if (!sent.ok) return json(502, { ok: false, error: 'Mesajul nu a putut fi trimis.' });
  return json(200, { ok: true });
};

/** Everything that is not a POST. `onRequestPost` above wins for POST. */
export const onRequest = (): Response => new Response('Metodă nepermisă.', { status: 405 });
