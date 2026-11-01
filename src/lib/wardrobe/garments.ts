// The built-in wardrobe. Every piece is drawn from her body measurements, so it fits whatever
// shape she gives the avatar, and every piece takes any colour and any pattern.
import { Body, CX, sidePts } from './body';
import { Path, blob, circle, ellipse, path, shade, mix, hex, lum, lerp, clamp, type Art, type Def, type El, type Pt } from './shapes';

export type Slot = 'top' | 'bottom' | 'dress' | 'outer' | 'shoes' | 'bag' | 'hat' | 'glasses' | 'ears' | 'neck' | 'belt';
export const SLOTS: { id: Slot; name: string }[] = [
  { id: 'top', name: 'Tops' }, { id: 'bottom', name: 'Bottoms' }, { id: 'dress', name: 'Dresses' },
  { id: 'outer', name: 'Jackets' }, { id: 'shoes', name: 'Shoes' }, { id: 'bag', name: 'Bags' },
  { id: 'hat', name: 'Hats' }, { id: 'glasses', name: 'Glasses' }, { id: 'ears', name: 'Earrings' },
  { id: 'neck', name: 'Necklaces' }, { id: 'belt', name: 'Belts' },
];

export type PatternId = 'solid' | 'stripes' | 'pinstripe' | 'dots' | 'check' | 'floral' | 'leopard' | 'denim' | 'knit' | 'hearts';
export const PATTERNS: { id: PatternId; name: string }[] = [
  { id: 'solid', name: 'Plain' }, { id: 'stripes', name: 'Stripes' }, { id: 'pinstripe', name: 'Pinstripe' },
  { id: 'dots', name: 'Polka dots' }, { id: 'check', name: 'Gingham' }, { id: 'floral', name: 'Floral' },
  { id: 'leopard', name: 'Leopard' }, { id: 'denim', name: 'Denim' }, { id: 'knit', name: 'Knit' }, { id: 'hearts', name: 'Hearts' },
];
const PATTERN_IDS = new Set(PATTERNS.map(p => p.id));

export const CLOTH_COLOURS = [
  '#111111', '#3a3a3a', '#8a8a8a', '#f4f1ea', '#ffffff', '#e9dcc4', '#c8a27a', '#8a5a36', '#5a3a24',
  '#7a1f2b', '#c0262d', '#e8505b', '#f4a3b5', '#f7c6d3', '#e86a2c', '#f2a03d', '#f6d35b', '#fff1a8',
  '#7a8a3a', '#2f6b45', '#8fcfa4', '#1f4e79', '#3c7fc0', '#9cc9ec', '#2a3a6a', '#5b3f8c', '#b79be0', '#3a8a8a',
];

/** One built-in piece being worn. */
export interface WornPiece { kind: 'piece'; piece: string; color: string; color2: string; pattern: PatternId }
/** One of her own closet photos placed on the avatar (avatar coordinates). */
export interface PlacedPhoto { kind: 'photo'; item: string; x: number; y: number; w: number; h: number; rot: number; z: number }
export type Layer = WornPiece | PlacedPhoto;

/** What a piece is painted with. */
interface Paint { fill: string; base: string; line: string; dark: string; light: string; trim: string }

interface Piece {
  id: string; name: string; slot: Slot; z: number;
  color: string; color2?: string; pattern?: PatternId;
  draw: (b: Body, p: Paint) => El[];
}

// ─── Building blocks ─────────────────────────────────────────────
const SW = 1.3;
/** A piece of fabric: the soft shadow it casts on what's underneath, the cloth, then its light and shade. */
const cloth = (d: string, p: Paint, a: Record<string, string | number> = {}): El[] => [
  path(d, { fill: '#000', opacity: 0.24, filter: 'url(#soft)', transform: 'translate(0 3)', pointerEvents: 'none' }),
  path(d, { fill: p.fill, stroke: p.line, strokeWidth: SW, strokeOpacity: 0.8, strokeLinejoin: 'round', ...a }),
  path(d, { fill: 'url(#clothShade)', pointerEvents: 'none' }),
];
const solid = (d: string, fill: string, line: string, a: Record<string, string | number> = {}): El =>
  path(d, { fill, stroke: line, strokeWidth: SW, strokeOpacity: 0.85, strokeLinejoin: 'round', ...a });
const seam = (d: string, p: Paint, w = 1.4, o = 0.7): El => path(d, { fill: 'none', stroke: p.dark, strokeWidth: w, strokeLinecap: 'round', opacity: o });
const stitch = (d: string, p: Paint): El => path(d, { fill: 'none', stroke: p.light, strokeWidth: 1.2, strokeDasharray: '3 3', opacity: 0.8 });

/** Half-width of a garment at height y: follows the body to the hips, then hangs straight (or flares). */
function half(b: Body, y: number, e: number, flare = 0): number {
  if (y <= b.y.hip) return b.torso(y) + e;
  const body = y <= b.y.crotch ? b.torso(y) : b.legOuter(1, y) - CX;
  return Math.max(body + e, b.w.hip + e + flare * (y - b.y.hip) / 100);
}
function sides(b: Body, side: number, y0: number, y1: number, e: number, flare = 0, n = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const y = lerp(y0, y1, i / n); out.push([CX + side * half(b, y, e, flare), y]); }
  return out;
}

type Neck = 'crew' | 'v' | 'scoop' | 'square' | 'turtle' | 'wide';
interface TopOpts { neck: Neck; hem: number; e: number; sleeve?: number; sleeveE?: number; puff?: number; flare?: number; curve?: number }

/** Outline of a top/bodice from the shoulders to the hem. */
function bodice(b: Body, o: TopOpts): string {
  const { neck, hem, e } = o, curve = o.curve ?? 6, flare = o.flare ?? 0;
  const open = { crew: 1, v: 5, scoop: 12, square: 14, turtle: -1, wide: 26 }[neck];
  const nx = b.w.neck + 3 + open, ny = b.y.neck + 6 + (neck === 'wide' ? 12 : 0);
  const tl = sides(b, -1, b.y.armpit, hem, e, flare), tr = sides(b, 1, b.y.armpit, hem, e, flare);
  const sh = (side: number) => b.shoulderPt(side, e);
  const p = new Path().M([CX - nx, ny]).Q([lerp(CX - nx, sh(-1)[0], 0.5), b.y.shoulder - 4 + (neck === 'wide' ? 8 : 0)], sh(-1))
    .S([[CX - b.w.shoulder + 2 - e, b.y.shoulder + 22], ...tl])
    .Q([CX, hem + curve], tr[tr.length - 1]).corner().S([...tr.slice(0, -1).reverse(), [CX + b.w.shoulder - 2 + e, b.y.shoulder + 22], sh(1)])
    .Q([lerp(CX + nx, sh(1)[0], 0.5), b.y.shoulder - 4 + (neck === 'wide' ? 8 : 0)], [CX + nx, ny]);
  if (neck === 'crew' || neck === 'wide') p.Q([CX, ny + (neck === 'wide' ? 26 : 22)], [CX - nx, ny]);
  else if (neck === 'v') p.L([CX, b.y.bust - 6]).L([CX - nx, ny]);
  else if (neck === 'scoop') p.Q([CX, b.y.armpit + 34], [CX - nx, ny]);
  else if (neck === 'square') p.L([CX + nx - 2, b.y.armpit + 4]).L([CX - nx + 2, b.y.armpit + 4]).L([CX - nx, ny]);
  else p.L([CX + b.w.neck + 2, 217]).Q([CX, 222], [CX - b.w.neck - 2, 217]).L([CX - nx, ny]);
  return p.Z().d;
}
/** A strappy top edge (cami, slip dress, tube): straight-ish neckline under the arms. */
function strappy(b: Body, hem: number, e: number, o: { flare?: number; curve?: number; dip?: number; straps?: boolean } = {}): { body: string; straps: string[] } {
  const top = b.y.armpit - 6, tl = sides(b, -1, top, hem, e, o.flare ?? 0), tr = sides(b, 1, top, hem, e, o.flare ?? 0);
  const dip = o.dip ?? 10;
  const body = new Path().M(tl[0]).Q([CX - b.w.bust * 0.5, top - 12], [CX, top + dip]).Q([CX + b.w.bust * 0.5, top - 12], tr[0])
    .S(tr.slice(1)).Q([CX, hem + (o.curve ?? 6)], tl[tl.length - 1]).corner().S(tl.slice(0, -1).reverse()).Z().d;
  const straps = o.straps === false ? [] : [-1, 1].map(side => new Path().M([CX + side * (b.w.bust * 0.55), top - 4]).Q([CX + side * (b.w.shoulder - 28), b.y.shoulder + 8], [CX + side * (b.w.shoulder - 24), b.y.shoulder + 1]).d);
  return { body, straps };
}
function sleeves(b: Body, p: Paint, u: number, e = 3, flare = 0, cuff = true): El[] {
  const out: El[] = [];
  for (const side of [-1, 1]) {
    out.push(...cloth(b.sleeve(side, u, e, flare), p));
    if (cuff && u > 0.15) {
      const a = b.armEdge(side, u - 0.03, true, e + flare), c = b.armEdge(side, u - 0.03, false, e + flare);
      out.push(seam(`M${a[0]} ${a[1]}L${c[0]} ${c[1]}`, p, 1.4, 0.55));
    }
  }
  return out;
}
/** Puffy short sleeve. */
function puffSleeves(b: Body, p: Paint, u = 0.24, puff = 7): El[] {
  return [-1, 1].flatMap(side => {
    const pts: Pt[] = [b.shoulderPt(side, 6)];
    for (let i = 1; i <= 5; i++) { const t = (i / 5) * u, k = Math.sin(Math.PI * i / 5.5) * puff; pts.push(b.armEdge(side, t, true, 3 + k)); }
    const inner: Pt[] = [];
    for (let i = 5; i >= 1; i--) { const t = (i / 5) * u, k = Math.sin(Math.PI * i / 5.5) * puff * 0.5; inner.push(b.armEdge(side, t, false, 3 + k)); }
    const d = new Path().M(pts[0]).S(pts.slice(1)).L(inner[0]).S([...inner.slice(1), [CX + side * (b.w.armpit - 2), b.y.armpit + 6]]).Z().d;
    const a = b.armEdge(side, u - 0.02, true, 4), c = b.armEdge(side, u - 0.02, false, 4);
    return [...cloth(d, p), seam(`M${a[0]} ${a[1]}L${c[0]} ${c[1]}`, p, 2, 0.6)];
  });
}

