/*
 * WHAT THIS PROVES: the contact form's decisions, and the order they are made
 * in, without a network and without a browser.
 *
 * `contact.ts` is pure and takes every `fetch` by injection, so each half is
 * tested on its own: validation, siteverify, the Resend payload. The Function
 * adapter is imported too, because the ORDER is the thing no pure function can
 * show - a filled honeypot must stop before any network call, and the only way
 * to see that is to call the adapter with a fake `fetch` and count it.
 *
 * The live siteverify and Resend round trip cannot be tested here and is not
 * pretended otherwise: `docs/handover.md` step K is where it is settled.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest, onRequestPost } from '../../functions/api/contact';
import {
  EMAIL_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  NAME_MAX_LENGTH,
  sendEmail,
  validateContact,
  verifyTurnstile,
} from './contact';

const VALID = {
  name: 'Ion Popescu',
  email: 'ion.popescu@example.com',
  message: 'Bună ziua, aș vrea să întreb ceva despre botez.',
  website: '',
};

const EMAIL_CONFIG = {
  apiKey: 'resend-key',
  to: 'parohie@example.com',
  from: 'contact@send.bor-zh.ch',
};

const PAYLOAD = {
  name: 'Ion Popescu',
  email: 'ion.popescu@example.com',
  message: 'Un mesaj de probă.',
};

const ENV = {
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  RESEND_API_KEY: 'resend-key',
  CONTACT_TO: 'parohie@example.com',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A POST to the Function's route with these form fields, as a browser sends it. */
function contactRequest(fields: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request('https://bor-zh.ch/api/contact', { method: 'POST', body: form });
}

/*
 * A `fetch` fake with the signature the injected type declares, so `mock.calls`
 * is typed and the URL and init can be read without casts. `respond` sees both.
 */
function fakeFetch(respond: (url: string, init: RequestInit | undefined) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init));
}

