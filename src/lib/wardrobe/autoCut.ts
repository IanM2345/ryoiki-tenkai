// Smart cut-out: a small neural network (U²-Net, Apache-2.0) finds the piece of clothing in the photo and
// separates it from whatever it's lying on. It runs in the browser (onnxruntime-web, MIT); the photo never
// leaves the device. Two sizes: a quick one (4.6 MB) and a stronger one (44 MB) that handles hard photos
// (trousers on a patterned floor, white on white) better. Each downloads once and is then cached by the browser.
import type { CutImage } from './cutout';

export type CutModel = 'quick' | 'strong';
// the strong model is stored in two parts (each file stays small); they're joined after download
const FILES: Record<CutModel, string[]> = { quick: ['/models/cutout/u2netp.onnx'], strong: ['/models/cutout/silueta.onnx.part0', '/models/cutout/silueta.onnx.part1'] };
const SIZE = 320;   // the network's input size

type Ort = typeof import('onnxruntime-web/wasm');
let ortP: Promise<Ort> | null = null;
const sessions: Partial<Record<CutModel, Promise<import('onnxruntime-web/wasm').InferenceSession>>> = {};

function runtime(): Promise<Ort> {
  ortP ??= import('onnxruntime-web/wasm').then(ort => {
    ort.env.wasm.wasmPaths = '/models/ort/';
    ort.env.wasm.numThreads = 1;      // threads need cross-origin isolation, which the site doesn't have
    return ort;
  }).catch(e => { ortP = null; throw e; });
  return ortP;
}
function session(model: CutModel) {
  sessions[model] ??= Promise.all([runtime(), ...FILES[model].map(f => fetch(f).then(r => { if (!r.ok) throw new Error('model'); return r.arrayBuffer(); }))])
    .then(([ort, ...parts]) => {
      const bytes = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
      let o = 0; for (const p of parts) { bytes.set(new Uint8Array(p), o); o += p.byteLength; }
      return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })
    .catch(e => { delete sessions[model]; throw e; });
  return sessions[model]!;
}

/** Has this model been fetched already in this visit (so a cut is quick)? */
export const modelReady = (model: CutModel) => !!sessions[model];

/**
 * Cut the piece out with the network: sets img.mask (0 background .. 255 piece) with soft edges.
 * Returns false if the network couldn't run (old browser, offline), leaving the mask untouched.
 */
export async function smartCut(img: CutImage, model: CutModel = 'quick'): Promise<boolean> {
  let ses;
  try { ses = await session(model); } catch { return false; }
  const ort = await runtime();
  // the photo, squashed to 320 x 320, normalised the way the network was trained (ImageNet mean and spread)
  const src = document.createElement('canvas'); src.width = img.w; src.height = img.h;
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.w, img.h), 0, 0);
  const sm = document.createElement('canvas'); sm.width = sm.height = SIZE;
  const sg = sm.getContext('2d', { willReadFrequently: true })!;
  sg.imageSmoothingQuality = 'high'; sg.drawImage(src, 0, 0, SIZE, SIZE);
  const px = sg.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE, input = new Float32Array(3 * n);
  const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = (px[i * 4 + c] / 255 - mean[c]) / sd[c];
  let out: Float32Array;
  try {
    const res = await ses.run({ [ses.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
    out = res[ses.outputNames[0]].data as Float32Array;
  } catch { return false; }
  // stretch to 0..1, then back up to the photo's size (smoothly) and harden the edge a little
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]); }
  const mc = document.createElement('canvas'); mc.width = mc.height = SIZE;
  const mg = mc.getContext('2d')!, md = mg.createImageData(SIZE, SIZE);
  for (let i = 0; i < n; i++) { const v = (out[i] - lo) / (hi - lo || 1) * 255; md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = v; md.data[i * 4 + 3] = 255; }
  mg.putImageData(md, 0, 0);
  const big = document.createElement('canvas'); big.width = img.w; big.height = img.h;
  const bg = big.getContext('2d', { willReadFrequently: true })!;
  bg.imageSmoothingQuality = 'high'; bg.drawImage(mc, 0, 0, img.w, img.h);
  const m = bg.getImageData(0, 0, img.w, img.h).data;
  let kept = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    const t = Math.max(0, Math.min(1, (m[i * 4] / 255 - 0.3) / 0.4));
    img.mask[i] = Math.round(t * t * (3 - 2 * t) * 255);
    if (img.mask[i] > 128) kept++;
  }
  if (kept < img.w * img.h * 0.01) { img.mask.fill(255); return false; }   // it found nothing: leave the photo whole
  return true;
}
