// Her avatar: a front-facing figure built from a few measurements (height, shoulders, bust,
// waist, hips, thighs). Clothes are drawn from the same measurements, so they fit any shape.
// Proportions follow a fashion figure (about 8 heads tall). The head, face and hair are drawn
// at a larger "head space" scale and shrunk into place with HEAD_T, so they keep their detail.
import { Path, blob, circle, ellipse, path, shade, mix, hex, keyed, lerp, clamp, type Art, type Def, type El, type Pt } from './shapes';

export type HairStyle = 'long' | 'wavy' | 'bob' | 'pixie' | 'bun' | 'ponytail' | 'braids' | 'afro' | 'puffs' | 'locs' | 'curly' | 'cornrows';

export interface Look {
  skin: string; hair: HairStyle; hairColor: string; eyes: string; lips: string;
  height: number;              // cm
  shoulders: number; bust: number; waist: number; hips: number; thighs: number;   // 0..1, 0.5 = average
  blush: boolean; freckles: boolean; lashes: boolean;
  basics: string;              // colour of the plain base layer (shown when nothing is worn)
  // Face (0..1, 0.5 = average)
  faceShape: FaceShape;
  cheeks: number; jaw: number; eyeSize: number; eyeGap: number; eyeTilt: number;
  noseWidth: number; lipFull: number; browThick: number; browArch: number;
  // Her own measurements in cm, if she has entered them (they set bust, waist and hips)
  bustCm: number | null; waistCm: number | null; hipsCm: number | null;
}
export type FaceShape = 'oval' | 'round' | 'heart' | 'square' | 'long';
export const FACE_SHAPES: { id: FaceShape; name: string }[] = [
  { id: 'oval', name: 'Oval' }, { id: 'round', name: 'Round' }, { id: 'heart', name: 'Heart' }, { id: 'square', name: 'Square' }, { id: 'long', name: 'Long' },
];
const FACE_SET = new Set(FACE_SHAPES.map(f => f.id));

/** Measurements (cm) -> body sliders. Average is about 92 / 74 / 100. */
export const MEASURE = { bust: [78, 112], waist: [58, 98], hips: [84, 124] } as const;
export const fromCm = (cm: number, [lo, hi]: readonly [number, number]) => clamp((cm - lo) / (hi - lo));
export const toCm = (v: number, [lo, hi]: readonly [number, number]) => Math.round(lo + v * (hi - lo));

export const SKIN_TONES = ['#f6dcc6', '#eecaa8', '#e0ac85', '#c98c62', '#b5774f', '#9c6440', '#875334', '#70422a', '#5c3420', '#4a2918', '#3b2013', '#2e180e'];
export const HAIR_COLOURS = ['#120c0a', '#2b1a12', '#4a2c1a', '#6b3f22', '#8c5a2c', '#b07a3c', '#d9b26b', '#efd9a7', '#a13a24', '#7a1f3d', '#5b3f8c', '#cfcfd6'];
export const EYE_COLOURS = ['#3b2314', '#5a3a20', '#7a5a2c', '#2f5f3a', '#3c6a8c', '#5c6b73'];
export const LIP_COLOURS = ['#b5655a', '#9c4a45', '#c26a7a', '#8a3a3a', '#d98a7a', '#6e2f3a', '#c24a5a', '#a8544a'];
export const HAIR_STYLES: { id: HairStyle; name: string }[] = [
  { id: 'braids', name: 'Box braids' }, { id: 'afro', name: 'Afro' }, { id: 'puffs', name: 'Puffs' },
  { id: 'locs', name: 'Locs' }, { id: 'cornrows', name: 'Cornrows' }, { id: 'curly', name: 'Curls' },
  { id: 'long', name: 'Long' }, { id: 'wavy', name: 'Waves' }, { id: 'bob', name: 'Bob' },
  { id: 'pixie', name: 'Pixie' }, { id: 'bun', name: 'Bun' }, { id: 'ponytail', name: 'Ponytail' },
];

export const DEFAULT_LOOK: Look = {
  skin: '#875334', hair: 'braids', hairColor: '#120c0a', eyes: '#3b2314', lips: '#9c4a45',
  height: 165, shoulders: 0.5, bust: 0.5, waist: 0.5, hips: 0.55, thighs: 0.5,
  blush: true, freckles: false, lashes: true, basics: '#e9ddd0',
  faceShape: 'oval', cheeks: 0.5, jaw: 0.5, eyeSize: 0.5, eyeGap: 0.5, eyeTilt: 0.5, noseWidth: 0.5, lipFull: 0.55, browThick: 0.5, browArch: 0.5,
  bustCm: null, waistCm: null, hipsCm: null,
};

const STYLES = new Set(HAIR_STYLES.map(h => h.id));
/** A look from saved data, with every value checked and clamped. */
export function cleanLook(raw: unknown): Look {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof Look, lo: number, hi: number) => typeof r[k] === 'number' && isFinite(r[k] as number) ? clamp(r[k] as number, lo, hi) : DEFAULT_LOOK[k] as number;
  const bool = (k: keyof Look) => typeof r[k] === 'boolean' ? r[k] as boolean : DEFAULT_LOOK[k] as boolean;
  const cm = (k: keyof Look, lo: number, hi: number) => typeof r[k] === 'number' && isFinite(r[k] as number) ? clamp(Math.round(r[k] as number), lo, hi) : null;
  return {
    skin: hex(r.skin, DEFAULT_LOOK.skin), hairColor: hex(r.hairColor, DEFAULT_LOOK.hairColor),
    eyes: hex(r.eyes, DEFAULT_LOOK.eyes), lips: hex(r.lips, DEFAULT_LOOK.lips), basics: hex(r.basics, DEFAULT_LOOK.basics),
    hair: STYLES.has(r.hair as HairStyle) ? r.hair as HairStyle : DEFAULT_LOOK.hair,
    height: num('height', 140, 195),
    shoulders: num('shoulders', 0, 1), bust: num('bust', 0, 1), waist: num('waist', 0, 1), hips: num('hips', 0, 1), thighs: num('thighs', 0, 1),
    blush: bool('blush'), freckles: bool('freckles'), lashes: bool('lashes'),
    faceShape: FACE_SET.has(r.faceShape as FaceShape) ? r.faceShape as FaceShape : DEFAULT_LOOK.faceShape,
    cheeks: num('cheeks', 0, 1), jaw: num('jaw', 0, 1), eyeSize: num('eyeSize', 0, 1), eyeGap: num('eyeGap', 0, 1), eyeTilt: num('eyeTilt', 0, 1),
    noseWidth: num('noseWidth', 0, 1), lipFull: num('lipFull', 0, 1), browThick: num('browThick', 0, 1), browArch: num('browArch', 0, 1),
    bustCm: cm('bustCm', 60, 160), waistCm: cm('waistCm', 45, 150), hipsCm: cm('hipsCm', 60, 170),
  };
}