/** Trousers / shorts / leggings outline. */
interface LegOpts { top: number; hem: number; e: number; wide?: number; flare?: number }
function legs(b: Body, o: LegOpts): string {
  const { top, hem, e } = o, wide = o.wide ?? 0, flare = o.flare ?? 0, { hip, crotch, knee, ankle } = b.y;
  const ease = (y: number) => e + wide * clamp((y - hip) / (ankle - hip)) + flare * Math.pow(clamp((y - knee) / (ankle - knee)), 1.6);
  const outer = (side: number, y: number): Pt => [y < hip ? CX + side * (b.torso(y) + e) : b.legOuter(side, y, ease(y)), y];
  const inner = (side: number, y: number): Pt => {
    const x = b.legInner(side, y, ease(y) * 0.55);
    return [side > 0 ? Math.max(CX + 1.5, x) : Math.min(CX - 1.5, x), y];
  };
  const n = 10, cy = crotch + 4;
  const oL: Pt[] = [], iL: Pt[] = [], iR: Pt[] = [], oR: Pt[] = [];
  for (let i = 0; i <= n; i++) { oL.push(outer(-1, lerp(top, hem, i / n))); oR.unshift(outer(1, lerp(top, hem, i / n))); }
  for (let i = n; i >= 0; i--) iL.push(inner(-1, lerp(cy, hem, i / n)));
  for (let i = 0; i <= n; i++) iR.push(inner(1, lerp(cy, hem, i / n)));
  return new Path().M(oL[0]).S(oL.slice(1)).L(iL[0]).S(iL.slice(1)).L([CX, cy - 2]).L(iR[0]).S(iR.slice(1)).L(oR[0]).S(oR.slice(1)).Z().d;
}
/** Skirt outline from top (waist/hip) to hem. */
function skirt(b: Body, top: number, hem: number, e: number, flare: number, curve = 8): string {
  const l = sides(b, -1, top, hem, e, flare), r = sides(b, 1, top, hem, e, flare);
  return new Path().M(l[0]).S(l.slice(1)).Q([CX, hem + curve], r[r.length - 1]).corner().S([...r.slice(0, -1).reverse()]).Q([CX, top + 4], l[0]).Z().d;
}
function pleats(b: Body, top: number, hem: number, e: number, flare: number, p: Paint, n = 7): El[] {
  const out: El[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n - 0.5, x0 = CX + t * 2 * half(b, top, e), x1 = CX + t * 2 * half(b, hem, e, flare);
    out.push(seam(`M${x0} ${top + 8}L${x1} ${hem + 6 - Math.abs(t) * 6}`, p, 1.3, 0.45));
  }
  return out;
}
function waistband(b: Body, y: number, e: number, p: Paint, h = 9): El[] {
  const w = half(b, y, e), w2 = half(b, y + h, e);
  return [seam(`M${CX - w2} ${y + h}Q${CX} ${y + h + 4} ${CX + w2} ${y + h}`, p, 1.3, 0.6), ...[-1, 1].map(s => seam(`M${CX + s * w * 0.55} ${y + 1}L${CX + s * w2 * 0.55} ${y + h}`, p, 1.2, 0.5))];
}

/** One open front panel of a jacket or coat (side -1 = her right, on the left of the screen). */
function frontPanel(b: Body, side: number, hem: number, e: number, gap: number, lapel: number, flare = 0): string {
  const s = sides(b, side, b.y.armpit, hem, e, flare);
  const sh = b.shoulderPt(side, e), nk = b.neckPt(side, 2);
  const p = new Path().M(nk).Q([lerp(nk[0], sh[0], 0.5), b.y.shoulder - 6], sh).S([[CX + side * (b.w.shoulder - 2 + e), b.y.shoulder + 22], ...s])
    .Q([lerp(s[s.length - 1][0], CX + side * gap, 0.5), hem + 4], [CX + side * gap, hem + 3]).L([CX + side * gap, lapel]);
  return p.L([CX + side * (b.w.neck + 10), b.y.shoulder + 6]).Z().d;
}
function lapels(b: Body, side: number, gap: number, lapel: number, p: Paint, notch = true): El {
  const d = new Path().M(b.neckPt(side, 2)).L([CX + side * (b.w.bust * 0.62), b.y.armpit - 4])
    .L([CX + side * (b.w.bust * 0.66 + (notch ? 6 : 0)), b.y.armpit + (notch ? 8 : 2)]).L([CX + side * gap, lapel]).L([CX + side * (b.w.neck + 10), b.y.shoulder + 6]).Z().d;
  return solid(d, shade(p.base, 0.12), p.line);
}

// Feet / shoes
function shoeAround(b: Body, side: number, e: number, toe = 0, lift = 0): string {
  const x = b.legCx(side, b.y.ankle), y = b.y.ankle, h = b.y.sole - y;
  return blob(sidePts(x, side, [[-10 - e, y + h * 0.15], [10 + e, y + h * 0.15], [13 + e, y + h * 0.5], [17 + e, y + h * 0.92 - lift], [6 + toe * 0.3, y + h + 5 + e + toe], [-9 - e, y + h + 2 + e], [-12 - e, y + h * 0.5]]));
}
function shaft(b: Body, side: number, y0: number, e: number): string {
  const pts: Pt[] = [], back: Pt[] = [];
  for (let i = 0; i <= 8; i++) { const y = lerp(y0, b.y.ankle + 8, i / 8); pts.push([b.legOuter(side, y, e), y]); back.unshift([b.legInner(side, y, e), y]); }
  return new Path().M(pts[0]).S(pts.slice(1)).L(back[0]).S(back.slice(1)).Z().d;
}

// ─── The catalogue ───────────────────────────────────────────────
const Z = { shoes: 10, bottom: 20, top: 30, dress: 32, boots: 15, belt: 45, outer: 50, neck: 55, bag: 60, ears: 82, glasses: 84, hat: 86 } as const;
/** Pieces with z at or above this are drawn over the hair. */
export const OVER_HAIR_Z = 80;
/** Slots drawn in head space (they move with the head). */
export const HEAD_SLOTS = new Set<Slot>(['hat', 'glasses', 'ears']);

const tee = (id: string, name: string, o: TopOpts, extra?: (b: Body, p: Paint) => El[]): Piece => ({
  id, name, slot: 'top', z: Z.top, color: '#f4f1ea',
  draw: (b, p) => [...(o.sleeve ? sleeves(b, p, o.sleeve, o.sleeveE ?? 3) : []), ...cloth(bodice(b, { ...o, hem: hemAt(b, o.hem) }), p), ...(extra?.(b, p) ?? [])],
});
/** Hem positions are given as 0..1 from the underbust (0) to the crotch (1). */
const hemAt = (b: Body, t: number) => lerp(b.y.underbust, b.y.crotch, t);

