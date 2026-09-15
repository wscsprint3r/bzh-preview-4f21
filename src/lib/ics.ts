import { etichetaSlujba, inainte, minute } from './schedule';
import type { Slujba, ZiSlujba } from './schema';
import { adaugaZile } from './week';

const CRLF = '\r\n';
const DURATA_IMPLICITA = 90; // minutes, for the last service of a day

/** RFC 5545 §3.3.11 text escaping. Backslash first, or it doubles the others. */
function escapeaza(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 line folding. The limit is 75 *octets*, not characters, and a
 * multi-byte character must not be split across the fold — so we walk the UTF-8
 * encoding and cut on character boundaries.
 */
function impatureste(linie: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linie).length <= 75) return linie;

  const bucati: string[] = [];
  let curenta = '';
  let octeti = 0;

  for (const ch of linie) {
    const n = enc.encode(ch).length;
    if (octeti + n > 75) {
      bucati.push(curenta);
      curenta = ch;
      octeti = n + 1; // the leading space on a continuation line counts
    } else {
      curenta += ch;
      octeti += n;
    }
  }
  bucati.push(curenta);
  return bucati.join(`${CRLF} `);
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
 * NUME_SLUJBE is a closed list, and no day may carry the same `slujba` twice at
 * the same `ora`.
 *
 * COUPLING: the residual gap is two `Altceva` entries whose `detaliu` values fold
 * to the same slug. The schema rejects those today because both carry
 * slujba: 'Altceva' — but that rejection has been flagged as a narrow
 * over-rejection, so if it is ever relaxed to key on `detaliu`, this slug must
 * join the same key.
 *
 * The 40-character cap is LOAD-BEARING. The longest name in NUME_SLUJBE,
 * "Liturghia Darurilor mai înainte sfințite", yields a 40-character slug and a
 * 68-octet UID line, which keeps UIDs under the 75-octet fold. A folded UID would
 * break clients and silently break the /UID:(\S+)/ assertions. A test asserts this
 * against NUME_SLUJBE itself, so adding a longer service name fails loudly.
 */
function slugSlujba(s: Slujba): string {
  const nume = s.slujba === 'Altceva' ? (s.detaliu ?? '') : s.slujba;
  return nume
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'slujba';
}

function laOraIcs(ora: string): string {
  const [h, m] = ora.split(':');
  return `${h.padStart(2, '0')}${m}00`;
}

function laDataIcs(data: string): string {
  return data.replace(/-/g, '');
}

function adaugaMinute(data: string, ora: string, n: number): { data: string; ora: string } {
  const total = minute(ora) + n;
  const zileInPlus = Math.floor(total / 1440);
  const ramas = ((total % 1440) + 1440) % 1440;
  const h = String(Math.floor(ramas / 60)).padStart(2, '0');
  const m = String(ramas % 60).padStart(2, '0');
  if (zileInPlus === 0) return { data, ora: `${h}:${m}` };
  // adaugaZile, not a third hand-rolled Date path. partiData is the one parser
  // and adaugaZile the one arithmetic; both are tested far harder than anything
  // inlined here, and an unvalidated third path is how 30 February got through.
  return { data: adaugaZile(data, zileInPlus), ora: `${h}:${m}` };
}

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

export function genereazaIcs(
  zile: ZiSlujba[],
  opts: { dtstamp: string; locatie: string },
): string {
  const linii: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Parohia Ortodoxa Romana Sfantul Nicolae Zurich//Program//RO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Program liturgic — Sfântul Nicolae Zürich',
    'X-WR-TIMEZONE:Europe/Zurich',
    ...VTIMEZONE,
  ];

  // `inainte`, not localeCompare: ICU collation varies between Node builds and
  // treats hyphens as variable-weight. schedule.ts exports one comparison
  // semantics for these strings; this module uses it rather than a second.
  const sortate = [...zile].sort((a, b) => inainte(a.data, b.data));

  for (const z of sortate) {
    const slujbe = [...z.slujbe].sort((a, b) => minute(a.ora) - minute(b.ora));

    slujbe.forEach((s, i) => {
      // The next service that starts STRICTLY later — not simply the next by
      // index. Two services can share a start time (17:00 Spovedanie during
      // 17:00 Vecernie), and `slujbe[i + 1]` would give the first of them a
      // DTEND equal to its DTSTART. RFC 5545 §3.6.1 requires DTEND to be later
      // than DTSTART, and a zero-length VEVENT renders unpredictably — for a
      // parish, as a service that looks like it is not happening.
      const urmatoarea = slujbe.slice(i + 1).find((u) => minute(u.ora) > minute(s.ora));
      const sfarsit = urmatoarea
        ? { data: z.data, ora: urmatoarea.ora }
        : adaugaMinute(z.data, s.ora, DURATA_IMPLICITA);

      const descriere = [
        z.praznic,
        z.zi_de_post ? 'zi de post' : undefined,
        z.note,
      ].filter(Boolean).join(' · ');

      linii.push(
        'BEGIN:VEVENT',
        // HHMM, not HHMMSS — laOraIcs returns HHMM00, so the first four suffice.
        // The slug is what keeps two services that share a start time apart:
        // 17:00 Spovedanie and 17:00 Vecernie are one ordinary parish evening,
        // and identical UIDs would make subscribers' calendars merge them.
        `UID:${laDataIcs(z.data)}T${laOraIcs(s.ora).slice(0, 4)}-${slugSlujba(s)}@bor-zh.ch`,
        `DTSTAMP:${opts.dtstamp}`,
        `DTSTART;TZID=Europe/Zurich:${laDataIcs(z.data)}T${laOraIcs(s.ora)}`,
        `DTEND;TZID=Europe/Zurich:${laDataIcs(sfarsit.data)}T${laOraIcs(sfarsit.ora)}`,
        `SUMMARY:${escapeaza(etichetaSlujba(s))}`,
        `LOCATION:${escapeaza(z.locatie || opts.locatie)}`,
      );
      if (descriere) linii.push(`DESCRIPTION:${escapeaza(descriere)}`);
      if (z.anulat) linii.push('STATUS:CANCELLED');
      linii.push('END:VEVENT');
    });
  }

  linii.push('END:VCALENDAR');

  // Fold once, uniformly, at the end. Folding as lines are pushed would leave
  // the header lines unfolded and make the 75-octet guarantee depend on nobody
  // ever lengthening X-WR-CALNAME. No raw line contains CRLF at this point,
  // because escapeaza has already turned newlines into a literal \n.
  return linii.map(impatureste).join(CRLF) + CRLF;
}
