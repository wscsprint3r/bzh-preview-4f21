/**
 * Calendar-date arithmetic, ISO week keys, and the only two functions in the
 * codebase that read the clock in a timezone.
 *
 * Every function below except aziLaZurich/oraLaZurich takes and returns plain
 * `YYYY-MM-DD` strings and does its arithmetic in UTC, where a day is always
 * exactly 24h. That is what makes daylight saving unable to move a service: a
 * Liturgy at 10:00 is at 10:00 on both sides of a DST change. Do not reach for
 * local-time Date arithmetic anywhere in here.
 */

import { indiceZi, partiData } from './date-ro';

const MS_PE_ZI = 86_400_000;

/**
 * Parses a date to a UTC timestamp, through the one parser this codebase has.
 *
 * There is deliberately no regex here. `partiData` both parses and validates:
 * it rejects dates that do not exist - month 13, 30 February, and years below
 * 0100, which `Date.UTC` silently maps into the 1900s. A private parser in this
 * module would accept all of those and quietly turn 2026-02-30 into 2 March,
 * putting a wrong day in front of a parishioner. One parser, one place.
 */
function laUtc(data: string): number {
  const { an, luna, zi } = partiData(data);
  return Date.UTC(an, luna - 1, zi);
}

function dinUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Adds days to a calendar date. Arithmetic happens in UTC, where every day is
 * exactly 24h, so daylight saving cannot shift the result.
 */
export function adaugaZile(data: string, n: number): string {
  return dinUtc(laUtc(data) + n * MS_PE_ZI);
}

/**
 * The Monday of that date's week. Paired with sfarsitSaptamana below: callers
 * such as formatIntervalSaptamana(luni, duminica) pass the two positionally and
 * do not re-check the order, so this must always be the earlier of the two.
 */
export function inceputSaptamana(data: string): string {
  return adaugaZile(data, -indiceZi(data));
}

/** The Sunday of that date's week, six days after inceputSaptamana. */
export function sfarsitSaptamana(data: string): string {
  return adaugaZile(inceputSaptamana(data), 6);
}

/**
 * ISO 8601 week key, e.g. "2026-W38". The ISO year is the year of the Thursday
 * in that week, which is why it can differ from the calendar year in late
 * December and early January.
 *
 * The week number is zero-padded on purpose: these keys are compared lexically
 * to find the current week, and "2026-W6" would sort after "2026-W38".
 */
export function cheieSaptamana(data: string): string {
  const joi = adaugaZile(inceputSaptamana(data), 3);
  const anIso = Number(joi.slice(0, 4));
  const primaJoi = adaugaZile(inceputSaptamana(`${anIso}-01-04`), 3);
  const numar = Math.round((laUtc(joi) - laUtc(primaJoi)) / (7 * MS_PE_ZI)) + 1;
  return `${anIso}-W${String(numar).padStart(2, '0')}`;
}

/**
 * The current calendar date in Europe/Zurich. This and oraLaZurich are the only
 * timezone-aware functions in the codebase. en-CA formats as YYYY-MM-DD.
 */
export function aziLaZurich(acum: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(acum);
}

/**
 * The current HH:MM in Europe/Zurich, 24-hour.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter selects the h24
 * cycle in some ICU builds, which formats midnight as "24:30" instead of
 * "00:30" - and urmatoareaSlujba compares that string, so a late-night visitor
 * would be shown the wrong next service.
 */
export function oraLaZurich(acum: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(acum);
}