const PIECES: Piece[] = [
  // Tops
  tee('tee', 'T-shirt', { neck: 'crew', hem: 0.62, e: 6, sleeve: 0.26, sleeveE: 5 }),
  tee('fitted-tee', 'Fitted tee', { neck: 'scoop', hem: 0.52, e: 2, sleeve: 0.2, sleeveE: 2 }),
  tee('crop-tee', 'Crop tee', { neck: 'crew', hem: 0.12, e: 4, sleeve: 0.22, sleeveE: 4 }),
  tee('long-sleeve', 'Long sleeve', { neck: 'crew', hem: 0.55, e: 3, sleeve: 1, sleeveE: 2 }),
  tee('turtleneck', 'Turtleneck', { neck: 'turtle', hem: 0.55, e: 3, sleeve: 1, sleeveE: 2 }, (b, p) => [seam(`M${CX - b.w.neck - 2} 222Q${CX} 229 ${CX + b.w.neck + 2} 222`, p)]),
  tee('v-tee', 'V-neck tee', { neck: 'v', hem: 0.6, e: 5, sleeve: 0.24, sleeveE: 4 }),
  {
    id: 'sweater', name: 'Jumper', slot: 'top', z: Z.top, color: '#c8a27a', pattern: 'knit',
    draw: (b, p) => {
      const hem = hemAt(b, 0.7);
      return [...sleeves(b, p, 1, 7, 4), ...cloth(bodice(b, { neck: 'crew', hem, e: 9, curve: 2 }), p),
        seam(`M${CX - half(b, hem - 12, 9)} ${hem - 12}Q${CX} ${hem - 8} ${CX + half(b, hem - 12, 9)} ${hem - 12}`, p, 1.4, 0.5),
        seam(`M${CX - b.w.neck - 4} ${b.y.neck + 14}Q${CX} ${b.y.neck + 34} ${CX + b.w.neck + 4} ${b.y.neck + 14}`, p, 1.4, 0.5)];
    },
  },
  {
    id: 'hoodie', name: 'Hoodie', slot: 'top', z: Z.top, color: '#8a8a8a',
    draw: (b, p) => {
      const hem = hemAt(b, 0.8), pk = b.y.waist + 30;
      return [...sleeves(b, p, 1, 8, 3), ...cloth(bodice(b, { neck: 'crew', hem, e: 10, curve: 2 }), p), ...cloth(hood(b), p),
        solid(`M${CX - 34} ${pk}L${CX + 34} ${pk}L${CX + 44} ${pk + 40}L${CX - 44} ${pk + 40}Z`, p.fill, p.line, { opacity: 0.95 }),
        seam(`M${CX - 8} ${b.y.neck + 30}l-3 46M${CX + 8} ${b.y.neck + 30}l3 46`, p, 2, 0.7)];
    },
  },
  {
    id: 'shirt', name: 'Button shirt', slot: 'top', z: Z.top, color: '#ffffff', color2: '#9cc9ec',
    draw: (b, p) => {
      const hem = hemAt(b, 0.68);
      const collar = (s: number) => solid(`M${CX + s * 2} ${b.y.neck + 18}L${CX + s * (b.w.neck + 12)} ${b.y.neck + 2}L${CX + s * (b.w.neck + 20)} ${b.y.neck + 20}L${CX + s * 6} ${b.y.neck + 34}Z`, p.fill, p.line);
      return [...sleeves(b, p, 1, 4, 2), ...cloth(bodice(b, { neck: 'v', hem, e: 6, curve: 12 }), p), collar(-1), collar(1),
        seam(`M${CX} ${b.y.bust - 6}L${CX} ${hem + 10}`, p, 1.3, 0.6),
        ...[0, 1, 2, 3].map(i => circle(CX + 5, lerp(b.y.bust, hem - 6, i / 3), 2, { fill: p.dark, opacity: 0.6 }))];
    },
  },
  {
    id: 'blouse', name: 'Puff blouse', slot: 'top', z: Z.top, color: '#f7c6d3',
    draw: (b, p) => [...puffSleeves(b, p, 0.3, 9), ...cloth(bodice(b, { neck: 'square', hem: hemAt(b, 0.35), e: 4, curve: 4 }), p),
      seam(`M${CX - b.w.waist - 2} ${b.y.waist - 8}Q${CX} ${b.y.waist - 2} ${CX + b.w.waist + 2} ${b.y.waist - 8}`, p, 1.2, 0.45)],
  },
  {
    id: 'cami', name: 'Cami', slot: 'top', z: Z.top, color: '#111111',
    draw: (b, p) => { const s = strappy(b, hemAt(b, 0.45), 3); return [...s.straps.map(d => path(d, { fill: 'none', stroke: p.base, strokeWidth: 3, strokeLinecap: 'round' })), ...cloth(s.body, p)]; },
  },
  {
    id: 'tank', name: 'Tank top', slot: 'top', z: Z.top, color: '#ffffff',
    draw: (b, p) => {
      return cloth(tankShape(b), p);
    },
  },
  {
    id: 'off-shoulder', name: 'Off-shoulder top', slot: 'top', z: Z.top, color: '#ffffff',
    draw: (b, p) => {
      const hem = hemAt(b, 0.3), y0 = b.y.shoulder + 26;
      const tl = sides(b, -1, b.y.armpit + 6, hem, 4), tr = sides(b, 1, b.y.armpit + 6, hem, 4);
      const ow = b.w.shoulder + 10;
      const d = new Path().M([CX - ow, y0]).Q([CX, y0 + 12], [CX + ow, y0]).L([CX + ow - 2, y0 + 22]).S(tr).Q([CX, hem + 6], tl[tl.length - 1]).corner().S([...tl.slice(0, -1).reverse(), [CX - ow + 2, y0 + 22]]).Z().d;
      return [...cloth(d, p), seam(`M${CX - ow + 2} ${y0 + 10}Q${CX} ${y0 + 22} ${CX + ow - 2} ${y0 + 10}`, p, 1.3, 0.5)];
    },
  },
  {
    id: 'corset', name: 'Corset top', slot: 'top', z: Z.top, color: '#7a1f2b',
    draw: (b, p) => {
      const s = strappy(b, b.y.waist + 18, 1, { dip: 16, curve: 14 });
      return [...s.straps.map(d => path(d, { fill: 'none', stroke: p.base, strokeWidth: 3, strokeLinecap: 'round' })), ...cloth(s.body, p),
        ...[-0.55, -0.2, 0.2, 0.55].map(t => seam(`M${CX + t * b.w.bust} ${b.y.armpit + 8}Q${CX + t * b.w.waist * 0.9} ${b.y.underbust + 20} ${CX + t * b.w.waist} ${b.y.waist + 18}`, p, 1.2, 0.5))];
    },
  },

  // Bottoms
  {
    id: 'jeans', name: 'Straight jeans', slot: 'bottom', z: Z.bottom, color: '#3c6a9c', pattern: 'denim',
    draw: (b, p) => [...cloth(legs(b, { top: b.y.navel, hem: b.y.ankle - 4, e: 4, wide: 6 }), p), ...waistband(b, b.y.navel, 4, p),
      seam(`M${CX + 2} ${b.y.navel + 9}Q${CX + 6} ${b.y.hip + 18} ${CX} ${b.y.crotch - 4}`, p, 1.2, 0.5), ...jeanPockets(b, p)],
  },
  {
    id: 'skinny', name: 'Skinny jeans', slot: 'bottom', z: Z.bottom, color: '#1f2a3a', pattern: 'denim',
    draw: (b, p) => [...cloth(legs(b, { top: b.y.navel - 6, hem: b.y.ankle - 6, e: 1.5 }), p), ...waistband(b, b.y.navel - 6, 1.5, p), ...jeanPockets(b, p)],
  },
  {
    id: 'flares', name: 'Flares', slot: 'bottom', z: Z.bottom, color: '#5a7fae', pattern: 'denim',
    draw: (b, p) => [...cloth(legs(b, { top: b.y.navel - 4, hem: b.y.sole - 4, e: 2, flare: 22 }), p), ...waistband(b, b.y.navel - 4, 2, p), ...jeanPockets(b, p)],
  },
  {
    id: 'wide-trousers', name: 'Wide trousers', slot: 'bottom', z: Z.bottom, color: '#2a2a2a',
    draw: (b, p) => [...cloth(legs(b, { top: b.y.waist, hem: b.y.sole - 2, e: 6, wide: 30 }), p), ...waistband(b, b.y.waist, 6, p, 11),
      ...[-1, 1].map(s => seam(`M${b.legCx(s, b.y.hip)} ${b.y.hip}L${b.legCx(s, b.y.ankle) + s * 6} ${b.y.sole - 6}`, p, 1.2, 0.4))],
  },
  {
    id: 'cargos', name: 'Cargo trousers', slot: 'bottom', z: Z.bottom, color: '#7a8a3a',
    draw: (b, p) => [...cloth(legs(b, { top: b.y.navel, hem: b.y.ankle, e: 6, wide: 12 }), p), ...waistband(b, b.y.navel, 6, p),
      ...[-1, 1].map(s => { const x = b.legOuter(s, b.y.thigh, 8) - s * 4, y = b.y.thigh; return solid(`M${x} ${y - 20}L${x - s * 30} ${y - 18}L${x - s * 30} ${y + 26}L${x} ${y + 24}Z`, p.fill, p.line, { opacity: 0.95 }); })],
  },
  {
    id: 'leggings', name: 'Leggings', slot: 'bottom', z: Z.bottom, color: '#111111',
    draw: (b, p) => cloth(legs(b, { top: b.y.waist + 6, hem: b.y.ankle - 2, e: 0.5 }), p),
  },
  {
    id: 'shorts', name: 'Denim shorts', slot: 'bottom', z: Z.bottom, color: '#8fb3d9', pattern: 'denim',
    draw: (b, p) => [...cloth(legs(b, { top: b.y.navel, hem: b.y.crotch + 34, e: 4, wide: 30 }), p), ...waistband(b, b.y.navel, 4, p), ...jeanPockets(b, p)],
  },
  {
    id: 'bermudas', name: 'Long shorts', slot: 'bottom', z: Z.bottom, color: '#e9dcc4',
    draw: (b, p) => [...cloth(legs(b, { top: b.y.waist + 4, hem: b.y.knee - 14, e: 6, wide: 26 }), p), ...waistband(b, b.y.waist + 4, 6, p)],
  },
  {
    id: 'mini-skirt', name: 'Mini skirt', slot: 'bottom', z: Z.bottom, color: '#111111',
    draw: (b, p) => [...cloth(skirt(b, b.y.navel, b.y.crotch + 40, 3, 8), p), ...waistband(b, b.y.navel, 3, p, 8)],
  },
  {
    id: 'pleated-skirt', name: 'Pleated skirt', slot: 'bottom', z: Z.bottom, color: '#2a3a6a', pattern: 'check',
    draw: (b, p) => { const hem = b.y.thigh + 30; return [...cloth(skirt(b, b.y.waist + 4, hem, 3, 26), p), ...pleats(b, b.y.waist + 4, hem, 3, 26, p, 9)]; },
  },
  {
    id: 'a-line-skirt', name: 'A-line midi', slot: 'bottom', z: Z.bottom, color: '#f2a03d',
    draw: (b, p) => cloth(skirt(b, b.y.waist, b.y.calf, 3, 22, 10), p),
  },
  {
    id: 'pencil-skirt', name: 'Pencil skirt', slot: 'bottom', z: Z.bottom, color: '#3a3a3a',
    draw: (b, p) => [...cloth(skirt(b, b.y.waist, b.y.knee + 10, 2, -2, 4), p), seam(`M${CX} ${b.y.knee - 30}L${CX} ${b.y.knee + 12}`, p, 1.3, 0.6)],
  },
  {
    id: 'maxi-skirt', name: 'Maxi skirt', slot: 'bottom', z: Z.bottom, color: '#2f6b45', pattern: 'floral',
    draw: (b, p) => [...cloth(skirt(b, b.y.waist, b.y.ankle + 6, 3, 18, 10), p), ...pleats(b, b.y.hip, b.y.ankle + 6, 3, 18, p, 6)],
  },

  // Dresses
  {
    id: 'slip-dress', name: 'Slip dress', slot: 'dress', z: Z.dress, color: '#c8a27a',
    draw: (b, p) => { const s = strappy(b, b.y.knee - 10, 3, { flare: 10, curve: 8 }); return [...s.straps.map(d => path(d, { fill: 'none', stroke: p.base, strokeWidth: 3, strokeLinecap: 'round' })), ...cloth(s.body, p)]; },
  },
  {
    id: 'bodycon', name: 'Bodycon mini', slot: 'dress', z: Z.dress, color: '#c0262d',
    draw: (b, p) => [...cloth(bodice(b, { neck: 'square', hem: b.y.crotch + 46, e: 1, curve: 4 }), p)],
  },
  {
    id: 'sundress', name: 'Sundress', slot: 'dress', z: Z.dress, color: '#fff1a8', pattern: 'floral', color2: '#e86a2c',
    draw: (b, p) => {
      const s = strappy(b, b.y.waist + 4, 3, { dip: 18, curve: 4 });
      return [...s.straps.map(d => path(d, { fill: 'none', stroke: p.base, strokeWidth: 6, strokeLinecap: 'round' })), ...cloth(skirt(b, b.y.waist, b.y.knee + 20, 4, 34, 10), p), ...cloth(s.body, p)];
    },
  },
  {
    id: 'wrap-dress', name: 'Wrap dress', slot: 'dress', z: Z.dress, color: '#3a8a8a', pattern: 'dots',
    draw: (b, p) => [...cloth(skirt(b, b.y.waist, b.y.knee + 30, 3, 20, 8), p), ...sleeves(b, p, 0.5, 4, 3), ...cloth(bodice(b, { neck: 'v', hem: b.y.waist + 6, e: 3, curve: 2 }), p),
      seam(`M${CX - b.w.neck - 6} ${b.y.neck + 12}L${CX + b.w.waist + 4} ${b.y.waist + 2}`, p, 1.6, 0.6),
      path(`M${CX + b.w.waist + 2} ${b.y.waist + 2}q14 18 4 40`, { fill: 'none', stroke: p.base, strokeWidth: 6, strokeLinecap: 'round' })],
  },
  {
    id: 'maxi-dress', name: 'Maxi dress', slot: 'dress', z: Z.dress, color: '#5b3f8c',
    draw: (b, p) => [...cloth(skirt(b, b.y.underbust + 8, b.y.ankle + 10, 4, 22, 10), p), ...cloth(bodice(b, { neck: 'v', hem: b.y.underbust + 12, e: 2, curve: 2 }), p), ...puffSleeves(b, p, 0.2, 5)],
  },
  {
    id: 'tshirt-dress', name: 'T-shirt dress', slot: 'dress', z: Z.dress, color: '#8a8a8a',
    draw: (b, p) => [...sleeves(b, p, 0.28, 6), ...cloth(bodice(b, { neck: 'crew', hem: b.y.thigh + 20, e: 8, curve: 6 }), p)],
  },
  {
    id: 'off-shoulder-dress', name: 'Off-shoulder dress', slot: 'dress', z: Z.dress, color: '#111111',
    draw: (b, p) => {
      const y0 = b.y.shoulder + 26, ow = b.w.shoulder + 10, hem = b.y.knee;
      const tl = sides(b, -1, b.y.armpit + 6, hem, 2, 6), tr = sides(b, 1, b.y.armpit + 6, hem, 2, 6);
      const d = new Path().M([CX - ow, y0]).Q([CX, y0 + 12], [CX + ow, y0]).L([CX + ow - 2, y0 + 22]).S(tr).Q([CX, hem + 6], tl[tl.length - 1]).corner().S([...tl.slice(0, -1).reverse(), [CX - ow + 2, y0 + 22]]).Z().d;
      return [...cloth(d, p), seam(`M${CX - ow + 2} ${y0 + 10}Q${CX} ${y0 + 22} ${CX + ow - 2} ${y0 + 10}`, p, 1.3, 0.5)];
    },
  },
  {
    id: 'jumpsuit', name: 'Jumpsuit', slot: 'dress', z: Z.dress, color: '#e86a2c',
    draw: (b, p) => { const s = strappy(b, b.y.waist + 6, 3, { dip: 14 }); return [...s.straps.map(d => path(d, { fill: 'none', stroke: p.base, strokeWidth: 5, strokeLinecap: 'round' })), ...cloth(legs(b, { top: b.y.waist, hem: b.y.sole - 6, e: 5, wide: 24 }), p), ...cloth(s.body, p), seam(`M${CX - b.w.waist - 3} ${b.y.waist + 4}Q${CX} ${b.y.waist + 10} ${CX + b.w.waist + 3} ${b.y.waist + 4}`, p)]; },
  },

  // Jackets
  {
    id: 'denim-jacket', name: 'Denim jacket', slot: 'outer', z: Z.outer, color: '#5a7fae', pattern: 'denim',
    draw: (b, p) => openJacket(b, p, { hem: b.y.navel + 4, e: 9, gap: 14, collar: true, extra: (s) => [stitch(`M${CX + s * 16} ${b.y.bust - 8}L${CX + s * (b.w.bust + 4)} ${b.y.bust - 14}`, p),
      solid(`M${CX + s * 22} ${b.y.bust}l${s * 26} -2l0 20l${-s * 26} 2Z`, p.fill, p.line)] }),
  },
  {
    id: 'blazer', name: 'Blazer', slot: 'outer', z: Z.outer, color: '#2a2a2a',
    draw: (b, p) => openJacket(b, p, { hem: b.y.hip + 14, e: 9, gap: 4, lapel: b.y.waist - 4, notch: true, extra: (s) => [seam(`M${CX + s * (b.w.waist * 0.7)} ${b.y.hip - 14}l${s * 26} 0`, p, 1.6, 0.7)], button: true }),
  },
  {
    id: 'cardigan', name: 'Cardigan', slot: 'outer', z: Z.outer, color: '#f6d35b', pattern: 'knit',
    draw: (b, p) => openJacket(b, p, { hem: b.y.hip + 6, e: 7, gap: 16, lapel: b.y.bust + 10, flat: true, extra: (s) => s > 0 ? [0, 1, 2, 3].map(i => circle(CX + 20, lerp(b.y.bust + 24, b.y.hip - 6, i / 3), 2.6, { fill: p.trim })) : [] }),
  },
  {
    id: 'leather', name: 'Leather jacket', slot: 'outer', z: Z.outer, color: '#111111',
    draw: (b, p) => openJacket(b, p, { hem: b.y.waist + 22, e: 8, gap: 18, notch: true, extra: (s) => [path(`M${CX + s * 30} ${b.y.bust + 10}l${s * 24} 4`, { stroke: '#c9c9c9', strokeWidth: 2, strokeLinecap: 'round' }),
      path(`M${CX + s * 18} ${b.y.waist}l${s * 26} 0`, { stroke: '#c9c9c9', strokeWidth: 2, strokeLinecap: 'round' })], shine: true }),
  },
  {
    id: 'trench', name: 'Trench coat', slot: 'outer', z: Z.outer, color: '#c8a27a',
    draw: (b, p) => {
      const out = openJacket(b, p, { hem: b.y.knee + 20, e: 10, gap: 12, flare: 14, lapel: b.y.bust + 8, notch: true });
      const w = half(b, b.y.waist, 11);
      out.push(solid(`M${CX - w} ${b.y.waist - 6}L${CX + w} ${b.y.waist - 6}L${CX + w} ${b.y.waist + 8}L${CX - w} ${b.y.waist + 8}Z`, p.fill, p.line),
        solid(`M${CX + 10} ${b.y.waist - 9}h16v20h-16Z`, 'none', shade(p.base, 0.45)));
      return out;
    },
  },
  {
    id: 'puffer', name: 'Puffer jacket', slot: 'outer', z: Z.outer, color: '#111111',
    draw: (b, p) => {
      const hem = b.y.hip, out: El[] = [...sleeves(b, p, 0.98, 14, 4)];
      for (const side of [-1, 1]) for (let i = 1; i < 8; i++) { const a = b.armEdge(side, i / 8, true, 14), c = b.armEdge(side, i / 8, false, 14); out.push(seam(`M${a[0]} ${a[1]}Q${(a[0] + c[0]) / 2} ${(a[1] + c[1]) / 2 + 5} ${c[0]} ${c[1]}`, p, 1.3, 0.45)); }
      out.push(...cloth(bodice(b, { neck: 'turtle', hem, e: 15, curve: 2 }), p));
      for (let i = 1; i < 6; i++) { const y = lerp(b.y.armpit - 10, hem, i / 6), w = half(b, y, 15); out.push(seam(`M${CX - w + 3} ${y}Q${CX} ${y + 6} ${CX + w - 3} ${y}`, p, 1.3, 0.45)); }
      out.push(seam(`M${CX} 214L${CX} ${hem + 2}`, p, 1.6, 0.8));
      return out;
    },
  },
  {
    id: 'zip-hoodie', name: 'Zip hoodie', slot: 'outer', z: Z.outer, color: '#9cc9ec',
    draw: (b, p) => {
      const out = openJacket(b, p, { hem: b.y.hip + 8, e: 9, gap: 6, lapel: b.y.shoulder + 8, flat: true, noLapel: true });
      out.push(...cloth(hood(b), { ...p, fill: shade(p.base, 0.08) }));
      out.push(seam(`M${CX - 8} ${b.y.shoulder + 8}l-2 44M${CX + 8} ${b.y.shoulder + 8}l2 44`, { ...p, dark: p.trim }, 2, 0.9));
      return out;
    },
  },

  // Shoes (and boots, which go over trousers)
  {
    id: 'sneakers', name: 'Trainers', slot: 'shoes', z: Z.shoes, color: '#ffffff', color2: '#e9e4dc',
    draw: (b, p) => [-1, 1].flatMap(s => {
      const x = b.legCx(s, b.y.ankle), y = b.y.ankle, h = b.y.sole - y;
      return [...cloth(shoeAround(b, s, 4, 3), p), path(new Path().M([x - s * 16, y + h + 2]).Q([x + s * 4, y + h + 14], [x + s * 22, y + h + 2]).d, { fill: 'none', stroke: p.trim, strokeWidth: 5, strokeLinecap: 'round' }),
        seam(`M${x - 7} ${y + 8}l14 0M${x - 7} ${y + 15}l14 0M${x - 6} ${y + 22}l12 0`, p, 1.4, 0.7)];
    }),
  },
  {
    id: 'heels', name: 'Heels', slot: 'shoes', z: Z.shoes, color: '#111111',
    draw: (b, p) => [-1, 1].flatMap(s => {
      const x = b.legCx(s, b.y.ankle), y = b.y.ankle, h = b.y.sole - y;
      const toe = blob(sidePts(x, s, [[-11, y + h * 0.55], [12, y + h * 0.5], [17, y + h * 0.95], [5, y + h + 9], [-9, y + h + 4]]));
      return [solid(`M${x + s * 10} ${y + h * 0.3}l${s * 4} ${h * 0.75}l${s * 3} 0l${-s * 1} ${-h * 0.75}Z`, p.base, p.line), ...cloth(toe, p)];
    }),
  },
  {
    id: 'flats', name: 'Ballet flats', slot: 'shoes', z: Z.shoes, color: '#f4a3b5',
    draw: (b, p) => [-1, 1].flatMap(s => {
      const x = b.legCx(s, b.y.ankle), y = b.y.ankle, h = b.y.sole - y;
      const toe = blob(sidePts(x, s, [[-12, y + h * 0.5], [13, y + h * 0.45], [18, y + h * 0.95], [6, y + h + 7], [-10, y + h + 4]]));
      return [...cloth(toe, p), path(`M${x - 4} ${y + h * 0.55}q4 4 8 0q-4 -4 -8 0`, { fill: p.trim, stroke: p.line, strokeWidth: 1 })];
    }),
  },
  {
    id: 'sandals', name: 'Sandals', slot: 'shoes', z: Z.shoes, color: '#8a5a36',
    draw: (b, p) => [-1, 1].flatMap(s => {
      const x = b.legCx(s, b.y.ankle), y = b.y.ankle, h = b.y.sole - y;
      return [path(`M${x - 12} ${y + h + 4}Q${x + s * 4} ${y + h + 12} ${x + s * 20} ${y + h + 3}`, { fill: 'none', stroke: p.line, strokeWidth: 4, strokeLinecap: 'round' }),
        path(`M${x - 13} ${y + h * 0.55}Q${x} ${y + h * 0.38} ${x + 13} ${y + h * 0.55}`, { fill: 'none', stroke: p.base, strokeWidth: 6, strokeLinecap: 'round' }),
        path(`M${x - 11} ${y - 2}Q${x} ${y + 4} ${x + 11} ${y - 2}`, { fill: 'none', stroke: p.base, strokeWidth: 4, strokeLinecap: 'round' })];
    }),
  },
  {
    id: 'ankle-boots', name: 'Ankle boots', slot: 'shoes', z: Z.boots, color: '#3a2a20',
    draw: (b, p) => [-1, 1].flatMap(s => [...cloth(shaft(b, s, b.y.ankle - 50, 4), p), ...cloth(shoeAround(b, s, 4, 2), p)]),
  },
  {
    id: 'knee-boots', name: 'Knee boots', slot: 'shoes', z: Z.boots, color: '#111111',
    draw: (b, p) => [-1, 1].flatMap(s => [...cloth(shaft(b, s, b.y.knee - 6, 3.5), p), ...cloth(shoeAround(b, s, 3, 3), p),
      seam(`M${b.legInner(s, b.y.knee, 3)} ${b.y.knee + 4}Q${b.legCx(s, b.y.knee)} ${b.y.knee + 10} ${b.legOuter(s, b.y.knee, 3)} ${b.y.knee + 4}`, p, 1.4, 0.5)]),
  },
  {
    id: 'loafers', name: 'Loafers', slot: 'shoes', z: Z.shoes, color: '#5a3a24',
    draw: (b, p) => [-1, 1].flatMap(s => { const x = b.legCx(s, b.y.ankle), y = b.y.ankle, h = b.y.sole - y; return [...cloth(shoeAround(b, s, 3, 1), p), solid(`M${x - 8} ${y + h * 0.5}h16v5h-16Z`, p.trim, p.line, { strokeWidth: 1 })]; }),
  },

  // Bags
  {
    id: 'handbag', name: 'Handbag', slot: 'bag', z: Z.bag, color: '#7a1f2b', color2: '#d9b26b',
    draw: (b, p) => {
      const [wx, wy] = b.wristPt(1), x = wx - 6, y = wy + 30;
      return [path(`M${x + 6} ${y}Q${x + 22} ${y - 40} ${x + 38} ${y}`, { fill: 'none', stroke: p.line, strokeWidth: 4 }),
        ...cloth(`M${x - 4} ${y}L${x + 48} ${y}L${x + 54} ${y + 46}Q${x + 22} ${y + 52} ${x - 10} ${y + 46}Z`, p), circle(x + 22, y + 12, 3, { fill: p.trim })];
    },
  },
  {
    id: 'crossbody', name: 'Crossbody', slot: 'bag', z: Z.bag, color: '#111111', color2: '#d9b26b',
    draw: (b, p) => {
      const x = CX + b.w.hip - 10, y = b.y.hip - 24;
      return [path(`M${CX - b.w.shoulder + 22} ${b.y.shoulder + 2}L${x + 8} ${y}`, { fill: 'none', stroke: p.line, strokeWidth: 3.5, strokeLinecap: 'round' }),
        ...cloth(`M${x - 8} ${y}h40q4 0 4 4v30q0 4 -4 4h-40q-4 0 -4 -4v-30q0 -4 4 -4Z`, p), seam(`M${x - 12} ${y + 14}h48`, p), circle(x + 12, y + 18, 2.6, { fill: p.trim })];
    },
  },
  {
    id: 'tote', name: 'Tote bag', slot: 'bag', z: Z.bag, color: '#e9dcc4',
    draw: (b, p) => {
      const sx = CX - b.w.shoulder + 12, x = CX - b.w.hip - 48, y = b.y.waist - 8;
      return [path(`M${sx} ${b.y.shoulder}Q${x + 6} ${b.y.armpit} ${x + 10} ${y}M${sx + 10} ${b.y.shoulder + 2}Q${x + 40} ${b.y.armpit + 10} ${x + 44} ${y}`, { fill: 'none', stroke: p.line, strokeWidth: 3 }),
        ...cloth(`M${x} ${y}L${x + 56} ${y}L${x + 60} ${y + 76}L${x - 4} ${y + 76}Z`, p)];
    },
  },

  // Hats, glasses, jewellery, belts
  {
    id: 'beanie', name: 'Beanie', slot: 'hat', z: Z.hat, color: '#c0262d', pattern: 'knit',
    draw: (b, p) => [...cloth('M130 112C126 60 160 24 200 24C240 24 274 60 270 112Z', p), solid('M126 100Q200 88 274 100L276 122Q200 110 124 122Z', shade(p.base, 0.1), p.line),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => seam(`M${136 + i * 18} 102l0 14`, p, 1.2, 0.4)), circle(200, 20, 14, { fill: p.trim, stroke: p.line, strokeWidth: SW })],
  },
  {
    id: 'cap', name: 'Cap', slot: 'hat', z: Z.hat, color: '#1f4e79',
    draw: (b, p) => [...cloth('M134 104C130 58 162 30 200 30C238 30 270 58 266 104Q200 92 134 104Z', p), solid('M138 98Q200 84 262 98Q282 108 264 116Q200 102 136 116Q118 108 138 98Z', shade(p.base, 0.15), p.line),
      circle(200, 32, 4, { fill: p.dark }), seam('M200 32L200 92', p, 1.2, 0.5)],
  },
  {
    id: 'bucket-hat', name: 'Bucket hat', slot: 'hat', z: Z.hat, color: '#f4f1ea', pattern: 'check',
    draw: (b, p) => [...cloth('M112 108Q200 92 288 108L300 128Q200 110 100 128Z', p), ...cloth('M140 104C138 56 164 32 200 32C236 32 262 56 260 104Q200 96 140 104Z', p)],
  },
  {
    id: 'headband', name: 'Headband', slot: 'hat', z: Z.hat, color: '#f4a3b5',
    draw: (b, p) => [path('M136 108C140 64 166 44 200 44C234 44 260 64 264 108', { fill: 'none', stroke: p.line, strokeWidth: 12, strokeLinecap: 'round' }),
      path('M136 108C140 64 166 44 200 44C234 44 260 64 264 108', { fill: 'none', stroke: p.base, strokeWidth: 9, strokeLinecap: 'round' })],
  },
  {
    id: 'sunglasses', name: 'Sunglasses', slot: 'glasses', z: Z.glasses, color: '#111111',
    draw: (b, p) => [...[-1, 1].map(s => solid(`M${CX + s * 9} 120Q${CX + s * 10} 146 ${CX + s * 28} 146Q${CX + s * 48} 146 ${CX + s * 48} 124Q${CX + s * 46} 116 ${CX + s * 28} 116Q${CX + s * 9} 116 ${CX + s * 9} 120Z`, p.base, shade(p.base, 0.4), { opacity: 0.94 })),
      path('M191 124Q200 118 209 124', { fill: 'none', stroke: p.line, strokeWidth: 3 }), path('M152 124L136 128M248 124L264 128', { stroke: p.line, strokeWidth: 3 }),
      ...[-1, 1].map(s => path(`M${CX + s * 18} 124l${s * 10} -4`, { stroke: '#ffffff', strokeWidth: 2, opacity: 0.4, strokeLinecap: 'round' }))],
  },
  {
    id: 'glasses', name: 'Glasses', slot: 'glasses', z: Z.glasses, color: '#5a3a24',
    draw: (b, p) => [...[-1, 1].map(s => circle(CX + s * 28, 131, 17, { fill: '#ffffff', fillOpacity: 0.08, stroke: p.base, strokeWidth: 3.5 })),
      path('M190 128Q200 122 210 128', { fill: 'none', stroke: p.base, strokeWidth: 3 }), path('M145 128L134 124M255 128L266 124', { stroke: p.base, strokeWidth: 3 })],
  },
  {
    id: 'hoops', name: 'Hoops', slot: 'ears', z: Z.ears, color: '#d9b26b',
    draw: (b, p) => [-1, 1].map(s => circle(CX + s * 66, 166, 11, { fill: 'none', stroke: p.base, strokeWidth: 3 })),
  },
  {
    id: 'studs', name: 'Studs', slot: 'ears', z: Z.ears, color: '#f4f1ea',
    draw: (b, p) => [-1, 1].map(s => circle(CX + s * 66, 150, 3.4, { fill: p.base, stroke: shade(p.base, 0.3), strokeWidth: 1 })),
  },
  {
    id: 'drops', name: 'Drop earrings', slot: 'ears', z: Z.ears, color: '#d9b26b', color2: '#3a8a8a',
    draw: (b, p) => [-1, 1].flatMap(s => [path(`M${CX + s * 66} 150l0 16`, { stroke: p.base, strokeWidth: 2 }), ellipse(CX + s * 66, 172, 5, 8, { fill: p.trim, stroke: p.base, strokeWidth: 2 })]),
  },
  {
    id: 'necklace', name: 'Pendant', slot: 'neck', z: Z.neck, color: '#d9b26b', color2: '#f4f1ea',
    draw: (b, p) => [path(`M${CX - b.w.neck - 2} ${b.y.neck + 2}Q${CX - 10} ${b.y.shoulder + 40} ${CX} ${b.y.shoulder + 40}Q${CX + 10} ${b.y.shoulder + 40} ${CX + b.w.neck + 2} ${b.y.neck + 2}`, { fill: 'none', stroke: p.base, strokeWidth: 1.8 }),
      circle(CX, b.y.shoulder + 46, 5, { fill: p.trim, stroke: p.base, strokeWidth: 2 })],
  },
  {
    id: 'pearls', name: 'Pearls', slot: 'neck', z: Z.neck, color: '#f4f1ea',
    draw: (b) => { const out: El[] = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = Math.PI * t; out.push(circle(CX - Math.cos(a) * (b.w.neck + 6), b.y.neck + 4 + Math.sin(a) * 26, 3.2, { fill: '#f7f3ea', stroke: '#cbbfa8', strokeWidth: 1 })); } return out; },
  },
  {
    id: 'choker', name: 'Choker', slot: 'neck', z: Z.neck, color: '#111111',
    draw: (b, p) => [path(`M${CX - b.w.neck} ${b.y.neck - 6}Q${CX} ${b.y.neck + 4} ${CX + b.w.neck} ${b.y.neck - 6}`, { fill: 'none', stroke: p.base, strokeWidth: 5, strokeLinecap: 'round' })],
  },
  {
    id: 'belt', name: 'Belt', slot: 'belt', z: Z.belt, color: '#3a2a20', color2: '#d9b26b',
    draw: (b, p) => {
      const y = b.y.navel - 2, w = half(b, y, 6);
      return [solid(`M${CX - w} ${y - 6}Q${CX} ${y} ${CX + w} ${y - 6}L${CX + w} ${y + 4}Q${CX} ${y + 10} ${CX - w} ${y + 4}Z`, p.base, p.line), solid(`M${CX - 9} ${y - 6}h18v14h-18Z`, 'none', p.trim, { strokeWidth: 3 })];
    },
  },
  {
    id: 'waist-belt', name: 'Waist belt', slot: 'belt', z: Z.belt, color: '#111111', color2: '#d9b26b',
    draw: (b, p) => {
      const y = b.y.waist, w = half(b, y, 5);
      return [solid(`M${CX - w} ${y - 9}Q${CX} ${y - 4} ${CX + w} ${y - 9}L${CX + w} ${y + 9}Q${CX} ${y + 14} ${CX - w} ${y + 9}Z`, p.base, p.line), circle(CX, y + 2, 7, { fill: 'none', stroke: p.trim, strokeWidth: 3 })];
    },
  },
];