export const CX = 200;           // centre line
export const VIEW_W = 400;
export const VIEW_Y = 66;        // the picture starts here (just above the head)
export const VIEW_H = 1040;
/** The head is drawn in head space and shrunk about the chin. */
export const HEAD_K = 0.7;
export const CHIN: Pt = [200, 214];
export const HEAD_T = `translate(${CHIN[0]} ${CHIN[1]}) scale(${HEAD_K}) translate(${-CHIN[0]} ${-CHIN[1]})`;
/** Body height -> head-space height (for hair that hangs down onto the body). */
export const toHead = (y: number) => CHIN[1] + (y - CHIN[1]) / HEAD_K;

/** Body geometry: landmark heights and half-widths, plus arm and leg helpers. */
export class Body {
  readonly f: number;            // height factor
  readonly y: Record<'neck' | 'shoulder' | 'armpit' | 'bust' | 'underbust' | 'waist' | 'navel' | 'hip' | 'crotch' | 'thigh' | 'knee' | 'calf' | 'ankle' | 'sole', number>;
  readonly w: Record<'neck' | 'shoulder' | 'armpit' | 'bust' | 'underbust' | 'waist' | 'hip', number>;
  readonly look: Look;
  private torsoKeys: [number, number][];
  constructor(look: Look) {
    this.look = look;
    const L = look;
    this.f = 0.93 + clamp((L.height - 140) / 55) * 0.1;
    const Y = (v: number) => 214 + (v - 214) * this.f;
    this.y = {
      neck: 228, shoulder: Y(254), armpit: Y(292), bust: Y(336), underbust: Y(368), waist: Y(426), navel: Y(456),
      hip: Y(518), crotch: Y(576), thigh: Y(676), knee: Y(806), calf: Y(892), ankle: Y(1012), sole: Y(1040),
    };
    this.w = {
      neck: 19,
      shoulder: 80 + (L.shoulders - 0.5) * 22,
      armpit: 0,
      bust: 64 + (L.bust - 0.5) * 26,
      underbust: 55 + (L.bust - 0.5) * 6 + (L.waist - 0.5) * 10,
      waist: 47 + (L.waist - 0.5) * 26,
      hip: 74 + (L.hips - 0.5) * 32,
    };
    this.w.armpit = Math.min(this.w.shoulder - 9, Math.max(this.w.bust - 3, 60));
    this.torsoKeys = [
      [this.y.armpit, this.w.armpit], [this.y.bust, this.w.bust], [this.y.underbust, this.w.underbust],
      [this.y.waist, this.w.waist], [this.y.navel, lerp(this.w.waist, this.w.hip, 0.55)], [this.y.hip, this.w.hip], [this.y.crotch, this.w.hip * 0.97],
    ];
  }
  /** Half-width of the torso at height y (armpit to crotch). */
  torso(y: number) { return keyed(this.torsoKeys, y); }

  // ─── Legs (side: -1 left of screen, +1 right) ───────────────
  legCx(side: number, y: number) {
    const { hip, crotch, knee, ankle } = this.y;
    return CX + side * keyed([[hip, this.w.hip * 0.5], [crotch, this.w.hip * 0.5 + 1], [knee, 30], [ankle, 27]], y);
  }
  legW(y: number) {
    const L = this.look, { hip, crotch, thigh, knee, calf, ankle } = this.y;
    return keyed([[hip, this.w.hip * 0.5], [crotch, this.w.hip * 0.5 - 1], [thigh, 32 + (L.thighs - 0.5) * 16], [knee, 19 + (L.thighs - 0.5) * 3], [calf, 21.5 + (L.thighs - 0.5) * 4], [ankle, 10]], y);
  }
  legOuter(side: number, y: number, e = 0) { return this.legCx(side, y) + side * (this.legW(y) + e); }
  legInner(side: number, y: number, e = 0) { return this.legCx(side, y) - side * (this.legW(y) + e); }

  // ─── Arms: u = 0 at the shoulder, ~0.54 at the elbow, 1 at the wrist ──
  private armJoint(side: number): Pt { return [CX + side * (this.w.shoulder - 6), this.y.shoulder + 10]; }
  private elbow(side: number): Pt {
    const s = this.armJoint(side), a = 0.13, L = 168 * this.f;
    return [s[0] + side * Math.sin(a) * L, s[1] + Math.cos(a) * L];
  }
  private wrist(side: number): Pt {
    const e = this.elbow(side), a = 0.07, L = 140 * this.f;
    return [e[0] + side * Math.sin(a) * L, e[1] + Math.cos(a) * L];
  }
  armAt(side: number, u: number): { c: Pt; n: Pt; w: number } {
    const s = this.armJoint(side), e = this.elbow(side), wr = this.wrist(side);
    const EU = 0.54;
    const [a, b, t] = u <= EU ? [s, e, u / EU] : [e, wr, (u - EU) / (1 - EU)];
    const c: Pt = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const n: Pt = [dy / len * side, -dx / len * side];       // points away from the body
    const bulk = 1 + (this.look.bust - 0.5) * 0.12 + (this.look.hips - 0.5) * 0.06;
    const w = keyed([[0, 17], [0.12, 16], [0.3, 14], [0.54, 10.5], [0.66, 11.5], [1, 7.6]], u) * bulk;
    return { c, n, w };
  }
  /** Edge of the arm at u: outer (away from the body) or inner. */
  armEdge(side: number, u: number, outer: boolean, e = 0): Pt {
    const { c, n, w } = this.armAt(side, u), k = (w + e) * (outer ? 1 : -1);
    return [c[0] + n[0] * k, c[1] + n[1] * k];
  }
  shoulderPt(side: number, e = 0): Pt { return [CX + side * (this.w.shoulder + e * 0.4), this.y.shoulder + 4 - e * 0.3]; }
  neckPt(side: number, e = 0): Pt { return [CX + side * (this.w.neck + 3 + e), this.y.neck + 8]; }
  wristPt(side: number): Pt { return this.wrist(side); }

