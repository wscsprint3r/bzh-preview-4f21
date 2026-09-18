import { describe, expect, it } from 'vitest';
import { dayIndex } from './date-ro';
import {
  addDays,
  nowInZurich,
  todayInZurich,
  weekKey,
  weekStart,
  timeInZurich,
  weekEnd,
} from './week';

describe('addDays', () => {
  it('adds inside the month', () => {
    expect(addDays('2026-09-14', 6)).toBe('2026-09-20');
  });

  it('crosses the month boundary', () => {
    expect(addDays('2026-09-28', 6)).toBe('2026-10-04');
  });

  it('crosses the year boundary', () => {
    expect(addDays('2025-12-29', 6)).toBe('2026-01-04');
  });

  it('subtracts with negative numbers', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('respects leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is unaffected by the switch to summer time', () => {
    // 2026-03-29 is the European DST switch. A naive local-time
    // implementation adding 24h in milliseconds lands back on the 29th.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('is unaffected by the switch to winter time', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
});

describe('weekStart and weekEnd', () => {
  it('a Monday is its own start of week', () => {
    expect(weekStart('2026-09-14')).toBe('2026-09-14');
  });

  it('a Sunday belongs to the week that starts on Monday', () => {
    expect(weekStart('2026-09-20')).toBe('2026-09-14');
    expect(weekEnd('2026-09-20')).toBe('2026-09-20');
  });

  it('a Wednesday anchors correctly', () => {
    expect(weekStart('2026-09-16')).toBe('2026-09-14');
    expect(weekEnd('2026-09-16')).toBe('2026-09-20');
  });
});

describe('weekKey', () => {
  it('numbers an ordinary week', () => {
    expect(weekKey('2026-09-14')).toBe('2026-W38');
    expect(weekKey('2026-09-20')).toBe('2026-W38');
  });

  it('assigns the days at the end of December to the next ISO year', () => {
    // 2026-01-01 is a Thursday, so ISO week 1 of 2026 starts Mon 2025-12-29.
    expect(weekKey('2025-12-29')).toBe('2026-W01');
    expect(weekKey('2026-01-04')).toBe('2026-W01');
  });

  it('assigns 1 January to the previous ISO year when it falls at the end of the week', () => {
    // 2027-01-01 is a Friday, so it belongs to the week starting Mon 2026-12-28,
    // which is ISO week 53 of 2026.
    expect(weekKey('2027-01-01')).toBe('2026-W53');
  });

  it('zero-pads single-digit weeks', () => {
    expect(weekKey('2026-02-02')).toBe('2026-W06');
  });
});

describe('todayInZurich', () => {
  it('returns the date in Zürich, not in UTC', () => {
    // 22:30 UTC on 14 Sept is already 00:30 on 15 Sept in Zürich (CEST, UTC+2).
    const now = new Date('2026-09-14T22:30:00Z');
    expect(todayInZurich(now)).toBe('2026-09-15');
  });

  it('returns the current date in the expected format', () => {
    expect(todayInZurich()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("lays out year, month and day in ISO order, not in the locale's order", () => {
    // The day is 15, so greater than any month number: a day/month
    // inversion would be visible here, and a shape regex would not catch it.
    // On a small-icu build that has no en-CA, format() would give
    // "09/15/2026" (en-US) or "15.09.2026" (de-CH). That is why the function
    // assembles from formatToParts, looking up each field by type.
    const today = todayInZurich(new Date('2026-09-15T10:00:00Z'));
    expect(today).toBe('2026-09-15');
    expect(today.split('-')).toEqual(['2026', '09', '15']);
  });

  it('uses Latin digits', () => {
    // The fallback locale also decides the numbering system: without
    // numberingSystem 'latn', ar-EG would write the same date with Arabic-Indic
    // digits, which no comparison below would survive.
    expect(todayInZurich(new Date('2026-09-15T10:00:00Z'))).toMatch(/^[0-9-]+$/);
  });
});

describe('timeInZurich', () => {
  it('converts UTC to local summer time', () => {
    expect(timeInZurich(new Date('2026-09-14T08:30:00Z'))).toBe('10:30');
  });

  it('converts UTC to local winter time', () => {
    expect(timeInZurich(new Date('2026-12-14T08:30:00Z'))).toBe('09:30');
  });

  it('separates hour from minute with a colon, in that order', () => {
    // 14:05 - the minute below 10 makes an hour/minute inversion visible, and
    // the separator itself is locale-dependent: da-DK writes "14.05".
    const time = timeInZurich(new Date('2026-09-15T12:05:00Z'));
    expect(time).toBe('14:05');
    expect(time.split(':')).toEqual(['14', '05']);
  });

  it('uses Latin digits', () => {
    expect(timeInZurich(new Date('2026-09-15T12:05:00Z'))).toMatch(/^[0-9:]+$/);
  });

  it('writes midnight as 00:xx, not 24:xx', () => {
    // 22:30 UTC is 00:30 the next day in Zürich (CEST). Some ICU builds format
    // this as "24:30" under hour12:false - which would break time comparison.
    expect(timeInZurich(new Date('2026-09-14T22:30:00Z'))).toBe('00:30');
  });

  /*
   * THE h23 DEFENCE, WITH A CONTROL - it was the one clock defence without one.
   *
   * `hour12: false` in place of `hourCycle: 'h23'` SURVIVES every test above,
   * because this machine's ICU resolves the two the same way. That is not a
   * property of the code and it is not a property this repository can assert by
   * behaviour: the difference only shows on an ICU build that resolves
   * `hour12: false` to the h24 cycle, and the comment in `week.ts` says so.
   *
   * What CAN be measured here is both halves of the claim, and they are the two
   * cases below: that the h24 cycle really does write this instant as `24:30` on
   * this very ICU - so the hazard is demonstrated rather than asserted - and that
   * `timeInZurich` asks for h23 by name. The second is a test of what is
   * REQUESTED rather than of what comes back, which is unusual here and is the
   * point: it is the only thing that separates the two spellings on a machine
   * where their answers agree.
   */
  const MIDNIGHT = new Date('2026-09-14T22:30:00Z');

  it('control: the h24 cycle really does write this instant as 24:30 on this ICU', () => {
    const withOptions = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit',
        numberingSystem: 'latn', ...options,
      }).format(MIDNIGHT);
    const h24 = withOptions({ hourCycle: 'h24' });
    const h23 = withOptions({ hourCycle: 'h23' });
    // Measured, not assumed: the number below is the one a
    // later reader checks against if a comment contradicts it. `console.log` is not
    // visible on the green run; `process.stdout.write` passes through the reporter.
    process.stdout.write(`\n22:30 UTC la Zürich: h23 -> ${h23} · h24 -> ${h24} · hour12:false -> ${withOptions({ hour12: false })}\n`);
    expect(h24).toBe('24:30');
    expect(h23).toBe('00:30');
  });

  it('timeInZurich asks for the h23 cycle by name, not hour12', () => {
    const Original = Intl.DateTimeFormat;
    const target = Intl as unknown as { DateTimeFormat: unknown };
    const requested: Intl.DateTimeFormatOptions[] = [];
    target.DateTimeFormat = function (local?: unknown, options?: Intl.DateTimeFormatOptions) {
      requested.push(options ?? {});
      return new Original(local as string | undefined, options);
    };
    try {
      expect(timeInZurich(MIDNIGHT)).toBe('00:30');
    } finally {
      target.DateTimeFormat = Original;
    }
    expect(requested).toHaveLength(1);
    expect(requested[0].hourCycle).toBe('h23');
    // And the other half: the two are not allowed to be requested together, because
    // `hour12` takes priority over `hourCycle` and would erase the very defence being tested.
    expect(requested[0].hour12).toBeUndefined();
  });
});

describe('date validation', () => {
  // toUtc parses through dateParts from ./date-ro; there is no second parser in
  // this module.
  //
  // Only the first test guards toUtc itself. addDays is the one export that
  // reaches toUtc without going through dayIndex, so if someone "simplified"
  // toUtc back to a bare regex, that test is the only one here that would fail
  // - and 30 February would otherwise sail through into a liturgical schedule.
  // The other two enter through dayIndex, which calls dateParts before toUtc is
  // ever reached; they document the validation on those paths, and would keep
  // passing against a bare-regex toUtc. Do not read them as a second guard.
  it('rejects a day that does not exist', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(/Nonexistent date/);
  });

  it('rejects month 13', () => {
    expect(() => weekStart('2026-13-01')).toThrow(/Nonexistent date/);
  });

  it('rejects a wrong format', () => {
    expect(() => weekKey('2026-9-14')).toThrow(/Invalid date/);
  });
});

describe('the Monday-Sunday contract', () => {
  // formatWeekRange(luni, duminica) does not check its argument order;
  // it trusts that weekStart is always the Monday and weekEnd
  // always the Sunday of the same week, so callers can pass them positionally.
  it('anchors every day of the week to the same Monday and the same Sunday', () => {
    const week = [
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20',
    ];
    for (const day of week) {
      expect(weekStart(day)).toBe('2026-09-14');
      expect(weekEnd(day)).toBe('2026-09-20');
      expect(dayIndex(weekStart(day))).toBe(0); // Monday
      expect(dayIndex(weekEnd(day))).toBe(6); // Sunday
    }
  });

  it('anchors the week that crosses the year too', () => {
    // 1 January 2026 is a Thursday, so its week starts Mon 29 December 2025.
    // Going back across the year boundary is the case a within-month negative
    // step does not exercise.
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
    expect(weekEnd('2026-01-01')).toBe('2026-01-04');
    expect(dayIndex(weekStart('2026-01-01'))).toBe(0);
    expect(dayIndex(weekEnd('2026-01-01'))).toBe(6);
  });
});

describe('independence from the fallback locale', () => {
  // The shape tests above run on a full-ICU machine, where en-CA and en-GB
  // always resolve - so they can never see the failure they are meant to
  // guard. A small-icu build drops the requested locale and falls back to the
  // default one. Forcing that fallback is the only way to test it here, and
  // this is the test that fails against a format()-based implementation.
  function withForcedLocale<T>(locale: string, f: () => T): T {
    const Original = Intl.DateTimeFormat;
    const target = Intl as unknown as { DateTimeFormat: unknown };
    target.DateTimeFormat = function (
      _cerut?: unknown,
      options?: Intl.DateTimeFormatOptions,
    ) {
      return new Original(locale, options);
    };
    try {
      return f();
    } finally {
      target.DateTimeFormat = Original;
    }
  }

  const instant = new Date('2026-09-15T12:05:00Z');

  // en-US reorders to 09/15/2026, de-CH to 15.09.2026, da-DK writes the time
  // as 14.05, and ar-EG uses Arabic-Indic digits for both.
  for (const locale of ['en-US', 'de-CH', 'ja-JP', 'da-DK', 'ar-EG']) {
    it(`returns ISO even if Intl falls back to ${locale}`, () => {
      expect(withForcedLocale(locale, () => todayInZurich(instant))).toBe('2026-09-15');
      expect(withForcedLocale(locale, () => timeInZurich(instant))).toBe('14:05');
    });
  }

  it('restores Intl.DateTimeFormat after every test', () => {
    expect(todayInZurich(instant)).toBe('2026-09-15');
  });
});

describe('nowInZurich', () => {
  it('gives the date and the time of the same instant', () => {
    expect(nowInZurich(new Date('2026-09-15T12:05:00Z'))).toEqual({
      today: '2026-09-15',
      time: '14:05',
    });
  });

  it('crosses midnight as a pair', () => {
    // 23:59:59.999 in Zürich, then one millisecond later.
    expect(nowInZurich(new Date('2026-09-20T21:59:59.999Z'))).toEqual({
      today: '2026-09-20',
      time: '23:59',
    });
    expect(nowInZurich(new Date('2026-09-20T22:00:00.000Z'))).toEqual({
      today: '2026-09-21',
      time: '00:00',
    });
  });

  it('the impossible pair it replaces really was possible', () => {
    // The bug, stated plainly: no single function is wrong, the pair is wrong.
    // todayInZurich reads the clock before midnight, timeInZurich after.
    expect(todayInZurich(new Date('2026-09-20T21:59:59.999Z'))).toBe('2026-09-20');
    expect(timeInZurich(new Date('2026-09-20T22:00:00.000Z'))).toBe('00:00');
    // "2026-09-20 at 00:00" is a moment almost a full day in the past, and
    // nextService takes it for now.
  });

  it('reads the clock exactly once', () => {
    /*
     * The actual guard, and the only shape it can be written in. The tests
     * above are handed a `Date` and only prove that the function uses that
     * one; they cannot see a second read, because there is no second
     * moment. Here the clock returns a different moment on every read, so
     * splitting the pair apart changes both the count and the result.
     */
    const Original = globalThis.Date;
    const moments = ['2026-09-20T21:59:59.999Z', '2026-09-20T22:00:00.000Z'];
    let reads = 0;
    globalThis.Date = new Proxy(Original, {
      construct(target, args) {
        if (args.length > 0) return new target(...(args as [string]));
        const m = moments[Math.min(reads, moments.length - 1)];
        reads += 1;
        return new target(m);
      },
    });
    try {
      expect(nowInZurich()).toEqual({ today: '2026-09-20', time: '23:59' });
      expect(reads).toBe(1);
    } finally {
      globalThis.Date = Original;
    }
  });
});