/** A hood lying down: a thick rim around the neck. */
function hood(b: Body): string {
  const sh = b.y.shoulder, nk = b.y.neck, o = b.w.neck + 34;
  return new Path().M([CX - o, sh + 12]).Q([CX - o - 2, nk - 12], [CX - 24, nk - 8]).L([CX + 24, nk - 8]).Q([CX + o + 2, nk - 12], [CX + o, sh + 12])
    .Q([CX + o - 14, sh + 4], [CX + b.w.neck + 2, nk + 6]).Q([CX, nk + 34], [CX - b.w.neck - 2, nk + 6]).Q([CX - o + 14, sh + 4], [CX - o, sh + 12]).Z().d;
}
function tankShape(b: Body): string {
  const hem = hemAt(b, 0.55), tl = sides(b, -1, b.y.armpit + 10, hem, 3), tr = sides(b, 1, b.y.armpit + 10, hem, 3);
  const sx = b.w.neck + 12;
  return new Path().M([CX - sx, b.y.neck + 6]).L([CX - sx - 12, b.y.shoulder]).Q([CX - b.w.shoulder + 12, b.y.armpit - 10], tl[0]).S(tl.slice(1))
    .Q([CX, hem + 6], tr[tr.length - 1]).corner().S([...tr.slice(0, -1).reverse()]).Q([CX + b.w.shoulder - 12, b.y.armpit - 10], [CX + sx + 12, b.y.shoulder]).L([CX + sx, b.y.neck + 6])
    .Q([CX, b.y.armpit + 20], [CX - sx, b.y.neck + 6]).Z().d;
}
function jeanPockets(b: Body, p: Paint): El[] {
  return [-1, 1].map(s => seam(`M${CX + s * (half(b, b.y.navel + 10, 4) - 4)} ${b.y.navel + 12}Q${CX + s * (half(b, b.y.navel + 10, 4) - 22)} ${b.y.navel + 20} ${CX + s * (half(b, b.y.hip, 4) - 4)} ${b.y.hip + 4}`, p, 1.3, 0.55));
}
interface JacketOpts { hem: number; e: number; gap: number; lapel?: number; notch?: boolean; collar?: boolean; flat?: boolean; noLapel?: boolean; flare?: number; button?: boolean; shine?: boolean; extra?: (side: number) => El[] }
function openJacket(b: Body, p: Paint, o: JacketOpts): El[] {
  const lapel = o.lapel ?? b.y.bust + 20, out: El[] = [...sleeves(b, p, 1, o.e - 2, 2)];
  for (const side of [-1, 1]) {
    out.push(...cloth(frontPanel(b, side, o.hem, o.e, o.gap, lapel, o.flare ?? 0), p));
    if (!o.noLapel && !o.flat) out.push(lapels(b, side, o.gap, lapel, p, !!o.notch));
    if (o.flat && !o.noLapel) out.push(seam(`M${b.neckPt(side, 2)[0]} ${b.neckPt(side, 2)[1]}L${CX + side * o.gap} ${lapel}`, p, 3, 0.35));
    if (o.collar) out.push(solid(`M${b.neckPt(side, 2)[0]} ${b.neckPt(side, 2)[1] - 4}L${CX + side * (b.w.neck + 30)} ${b.y.shoulder + 10}L${CX + side * 16} ${b.y.armpit + 4}L${CX + side * (b.w.neck + 6)} ${b.y.shoulder + 8}Z`, shade(p.base, 0.1), p.line));
    if (o.shine) out.push(path(`M${CX + side * (b.w.bust - 6)} ${b.y.armpit + 10}Q${CX + side * (b.w.bust - 2)} ${b.y.underbust} ${CX + side * (b.w.waist + 2)} ${b.y.waist}`, { fill: 'none', stroke: '#ffffff', strokeWidth: 3, opacity: 0.14, strokeLinecap: 'round' }));
    out.push(...(o.extra?.(side) ?? []));
  }
  if (o.button) out.push(circle(CX + o.gap + 6, lapel + 6, 3.4, { fill: p.dark }));
  return out;
}