  /** Closed outline of a sleeve from the shoulder to u (0..1) with ease. */
  sleeve(side: number, u: number, e = 3, flare = 0): string {
    const p = new Path().M(this.shoulderPt(side, e));
    const outer: Pt[] = [], inner: Pt[] = [];
    const steps = Math.max(2, Math.round(u * 8));
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * u, fl = flare * Math.pow(i / steps, 2);
      outer.push(this.armEdge(side, t, true, e + fl));
      inner.unshift(this.armEdge(side, t, false, e + fl));
    }
    p.S(outer).L(inner[0]).S([...inner.slice(1), [CX + side * (this.w.armpit - 2), this.y.armpit + 6]]).Z();
    return p.d;
  }

  /** Points down one side of the torso (top to bottom), widened by e. */
  side(side: number, y0: number, y1: number, e = 0, n = 6): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) { const y = lerp(y0, y1, i / n); out.push([CX + side * (this.torso(y) + e), y]); }
    return out;
  }
}

const SK = (L: Look) => ({ base: L.skin, dark: shade(L.skin, 0.22), deep: shade(L.skin, 0.4), light: mix(L.skin, '#ffe9d6', 0.22) });
type Skin = ReturnType<typeof SK>;
/** Soft light from the upper left: dark edges, a glow just left of centre. */
function roundShade(id: string, dark: string, light: string, k = 1): Def {
  return {
    tag: 'linearGradient', id, a: { x1: 0, x2: 1, y1: 0, y2: 0 },
    kids: [
      { tag: 'stop', a: { offset: '0%', stopColor: dark, stopOpacity: 0.5 * k } }, { tag: 'stop', a: { offset: '16%', stopColor: dark, stopOpacity: 0.12 * k } },
      { tag: 'stop', a: { offset: '38%', stopColor: light, stopOpacity: 0.26 * k } }, { tag: 'stop', a: { offset: '58%', stopColor: light, stopOpacity: 0 } },
      { tag: 'stop', a: { offset: '84%', stopColor: dark, stopOpacity: 0.2 * k } }, { tag: 'stop', a: { offset: '100%', stopColor: dark, stopOpacity: 0.6 * k } },
    ],
  };
}
const SOFT: Def = { tag: 'filter', id: 'soft', a: { x: '-30%', y: '-30%', width: '160%', height: '160%' }, kids: [{ tag: 'feGaussianBlur', a: { stdDeviation: 3 } }] };
const SOFT2: Def = { tag: 'filter', id: 'soft2', a: { x: '-50%', y: '-50%', width: '200%', height: '200%' }, kids: [{ tag: 'feGaussianBlur', a: { stdDeviation: 1.4 } }] };

export interface BodyArt extends Art { head: El[] }

/** The body (skin, base layer) and the face. `head` is in head space (draw it inside HEAD_T). */
export function drawBody(b: Body, covered: { top?: boolean; bottom?: boolean } = {}): BodyArt {
  const L = b.look, s = SK(L), els: El[] = [];
  const line = { stroke: s.deep, strokeWidth: 1.3, strokeOpacity: 0.55, strokeLinejoin: 'round' as const };
  const over = (d: string, id: string) => path(d, { fill: `url(#${id})`, pointerEvents: 'none' });
  const defs: Def[] = [
    roundShade('skinShade', s.deep, s.light, 0.85), roundShade('limbShade', s.deep, s.light, 1), SOFT, SOFT2, ...eyeClips(L),
    { tag: 'radialGradient', id: 'faceShade', a: { cx: '44%', cy: '38%', r: '62%' }, kids: [
      { tag: 'stop', a: { offset: '0%', stopColor: s.light, stopOpacity: 0.28 } }, { tag: 'stop', a: { offset: '55%', stopColor: s.light, stopOpacity: 0 } },
      { tag: 'stop', a: { offset: '82%', stopColor: s.deep, stopOpacity: 0.12 } }, { tag: 'stop', a: { offset: '100%', stopColor: s.deep, stopOpacity: 0.5 } }] },
    { tag: 'radialGradient', id: 'iris', a: { cx: '50%', cy: '50%', r: '50%' }, kids: [
      { tag: 'stop', a: { offset: '0%', stopColor: mix(L.eyes, '#ffffff', 0.25) } }, { tag: 'stop', a: { offset: '62%', stopColor: L.eyes } }, { tag: 'stop', a: { offset: '100%', stopColor: shade(L.eyes, 0.6) } }] },
  ];
  const softLine = (d: string, w = 1.6, o = 0.3) => path(d, { fill: 'none', stroke: s.deep, strokeWidth: w, opacity: o, strokeLinecap: 'round', filter: 'url(#soft2)' });

  // Arms (behind the torso edges) and hands
  for (const side of [-1, 1]) {
    const p = new Path().M(b.shoulderPt(side, -2));
    const outer: Pt[] = [], inner: Pt[] = [];
    for (let i = 1; i <= 12; i++) { const u = i / 12; outer.push(b.armEdge(side, u, true)); inner.unshift(b.armEdge(side, u, false)); }
    p.S(outer).L(inner[0]).S([...inner.slice(1), [CX + side * (b.w.armpit - 4), b.y.armpit + 4]]).Z();
    els.push(path(p.d, { fill: s.base, ...line }), over(p.d, 'limbShade'));
    const el = b.armEdge(side, 0.55, false, -3), eo = b.armEdge(side, 0.55, false, -9);
    els.push(path(`M${el[0]} ${el[1]}L${eo[0]} ${eo[1] + 2}`, { stroke: s.deep, strokeWidth: 1.2, opacity: 0.35, strokeLinecap: 'round' }));
    els.push(...hand(b, side, s, line));
  }

  // Legs and feet
  for (const side of [-1, 1]) {
    const { hip, crotch, ankle } = b.y;
    const outer: Pt[] = [], inner: Pt[] = [];
    for (let i = 0; i <= 14; i++) { const y = lerp(hip, ankle, i / 14); outer.push([b.legOuter(side, y), y]); }
    for (let i = 14; i >= 0; i--) { const y = lerp(crotch, ankle, i / 14); inner.push([b.legInner(side, y), y]); }
    const p = new Path().M(outer[0]).S(outer.slice(1)).L(inner[0]).S(inner.slice(1)).L([CX, crotch - 6]).Z();
    els.push(path(p.d, { fill: s.base, ...line }), over(p.d, 'limbShade'));
    const kx = b.legCx(side, b.y.knee), ky = b.y.knee;
    els.push(path(`M${kx - 9} ${ky + 8}Q${kx} ${ky + 14} ${kx + 9} ${ky + 8}`, { fill: 'none', stroke: s.deep, strokeWidth: 2.4, opacity: 0.3, filter: 'url(#soft2)', strokeLinecap: 'round' }));
    els.push(ellipse(kx - side * 2, ky - 2, 7, 9, { fill: s.light, opacity: 0.2, filter: 'url(#soft2)' }));
    els.push(...foot(b, side, s, line));
  }

  // Torso
  const tl = b.side(-1, b.y.armpit, b.y.hip, 0, 12), tr = b.side(1, b.y.armpit, b.y.hip, 0, 12);
  const torso = new Path().M(b.neckPt(-1)).Q([CX - b.w.neck - 16, b.y.shoulder - 4], b.shoulderPt(-1)).S([[CX - b.w.shoulder + 3, b.y.shoulder + 24], tl[0]]).S(tl.slice(1))
    .L(tr[tr.length - 1]).S([...tr.slice(0, -1).reverse(), [CX + b.w.shoulder - 3, b.y.shoulder + 24], b.shoulderPt(1)]).Q([CX + b.w.neck + 16, b.y.shoulder - 4], b.neckPt(1)).Z();
  els.push(path(torso.d, { fill: s.base, ...line }), over(torso.d, 'skinShade'));
  for (const side of [-1, 1]) {
    els.push(softLine(`M${CX + side * 6} ${b.y.shoulder + 8}Q${CX + side * 30} ${b.y.shoulder + 2} ${CX + side * 54} ${b.y.shoulder + 4}`, 2, 0.4));
    els.push(path(`M${CX + side * 10} ${b.y.shoulder + 11}Q${CX + side * 30} ${b.y.shoulder + 6} ${CX + side * 50} ${b.y.shoulder + 8}`, { fill: 'none', stroke: s.light, strokeWidth: 1.4, opacity: 0.35, strokeLinecap: 'round' }));
    els.push(softLine(`M${CX + side * 6} ${b.y.bust + 22}Q${CX + side * b.w.bust * 0.5} ${b.y.bust + 34} ${CX + side * (b.w.bust - 6)} ${b.y.bust + 14}`, 3, 0.35));
    els.push(softLine(`M${CX + side * (b.w.hip - 22)} ${b.y.navel + 10}Q${CX + side * (b.w.hip - 34)} ${b.y.hip} ${CX + side * 12} ${b.y.crotch - 10}`, 1.6, 0.25));
  }
  els.push(softLine(`M${CX} ${b.y.bust + 28}L${CX} ${b.y.waist - 4}`, 1.6, 0.18));
  els.push(ellipse(CX, b.y.navel, 2.2, 3.6, { fill: s.deep, opacity: 0.55, filter: 'url(#soft2)' }));

  // Plain base layer: a soft crop top and briefs, so the avatar is never bare.
  els.push(...basics(b, L.basics, covered));

  // Neck (with the shadow the chin casts)
  const neck = new Path().M([CX - b.w.neck, 196]).L([CX - b.w.neck - 1, b.y.neck + 12]).Q([CX, b.y.neck + 22], [CX + b.w.neck + 1, b.y.neck + 12]).L([CX + b.w.neck, 196]).Z();
  els.push(path(neck.d, { fill: s.base, ...line }), over(neck.d, 'limbShade'));
  els.push(path(`M${CX - b.w.neck + 1} 214Q${CX} 236 ${CX + b.w.neck - 1} 214`, { fill: 'none', stroke: s.deep, strokeWidth: 12, opacity: 0.32, strokeLinecap: 'round', filter: 'url(#soft)' }));
  for (const side of [-1, 1]) els.push(softLine(`M${CX + side * 9} 222Q${CX + side * 6} ${b.y.neck + 4} ${CX + side * 3} ${b.y.neck + 14}`, 1.4, 0.25));

  return { defs, els, head: head(L) };
}

