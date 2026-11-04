// Cutting a piece of clothing out of a photo, entirely in the browser.
// The mask is one byte per pixel: 255 = keep, 0 = removed.

export interface CutImage { w: number; h: number; rgba: Uint8ClampedArray; mask: Uint8Array }

const MAX_SIDE = 1100;

export async function loadForCutout(file: Blob): Promise<CutImage> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const rgba = ctx.getImageData(0, 0, w, h).data;
  return { w, h, rgba, mask: new Uint8Array(w * h).fill(255) };
}

const dist = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
  // weighted so it follows how different colours look, not raw numbers
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
};

/**
 * Flood from the given seed pixels, removing every connected pixel close in colour to the seed it
 * spread from (so a soft shadow or gradient background still comes away). tol is 0..100.
 */
function flood(img: CutImage, seeds: number[], tol: number, value: 0 | 255) {
  const { w, h, rgba, mask } = img;
  const limit = 6 + tol * 1.4;
  const seen = new Uint8Array(w * h);
  const origin = new Int32Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (const s of seeds) { if (!seen[s]) { seen[s] = 1; origin[s] = s; q[tail++] = s; } }
  while (head < tail) {
    const p = q[head++], o = origin[p] * 4;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    if (dist(rgba, p * 4, r, g, b) > limit) continue;
    mask[p] = value;
    // the local colour drifts slowly: re-anchor on this pixel every so often
    const next = dist(rgba, p * 4, r, g, b) < limit * 0.35 ? p : origin[p];
    const x = p % w, y = (p / w) | 0;
    if (x > 0 && !seen[p - 1]) { seen[p - 1] = 1; origin[p - 1] = next; q[tail++] = p - 1; }
    if (x < w - 1 && !seen[p + 1]) { seen[p + 1] = 1; origin[p + 1] = next; q[tail++] = p + 1; }
    if (y > 0 && !seen[p - w]) { seen[p - w] = 1; origin[p - w] = next; q[tail++] = p - w; }
    if (y < h - 1 && !seen[p + w]) { seen[p + w] = 1; origin[p + w] = next; q[tail++] = p + w; }
  }
}

/** Remove the background by flooding in from every edge of the photo. */
export function autoRemove(img: CutImage, tol: number) {
  img.mask.fill(255);
  const { w, h } = img, seeds: number[] = [];
  for (let x = 0; x < w; x += 2) seeds.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += 2) seeds.push(y * w, y * w + w - 1);
  flood(img, seeds, tol, 0);
  despeckle(img);
}
/** Magic wand: remove the area she tapped (and everything like it, touching it). */
export function wandAt(img: CutImage, x: number, y: number, tol: number, value: 0 | 255 = 0) {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || py < 0 || px >= img.w || py >= img.h) return;
  flood(img, [py * img.w + px], tol, value);
}
/** Erase (value 0) or bring back (255) a round brush stroke from a to b. */
export function brush(img: CutImage, ax: number, ay: number, bx: number, by: number, r: number, value: 0 | 255) {
  const { w, h, mask } = img, steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (r * 0.4)));
  for (let s = 0; s <= steps; s++) {
    const cx = ax + (bx - ax) * s / steps, cy = ay + (by - ay) * s / steps;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[y * w + x] = value;
  }
}
/** Drop tiny islands of kept pixels left behind in the background. */
function despeckle(img: CutImage) {
  const { w, h, mask } = img, label = new Int32Array(w * h).fill(-1), q = new Int32Array(w * h);
  const minKeep = Math.max(40, (w * h) / 2500);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    let head = 0, tail = 0; q[tail++] = i; label[i] = i;
    while (head < tail) {
      const p = q[head++], x = p % w;
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (n < 0 || n >= w * h || !mask[n] || label[n] >= 0) continue;
        label[n] = i; q[tail++] = n;
      }
    }
    if (tail < minKeep) for (let k = 0; k < tail; k++) mask[q[k]] = 0;
  }
}

/** Paint the photo with the mask into a canvas (removed areas transparent, edges softened). */
export function render(img: CutImage, ctx: CanvasRenderingContext2D) {
  const { w, h, rgba, mask } = img, out = new ImageData(w, h), d = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let a = mask[i];
    if (a && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w])) a = Math.min(a, 150);
    d[i * 4] = rgba[i * 4]; d[i * 4 + 1] = rgba[i * 4 + 1]; d[i * 4 + 2] = rgba[i * 4 + 2]; d[i * 4 + 3] = a;
  }
  ctx.putImageData(out, 0, 0);
}

/** The finished cut-out, cropped to the piece, plus its main colour. Null if nothing is left. */
export async function exportCutout(img: CutImage): Promise<{ blob: Blob; color: string; w: number; h: number } | null> {
  const { w, h, rgba, mask } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if ((x + y) % 3 === 0) { n++; r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2]; }
  }
  if (x1 < x0 || y1 < y0) return null;
  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  render(img, full.getContext('2d')!);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  c.getContext('2d')!.drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/webp', 0.9));
  const finalBlob = blob && blob.type === 'image/webp' ? blob : await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'));
  if (!finalBlob) return null;
  const hx = (v: number) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0');
  return { blob: finalBlob, color: `#${hx(r)}${hx(g)}${hx(b)}`, w: cw, h: ch };
}
