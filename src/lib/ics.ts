import { serviceLabel, compareDates, minutes, servicesInOrder } from './schedule';
import type { Service, ServiceDay } from './schema';
import { addDays } from './week';

const CRLF = '\r\n';
const DEFAULT_DURATION = 90; // minutes, for the last service of a day

/** RFC 5545 §3.3.11 text escaping. Backslash first, or it doubles the others. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 line folding. The limit is 75 *octets*, not characters, and a
 * multi-byte character must not be split across the fold — so we walk the UTF-8
 * encoding and cut on character boundaries.
 */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const pieces: string[] = [];
  let current = '';
  let bytes = 0;

  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 75) {
      pieces.push(current);
      current = ch;
      bytes = n + 1; // the leading space on a continuation line counts
    } else {
      current += ch;
      bytes += n;
    }
  }
  pieces.push(current);
  return pieces.join(`${CRLF} `);
}

/**
 * ASCII slug of the service name, for the UID.
 *
 * Diacritics are FOLDED (Sfânta -> sfanta), which deliberately maps a name and
 * its unaccented spelling to the same slug. That is the right trade: an ASCII
 * slug is stable however the YAML is normalised, readable inside a UID, and safe
 * in every client. Distinguishing Sfânta from Sfanta is not a property anyone
 * should want — they are the same service, one of them misspelled.
 *
 * What actually prevents two different services colliding is Task 4's schema:
 * SERVICE_NAMES is a closed list, and no day may carry the same `service` twice at
 * the same `time`.
 *
 * COUPLING: the residual gap is two `Altceva` entries whose `detail` values fold
 * to the same slug. The schema rejects those today because both carry
 * slujba: 'Altceva' — but that rejection has been flagged as a narrow
 * over-rejection, so if it is ever relaxed to key on `detail`, this slug must
 * join the same key.
 *
 * The 40-character cap is LOAD-BEARING. The longest name in SERVICE_NAMES,
 * "Liturghia Darurilor mai înainte sfințite", yields a 40-character slug and a
 * 68-octet UID line, which keeps UIDs under the 75-octet fold. A folded UID would
 * break clients and silently break the /UID:(\S+)/ assertions. A test asserts this
 * against SERVICE_NAMES itself, so adding a longer service name fails loudly.
 */
function serviceSlug(s: Service): string {
  const name = s.service === 'Altceva' ? (s.detail ?? '') : s.service;
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'slujba';
}

function toIcsTime(time: string): string {
  const [h, m] = time.split(':');
  return `${h.padStart(2, '0')}${m}00`;
}

function toIcsDate(date: string): string {
  return date.replace(/-/g, '');
}

function addMinutes(date: string, time: string, n: number): { date: string; time: string } {
  const total = minutes(time) + n;
  const extraDays = Math.floor(total / 1440);
  const leftover = ((total % 1440) + 1440) % 1440;
  const h = String(Math.floor(leftover / 60)).padStart(2, '0');
  const m = String(leftover % 60).padStart(2, '0');
  if (extraDays === 0) return { date, time: `${h}:${m}` };
  // addDays, not a third hand-rolled Date path. dateParts is the one parser
  // and addDays the one arithmetic; both are tested far harder than anything
  // inlined here, and an unvalidated third path is how 30 February got through.
  return { date: addDays(date, extraDays), time: `${h}:${m}` };
}