function hand(b: Body, side: number, s: Skin, line: Record<string, string | number>): El[] {
  const [x, y] = b.wristPt(side), k = b.f;
  const palm = blob(sidePts(x, side, [[-8, y - 2], [8, y - 2], [12, y + 18 * k], [11, y + 36 * k], [5, y + 52 * k], [-3, y + 54 * k], [-9, y + 40 * k], [-11, y + 18 * k]]));
  const thumb = blob(sidePts(x, side, [[-9, y + 12 * k], [-6, y + 10 * k], [-4, y + 26 * k], [-8, y + 36 * k], [-13, y + 30 * k]]));
  const fingers = [-4, 0, 4].map(dx => path(`M${x + side * dx} ${y + 34 * k}L${x + side * (dx + 1)} ${y + 50 * k}`, { stroke: s.deep, strokeWidth: 1, opacity: 0.4, strokeLinecap: 'round' }));
  return [path(palm, { fill: s.base, ...line }), path(palm, { fill: 'url(#limbShade)' }), path(thumb, { fill: s.base, ...line }), ...fingers];
}
function foot(b: Body, side: number, s: Skin, line: Record<string, string | number>): El[] {
  const d = footPath(b, side), x = b.legCx(side, b.y.ankle), y = b.y.sole;
  return [path(d, { fill: s.base, ...line }), path(d, { fill: 'url(#limbShade)' }),
    ...[2, 7, 12].map(dx => path(`M${x + side * dx} ${y + 1}l${side * 1} 4`, { stroke: s.deep, strokeWidth: 1, opacity: 0.35, strokeLinecap: 'round' }))];
}


/** Points given for the right-hand side (offsets from x), mirrored for the left, in drawing order. */
export function sidePts(x: number, side: number, pts: Pt[]): Pt[] {
  const out = pts.map(([dx, y]) => [x + dx * side, y] as Pt);
  return side > 0 ? out : out.reverse();
}

export function footPath(b: Body, side: number): string {
  const x = b.legCx(side, b.y.ankle), y = b.y.ankle, h = b.y.sole - y;
  return blob(sidePts(x, side, [[-9, y - 4], [9, y - 4], [12, y + h * 0.5], [16, y + h * 0.95], [6, y + h + 6], [-8, y + h + 3], [-11, y + h * 0.5]]));
}

