// Drawing primitives for the wardrobe. Everything is plain data (shapes with attributes) that
// the Avatar component turns into SVG elements; nothing is ever inserted as raw markup.

export type Pt = [number, number];

/** One SVG element: tag plus React-style attributes. */
export interface El {
  tag: 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polygon';
  a: Record<string, string | number>;
}
/** A gradient or pattern definition, referenced by id. */
export interface Def {
  tag: 'linearGradient' | 'radialGradient' | 'pattern' | 'filter' | 'clipPath';
  id: string;
  a: Record<string, string | number>;
  kids: { tag: 'stop' | 'rect' | 'circle' | 'path' | 'ellipse' | 'line' | 'feGaussianBlur'; a: Record<string, string | number> }[];
}
export interface Art { defs: Def[]; els: El[] }

const HEX = /^#[0-9a-f]{6}$/i;
/** Only #rrggbb colours ever reach the drawing (anything else falls back). */
export const hex = (c: unknown, fallback = '#888888'): string => (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : fallback);

const toRgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Mix towards black (amt > 0 darker) or white (amt < 0 lighter). */
export function shade(c: string, amt: number): string {
  const [r, g, b] = toRgb(hex(c));
  if (amt >= 0) return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
  const k = -amt;
  return toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
}
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(hex(a)), y = toRgb(hex(b));
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}
/** Relative brightness 0..1 (for choosing outline strength). */
export function lum(c: string): number {
  const [r, g, b] = toRgb(hex(c));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const f1 = (n: number) => Math.round(n * 10) / 10;
const P = (p: Pt) => `${f1(p[0])} ${f1(p[1])}`;

/** Path builder with Catmull-Rom smoothing for organic outlines. */
export class Path {
  d = '';
  private cur: Pt = [0, 0];
  private prev: Pt | null = null;
  M(p: Pt) { this.d += `M${P(p)}`; this.prev = null; this.cur = p; return this; }
  L(p: Pt) { this.d += `L${P(p)}`; this.prev = null; this.cur = p; return this; }   // corner: next curve starts fresh
  Q(c: Pt, p: Pt) { this.d += `Q${P(c)} ${P(p)}`; this.prev = c; this.cur = p; return this; }
  C(c1: Pt, c2: Pt, p: Pt) { this.d += `C${P(c1)} ${P(c2)} ${P(p)}`; this.prev = c2; this.cur = p; return this; }
  /** Smooth curve from the current point through every point given. */
  S(pts: Pt[], tension = 1) {
    const all: Pt[] = [this.cur, ...pts];
    for (let i = 0; i < all.length - 1; i++) {
      const p0 = all[i - 1] ?? (i === 0 && this.prev ? this.prev : all[i]);
      const p1 = all[i], p2 = all[i + 1], p3 = all[i + 2] ?? p2;
      const k = tension / 6;
      const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
      const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
      this.d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
    }
    this.prev = all[all.length - 2] ?? this.cur;
    this.cur = all[all.length - 1];
    return this;
  }
  /** Make the next smooth curve start from a sharp corner (e.g. a hem meeting a side seam). */
  corner() { this.prev = null; return this; }
  Z() { this.d += 'Z'; return this; }
}

/** Closed smooth shape through points. */
export function blob(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d + 'Z';
}

export const mirror = (p: Pt, cx = 200): Pt => [2 * cx - p[0], p[1]];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const ease = (t: number) => (1 - Math.cos(Math.PI * clamp(t))) / 2;

/** Smoothly interpolate a value through (y, v) keyframes sorted by y. */
export function keyed(keys: [number, number][], y: number): number {
  if (y <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [y0, v0] = keys[i], [y1, v1] = keys[i + 1];
    if (y <= y1) return lerp(v0, v1, ease((y - y0) / (y1 - y0)));
  }
  return keys[keys.length - 1][1];
}

export const path = (d: string, a: Record<string, string | number> = {}): El => ({ tag: 'path', a: { d, ...a } });
export const circle = (cx: number, cy: number, r: number, a: Record<string, string | number> = {}): El => ({ tag: 'circle', a: { cx: f1(cx), cy: f1(cy), r: f1(r), ...a } });
export const ellipse = (cx: number, cy: number, rx: number, ry: number, a: Record<string, string | number> = {}): El => ({ tag: 'ellipse', a: { cx: f1(cx), cy: f1(cy), rx: f1(rx), ry: f1(ry), ...a } });
