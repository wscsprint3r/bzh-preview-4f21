import { describe, expect, it } from 'vitest';
import { contrastRatio, heroContrastProblems, parseRgb } from './hero-contrast';

/*
 * `pixels` is a list of ROWS, each row a flat run of channels, so the width is
 * the row length divided by the channel count. This helper used to declare
 * `width = pixels[0].length` while flattening the same data: a four-channel
 * shot was declared four times as wide as its bytes could fill, the sampler
 * read past the end, got `undefined` -> `NaN`, and `NaN < worst` is false — so
 * every row after the first was silently dropped while the tests stayed green.
 * The fixtures below are true rows now, and `heroContrastProblems` refuses a
 * shot whose bytes do not fill its declared dimensions, so the shape cannot go
 * wrong in silence again.
 */
const shot = (pixels: number[][], channels = 4) => ({
  width: pixels[0].length / channels,
  height: pixels.length,
  channels,
  data: Uint8Array.from(pixels.flat()),
});

describe('contrast maths', () => {
  it('parses the computed rgb() strings a browser returns', () => {
    expect(parseRgb('rgb(250, 246, 238)')).toEqual([250, 246, 238]);
    expect(parseRgb('rgba(250, 246, 238, 0.5)')).toEqual([250, 246, 238]);
    expect(parseRgb('not a colour')).toBeNull();
  });

  it('measures the WCAG extremes', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe('the hero measurement', () => {
  const text = { selector: '.hero-verse', rect: { left: 0, top: 0, width: 2, height: 2 }, color: 'rgb(250, 246, 238)' };

  it('passes when every pixel under the text keeps the ratio', () => {
    const dark = shot([
      [60, 20, 24, 255, 70, 25, 30, 255],
      [80, 30, 34, 255, 75, 28, 32, 255],
    ]);
    expect(heroContrastProblems({ texts: [text], shot: dark })).toEqual([]);
  });

  it('fails naming the selector and the worst ratio when a pixel is too light', () => {
    const mixed = shot([
      [60, 20, 24, 255, 230, 210, 190, 255],
      [70, 25, 30, 255, 75, 28, 32, 255],
    ]);
    const problems = heroContrastProblems({ texts: [text], shot: mixed });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.hero-verse');
    expect(problems[0]).toMatch(/3\.\d|2\.\d|1\.\d/);
  });

  it('refuses a screenshot whose bytes do not fill its declared dimensions', () => {
    // The old helper produced exactly this shape: 2x2 pixels declared, four
    // bytes carried. The sampler read past the end and the NaN comparison
    // dropped the rest; a measurement with inconsistent input must not pass.
    const truncated = { width: 2, height: 2, channels: 4, data: Uint8Array.from([60, 20, 24, 255]) };
    const problems = heroContrastProblems({ texts: [text], shot: truncated });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('inconsistent');
    expect(problems[0]).toContain('16');
    // The other half of the control: the same dimensions built by the helper
    // are consistent, so the refusal is about the bytes, not the fixture size.
    const consistent = shot([
      [60, 20, 24, 255, 70, 25, 30, 255],
      [80, 30, 34, 255, 75, 28, 32, 255],
    ]);
    expect(heroContrastProblems({ texts: [text], shot: consistent })).toEqual([]);
  });

  it('clamps a rect to the screenshot and fails a rect wholly outside it', () => {
    const outside = { ...text, rect: { left: 99, top: 99, width: 2, height: 2 } };
    expect(heroContrastProblems({ texts: [outside], shot: shot([[0, 0, 0, 255]]) })[0]).toContain(
      'outside',
    );
  });

  it('reads three-channel screenshots too', () => {
    const rgb = shot([[60, 20, 24, 70, 25, 30]], 3);
    expect(heroContrastProblems({ texts: [text], shot: rgb })).toEqual([]);
  });

  it('reports the worst ratio it measured for each text, pass or fail', () => {
    const seen: Array<[string, number]> = [];
    const mixed = shot([
      [60, 20, 24, 255, 230, 210, 190, 255],
      [70, 25, 30, 255, 75, 28, 32, 255],
    ]);
    heroContrastProblems({
      texts: [text],
      shot: mixed,
      report: (selector, worst) => seen.push([selector, worst]),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe('.hero-verse');
    // The mixed shot's worst pixel is the light one, so the reported ratio is
    // the failing one - the number the pass prints is the one it judged.
    expect(seen[0][1]).toBeLessThan(4.5);
    const dark = shot([
      [60, 20, 24, 255, 70, 25, 30, 255],
      [80, 30, 34, 255, 75, 28, 32, 255],
    ]);
    const passing: number[] = [];
    heroContrastProblems({ texts: [text], shot: dark, report: (_selector, worst) => passing.push(worst) });
    expect(passing).toHaveLength(1);
    expect(passing[0]).toBeGreaterThan(4.5);
  });
});