/**
 * Prefix written into a cancelled service's SUMMARY, on top of STATUS:CANCELLED.
 *
 * REPORTED, NOT VERIFIED BY US: Google Calendar is said to hide cancelled events
 * from subscribed feeds. If that is so, STATUS:CANCELLED alone makes a cancelled
 * day quietly empty on the most widely used client - which is the same failure
 * as the day disappearing altogether, one layer out, and is what the schema rule
 * requiring a cancelled day to keep its times exists to prevent.
 *
 * So both: the status for clients that honour it, and a marker in the text for
 * clients that show the event anyway. A client that hides cancelled events at
 * least does not show a service that is not happening; a client that shows them
 * makes the cancellation unmissable. The case ruled out is the middle one, where
 * the entry looks ordinary.
 *
 * Short and leading, because a phone's month view shows perhaps twenty
 * characters. Invariable rather than agreeing with the service name: `slujbă` is
 * feminine but `Acatist` and `Botez` are masculine, so an agreeing adjective
 * would be wrong on most of SERVICE_NAMES.
 *
 * A real subscription test against Google after launch is the only thing that
 * settles whether the hiding behaviour is real.
 */
const CANCELLED_MARKER = 'ANULAT: ';

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Zurich',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export function generateIcs(
  days: ServiceDay[],
  opts: { dtstamp: string; location: string },
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Parohia Ortodoxa Romana Sfantul Nicolae Zurich//Program//RO',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Program liturgic — Sfântul Nicolae Zürich',
    'X-WR-TIMEZONE:Europe/Zurich',
    ...VTIMEZONE,
  ];

  // `compareDates`, not localeCompare: ICU collation varies between Node builds and
  // treats hyphens as variable-weight. schedule.ts exports one comparison
  // semantics for these strings; this module uses it rather than a second.
  const sorted = [...days].sort((a, b) => compareDates(a.date, b.date));

  for (const z of sorted) {
    const services = servicesInOrder(z.services);

    services.forEach((s, i) => {
      // The next service that starts STRICTLY later — not simply the next by
      // index. Two services can share a start time (17:00 Spovedanie during
      // 17:00 Vecernie), and `services[i + 1]` would give the first of them a
      // DTEND equal to its DTSTART. RFC 5545 §3.6.1 requires DTEND to be later
      // than DTSTART, and a zero-length VEVENT renders unpredictably — for a
      // parish, as a service that looks like it is not happening.
      const nextLater = services.slice(i + 1).find((u) => minutes(u.time) > minutes(s.time));
      const end = nextLater
        ? { date: z.date, time: nextLater.time }
        : addMinutes(z.date, s.time, DEFAULT_DURATION);

      const description = [
        z.feast,
        z.fast_day ? 'zi de post' : undefined,
        z.notes,
      ].filter(Boolean).join(' · ');

      lines.push(
        'BEGIN:VEVENT',
        // HHMM, not HHMMSS — toIcsTime returns HHMM00, so the first four suffice.
        // The slug is what keeps two services that share a start time apart:
        // 17:00 Spovedanie and 17:00 Vecernie are one ordinary parish evening,
        // and identical UIDs would make subscribers' calendars merge them.
        `UID:${toIcsDate(z.date)}T${toIcsTime(s.time).slice(0, 4)}-${serviceSlug(s)}@bor-zh.ch`,
        `DTSTAMP:${opts.dtstamp}`,
        `DTSTART;TZID=Europe/Zurich:${toIcsDate(z.date)}T${toIcsTime(s.time)}`,
        `DTEND;TZID=Europe/Zurich:${toIcsDate(end.date)}T${toIcsTime(end.time)}`,
        `SUMMARY:${escapeText(z.cancelled ? CANCELLED_MARKER + serviceLabel(s) : serviceLabel(s))}`,
        `LOCATION:${escapeText(z.location || opts.location)}`,
      );
      if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
      if (z.cancelled) lines.push('STATUS:CANCELLED');
      lines.push('END:VEVENT');
    });
  }

  lines.push('END:VCALENDAR');

  // Fold once, uniformly, at the end. Folding as lines are pushed would leave
  // the header lines unfolded and make the 75-octet guarantee depend on nobody
  // ever lengthening X-WR-CALNAME. No raw line contains CRLF at this point,
  // because escapeaza has already turned newlines into a literal \n.
  return lines.map(fold).join(CRLF) + CRLF;
}