describe('validateContact', () => {
  it('accepts a complete submission and trims what it keeps', () => {
    const result = validateContact({
      ...VALID,
      name: `  ${VALID.name}  `,
      email: `  ${VALID.email}  `,
      message: `  ${VALID.message}  `,
    });
    expect(result).toEqual({
      ok: true,
      values: { name: VALID.name, email: VALID.email, message: VALID.message },
    });
  });

  it('requires a name', () => {
    const result = validateContact({ ...VALID, name: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errors.name).toBeDefined();
  });

  it('requires an e-mail address in a plausible shape', () => {
    const result = validateContact({ ...VALID, email: 'nu-e-o-adresă' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errors.email).toBeDefined();
  });

  it(`requires a message of at least ${MESSAGE_MIN_LENGTH} characters`, () => {
    const short = validateContact({ ...VALID, message: 'scurt' });
    expect(short.ok).toBe(false);
    if (short.ok) throw new Error('unreachable');
    expect(short.errors.message).toBeDefined();

    const boundary = validateContact({ ...VALID, message: 'x'.repeat(MESSAGE_MIN_LENGTH) });
    expect(boundary.ok).toBe(true);
  });

  it('treats missing or non-string fields as empty', () => {
    const result = validateContact({ name: null, email: undefined, message: null, website: null });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(Object.keys(result.errors).sort()).toEqual(['email', 'message', 'name']);
  });

  /*
   * THE CEILING, WITH BOTH SIDES OF IT. `maxlength` on the inputs is a courtesy
   * to a person; a script posts whatever it likes, so the server refuses the
   * same lengths and the boundary is pinned in both directions.
   */
  it(`refuses a name past ${NAME_MAX_LENGTH} characters and accepts the boundary`, () => {
    const over = validateContact({ ...VALID, name: 'x'.repeat(NAME_MAX_LENGTH + 1) });
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error('unreachable');
    expect(over.errors.name).toBeDefined();

    const boundary = validateContact({ ...VALID, name: 'x'.repeat(NAME_MAX_LENGTH) });
    expect(boundary.ok).toBe(true);
  });

  it(`refuses an e-mail past ${EMAIL_MAX_LENGTH} characters and accepts the boundary`, () => {
    const boundaryAddress = `${'a'.repeat(EMAIL_MAX_LENGTH - 5)}@x.co`;
    const over = validateContact({ ...VALID, email: `a${boundaryAddress}` });
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error('unreachable');
    expect(over.errors.email).toBeDefined();

    const boundary = validateContact({ ...VALID, email: boundaryAddress });
    expect(boundary.ok).toBe(true);
  });

  it(`refuses a message past ${MESSAGE_MAX_LENGTH} characters and accepts the boundary`, () => {
    const over = validateContact({ ...VALID, message: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) });
    expect(over.ok).toBe(false);
    if (over.ok) throw new Error('unreachable');
    expect(over.errors.message).toBeDefined();

    const boundary = validateContact({ ...VALID, message: 'x'.repeat(MESSAGE_MAX_LENGTH) });
    expect(boundary.ok).toBe(true);
  });

  /*
   * THE NAME CANNOT CARRY A NEWLINE INTO THE SUBJECT. It is interpolated into
   * the e-mail subject, and CR or LF there is a header-injection attempt; the
   * value that comes out of validation has neither, whatever the input held.
   */
  it('removes line breaks from the name before it can reach a subject', () => {
    const result = validateContact({ ...VALID, name: 'Ion\r\nBcc: victim@example.com' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.values.name).not.toMatch(/[\r\n]/);
    expect(result.values.name).toBe('Ion Bcc: victim@example.com');
  });

  /*
   * THE HONEYPOT IS A TRAP, SO THE REPLY MUST NOT SPRING IT BACK. The error
   * names no field: a bot that reads the response body must not learn which
   * input gave it away, and a person who somehow filled the hidden field gets
   * the same sentence as any other refusal.
   */
  it('rejects a filled honeypot with an error that does not name the trap', () => {
    const result = validateContact({ ...VALID, website: 'http://spam.example' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect('website' in result.errors).toBe(false);
    expect(result.errors.form).toBeDefined();
  });
});

describe('verifyTurnstile', () => {
  it('posts the secret, the token and the IP to siteverify', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(200, { success: true }));
    await expect(verifyTurnstile('token-123', '203.0.113.7', 'secret-xyz', fetchFn)).resolves.toBe(
      true,
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init?.method).toBe('POST');
    const body = new URLSearchParams(init?.body as URLSearchParams);
    expect(body.get('secret')).toBe('secret-xyz');
    expect(body.get('response')).toBe('token-123');
    expect(body.get('remoteip')).toBe('203.0.113.7');
  });

  it('is false when the reply is not success', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(200, { success: false }));
    await expect(verifyTurnstile('token', 'ip', 'secret', fetchFn)).resolves.toBe(false);
  });

  it('is false, never an unhandled throw, when the network fails', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    await expect(verifyTurnstile('token', 'ip', 'secret', fetchFn)).resolves.toBe(false);
  });
});

describe('sendEmail', () => {
  it('posts JSON to Resend with the sender as reply_to', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(200, { id: 'abc' }));
    const result = await sendEmail(PAYLOAD, EMAIL_CONFIG, fetchFn);

    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer resend-key');
    const body = JSON.parse(init?.body as string);
    expect(body.from).toBe('contact@send.bor-zh.ch');
    expect(body.to).toBe('parohie@example.com');
    expect(body.reply_to).toBe('ion.popescu@example.com');
    expect(body.subject).toBe('Formular de contact — Ion Popescu');
    /*
     * THE BODY NAMES THE SENDER. `reply_to` is the one-click path; the body is
     * the one that survives a forwarded copy, and it must carry both halves.
     */
    expect(body.text).toContain(PAYLOAD.message);
    expect(body.text).toContain(`Nume: ${PAYLOAD.name}`);
    expect(body.text).toContain(`E-mail: ${PAYLOAD.email}`);
    expect(body.html).toContain(`mailto:${PAYLOAD.email}`);
  });

  /*
   * THE ESCAPE TEST. The parish's mail client renders `html`; the same message
   * reaches `text` verbatim. A message containing markup must not become markup
   * in the mail body, and the plain-text half must not be escaped - escaping it
   * would print `&lt;script&gt;` to a person reading the text part.
   */
  it('escapes the html half and leaves the text half verbatim', async () => {
    const message = 'Întrebare: <script>alert(1)</script> — atât.';
    const fetchFn = fakeFetch(() => jsonResponse(200, {}));
    await sendEmail({ ...PAYLOAD, message }, EMAIL_CONFIG, fetchFn);

    const body = JSON.parse(fetchFn.mock.calls[0]![1]?.body as string);
    expect(body.text).toContain('<script>alert(1)</script>');
    expect(body.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body.html).not.toContain('<script>');
  });

  it('reports a non-2xx as not sent, with the status', async () => {
    const fetchFn = fakeFetch(() => jsonResponse(422, { message: 'rejected' }));
    await expect(sendEmail(PAYLOAD, EMAIL_CONFIG, fetchFn)).resolves.toEqual({
      ok: false,
      status: 422,
    });
  });

  it('reports a network failure as not sent', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    await expect(sendEmail(PAYLOAD, EMAIL_CONFIG, fetchFn)).resolves.toEqual({
      ok: false,
      status: 0,
    });
  });
});

