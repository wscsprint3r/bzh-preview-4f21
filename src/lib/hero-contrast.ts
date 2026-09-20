/**
 * The hero's contrast, computed from the pixels a browser really paints.
 *
 * WHY THIS EXISTS AT ALL. The hero is text over a photograph under an oxblood
 * scrim; axe's color-contrast rule cannot determine a background image and
 * returns an `incomplete`, and this project fails on every in-scope incomplete.
 * The exemption in `scripts/a11y.mjs` says "axe cannot judge this"; this module
 * is the judgement that replaces it, on the same pixels.
 *
 * THE TEXT IS HIDDEN FOR THE SCREENSHOT. Sampling the hero with the glyphs
 * painted in would include the text's own colour — a 1:1 ratio — and every
 * measurement would fail. The browser half hides the text with a style, takes
 * the screenshot, and restores; the pixels under each text rect are therefore
 * the composited scrim-over-photograph, which is exactly what a reader sees
 * behind the glyphs.
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HeroText {
  selector: string;
  rect: Rect;
  color: string;
}

export interface Screenshot {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array;
}

export function parseRgb(value: string): [number, number, number] | null {
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The problems, one line each: a text whose worst pixel under it falls below
 * `min`. A rect with no pixels inside the screenshot is a problem in its own
 * right — a measurement that measured nothing must not pass.
 *
 * `report`, when given, receives every measured text's worst ratio even when
 * nothing fails. The caller prints that number: a green verdict alone is what a
 * later reader cannot check a claim like "82% gives 4.97:1" against, and this
 * project's rule is to print what was measured rather than only the verdict.
 * The texts that produced no measurement — an unparseable colour, a rect
 * outside the screenshot — report nothing, because nothing was measured.
 */
export function heroContrastProblems({
  texts,
  shot,
  min = 4.5,
  report,
}: {
  texts: HeroText[];
  shot: Screenshot;
  min?: number;
  report?: (selector: string, worst: number) => void;
}): string[] {
  const problems: string[] = [];
  for (const text of texts) {
    const colour = parseRgb(text.color);
    if (colour === null) {
      problems.push(`${text.selector}: the browser reported a colour this check cannot parse: ${text.color}`);
      continue;
    }
    const left = Math.max(0, Math.floor(text.rect.left));
    const top = Math.max(0, Math.floor(text.rect.top));
    const right = Math.min(shot.width, Math.ceil(text.rect.left + text.rect.width));
    const bottom = Math.min(shot.height, Math.ceil(text.rect.top + text.rect.height));
    if (right <= left || bottom <= top) {
      problems.push(`${text.selector}: the text box is outside the screenshot — nothing was measured.`);
      continue;
    }
    let worst = Number.POSITIVE_INFINITY;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const at = (y * shot.width + x) * shot.channels;
        const ratio = contrastRatio(colour, [shot.data[at], shot.data[at + 1], shot.data[at + 2]]);
        if (ratio < worst) worst = ratio;
      }
    }
    report?.(text.selector, worst);
    if (worst < min) {
      problems.push(
        `${text.selector}: worst contrast under the text is ${worst.toFixed(2)}:1 (needs ${min}:1) — ` +
          'darken the scrim or move the crop.',
      );
    }
  }
  return problems;
}
