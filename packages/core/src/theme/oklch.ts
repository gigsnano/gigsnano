/** OKLCH (CSS Color 4) → sRGB, so React Native can use the web's brand tokens. */

const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/;

function gamma(x: number): number {
  const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

export function oklchToCss(value: string): string {
  const m = OKLCH.exec(value.trim());
  if (!m) throw new Error(`Not an oklch() colour: ${value}`);
  const l = Number(m[1]) / (m[2] ? 100 : 1);
  const c = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  // OKLab → LMS → linear sRGB (Björn Ottosson's reference matrices).
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = gamma(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S);
  const g = gamma(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S);
  const bl = gamma(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S);

  if (m[5] !== undefined) {
    const alpha = Number(m[5]) / (m[6] ? 100 : 1);
    return `rgba(${r}, ${g}, ${bl}, ${Number(alpha.toFixed(3))})`;
  }
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