/*
 * THE ADAPTER, WHERE THE ORDER LIVES.
 *
 * `vi.stubGlobal` rather than passing `fetch` in: the Function is the deployed
 * artifact and calls the global, so replacing the global is the only way to see
 * what the deployed code does. Every case unstubs afterwards.
 */
describe('the Pages Function', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a filled honeypot with 400 and never touches the network', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);

    const response = await onRequestPost({
      request: contactRequest({ ...VALID, website: 'http://spam.example' }),
      env: ENV,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      errors: { form: expect.any(String) },
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an invalid submission before Turnstile is asked', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);

    const response = await onRequestPost({
      request: contactRequest({ ...VALID, email: 'nu-e-o-adresă' }),
      env: ENV,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.errors.email).toBeDefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  /*
   * THE POSITIVE CONTROL FOR THE TWO CASES ABOVE. Without it, an adapter that
   * never calls `fetch` at all would pass "fetch was not touched" forever.
   */
  it('verifies Turnstile and sends a valid submission', async () => {
    const fetchFn = fakeFetch((url) => {
      if (url.includes('siteverify')) return jsonResponse(200, { success: true });
      if (url.includes('api.resend.com')) return jsonResponse(200, { id: 'abc' });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchFn);

    const response = await onRequestPost({ request: contactRequest(VALID), env: ENV });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const urls = fetchFn.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(urls[1]).toBe('https://api.resend.com/emails');
    const siteverify = new URLSearchParams(fetchFn.mock.calls[0]![1]?.body as URLSearchParams);
    expect(siteverify.get('secret')).toBe('turnstile-secret');
  });

  it('refuses when Turnstile says no, without sending a message', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { success: false }));
    vi.stubGlobal('fetch', fetchFn);

    const response = await onRequestPost({ request: contactRequest(VALID), env: ENV });

    expect(response.status).toBe(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  /*
   * A MALFORMED BODY IS A 400, NOT CLOUDFLARE'S 500. `request.formData()`
   * throws on anything that is not form-encoded - a scanner's JSON POST, a
   * probe with no body - and the endpoint is public, so the error it returns
   * has to be the one it means.
   */
  it('answers a body that is not a form with 400, before touching the network', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const request = new Request('https://bor-zh.ch/api/contact', {
      method: 'POST',
      body: '{"name":"Ion"}',
      headers: { 'content-type': 'application/json' },
    });

    const response = await onRequestPost({ request, env: ENV });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: expect.any(String) });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('answers a Resend refusal with 502 and does not claim success', async () => {
    const fetchFn = fakeFetch((url) => {
      if (url.includes('siteverify')) return jsonResponse(200, { success: true });
      return jsonResponse(422, { message: 'rejected' });
    });
    vi.stubGlobal('fetch', fetchFn);

    const response = await onRequestPost({ request: contactRequest(VALID), env: ENV });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ ok: false, error: expect.any(String) });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('answers every method that is not POST with 405', () => {
    const response = onRequest();

    expect(response.status).toBe(405);
  });
});