const BY_ID = new Map(PIECES.map(p => [p.id, p]));
export const CATALOGUE = PIECES.map(({ id, name, slot, color, color2, pattern }) => ({ id, name, slot, color, color2, pattern: pattern ?? 'solid' as PatternId }));
export const pieceSlot = (id: string): Slot | null => BY_ID.get(id)?.slot ?? null;

/** A fresh worn piece with the piece's own default colours. */
export function wear(id: string, color?: string, pattern?: PatternId): WornPiece | null {
  const p = BY_ID.get(id);
  if (!p) return null;
  const c = hex(color, p.color);
  return { kind: 'piece', piece: id, color: c, color2: hex(p.color2, lum(c) > 0.6 ? '#3a3a3a' : '#f4f1ea'), pattern: pattern ?? p.pattern ?? 'solid' };
}

// ─── Patterns ────────────────────────────────────────────────────
function patternDef(id: string, kind: PatternId, base: string, c2: string): Def | null {
  const bg = { tag: 'rect' as const, a: { width: 40, height: 40, fill: base } };
  const P = (size: number, kids: Def['kids'], extra: Record<string, string | number> = {}): Def => ({ tag: 'pattern', id, a: { patternUnits: 'userSpaceOnUse', width: size, height: size, ...extra }, kids: [bg, ...kids] });
  switch (kind) {
    case 'solid': return null;
    case 'stripes': return P(16, [{ tag: 'rect', a: { y: 0, width: 16, height: 6, fill: c2 } }]);
    case 'pinstripe': return P(10, [{ tag: 'rect', a: { x: 4, width: 1.4, height: 10, fill: c2, opacity: 0.8 } }]);
    case 'dots': return P(18, [{ tag: 'circle', a: { cx: 4.5, cy: 4.5, r: 2.8, fill: c2 } }, { tag: 'circle', a: { cx: 13.5, cy: 13.5, r: 2.8, fill: c2 } }]);
    case 'check': return P(16, [{ tag: 'rect', a: { width: 8, height: 16, fill: c2, opacity: 0.45 } }, { tag: 'rect', a: { width: 16, height: 8, fill: c2, opacity: 0.45 } }]);
    case 'floral': {
      const kids: Def['kids'] = [];
      for (const [x, y, r] of [[8, 8, 2.6], [22, 21, 2]] as [number, number, number][]) {
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; kids.push({ tag: 'circle', a: { cx: x + Math.cos(a) * r * 1.3, cy: y + Math.sin(a) * r * 1.3, r, fill: c2 } }); }
        kids.push({ tag: 'circle', a: { cx: x, cy: y, r: r * 0.7, fill: mix(c2, '#ffe08a', 0.6) } });
      }
      kids.push({ tag: 'path', a: { d: 'M20 6q3 -2 5 1M6 22q-1 3 2 5', fill: 'none', stroke: mix(base, '#2f6b45', 0.6), strokeWidth: 1.4, strokeLinecap: 'round' } });
      return P(30, kids);
    }
    case 'leopard': return P(30, [
      { tag: 'ellipse', a: { cx: 8, cy: 8, rx: 5, ry: 3.6, fill: 'none', stroke: c2, strokeWidth: 2.2 } }, { tag: 'ellipse', a: { cx: 8, cy: 8, rx: 2, ry: 1.4, fill: mix(base, c2, 0.4) } },
      { tag: 'ellipse', a: { cx: 23, cy: 20, rx: 4.4, ry: 3.2, fill: 'none', stroke: c2, strokeWidth: 2.2 } }, { tag: 'ellipse', a: { cx: 23, cy: 20, rx: 1.8, ry: 1.2, fill: mix(base, c2, 0.4) } },
      { tag: 'circle', a: { cx: 20, cy: 6, r: 1.6, fill: c2 } }, { tag: 'circle', a: { cx: 6, cy: 24, r: 1.8, fill: c2 } }]);
    case 'denim': return P(8, [{ tag: 'path', a: { d: 'M0 8L8 0M-2 2L2 -2M6 10L10 6', stroke: mix(base, '#ffffff', 0.25), strokeWidth: 1, opacity: 0.6 } }]);
    case 'knit': return P(10, [{ tag: 'path', a: { d: 'M0 2L5 7L10 2', fill: 'none', stroke: shade(base, 0.25), strokeWidth: 1.2, opacity: 0.6 } }]);
    case 'hearts': return P(22, [{ tag: 'path', a: { d: 'M11 15C4 10 5 5 8 5C10 5 11 7 11 7C11 7 12 5 14 5C17 5 18 10 11 15Z', fill: c2 } }]);
  }
}

