function canale(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Culoare invalidă: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** WCAG 2.1 relative luminance. */
function luminanta(hex: string): number {
  const [r, g, b] = canale(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function raportContrast(a: string, b: string): number {
  const la = luminanta(a);
  const lb = luminanta(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