function basics(b: Body, colour: string, covered: { top?: boolean; bottom?: boolean }): El[] {
  const c = hex(colour), line = { stroke: shade(c, 0.3), strokeWidth: 1.2, strokeOpacity: 0.7, strokeLinejoin: 'round' as const };
  const out: El[] = [];
  const shadowed = (d: string) => [path(d, { fill: '#000', opacity: 0.2, filter: 'url(#soft)', transform: 'translate(0 3)' }), path(d, { fill: c, ...line }), path(d, { fill: 'url(#skinShade)', opacity: 0.6 })];
  if (!covered.top) {
    const top0 = b.y.armpit - 2, top1 = b.y.underbust + 10;
    const tl = b.side(-1, top0, top1, 1, 5), tr = b.side(1, top0, top1, 1, 5);
    const top = new Path().M(tl[0]).Q([CX - b.w.bust * 0.5, top0 - 14], [CX, top0 + 8]).Q([CX + b.w.bust * 0.5, top0 - 14], tr[0])
      .S(tr.slice(1)).Q([CX, top1 + 6], tl[tl.length - 1]).S(tl.slice(0, -1).reverse()).Z();
    out.push(...[-1, 1].map(side => path(new Path().M([CX + side * (b.w.bust * 0.5), top0 - 6]).Q([CX + side * (b.w.shoulder - 28), b.y.shoulder + 6], [CX + side * (b.w.shoulder - 24), b.y.shoulder + 1]).d,
      { fill: 'none', stroke: c, strokeWidth: 3.5, strokeLinecap: 'round' })), ...shadowed(top.d));
  }
  if (!covered.bottom) {
    const low = b.y.hip - 16, legY = b.y.crotch + 16;
    const briefs = new Path().M([CX - b.torso(low) - 1, low]).L([CX + b.torso(low) + 1, low])
      .S([[b.legOuter(1, b.y.hip + 4, 1), b.y.hip + 4], [b.legOuter(1, legY - 10, 1), legY - 10]])
      .Q([CX + 26, legY], [CX + 4, b.y.crotch + 8]).L([CX - 4, b.y.crotch + 8]).Q([CX - 26, legY], [b.legOuter(-1, legY - 10, 1), legY - 10])
      .S([[b.legOuter(-1, b.y.hip + 4, 1), b.y.hip + 4], [CX - b.torso(low) - 1, low]]).Z();
    out.push(...shadowed(briefs.d));
  }
  return out;
}

// ─── Head and face (head space) ────────────────────────────────
/** Head outline for her face shape (head space; the chin always sits at 200,216). */
export function headPath(L: Look): string {
  const sh = L.faceShape;
  const top = { oval: 41, round: 46, heart: 41, square: 43, long: 39 }[sh];
  const cheek = 67 + (L.cheeks - 0.5) * 8 + { oval: 0, round: 4, heart: 2, square: 1, long: -6 }[sh];
  const jaw = 46 + (L.jaw - 0.5) * 16 + { oval: 0, round: 9, heart: -9, square: 13, long: -4 }[sh];
  const chin = 15 + { oval: 0, round: 5, heart: -6, square: 9, long: -2 }[sh];
  const temple = 67 + { oval: 0, round: 1, heart: 1, square: 1, long: -3 }[sh];
  const half: Pt[] = [[240, top + 4], [259, top + 36], [200 + temple, 124], [200 + cheek, 156], [200 + jaw, 191], [200 + chin, 210]];
  return blob([[200, top], ...half, [200, 216.5], ...half.map(([x, y]) => [400 - x, y] as Pt).reverse()]);
}
/** The default head, for anything that needs a plain outline. */
export const HEAD = 'M200 40C248 40 270 78 268 126C267 152 259 172 245 190C231 206 214 216 200 216C186 216 169 206 155 190C141 172 133 152 132 126C130 78 152 40 200 40Z';

function head(L: Look): El[] {
  const s = SK(L), els: El[] = [], HD = headPath(L);
  const line = { stroke: s.deep, strokeWidth: 1.8, strokeOpacity: 0.55, strokeLinejoin: 'round' as const };
  for (const side of [-1, 1]) {
    els.push(ellipse(CX + side * 66, 140, 10, 18, { fill: s.base, ...line }));
    els.push(path(`M${CX + side * 64} 128Q${CX + side * 72} 140 ${CX + side * 64} 152`, { fill: 'none', stroke: s.deep, strokeWidth: 2, opacity: 0.4, strokeLinecap: 'round' }));
  }
  els.push(path(HD, { fill: s.base, ...line }), path(HD, { fill: 'url(#faceShade)' }));
  // cheekbones catch the light; the jaw sits in soft shadow
  const ck = 0.18 + L.cheeks * 0.18;
  for (const side of [-1, 1]) {
    els.push(ellipse(CX + side * 42, 158, 20, 10, { fill: s.light, opacity: ck, filter: 'url(#soft)' }));
    els.push(path(`M${CX + side * 60} 166Q${CX + side * 54} 180 ${CX + side * 40} 178`, { fill: 'none', stroke: s.deep, strokeWidth: 6, opacity: 0.06 + L.cheeks * 0.12, filter: 'url(#soft)' }));
    els.push(path(`M${CX + side * 58} 176Q${CX + side * 48} 202 ${CX + side * 14} 210`, { fill: 'none', stroke: s.deep, strokeWidth: 8, opacity: 0.16, filter: 'url(#soft)' }));
    if (L.blush) els.push(ellipse(CX + side * 42, 170, 17, 10, { fill: '#e05a6a', opacity: 0.14, filter: 'url(#soft)' }));
    if (L.freckles) for (const [dx, dy] of [[-8, -2], [1, 3], [9, -3], [-3, 8], [14, 5], [5, 10]]) els.push(circle(CX + side * (36 + dx), 160 + dy, 1.4, { fill: s.deep, opacity: 0.55 }));
  }
  els.push(...[-1, 1].flatMap(side => eye(L, side, s)));
  // nose: built from light and shadow rather than a line; nostril width follows her
  const nw = 0.82 + L.noseWidth * 0.4, nx = (x: number) => 200 + (x - 200) * nw;
  els.push(path(`M194 142Q191 160 ${nx(188)} 172`, { fill: 'none', stroke: s.deep, strokeWidth: 3, opacity: 0.22, filter: 'url(#soft2)', strokeLinecap: 'round' }));
  els.push(path('M203 146Q205 160 205 168', { fill: 'none', stroke: s.light, strokeWidth: 3, opacity: 0.35, filter: 'url(#soft2)', strokeLinecap: 'round' }));
  els.push(ellipse(200, 174, 6 * nw, 4.5, { fill: s.light, opacity: 0.3, filter: 'url(#soft2)' }));
  els.push(path(`M${nx(187)} 171Q${nx(184)} 180 ${nx(192)} 182M${nx(213)} 171Q${nx(216)} 180 ${nx(208)} 182`, { fill: 'none', stroke: s.deep, strokeWidth: 1.6, opacity: 0.55, strokeLinecap: 'round' }));
  els.push(ellipse(nx(194.5), 181, 3 * nw, 1.5, { fill: s.deep, opacity: 0.7 }), ellipse(nx(205.5), 181, 3 * nw, 1.5, { fill: s.deep, opacity: 0.7 }));
  els.push(path('M192 186Q200 190 208 186', { fill: 'none', stroke: s.deep, strokeWidth: 3, opacity: 0.25, filter: 'url(#soft2)' }));
  // lips: cupid's bow, fuller lower lip, a shine and soft corners
  const lip = hex(L.lips), y = 197, f = 0.7 + L.lipFull * 0.6, mw = 0.92 + L.lipFull * 0.16;
  const mx = (x: number) => 200 + (x - 200) * mw, up = (d: number) => y - d * f, dn = (d: number) => y + d * f;
  els.push(path(`M${mx(180)} ${y}Q${mx(188)} ${up(8)} ${mx(195)} ${up(7)}Q200 ${up(4)} ${mx(205)} ${up(7)}Q${mx(212)} ${up(8)} ${mx(220)} ${y}Q${mx(210)} ${y + 1} 200 ${y + 1}Q${mx(190)} ${y + 1} ${mx(180)} ${y}Z`, { fill: shade(lip, 0.12) }));
  els.push(path(`M${mx(180)} ${y}Q${mx(190)} ${y + 1} 200 ${y + 1}Q${mx(210)} ${y + 1} ${mx(220)} ${y}Q${mx(214)} ${dn(13)} 200 ${dn(13)}Q${mx(186)} ${dn(13)} ${mx(180)} ${y}Z`, { fill: lip }));
  els.push(path(`M${mx(181)} ${y}Q200 ${y + 3} ${mx(219)} ${y}`, { fill: 'none', stroke: shade(lip, 0.45), strokeWidth: 1.4, strokeLinecap: 'round' }));
  els.push(ellipse(203, dn(6), 7 * mw, 2.4 * f, { fill: '#ffffff', opacity: 0.28, filter: 'url(#soft2)' }));
  els.push(path(`M186 ${dn(18)}Q200 ${dn(22)} 214 ${dn(18)}`, { fill: 'none', stroke: s.deep, strokeWidth: 4, opacity: 0.18, filter: 'url(#soft2)' }));
  for (const side of [-1, 1]) els.push(circle(200 + side * 21 * mw, y + 0.5, 1.6, { fill: s.deep, opacity: 0.5, filter: 'url(#soft2)' }));
  return els;
}