/** Draw one built-in piece. uid keeps its pattern id unique within the picture. */
export function drawPiece(b: Body, w: WornPiece, uid: string): Art {
  const piece = BY_ID.get(w.piece);
  if (!piece) return { defs: [], els: [] };
  const base = hex(w.color, piece.color), c2 = hex(w.color2, '#f4f1ea');
  const kind = PATTERN_IDS.has(w.pattern) ? w.pattern : 'solid';
  const def = patternDef(`pat-${uid}`, kind, base, c2);
  const dark = lum(base) < 0.18;
  const paint: Paint = {
    fill: def ? `url(#pat-${uid})` : base, base,
    line: dark ? mix(base, '#ffffff', 0.18) : shade(base, 0.38),
    dark: dark ? mix(base, '#ffffff', 0.3) : shade(base, 0.3),
    light: mix(base, '#ffffff', 0.45), trim: c2,
  };
  return { defs: def ? [def] : [], els: piece.draw(b, paint) };
}

/** Shared definitions every outfit picture uses (cloth shading). */
export const CLOTH_DEFS: Def[] = [{
  tag: 'linearGradient', id: 'clothShade', a: { x1: 0, x2: 1, y1: 0, y2: 0 },
  kids: [{ tag: 'stop', a: { offset: '0%', stopColor: '#000000', stopOpacity: 0.34 } }, { tag: 'stop', a: { offset: '14%', stopColor: '#000000', stopOpacity: 0.08 } },
    { tag: 'stop', a: { offset: '36%', stopColor: '#ffffff', stopOpacity: 0.13 } }, { tag: 'stop', a: { offset: '56%', stopColor: '#ffffff', stopOpacity: 0 } },
    { tag: 'stop', a: { offset: '84%', stopColor: '#000000', stopOpacity: 0.1 } }, { tag: 'stop', a: { offset: '100%', stopColor: '#000000', stopOpacity: 0.4 } }],
}];

