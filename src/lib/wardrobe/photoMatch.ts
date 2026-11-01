// "Start from a photo": read her colouring and face shape from a photo, entirely in the browser.
// The photo is never uploaded or saved; the face-mapping model is served from this site (/models/face).
import { clamp } from './shapes';
import type { FaceShape, Look } from './body';

type P = { x: number; y: number };
export interface PhotoMatch {
  patch: Partial<Look>;
  /** Values that might be wrong (e.g. the hair sample may have caught the background). */
  unsure: string[];
  /** What was found, for showing her (in photo pixels). */
  points: P[];
  box: { x: number; y: number; width: number; height: number };
  metrics: Record<string, number>;
}

let loading: Promise<typeof import('@vladmandic/face-api')> | null = null;
function faceApi() {
  loading ??= (async () => {
    const api = await import('@vladmandic/face-api');
    await (api.tf as unknown as { ready: () => Promise<void> }).ready();
    await Promise.all([api.nets.tinyFaceDetector.loadFromUri('/models/face'), api.nets.faceLandmark68Net.loadFromUri('/models/face')]);
    return api;
  })().catch(e => { loading = null; throw e; });
  return loading;
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (ps: P[]): P => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const lumOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Median colour of the pixels given, ignoring the darkest and brightest quarter (shadows, shine). */
function medianColour(px: [number, number, number][], trim = 0.25): string | null {
  if (px.length < 6) return null;
  const sorted = [...px].sort((a, b) => lumOf(...a) - lumOf(...b));
  const mid = sorted.slice(Math.floor(sorted.length * trim), Math.ceil(sorted.length * (1 - trim)));
  const m = (i: number) => { const v = mid.map(p => p[i]).sort((a, b) => a - b); return v[v.length >> 1]; };
  return toHex(m(0), m(1), m(2));
}

/** Dark, neutral or warm-toned samples look like hair; a bright cool colour is more likely the background. */
function hairLooksNatural(c: string): boolean {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  return l < 0.3 || sat < 0.15 || (r >= g && g >= b);
}

/** Map a measurement onto 0..1 around a typical value. */
const scale = (v: number, lo: number, hi: number) => Math.round(clamp((v - lo) / (hi - lo)) * 100) / 100;

export async function matchPhoto(file: Blob): Promise<PhotoMatch | null> {
  const api = await faceApi();
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();

  const found = await api.detectSingleFace(c, new api.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 })).withFaceLandmarks();
  if (!found) return null;
  const pts: P[] = found.landmarks.positions.map(p => ({ x: p.x, y: p.y }));
  const L = (i: number) => pts[i];
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const sample = (centre: P, r: number, keep: (px: [number, number, number]) => boolean = () => true) => {
    const out: [number, number, number][] = [];
    for (let y = Math.round(centre.y - r); y <= centre.y + r; y++) for (let x = Math.round(centre.x - r); x <= centre.x + r; x++) {
      if (x < 0 || y < 0 || x >= c.width || y >= c.height || (x - centre.x) ** 2 + (y - centre.y) ** 2 > r * r) continue;
      const i = (y * c.width + x) * 4, px: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
      if (keep(px)) out.push(px);
    }
    return out;
  };

  // ─── Proportions of the face (all relative to its width, so photo size doesn't matter)
  const cheekW = dist(L(1), L(15)), jawW = dist(L(4), L(12)), chinW = dist(L(6), L(10));
  const browY = mean([...Array(10)].map((_, i) => L(17 + i))).y;
  const faceH = L(8).y - browY;
  const eyeW = (dist(L(36), L(39)) + dist(L(42), L(45))) / 2;
  const eyeOpen = ((dist(L(37), L(41)) + dist(L(38), L(40))) / 2 + (dist(L(43), L(47)) + dist(L(44), L(46))) / 2) / 2;
  const tiltL = (L(39).y - L(36).y) / eyeW, tiltR = (L(42).y - L(45).y) / eyeW;     // positive: outer corner higher
  const m = {
    height: faceH / cheekW, jaw: jawW / cheekW, chin: chinW / cheekW,
    gap: dist(L(39), L(42)) / cheekW, eyeW: eyeW / cheekW, eyeOpen: eyeOpen / eyeW, tilt: (tiltL + tiltR) / 2,
    nose: dist(L(31), L(35)) / cheekW, lips: (L(57).y - L(51).y) / dist(L(48), L(54)),
    arch: ((L(17).y + L(21).y) / 2 - L(19).y + (L(22).y + L(26).y) / 2 - L(24).y) / 2 / eyeW,
  };
  // thresholds calibrated on sample portraits (typical: height 0.89, jaw 0.79, chin 0.48)
  const shape: FaceShape = m.height > 0.97 ? 'long' : m.jaw > 0.83 && m.chin > 0.5 ? 'square' : m.jaw < 0.765 ? 'heart' : m.height < 0.8 ? 'round' : 'oval';

  // ─── Colours
  const cheekL = mean([L(2), L(31), L(41)]), cheekR = mean([L(14), L(35), L(46)]), r = cheekW * 0.05;
  const skinPx = [...sample(cheekL, r), ...sample(cheekR, r), ...sample(L(29), r * 0.7)];
  const skin = medianColour(skinPx);
  const lipPx = [...sample(mean([L(51), L(62)]), r * 0.4), ...sample(mean([L(57), L(66)]), r * 0.5)];
  const lips = medianColour(lipPx, 0.2);
  const irisPx = [mean([36, 37, 38, 39, 40, 41].map(L)), mean([42, 43, 44, 45, 46, 47].map(L))]
    .flatMap(ctr => sample(ctr, eyeOpen * 0.3, px => lumOf(...px) < 130));
  const eyes = medianColour(irisPx, 0.3);
  // hair: above the brows, where pixels clearly aren't skin
  const sk = skin ? [1, 3, 5].map(i => parseInt(skin.slice(i, i + 2), 16)) : null;
  const notSkin = (px: [number, number, number]) => !sk || Math.hypot(px[0] - sk[0], px[1] - sk[1], px[2] - sk[2]) > 55;
  const hairPx: [number, number, number][] = [];
  for (let t = 0.55; t <= 0.85; t += 0.1) for (let s = -0.35; s <= 0.35; s += 0.1)
    hairPx.push(...sample({ x: L(27).x + s * cheekW, y: browY - t * faceH }, r * 0.6, notSkin));
  const hairColor = hairPx.length > 40 ? medianColour(hairPx, 0.2) : null;

  const patch: Partial<Look> = {
    faceShape: shape,
    jaw: scale(m.jaw, 0.72, 0.86), eyeGap: scale(m.gap, 0.22, 0.29), eyeSize: scale(m.eyeW * 0.6 + m.eyeOpen * 0.35, 0.18, 0.25),
    eyeTilt: scale(m.tilt, -0.02, 0.2), noseWidth: scale(m.nose, 0.14, 0.21), lipFull: scale(m.lips, 0.18, 0.45), browArch: scale(m.arch, 0.12, 0.34),
  };
  if (skin) patch.skin = skin;
  if (lips) patch.lips = lips;
  if (eyes) patch.eyes = eyes;
  if (hairColor) patch.hairColor = hairColor;
  if (process.env.NODE_ENV !== 'production') console.debug('[photo-match]', JSON.stringify({ shape, m, patch }));
  const b = found.detection.box;
  return { patch, unsure: hairColor && !hairLooksNatural(hairColor) ? ['hairColor'] : [], points: pts.map(p => ({ x: p.x / k, y: p.y / k })), box: { x: b.x / k, y: b.y / k, width: b.width / k, height: b.height / k }, metrics: m };
}