/** Where an eye point sits: (dx outward, dy down) around her eye centre, with her size, spacing and tilt. */
function eyeGeom(L: Look, side: number) {
  const ex = CX + side * (29 + (L.eyeGap - 0.5) * 8), ey = 134, k = 0.84 + L.eyeSize * 0.32, tilt = (L.eyeTilt - 0.5) * 7;
  const pt = (dx: number, dy: number): Pt => [ex + side * dx * k, ey + (dy - tilt * dx / 16) * k];
  const P = (dx: number, dy: number) => { const [x, y] = pt(dx, dy); return `${x.toFixed(1)} ${y.toFixed(1)}`; };
  return { ex, ey, k, pt, P };
}
const eyeShape = (L: Look, side: number) => {
  const { P } = eyeGeom(L, side);
  return `M${P(-15, 2)}C${P(-8, -9)} ${P(8, -11)} ${P(16, -2)}C${P(9, 6)} ${P(-6, 8)} ${P(-15, 2)}Z`;
};
/** Eye clip shapes (head space), so the iris tucks under the lids. */
export function eyeClips(L: Look): Def[] {
  return [-1, 1].map(side => ({ tag: 'clipPath', id: side < 0 ? 'eyeL' : 'eyeR', a: {}, kids: [{ tag: 'path', a: { d: eyeShape(L, side) } }] } as Def));
}

function eye(L: Look, side: number, s: Skin): El[] {
  const { ex, ey, k, pt, P } = eyeGeom(L, side);
  const shape = eyeShape(L, side), id = side < 0 ? 'eyeL' : 'eyeR';
  const out: El[] = [];
  const [ix, iy] = pt(1, -1);
  out.push(ellipse(ex + side * 2, ey - 8 * k, 19 * k, 9 * k, { fill: s.deep, opacity: 0.28, filter: 'url(#soft)' }));                 // eye socket shadow
  out.push(path(shape, { fill: '#f6efe6', className: 'yw-eye' }));
  const clip = { clipPath: `url(#${id})`, className: 'yw-eye' };
  out.push(circle(ix, iy, 7.6 * k, { fill: 'url(#iris)', ...clip }));
  out.push(circle(ix, iy, 3.5 * k, { fill: '#0d0705', ...clip }));
  out.push(path(`M${P(-15, 2)}C${P(-8, -9)} ${P(8, -11)} ${P(16, -2)}`, { fill: 'none', stroke: '#000', strokeWidth: 5, opacity: 0.18, ...clip }));   // lid shadow on the eyeball
  out.push(circle(ix + 2.6 * k, iy - 2.6 * k, 1.9 * k, { fill: '#ffffff', opacity: 0.95, className: 'yw-eye' }));
  out.push(circle(ix - 2.4 * k, iy + 3.4 * k, 0.9 * k, { fill: '#ffffff', opacity: 0.5, className: 'yw-eye' }));
  out.push(path(`M${P(-15, 2)}C${P(-8, -9)} ${P(8, -11)} ${P(17, -3)}`, { fill: 'none', stroke: '#160c08', strokeWidth: L.lashes ? 3 : 2, strokeLinecap: 'round', className: 'yw-eye' }));
  if (L.lashes) {
    const [a, b2, c] = [pt(10, -7), pt(14, -5), pt(17, -3)];
    out.push(path(`M${a[0]} ${a[1]}l${side * 4} -4M${b2[0]} ${b2[1]}l${side * 5} -3M${c[0]} ${c[1]}l${side * 5} -1`, { fill: 'none', stroke: '#160c08', strokeWidth: 1.6, strokeLinecap: 'round', className: 'yw-eye' }));
  }
  out.push(path(`M${P(-12, -5)}C${P(-5, -15)} ${P(8, -16)} ${P(15, -8)}`, { fill: 'none', stroke: s.deep, strokeWidth: 1.4, opacity: 0.45, strokeLinecap: 'round' }));
  out.push(path(`M${P(-11, 5)}C${P(-3, 9)} ${P(6, 8)} ${P(14, 2)}`, { fill: 'none', stroke: s.deep, strokeWidth: 1, opacity: 0.35, strokeLinecap: 'round' }));
  // brow: thick at the inner end, tapering to the tail; thickness and arch follow her
  const th = 3 + L.browThick * 6, arch = 4 + L.browArch * 8, by = ey - 18, bx = ex;
  out.push(path(new Path().M([bx + side * -16, by]).Q([bx + side * -4, by - arch], [bx + side * 7, by - arch - 1]).Q([bx + side * 15, by - arch + 1], [bx + side * 20, by - 1])
    .Q([bx + side * 13, by - arch + 1 + th * 0.4], [bx + side * 6, by - arch + th * 0.55]).Q([bx + side * -5, by - arch * 0.5 + th * 0.6], [bx + side * -16, by + th * 0.8]).Z().d,
  { fill: mix(hex(L.hairColor), '#000000', 0.15), opacity: 0.92 }));
  return out;
}