// ─── Outfits ─────────────────────────────────────────────────────
export const layerZ = (l: Layer): number => l.kind === 'photo' ? l.z : BY_ID.get(l.piece)?.z ?? 30;

/** Put a piece on: replaces whatever was in its slot (a dress replaces top and bottom, and the other way round). */
export function putOn(layers: Layer[], w: WornPiece): Layer[] {
  const slot = pieceSlot(w.piece);
  const clash = (s: Slot | null) => s === slot || (slot === 'dress' && (s === 'top' || s === 'bottom')) || ((slot === 'top' || slot === 'bottom') && s === 'dress');
  return [...layers.filter(l => l.kind === 'photo' || !clash(pieceSlot(l.piece))), w];
}

/** Clean saved layers (from the database): unknown pieces dropped, numbers clamped. */
export function cleanLayers(raw: unknown): Layer[] {
  if (!Array.isArray(raw)) return [];
  const out: Layer[] = [];
  const n = (v: unknown, lo: number, hi: number, d: number) => typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : d;
  for (const r of raw.slice(0, 40)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (o.kind === 'piece' && typeof o.piece === 'string' && BY_ID.has(o.piece)) {
      const w = wear(o.piece, o.color as string, PATTERN_IDS.has(o.pattern as PatternId) ? o.pattern as PatternId : 'solid');
      if (w) out.push({ ...w, color2: hex(o.color2, w.color2) });
    } else if (o.kind === 'photo' && typeof o.item === 'string' && /^[0-9a-f-]{36}$/i.test(o.item)) {
      out.push({ kind: 'photo', item: o.item, x: n(o.x, -200, 600, 100), y: n(o.y, -200, 1200, 300), w: n(o.w, 10, 800, 200), h: n(o.h, 10, 1200, 200), rot: n(o.rot, -180, 180, 0), z: n(o.z, 0, 99, 30) });
    }
  }
  return out;
}

