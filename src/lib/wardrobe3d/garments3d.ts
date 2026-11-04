// Every 3D garment: how it's cut from the body shells, how loose it sits, what details it carries and which solid
// parts go with it. Each one follows the real thing: a trench coat is knee-length and double-breasted with a collar,
// lapels and a belt; a puffer is quilted in channels with a stand-up collar; flares kick out below the knee; heels
// lift her onto the balls of her feet. All numbers are in dm on her body at rest, from her landmarks, so every
// garment fits whatever shape she has.
import type { Cut, PieceSpec, Marks, Detail, Extra } from './build3d';
import { DETAIL as D } from './build3d';

type Spec = Partial<PieceSpec>;
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function garmentSpecs(k: Marks): Record<string, Spec[]> {
  // ─── building blocks ───
  const T = (cuts: Cut[], o: Spec = {}): Spec => ({ cuts, rough: 0.88, sheen: 0.5, folds: 'tee', ...o });
  const torso = (y0: number, ease: number, o: Partial<Cut> = {}): Cut => ({ y0, y1: k.neckY - 0.2, scoop: 0.32, arm: 0.38, ease, source: 'tights', smooth: 12, ...o });
  const strap = (ease: number, w = 0.18): Cut => ({ y0: k.armpitY - 0.2, y1: k.neckY + 0.6, x0: k.shoulderX * (0.5 - w), x1: k.shoulderX * (0.5 + w * 0.6), arm: -0.05, ease, source: 'tights', smooth: 2 });
  const bodice = (ease: number, o: Partial<Cut> = {}): Cut => ({ y0: k.waistY - 0.3, y1: k.armpitY + 0.15, scoop: 0.25, arm: -0.05, ease, source: 'tights', smooth: 8, ...o });
  const skirt = (y0: number | undefined, flare: number, pleats: number, o: Partial<Cut> = {}): Cut => ({ y0, ease: 0.07, flare, pleats, dropFrom: k.hipY, source: 'skirt', smooth: 4, ...o });
  const legs = (y0: number, ease: number, o: Partial<Cut> = {}): Cut => ({ y0, y1: k.waistY - 0.35, ease, source: 'tights', smooth: 24, ...o });
  // a V at the front neck, `depth` deep and `w` wide at the neck
  const vneck = (depth: number, w: number) => (x: number, y: number, z: number) => (z < 0.05 ? -1 : y - (k.neckY - depth + depth * Math.abs(x) / w));
  // a sweetheart neckline: dips between the breasts, higher over them
  const sweetheart = (x: number, y: number, z: number) => y - (z > 0 ? k.bustY + 0.32 - 0.24 * Math.exp(-((x / 0.2) ** 2)) : k.bustY + 0.12);
  // outward room on a leg, less on the inside so the legs don't meet
  const leg = (amt: (y: number) => number) => (x: number, y: number, _z: number, nx: number) => (y < k.crotchY ? amt(y) * (x * nx >= 0 ? 1 : 0.35) : 0);
  const puff = (big: number, end: number) => (_x: number, _y: number, _z: number, _nx: number, _nz: number, t: number) => (t > 0.05 && t < end ? big * Math.sin(Math.PI * (t - 0.05) / (end - 0.05)) : 0);
  const quilt = (_x: number, y: number) => 0.24 * Math.pow(Math.abs(Math.sin(Math.PI * y / 0.55)), 0.45);
  const det = (f: number, o: Omit<Detail, 'f'> = {}): Detail => ({ f, ...o });
  const topstitch = '#c98a35', waistband = k.waistY - 0.5;
  const ex = (kind: Extra['kind'], off: number, o: Partial<Extra> = {}): Extra => ({ kind, off, ...o });
  // shoes: the upper's top edge as a height above the sole along the foot (t: 0 heel .. 1 toe)
  const ft = (z: number) => (z - k.heelZ) / (k.toeZ - k.heelZ || 1);
  const upper = (edge: (t: number) => number) => (_x: number, y: number, z: number) => (y - k.soleY) - edge(ft(z));
  const shoe = (clip: Cut['clip'], o: Spec, y1 = k.ankleY + 0.3, ease = 0.06): Spec => ({ cuts: [{ y1, ease, source: 'tights', smooth: 8, clip }], rough: 0.4, folds: 'leather', hem: 0.025, ...o });

  // ─── tops ───
  const tee: Spec[] = [T([torso(k.crotchY + 0.75, 0.13, { smooth: 14 })])];
  const long: Spec[] = [T([torso(k.crotchY + 0.75, 0.08, { arm: 1.92, scoop: 0.28 })])];
  const hoodie: Spec[] = [T([{ y0: k.crotchY + 0.55, y1: k.neckY + 0.05, arm: 1.92, ease: 0.22, source: 'tights', smooth: 14 }], { rough: 0.95, sheen: 0.8, folds: 'knit', hem: 0.06, extra: 'hood' }),
    T([{ y0: k.crotchY + 0.85, y1: k.waistY - 0.05, x1: k.shoulderX * 0.62, z0: 0.35, ease: 0.27, source: 'tights', smooth: 14 }], { rough: 0.95, sheen: 0.8, folds: 'knit', hem: 0.03 })];
  const tank: Spec[] = [T([{ y0: k.crotchY + 0.75, y1: k.armpitY + 0.2, scoop: 0.2, arm: -0.05, ease: 0.1, source: 'tights', smooth: 12 }, strap(0.08)])];
  const off: Cut = { y0: k.crotchY + 0.8, y1: k.armpitY + 0.32, arm: 0.28, ease: 0.08, source: 'tights', smooth: 6, bulge: (x, y) => 0.09 * ss(k.armpitY + 0.05, k.armpitY + 0.3, y) * (Math.abs(x) < k.shoulderX - 0.15 ? 1 : 0.2) };   // with a ruffled band across the upper arms
  const S: Record<string, Spec[]> = {
    tee, 'fitted-tee': [T([torso(k.hipY + 0.15, 0.05, { scoop: 0.45, arm: 0.3, smooth: 6 })])],
    crop: [T([torso(k.underbustY - 0.45, 0.08, { arm: 0.3, smooth: 6 })])],
    longsleeve: long,
    turtleneck: [T([torso(k.crotchY + 0.75, 0.07, { arm: 1.92, scoop: 0, y1: k.neckY - 0.05 })], { extras: [ex('turtle', 0.07)] })],
    'v-tee': [T([torso(k.crotchY + 0.75, 0.12, { clip: vneck(0.55, 0.36) })])],
    sweater: [T([torso(k.crotchY + 0.55, 0.17, { arm: 1.95, scoop: 0.15, smooth: 16 })], { folds: 'knit', rough: 0.95, sheen: 0.8, hem: 0.06, detail: det(D.rib, { b: [0, 0, k.crotchY + 0.85, 0] }), extras: [ex('neckband', 0.17)] })],
    shirt: [T([torso(k.crotchY + 0.4, 0.11, { arm: 1.95, scoop: 0.1, y1: k.neckY - 0.08 })], { rough: 0.8, sheen: 0.4, fabric: 'woven', detail: det(D.placket, { a: [k.neckY - 0.25, k.crotchY + 0.5, 0.55, 0], color: '#f4f2ee' }), extras: [ex('collar', 0.11)] })],
    blouse: [T([torso(k.crotchY + 0.8, 0.1, { arm: 0.75, smooth: 8, bulge: puff(0.32, 0.75) })], { sheen: 0.8, rough: 0.7, folds: 'drape' })],
    cami: [T([bodice(0.05, { y0: k.hipY + 0.1, clip: vneck(0.35, 0.5) }), strap(0.03, 0.04)], { rough: 0.32, sheen: 1, coat: 0.25, folds: 'drape' })],
    tank,
    'off-shoulder': [T([off])],
    corset: [T([{ y0: k.waistY - 0.45, y1: k.bustY + 0.5, arm: -0.05, ease: 0.025, source: 'tights', smooth: 6, clip: sweetheart }], { rough: 0.4, sheen: 0.8, coat: 0.2, folds: 'drape', fabric: 'satin', detail: det(D.boning, { color: '#000000' }) })],

    // ─── jackets and coats ───
    hoodie,
    'zip-hoodie': [{ ...hoodie[0], detail: det(D.zip, { a: [k.neckY + 0.05, k.crotchY + 0.55, 0, 0] }) },
      T([{ y0: k.crotchY + 0.85, y1: k.waistY - 0.05, x1: k.shoulderX * 0.62, x0: 0.06, z0: 0.35, ease: 0.27, source: 'tights', smooth: 14 }], { rough: 0.95, sheen: 0.8, folds: 'knit', hem: 0.03 })],
    jacket: [T([{ y0: k.crotchY + 0.45, y1: k.neckY + 0.1, arm: 1.95, ease: 0.24, source: 'tights', smooth: 14 }], { rough: 0.7, sheen: 0.3, folds: 'jeans', hem: 0.06, extras: [ex('collar', 0.25)] })],
    'denim-jacket': [T([{ y0: k.waistY - 0.45, y1: k.neckY - 0.02, scoop: 0.1, arm: 1.95, ease: 0.2, source: 'tights', smooth: 12 }], {
      rough: 0.85, folds: 'jeans', hem: 0.07, pattern: 'denim', extras: [ex('collar', 0.26, { wide: 1.5 })],
      detail: det(D.placket | D.yoke | D.chestPockets | D.sideSeam, { color: topstitch, a: [k.neckY - 0.25, k.waistY - 0.35, 0.5, 0], b: [k.bustY + 0.55, k.bustY + 0.3, 0, 0] }),
    })],
    blazer: [T([{ y0: k.crotchY + 0.25, y1: k.neckY + 0.05, arm: 1.95, ease: 0.2, source: 'tights', smooth: 12, clip: vneck(k.neckY - k.waistY - 0.25, 0.55),
      bulge: (x, y) => 0.05 * ss(0.4, 0, Math.hypot(Math.abs(x) - k.shoulderJ.x, y - k.shoulderJ.y)) }],   // padded shoulders
      { rough: 0.75, sheen: 0.35, folds: 'drape', hem: 0.06, detail: det(D.placket, { a: [k.waistY + 0.1, k.waistY - 0.4, 0.5, 0], color: '#000000' }), extras: [ex('lapels', 0.22, { breakY: k.waistY + 0.25 })] })],
    cardigan: [T([{ y0: k.crotchY + 0.3, y1: k.neckY + 0.02, arm: 1.95, ease: 0.15, source: 'tights', smooth: 14, clip: vneck(k.neckY - k.waistY - 0.1, 0.4) }],
      { folds: 'knit', rough: 0.95, sheen: 0.8, hem: 0.06, pattern: 'knit', detail: det(D.placket | D.rib, { a: [k.waistY, k.crotchY + 0.4, 0.42, 0.05], b: [0, 0, k.crotchY + 0.6, 0] }) })],
    leather: [T([{ y0: k.waistY - 0.5, y1: k.neckY + 0.05, arm: 1.95, ease: 0.18, source: 'tights', smooth: 10, clip: vneck(0.65, 0.55) }],
      { rough: 0.32, sheen: 0.2, coat: 0.55, folds: 'leather', hem: 0.05, detail: det(D.zip, { a: [k.bustY + 0.2, k.waistY - 0.5, 0, 0.22] }), extras: [ex('lapels', 0.2, { breakY: k.bustY + 0.15, wide: 1.4 })] })],
    trench: [T([{ y0: k.hipY - 0.1, y1: k.neckY + 0.1, arm: 1.95, ease: 0.26, source: 'tights', smooth: 14, clip: vneck(k.neckY - k.bustY + 0.05, 0.6) },
      { y0: k.kneeY - 0.25, ease: 0.24, flare: 0.13, pleats: 0.14, dropFrom: k.waistY, source: 'skirt', smooth: 6 }],
      { rough: 0.78, sheen: 0.35, folds: 'drape', fabric: 'twill', hem: 0.07, detail: det(D.double, { a: [k.bustY, k.hipY - 0.2, 0.55, 0.34], color: '#2a1e14' }),
        extras: [ex('collar', 0.28, { wide: 1.2 }), ex('lapels', 0.28, { breakY: k.bustY - 0.05 }), ex('belt', 0.3)] })],
    coat: [T([{ y0: k.hipY - 0.1, y1: k.neckY + 0.1, arm: 1.95, ease: 0.27, source: 'tights', smooth: 14 }, { y0: k.kneeY - 0.3, ease: 0.2, flare: 0.12, pleats: 0.15, dropFrom: k.hipY, source: 'skirt', smooth: 6 }], { rough: 0.8, sheen: 0.4, folds: 'drape', hem: 0.07, extras: [ex('collar', 0.27)] })],
    puffer: [T([{ y0: k.crotchY + 0.45, y1: k.neckY + 0.15, arm: 1.95, ease: 0.3, source: 'tights', smooth: 4, bulge: quilt }],
      { rough: 0.78, sheen: 0.2, coat: 0, folds: 'tee', fabric: 'nylon', hem: 0.08, detail: det(D.zip | D.quilt, { a: [k.neckY + 0.4, k.crotchY + 0.45, 0, 0] }), extras: [ex('puffcollar', 0.3)] })],

    // ─── bottoms ───
    jeans: [T([legs(k.ankleY + 0.15, 0.08, { bulge: leg(y => Math.max(0, k.kneeY + 0.4 - y) * 0.05) })], { rough: 0.85, folds: 'jeans', hem: 0.05, pattern: 'denim',
      detail: det(D.sideSeam | D.backPockets | D.waistband, { color: topstitch, c: [k.hipY + 0.15, waistband, k.ankleY + 0.45, 1] }) })],
    skinny: [T([legs(k.ankleY + 0.1, 0.045, { smooth: 18 })], { rough: 0.85, folds: 'jeans', hem: 0.04, pattern: 'denim', detail: det(D.sideSeam | D.backPockets | D.waistband, { color: topstitch, c: [k.hipY + 0.15, waistband, k.ankleY + 0.45, 1] }) })],
    flares: [T([legs(k.soleY + 0.4, 0.06, { hang: k.kneeY - 0.2, bulge: leg(y => Math.max(0, k.kneeY - y) * 0.3) })], { rough: 0.85, folds: 'jeans', hem: 0.05, pattern: 'denim', detail: det(D.sideSeam | D.backPockets | D.waistband, { color: topstitch, c: [k.hipY + 0.15, waistband, k.ankleY + 0.45, 1] }) })],
    'wide-trousers': [T([legs(k.soleY + 0.4, 0.08, { hang: k.kneeY + 0.4, bulge: leg(y => 0.12 + (k.crotchY - y) * 0.09) })], { rough: 0.8, folds: 'drape', hem: 0.05, detail: det(D.waistband, { c: [0, waistband, 0, 0], color: '#000000' }) })],
    cargos: [T([legs(k.ankleY + 0.15, 0.1, { bulge: (x, y, z, nx) => leg(yy => 0.08 + (k.crotchY - yy) * 0.05)(x, y, z, nx) + (Math.abs(nx) > 0.6 && y < k.kneeY + 1.35 && y > k.kneeY + 0.45 ? 0.07 : 0) })],
      { rough: 0.9, folds: 'jeans', hem: 0.05, detail: det(D.cargo | D.sideSeam | D.waistband, { color: '#4a5420', b: [0, 0, 0, k.kneeY + 1.35], c: [0, waistband, 0, 0] }) })],
    leggings: [T([legs(k.ankleY + 0.1, 0.03, { y1: k.waistY - 0.2, smooth: 3 })], { rough: 0.6, sheen: 0.3, hem: 0.02 })],
    shorts: [T([legs(k.crotchY - 0.75, 0.08, { smooth: 20 })], { rough: 0.85, folds: 'jeans', hem: 0.05, pattern: 'denim', detail: det(D.sideSeam | D.backPockets | D.waistband, { color: topstitch, c: [k.hipY + 0.15, waistband, k.ankleY + 0.45, 1] }) })],
    bermudas: [T([legs(k.kneeY + 0.2, 0.1, { bulge: leg(() => 0.08) })], { rough: 0.85, folds: 'drape', hem: 0.06, detail: det(D.waistband | D.backPockets, { color: '#000000', c: [k.hipY + 0.15, waistband, k.ankleY + 0.45, 1] }) })],
    skirt: [T([skirt(k.kneeY + 1.1, 0.2, 0.3)], { folds: 'drape' })],
    'mini-skirt': [T([skirt(k.kneeY + 1.35, 0.1, 0.1, { ease: 0.05 })], { folds: 'drape', rough: 0.7 })],
    'pleated-skirt': [T([skirt(k.kneeY + 0.7, 0.24, 0.9, { pleatN: 16, sharp: true, smooth: 0 })], { folds: 'drape' })],
    'a-line-skirt': [T([skirt(k.kneeY - 0.9, 0.3, 0.22)], { folds: 'drape' })],
    'pencil-skirt': [T([skirt(k.kneeY - 0.35, -0.05, 0, { ease: 0.04, smooth: 10 })], { folds: 'drape', rough: 0.75 })],
    longskirt: [T([skirt(k.kneeY - 1.6, 0.26, 0.45)], { folds: 'drape' })],
    'maxi-skirt': [T([skirt(k.soleY + 0.6, 0.15, 0.45)], { folds: 'drape' })],

    // ─── dresses ───
    dress: [T([bodice(0.06), strap(0.04), { ...skirt(k.kneeY - 0.7, 0.3, 0.45), ease: 0.06 }], { rough: 0.8, folds: 'drape' })],
    sundress: [T([bodice(0.06), strap(0.04), { ...skirt(k.kneeY - 0.7, 0.3, 0.45), ease: 0.06 }], { rough: 0.8, folds: 'drape' })],
    minidress: [T([bodice(0.06), strap(0.04), { ...skirt(k.kneeY + 0.9, 0.22, 0.3), ease: 0.06 }], { rough: 0.8, folds: 'drape' })],
    maxidress: [T([bodice(0.06), strap(0.04), { ...skirt(k.soleY + 0.5, 0.14, 0.4), ease: 0.06 }], { rough: 0.8, folds: 'drape' })],
    'slip-dress': [T([bodice(0.04, { clip: vneck(0.4, 0.55) }), strap(0.03, 0.04), skirt(k.kneeY - 0.85, 0.14, 0.3, { ease: 0.05 })], { rough: 0.3, sheen: 1, coat: 0.25, folds: 'drape' })],
    bodycon: [T([bodice(0.03, { y1: k.armpitY + 0.25, scoop: 0.3 }), strap(0.03, 0.15), skirt(k.kneeY + 1.1, -0.03, 0, { ease: 0.035, smooth: 8, dropFrom: k.waistY })], { rough: 0.55, sheen: 0.6, folds: 'tee' })],
    'wrap-dress': [T([{ y0: k.waistY - 0.3, y1: k.neckY - 0.15, arm: 0.3, ease: 0.08, source: 'tights', smooth: 8, clip: vneck(k.neckY - k.bustY + 0.1, 0.42) }, skirt(k.kneeY - 0.4, 0.24, 0.35, { ease: 0.07 })],
      { rough: 0.75, folds: 'drape', detail: det(D.wrap, { color: '#000000', a: [k.neckY, k.hipY, 0, 0] }), extras: [ex('bow', 0.1)] })],
    'tshirt-dress': [T([torso(k.hipY - 0.2, 0.13, { smooth: 14 }), skirt(k.kneeY + 0.65, 0.06, 0.1, { ease: 0.13, dropFrom: k.waistY })], { folds: 'tee' })],
    'off-shoulder-dress': [T([{ ...off, y0: k.waistY - 0.3, ease: 0.06 }, skirt(k.kneeY - 0.45, 0.2, 0.3)], { rough: 0.7, folds: 'drape' })],
    jumpsuit: [T([{ y0: k.waistY - 0.4, y1: k.armpitY + 0.2, scoop: 0.25, arm: -0.05, ease: 0.09, source: 'tights', smooth: 10 }, strap(0.07),
      legs(k.soleY + 0.35, 0.09, { y1: k.waistY - 0.2, bulge: leg(y => 0.08 + (k.crotchY - y) * 0.08) })], { rough: 0.8, folds: 'drape', extras: [ex('belt', 0.12)] })],

    // ─── shoes ───
    sneakers: [{ cuts: [{ y1: k.ankleY + 0.42, ease: 0.11, source: 'tights', smooth: 10 }], rough: 0.5, folds: 'leather', hem: 0.04, color2: '#f4f1ea', sole: { h: 0.25, laces: true } }],
    // a court shoe: closed toe and heel, open over the top of the foot, on a stiletto
    heels: [shoe(upper(t => (t < 0.18 ? 0.65 : t < 0.62 ? 0.65 - (t - 0.18) * 0.9 : 0.26 + (t - 0.62) * 0.4)), { rough: 0.28, coat: 0.6, sole: { h: 0.05, heel: 0.75, post: 'stiletto' } }, k.ankleY)],
    flats: [shoe(upper(t => (t < 0.2 ? 0.45 : t < 0.6 ? 0.45 - (t - 0.2) * 0.5 : 0.25 + (t - 0.6) * 0.3)), { rough: 0.45, sole: { h: 0.05, heel: 0.05, post: 'block' } }, k.ankleY)],
    // straps: across the toes, over the instep, round the ankle, plus a heel strap
    sandals: [shoe((x, y, z) => {
      const t = ft(z), band = (c: number, w: number) => Math.abs(t - c) - w;
      return Math.min(band(0.8, 0.07), band(0.5, 0.05), Math.abs(y - (k.ankleY + 0.05)) - 0.07, t < 0.12 ? (y - k.soleY) - 0.55 : 1) * 3;
    }, { rough: 0.5, sole: { h: 0.06, heel: 0.25, post: 'block' } }, k.ankleY + 0.15, 0.04)],
    'ankle-boots': [shoe(() => -1, { rough: 0.5, sole: { h: 0.1, heel: 0.4, post: 'block' } }, k.ankleY + 0.6, 0.08)],
    boots: [shoe(() => -1, { rough: 0.35, coat: 0.3, sole: { h: 0.1, heel: 0.45, post: 'block' } }, k.kneeY - 0.35, 0.08)],
    loafers: [shoe(upper(t => (t < 0.2 ? 0.6 : t < 0.55 ? 0.6 - (t - 0.2) * 0.3 : 0.5 + (t - 0.55) * 0.1)), { rough: 0.35, coat: 0.4, sole: { h: 0.08, heel: 0.15, post: 'block' } }, k.ankleY)],
  };
  S['knee-boots'] = S.boots;
  // the small things (solid pieces, see wearables3d), and belts
  for (const w of ['beanie', 'cap', 'bucket-hat', 'headband', 'sunglasses', 'glasses', 'hoops', 'studs', 'drops', 'necklace', 'pearls', 'choker', 'handbag', 'crossbody', 'tote'] as const)
    S[w] = [{ cuts: [], wear: w, rough: 0.6 }];
  S.belt = [{ cuts: [], rough: 0.45, coat: 0.3, extras: [ex('belt', 0.12, { breakY: k.hipY + 0.15 })] }];
  S['waist-belt'] = [{ cuts: [], rough: 0.45, coat: 0.3, extras: [ex('belt', 0.1, { breakY: k.waistY })] }];
  return S;
}