// ─── Hair (head space) ──────────────────────────────────────────
/** Hair behind the head (drawn before the body) and in front (drawn over clothes). Both in head space. */
export function drawHair(b: Body): { back: Art; front: Art } {
  const L = b.look, c = hex(L.hairColor), dk = shade(c, 0.4), lt = mix(c, '#ffffff', 0.22);
  const fill = { fill: c, stroke: dk, strokeWidth: 1.6, strokeOpacity: 0.8, strokeLinejoin: 'round' as const };
  const sheen = (d: string): El => path(d, { fill: 'url(#hairSheen)', pointerEvents: 'none' });
  const strand = (d: string, w = 1.4, o = 0.45): El => path(d, { fill: 'none', stroke: lt, strokeWidth: w, strokeLinecap: 'round', opacity: o });
  const dstrand = (d: string, w = 1.4, o = 0.5): El => path(d, { fill: 'none', stroke: dk, strokeWidth: w, strokeLinecap: 'round', opacity: o });
  const shape = (d: string): El[] => [path(d, fill), sheen(d)];
  const back: El[] = [], front: El[] = [];
  const cap = 'M134 128C128 70 160 34 200 34C240 34 272 70 266 128C258 96 240 78 214 74C196 72 168 78 150 96C142 104 136 116 134 128Z';
  const shoulderY = toHead(b.y.shoulder), bustY = toHead(b.y.bust);
  const defs: Def[] = [{ tag: 'linearGradient', id: 'hairSheen', a: { x1: 0, x2: 0.25, y1: 0, y2: 1 }, kids: [
    { tag: 'stop', a: { offset: '0%', stopColor: '#ffffff', stopOpacity: 0 } }, { tag: 'stop', a: { offset: '14%', stopColor: '#ffffff', stopOpacity: 0.16 } },
    { tag: 'stop', a: { offset: '22%', stopColor: '#ffffff', stopOpacity: 0 } }, { tag: 'stop', a: { offset: '100%', stopColor: '#000000', stopOpacity: 0.25 } }] }];
  // a soft shadow the hair throws on the forehead
  const fringeShadow = path('M140 118C150 90 176 78 200 78C226 78 250 90 260 118', { fill: 'none', stroke: '#000', strokeWidth: 12, opacity: 0.18, filter: 'url(#soft)' });

  switch (L.hair) {
    case 'long': case 'wavy': {
      const wave = L.hair === 'wavy';
      const end = bustY + 40;
      const backPts: Pt[] = wave
        ? [[200, 30], [276, 52], [292, 130], [300, 220], [312, 290], [300, 360], [314, end], [262, end + 18], [200, end + 6], [138, end + 18], [86, end], [100, 360], [88, 290], [100, 220], [108, 130], [124, 52]]
        : [[200, 30], [274, 50], [290, 130], [294, 250], [298, end], [250, end + 14], [200, end + 8], [150, end + 14], [102, end], [106, 250], [110, 130], [126, 50]];
      back.push(...shape(blob(backPts)));
      front.push(fringeShadow, ...shape(cap));
      for (const side of [-1, 1]) {
        const x0 = CX + side * 62;
        const pts: Pt[] = wave
          ? [[x0, 110], [CX + side * 78, 210], [CX + side * 70, 270], [CX + side * 86, 330], [CX + side * 76, end - 10]]
          : [[x0, 110], [CX + side * 74, 210], [CX + side * 78, 300], [CX + side * 80, end - 12]];
        const inner: Pt[] = pts.map(([x, y], i) => [x + side * (i === 0 ? 4 : 26), y + (i === pts.length - 1 ? 8 : 0)]);
        const p = new Path().M([CX + side * 40, 76]).S(pts).L(inner[inner.length - 1]).S([...inner.slice(0, -1).reverse(), [CX + side * 66, 90]]).Z();
        front.push(...shape(p.d));
        for (let k = 0; k < 3; k++) front.push((k % 2 ? dstrand : strand)(new Path().M([CX + side * (66 + k * 5), 130]).S(pts.slice(1).map(([x, y]) => [x + side * (6 + k * 6), y - 6] as Pt)).d, 1.2));
      }
      front.push(strand('M170 52Q150 70 142 104', 1.8), strand('M214 46Q246 56 258 96', 1.8), dstrand('M190 44Q168 58 156 92', 1.2));
      break;
    }
    case 'bob': {
      back.push(...shape(blob([[200, 30], [272, 50], [292, 130], [296, 214], [270, 232], [200, 224], [130, 232], [104, 214], [108, 130], [128, 50]])));
      front.push(fringeShadow, ...shape('M126 216C108 160 118 66 172 42C204 30 244 38 266 66C290 100 292 170 274 216C264 206 262 170 262 132C258 108 246 92 228 84C206 98 176 100 150 92C142 104 138 118 138 132C138 170 136 206 126 216Z'));
      front.push(strand('M156 60Q134 100 132 170', 1.8), strand('M240 54Q270 90 272 170', 1.8), strand('M226 70Q196 92 156 88', 1.6), dstrand('M170 50Q146 90 146 180', 1.2), dstrand('M232 50Q262 100 262 190', 1.2));
      break;
    }
    case 'pixie': {
      front.push(fringeShadow, ...shape('M132 132C124 82 150 38 200 36C246 36 276 70 270 130C262 106 252 92 236 84C226 104 196 102 170 90C156 100 140 112 132 132Z'));
      front.push(strand('M160 58Q182 70 210 66', 1.8), strand('M220 50Q244 60 256 84', 1.8), dstrand('M176 46Q196 56 222 54', 1.2));
      break;
    }
    case 'bun': case 'ponytail': {
      if (L.hair === 'bun') back.push(...shape(blob([[200, -6], [228, 2], [236, 30], [226, 58], [200, 64], [174, 58], [164, 30], [172, 2]])), dstrand('M178 14Q200 4 222 16M174 34Q200 24 226 36', 1.4));
      else back.push(...shape(blob([[226, 56], [262, 40], [292, 70], [300, 150], [296, 250], [282, 330], [266, 260], [262, 150], [250, 90]])), dstrand('M276 90Q290 190 278 300', 1.2));
      front.push(fringeShadow, ...shape('M134 130C126 74 158 36 200 36C242 36 274 74 266 130C258 104 246 88 230 80C214 74 186 74 170 80C154 88 142 104 134 130Z'));
      front.push(strand('M166 50Q190 42 214 46', 1.8), strand('M150 76Q144 96 142 116', 1.6), dstrand('M180 44Q160 60 150 90M222 44Q244 60 252 92', 1.2));
      break;
    }
    case 'afro': {
      const pts: Pt[] = [];
      for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, r = 104 + (i % 2 ? 8 : 0) + Math.sin(i * 2.1) * 4; pts.push([200 + Math.cos(a) * r * 1.06, 106 + Math.sin(a) * r * 0.88]); }
      back.push(...shape(blob(pts)));
      for (let i = 0; i < 60; i++) { const a = i * 2.4, r = 30 + (i * 37 % 70); back.push(circle(200 + Math.cos(a) * r * 1.3, 104 + Math.sin(a) * r, 3 + (i % 3), { fill: i % 2 ? lt : dk, opacity: 0.22 })); }
      front.push(fringeShadow, path('M134 122C128 70 160 32 200 32C240 32 272 70 266 122C254 96 228 86 200 86C172 86 146 96 134 122Z', { fill: c }));
      break;
    }
    case 'puffs': {
      for (const side of [-1, 1]) {
        back.push(...shape(blob([[CX + side * 60, 40], [CX + side * 98, 6], [CX + side * 138, 26], [CX + side * 144, 74], [CX + side * 112, 102], [CX + side * 70, 88]])));
        for (let i = 0; i < 14; i++) back.push(circle(CX + side * (82 + (i * 23 % 52)), 18 + (i * 31 % 76), 3, { fill: i % 2 ? lt : dk, opacity: 0.25 }));
      }
      front.push(fringeShadow, ...shape('M134 124C130 74 160 40 200 40C240 40 270 74 266 124C256 98 236 80 200 78C164 80 144 98 134 124Z'));
      front.push(strand('M200 40L200 78', 1.8, 0.6), dstrand('M176 46Q160 64 150 96M224 46Q240 64 250 96', 1.2));
      break;
    }
    case 'curly': {
      const pts: Pt[] = [];
      for (let i = 0; i <= 18; i++) { const a = Math.PI * (0.98 + i / 18 * 1.04), r = i % 2 ? 96 : 108; pts.push([200 + Math.cos(a) * r * 0.95, 120 + Math.sin(a) * r * 0.95]); }
      back.push(...shape(blob([...pts, [304, 200], [298, shoulderY + 40], [250, shoulderY + 54], [200, 250], [150, shoulderY + 54], [102, shoulderY + 40], [96, 200]])));
      for (const side of [-1, 1]) for (let k = 0; k < 6; k++) back.push(path(`M${CX + side * (84 + (k % 2) * 12)} ${140 + k * 30}c${side * 12} -6 ${side * 12} 18 0 14c${-side * 12} -4 ${-side * 6} -18 6 -14`, { fill: 'none', stroke: lt, strokeWidth: 2, opacity: 0.4 }));
      front.push(fringeShadow, ...shape('M134 128C128 74 160 38 200 38C240 38 272 74 266 128C254 100 232 82 200 82C168 82 146 100 134 128Z'));
      for (let i = 0; i < 9; i++) { const x = 146 + i * 13, y = 62 + Math.abs(4 - i) * 6; front.push(path(`M${x - 6} ${y}q6 -8 12 0q-6 8 -12 0`, { fill: 'none', stroke: lt, strokeWidth: 1.6, opacity: 0.45 })); }
      break;
    }
    case 'braids': case 'locs': {
      const end = toHead(L.hair === 'braids' ? b.y.waist + 10 : b.y.bust + 40);
      const braid = (d: string, out: El[]) => {
        out.push(path(d, { fill: 'none', stroke: dk, strokeWidth: 15, strokeLinecap: 'round' }));
        out.push(path(d, { fill: 'none', stroke: c, strokeWidth: 11.5, strokeLinecap: 'round' }));
        out.push(path(d, { fill: 'none', stroke: lt, strokeWidth: 3, strokeLinecap: 'round', opacity: 0.35, transform: 'translate(-2.5 0)' }));
        if (L.hair === 'braids') out.push(path(d, { fill: 'none', stroke: dk, strokeWidth: 10, strokeDasharray: '2 7', strokeLinecap: 'round', opacity: 0.45 }));
      };
      const n = 15;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), x0 = lerp(116, 284, t), sway = (t - 0.5) * 36, y1 = end - Math.abs(t - 0.5) * 60;
        braid(new Path().M([x0, 110]).S([[x0 + sway * 0.6, (110 + y1) / 2], [x0 + sway, y1]]).d, back);
      }
      front.push(fringeShadow, ...shape(cap));
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
        const x0 = CX + side * (52 + k * 10), y1 = end - 40 - k * 26;
        braid(new Path().M([x0, 96]).S([[CX + side * (70 + k * 10), 220], [CX + side * (78 + k * 12), y1]]).d, front);
      }
      front.push(strand('M200 36L200 74', 1.6, 0.5), strand('M170 42Q160 60 156 86', 1.4), strand('M230 42Q240 60 244 86', 1.4));
      break;
    }
    case 'cornrows': {
      front.push(...shape('M134 128C128 70 160 34 200 34C240 34 272 70 266 128C262 112 256 100 250 92L150 92C144 100 138 112 134 128Z'));
      for (let i = 0; i < 7; i++) { const x = 146 + i * 18; front.push(path(`M${x} 92Q${x + (i - 3) * 2} 60 ${200 + (i - 3) * 8} 36`, { fill: 'none', stroke: lt, strokeWidth: 3, strokeDasharray: '4 4', opacity: 0.45 })); }
      for (const side of [-1, 1]) {
        const d = new Path().M([CX + side * 30, 60]).S([[CX + side * 60, 160], [CX + side * 70, shoulderY + 70]]).d;
        back.push(path(d, { fill: 'none', stroke: dk, strokeWidth: 15, strokeLinecap: 'round' }), path(d, { fill: 'none', stroke: c, strokeWidth: 11, strokeLinecap: 'round' }),
          path(d, { fill: 'none', stroke: dk, strokeWidth: 10, strokeDasharray: '2 7', opacity: 0.45 }));
      }
      break;
    }
  }
  return { back: { defs, els: back }, front: { defs: [], els: front } };
}
