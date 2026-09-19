import { describe, expect, it } from 'vitest';
import type { EventEntry } from './events';
import { eventDates, eventSlug, splitEvents } from './events';

function event(id: string, start_date: string): EventEntry {
  return { id, data: { title: id, start_date, location: 'Zürich' } };
}

describe('eventSlug', () => {
  /*
   * THE ONE DIFFERENCE FROM `articleSlug`, pinned: an event id that begins with
   * a date keeps it. If event filenames ever gain a date prefix, this test is
   * what says the decision was made rather than the two links drifting apart.
   */
  it('is the id unchanged, date-shaped or not', () => {
    expect(eventSlug('hramul-parohiei')).toBe('hramul-parohiei');
    expect(eventSlug('2026-10-04-hramul-parohiei')).toBe('2026-10-04-hramul-parohiei');
  });
});

describe('splitEvents', () => {
  const TODAY = '2026-09-16';
  const entries = [
    event('c', '2026-10-01'),
    event('a', '2026-09-20'),
    event('b', '2026-09-16'),
    event('d', '2026-09-10'),
    event('e', '2026-09-01'),
  ];

  it('splits on the start date, with today on the upcoming side', () => {
    const { upcoming, past } = splitEvents(entries, TODAY);
    expect(upcoming.map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(past.map((e) => e.id)).toEqual(['d', 'e']);
  });

  it('sorts upcoming ascending and past descending', () => {
    const { upcoming, past } = splitEvents(entries, TODAY);
    expect(upcoming.map((e) => e.data.start_date)).toEqual([
      '2026-09-16',
      '2026-09-20',
      '2026-10-01',
    ]);
    expect(past.map((e) => e.data.start_date)).toEqual(['2026-09-10', '2026-09-01']);
  });

  // Same start date: the order is the id's, so two rebuilds cannot disagree.
  it('breaks ties by id on both sides', () => {
    const tied = [event('b', '2026-10-01'), event('a', '2026-10-01')];
    expect(splitEvents(tied, TODAY).upcoming.map((e) => e.id)).toEqual(['a', 'b']);
    const tiedPast = [event('b', '2026-09-01'), event('a', '2026-09-01')];
    expect(splitEvents(tiedPast, TODAY).past.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('leaves the caller\'s array alone', () => {
    const input = [event('c', '2026-10-01'), event('a', '2026-09-20')];
    const before = input.map((e) => e.id);
    splitEvents(input, TODAY);
    expect(input.map((e) => e.id)).toEqual(before);
  });

  it('puts an empty collection in both sides, not in one', () => {
    expect(splitEvents([], TODAY)).toEqual({ upcoming: [], past: [] });
  });
});

describe('eventDates', () => {
  it('writes a one-day event once, with its year', () => {
    expect(eventDates('2026-10-04')).toEqual({ start: 'Duminică, 4 octombrie 2026', end: null });
  });

  it('writes a same-year range with the year once, at the end', () => {
    expect(eventDates('2026-10-02', '2026-10-04')).toEqual({
      start: 'Vineri, 2 octombrie',
      end: 'Duminică, 4 octombrie 2026',
    });
  });

  it('writes the year on both dates when the range crosses one', () => {
    expect(eventDates('2026-12-28', '2027-01-03')).toEqual({
      start: 'Luni, 28 decembrie 2026',
      end: 'Duminică, 3 ianuarie 2027',
    });
  });

  // The schema permits `end_date === start_date`; the page must not turn it
  // into a range of one day. `null` is what both routes pass after normalising.
  it('treats an end date equal to the start, or no end date, as one day', () => {
    expect(eventDates('2026-10-04', '2026-10-04')).toEqual({
      start: 'Duminică, 4 octombrie 2026',
      end: null,
    });
    expect(eventDates('2026-10-04', null)).toEqual({
      start: 'Duminică, 4 octombrie 2026',
      end: null,
    });
  });
});