/** Where a closet photo of this category starts on the body (box in avatar coordinates). */
export function photoBox(b: Body, category: string, aspect: number): { x: number; y: number; w: number; h: number; z: number } {
  const fit = (cx: number, top: number, w: number, maxH: number) => { let ww = w, hh = w * aspect; if (hh > maxH) { hh = maxH; ww = hh / aspect; } return { x: cx - ww / 2, y: top, w: ww, h: hh }; };
  switch (category) {
    case 'bottom': return { ...fit(CX, b.y.waist - 4, (b.w.hip + 40) * 2, b.y.sole - b.y.waist), z: Z.bottom + 1 };
    case 'dress': return { ...fit(CX, b.y.shoulder - 16, (b.w.shoulder + 30) * 2, b.y.ankle - b.y.shoulder), z: Z.dress + 1 };
    case 'outerwear': return { ...fit(CX, b.y.shoulder - 22, (b.w.shoulder + 60) * 2, b.y.knee - b.y.shoulder), z: Z.outer + 1 };
    case 'shoes': return { ...fit(CX, b.y.ankle - 30, 140, 90), z: Z.boots + 1 };
    case 'bag': return { ...fit(CX + b.w.hip + 40, b.y.hip - 60, 110, 140), z: Z.bag + 1 };
    case 'accessory': return { ...fit(CX, b.y.neck - 10, 90, 90), z: Z.neck + 1 };
    default: return { ...fit(CX, b.y.shoulder - 20, (b.w.shoulder + 44) * 2, b.y.crotch - b.y.shoulder + 30), z: Z.top + 1 };
  }
}

// ─── Random outfits ──────────────────────────────────────────────
const PALETTES = [
  ['#111111', '#f4f1ea', '#c0262d'], ['#e9dcc4', '#5a3a24', '#c8a27a'], ['#1f4e79', '#ffffff', '#f2a03d'],
  ['#f7c6d3', '#ffffff', '#5b3f8c'], ['#2f6b45', '#e9dcc4', '#8a5a36'], ['#3a3a3a', '#9cc9ec', '#ffffff'],
  ['#7a1f2b', '#111111', '#d9b26b'], ['#fff1a8', '#3c7fc0', '#ffffff'], ['#e86a2c', '#f4f1ea', '#3a2a20'],
];
const pick = <T,>(xs: T[], r: () => number) => xs[Math.floor(r() * xs.length)];
/** A random but coordinated outfit. r is a random source (Math.random in the app). */
export function randomOutfit(r: () => number): Layer[] {
  const pal = pick(PALETTES, r);
  const ids = (slot: Slot) => PIECES.filter(p => p.slot === slot).map(p => p.id);
  const w = (id: string, c: string, pat?: PatternId) => wear(id, c, pat)!;
  const out: Layer[] = [];
  if (r() < 0.3) out.push(w(pick(ids('dress'), r), pal[0], r() < 0.3 ? pick(['floral', 'dots', 'stripes', 'leopard'] as PatternId[], r) : 'solid'));
  else {
    const bottom = pick(ids('bottom'), r), bp = BY_ID.get(bottom)!;
    out.push(w(bottom, bp.pattern === 'denim' ? bp.color : pal[1], bp.pattern));
    out.push(w(pick(ids('top'), r), pal[0], r() < 0.2 ? pick(['stripes', 'check', 'dots'] as PatternId[], r) : undefined));
  }
  out.push(w(pick(ids('shoes'), r), pal[2]));
  if (r() < 0.45) { const o = pick(ids('outer'), r); out.push(w(o, r() < 0.5 ? BY_ID.get(o)!.color : pal[1], BY_ID.get(o)!.pattern)); }
  if (r() < 0.5) out.push(w(pick(ids('bag'), r), pal[2]));
  if (r() < 0.5) out.push(w(pick(ids('ears'), r), '#d9b26b'));
  if (r() < 0.2) out.push(w(pick(ids('glasses'), r), '#111111'));
  return out;
}
