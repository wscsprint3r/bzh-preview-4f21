/*
 * The contact form's decisions, with no Astro, no Cloudflare and no network.
 *
 * THE FUNCTION IN `functions/api/contact.ts` IS THE ONLY SERVER-SIDE CODE on
 * this site, and it is deliberately thin: everything here is pure and takes
 * every `fetch` by injection, so the validation, the siteverify call and the
 * Resend payload are unit-tested without either service being reachable from
 * this repository. The adapter keeps only the part no unit test can own - the
 * ORDER the decisions are made in.
 *
 * THE HONEYPOT IS CHECKED BEFORE THE SECRET IS USED. A filled `website` field
 * is a bot that filled every input it found; the reply says nothing about which
 * field gave it away, and `validateContact` is called before `verifyTurnstile`
 * so that reply costs no network call at all. That ordering is asserted in
 * `contact.test.ts` against a fake global `fetch`, because it is a property of
 * the adapter rather than of this file.
 *
 * NO SUBMISSION IS STORED ANYWHERE (spec §10). This module turns a form into
 * one email and forgets it; `ip` rides along in the payload only because the
 * Function reads it from the request.
 */

/**
 * How short a message may be and still be a message.
 *
 * Ten characters, not a round number: "Bună ziua" clears it, a bot's empty or
 * one-word probe does not, and the schema messages in this repository are
 * written for a person rather than for a parser. The boundary is tested.
 */
export const MESSAGE_MIN_LENGTH = 10;

/** The `fetch` this module needs, so every caller and test can inject its own. */
export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** What the form sent. Unknown, because a `FormData` entry may also be a File. */
export interface ContactFields {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown;
}

/** What the parish receives, trimmed and in the form the email is built from. */
export interface ContactValues {
  name: string;
  email: string;
  message: string;
}

export type ContactErrors = Partial<Record<'name' | 'email' | 'message' | 'form', string>>;

export type ContactValidation =
  | { ok: true; values: ContactValues }
  | { ok: false; errors: ContactErrors };

/*
 * Deliberately loose. The address's real shape is decided by whether Resend
 * accepts it and whether the reply reaches a human; a stricter regex here would
 * only reject addresses that work. It rejects the two mistakes a person makes -
 * no `@`, no dot after it - and nothing else.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The form's fields, as values or as the errors a person reads.
 *
 * The honeypot branch returns a single generic error and no field names: the
 * bot that filled the hidden input must not be told which input it was, and
 * neither does a person who somehow tabbed into it.
 */
export function validateContact(fields: ContactFields): ContactValidation {
  const name = asText(fields.name).trim();
  const email = asText(fields.email).trim();
  const message = asText(fields.message).trim();

  if (asText(fields.website).trim() !== '') {
    return { ok: false, errors: { form: 'Cererea nu a putut fi trimisă.' } };
  }

  const errors: ContactErrors = {};
  if (name === '') errors.name = 'Vă rugăm să scrieți numele dumneavoastră.';
  if (!EMAIL.test(email)) errors.email = 'Vă rugăm să scrieți o adresă de e-mail validă.';
  if (message.length < MESSAGE_MIN_LENGTH) {
    errors.message = `Vă rugăm să scrieți mesajul (cel puțin ${MESSAGE_MIN_LENGTH} caractere).`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values: { name, email, message } };
}

/**
 * Cloudflare's siteverify, as a boolean.
 *
 * FALSE FOR EVERYTHING THAT IS NOT AN EXPLICIT `success: true` - a refusal, a
 * 5xx, a body that is not JSON, a rejected connection. A throw here would
 * become an unhandled rejection in the Function and a 500 to the visitor; a
 * `false` becomes the Romanian refusal the form shows.
 */
export async function verifyTurnstile(
  token: string,
  ip: string,
  secret: string,
  fetchFn: FetchFn,
): Promise<boolean> {
  try {
    const response = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const body = (await response.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

/** One validated submission plus the address the Function saw it from. */
export interface ContactPayload extends ContactValues {
  ip: string;
}

export interface EmailConfig {
  apiKey: string;
  to: string;
  from: string;
}

/**
 * The four characters that make a message safe inside an HTML mail body.
 *
 * Exported to no one: the escape is a property of the `html` half below, and
 * `contact.test.ts` proves it through `sendEmail` rather than through this
 * helper, so a refactor cannot leave the test passing against a function the
 * mail no longer goes through.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * One message to Resend, with the sender's address as `reply_to`.
 *
 * `text` is the message verbatim and `html` is the same message escaped: the
 * parish may read either half, and escaping the plain-text one would print
 * `&lt;` to a person. The subject carries the name because the inbox shows the
 * subject before the body.
 */
export async function sendEmail(
  payload: ContactPayload,
  config: EmailConfig,
  fetchFn: FetchFn,
): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        reply_to: payload.email,
        subject: `Formular de contact — ${payload.name}`,
        text: payload.message,
        html: `<p>${escapeHtml(payload.message).replace(/\n/g, '<br>')}</p>`,
      }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
