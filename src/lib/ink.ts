// Handwriting and drawing: the stroke model, smoothing, hit-testing and rendering.
// Strokes are stored as vectors (not pixels), so they stay sharp at any zoom,
// are small to save, and the eraser can remove exactly what it touches.
import { getStroke } from 'perfect-freehand';

export type InkTool = 'pen' | 'pencil' | 'marker' | 'highlighter';
export type InkBackground = 'blank' | 'lined' | 'grid' | 'dots';

/** One stroke. `pts` is flat: x, y, pressure, x, y, pressure… in page units. */
export interface InkStroke {
  t: InkTool;
  c: string;         // colour
  s: number;         // base size in page units
  pts: number[];
  sim?: boolean;     // pressure was simulated (finger or mouse), not from the Pencil
}

export interface InkDoc {
  v: 1;
  w: number;         // page width in units
  h: number;         // page height in units
  bg: InkBackground;
  paper?: string;    // paper colour; default follows the theme
  strokes: InkStroke[];
  /** Animations only: the frames. `strokes` above is then the background, shown under every frame. */
  anim?: InkAnim;
}

export interface InkFrame { id: string; strokes: InkStroke[]; hold?: number }
export interface InkAnim {
  fps: number;                    // frames per second (1-24)
  loop: 'loop' | 'bounce';        // play round and round, or forwards then backwards
  onion: boolean;                 // show the frames either side, faintly, while drawing
  frames: InkFrame[];
}
export const MAX_FRAMES = 120;
let frameSeq = 0;
export const newFrameId = () => `f${Date.now().toString(36)}${(frameSeq++).toString(36)}`;

export const PAGE_W = 1000;           // notes pages: 1000 units wide, grow downwards
export const PAGE_H = 1400;
export const SKETCH_SIZES = {
  landscape: { w: 1600, h: 1200, label: 'Landscape' },
  portrait:  { w: 1200, h: 1600, label: 'Portrait' },
  square:    { w: 1400, h: 1400, label: 'Square' },
} as const;
export type SketchSize = keyof typeof SKETCH_SIZES;

export const INK_COLORS = ['#f5e6d0', '#ff8c00', '#a855f7', '#f87171', '#4ade80', '#60a5fa', '#fbbf24', '#ec4899', '#0d0a0f'];
export const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#f9a8d4', '#93c5fd', '#fdba74'];

export const TOOLS: Record<InkTool, { label: string; sizes: number[]; alpha: number }> = {
  pen:         { label: 'Pen',         sizes: [3, 5, 9],    alpha: 1 },
  pencil:      { label: 'Pencil',      sizes: [2.5, 4, 7],  alpha: 0.82 },
  marker:      { label: 'Marker',      sizes: [10, 18, 30], alpha: 1 },
  highlighter: { label: 'Highlighter', sizes: [16, 24, 36], alpha: 0.38 },
};

export function emptyDoc(kind: 'note' | 'sketch', size: SketchSize = 'landscape'): InkDoc {
  if (kind === 'note') return { v: 1, w: PAGE_W, h: PAGE_H, bg: 'lined', strokes: [] };
  const { w, h } = SKETCH_SIZES[size];
  return { v: 1, w, h, bg: 'blank', strokes: [] };
}

/** Make sure a value from the database is a usable document. */
export function asDoc(raw: unknown, kind: 'note' | 'sketch' | 'animation' = 'note'): InkDoc {
  const d = raw as Partial<InkDoc> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.strokes)) return kind === 'animation' ? emptyAnimation() : emptyDoc(kind);
  const clean = (list: unknown) => (Array.isArray(list) ? list : []).filter((s: InkStroke) => s && Array.isArray(s.pts) && s.pts.length >= 3) as InkStroke[];
  const a = d.anim as Partial<InkAnim> | undefined;
  const anim: InkAnim | undefined = a && Array.isArray(a.frames) ? {
    fps: Math.min(24, Math.max(1, Number(a.fps) || 8)),
    loop: a.loop === 'bounce' ? 'bounce' : 'loop',
    onion: a.onion !== false,
    frames: a.frames.map(f => ({ id: String(f?.id ?? newFrameId()), strokes: clean(f?.strokes), hold: f?.hold && f.hold > 1 ? Math.min(12, Math.round(f.hold)) : undefined })),
  } : kind === 'animation' ? emptyAnimation().anim : undefined;
  if (anim && !anim.frames.length) anim.frames.push({ id: newFrameId(), strokes: [] });
  return {
    v: 1,
    w: Number(d.w) || PAGE_W,
    h: Number(d.h) || PAGE_H,
    bg: (['blank', 'lined', 'grid', 'dots'] as const).includes(d.bg as InkBackground) ? d.bg as InkBackground : 'blank',
    paper: typeof d.paper === 'string' ? d.paper : undefined,
    strokes: clean(d.strokes),
    ...(anim ? { anim } : {}),
  };
}

export function emptyAnimation(size: SketchSize = 'landscape'): InkDoc {
  const { w, h } = SKETCH_SIZES[size];
  return { v: 1, w, h, bg: 'blank', strokes: [], anim: { fps: 8, loop: 'loop', onion: true, frames: [{ id: newFrameId(), strokes: [] }] } };
}

/** Save size: round every stroke in the background and the frames. */
export function compactDoc(doc: InkDoc): InkDoc {
  return {
    ...doc,
    strokes: doc.strokes.map(compactStroke),
    ...(doc.anim ? { anim: { ...doc.anim, frames: doc.anim.frames.map(f => ({ ...f, strokes: f.strokes.map(compactStroke) })) } } : {}),
  };
}

/** The order frames play in (bounce plays back again without repeating the ends); holds repeat a frame. */
export function playOrder(anim: InkAnim): number[] {
  const base = anim.frames.flatMap((f, i) => Array(f.hold ?? 1).fill(i));
  if (anim.loop !== 'bounce' || anim.frames.length < 3) return base;
  const back = anim.frames.slice(1, -1).map((_, j) => anim.frames.length - 2 - j).flatMap(i => Array(anim.frames[i].hold ?? 1).fill(i));
  return [...base, ...back];
}

/** Paint one animation frame (paper, background layer, frame) on a context in page units. */
export function paintFrame(ctx: CanvasRenderingContext2D, doc: InkDoc, index: number) {
  const light = doc.paper === 'light';
  paintBackground(ctx, doc, light ? '#fbf6ec' : '#1b1521', light ? 'rgba(70,45,20,.15)' : 'rgba(245,230,208,.09)');
  paintStrokes(ctx, doc.strokes, null, light);
  const f = doc.anim?.frames[index];
  if (f) paintStrokes(ctx, f.strokes, null, light);
}

/** Round points before saving: about a third of the size, invisible difference. */
export function compactStroke(st: InkStroke): InkStroke {
  const pts: number[] = [];
  for (let i = 0; i < st.pts.length; i += 3) {
    pts.push(Math.round(st.pts[i] * 10) / 10, Math.round(st.pts[i + 1] * 10) / 10, Math.round(st.pts[i + 2] * 100) / 100);
  }
  return { ...st, pts };
}

function toTriples(st: InkStroke): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < st.pts.length; i += 3) out.push([st.pts[i], st.pts[i + 1], st.pts[i + 2]]);
  return out;
}

/** The outline polygon of a stroke (perfect-freehand), as [x, y] points. */
export function outline(st: InkStroke, last = true): number[][] {
  const pts = toTriples(st);
  const tool = st.t;
  return getStroke(pts, {
    size: st.s * (tool === 'highlighter' ? 1 : 1.6),
    thinning: tool === 'pen' ? 0.6 : tool === 'pencil' ? 0.45 : tool === 'marker' ? 0.15 : 0,
    smoothing: 0.55,
    streamline: tool === 'highlighter' ? 0.6 : 0.42,
    simulatePressure: !!st.sim,
    last,
    start: { cap: tool !== 'highlighter', taper: 0 },
    end: { cap: tool !== 'highlighter', taper: 0 },
  });
}

/** SVG path data for an outline polygon (quadratic curves through the midpoints). */
export function pathData(poly: number[][]): string {
  if (poly.length < 4) {
    if (!poly.length) return '';
    const [x, y] = poly[0];
    return `M ${x} ${y} l 0.01 0 Z`;
  }
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = `M ${f(poly[0][0])} ${f(poly[0][1])} Q`;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    d += ` ${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  }
  return d + ' Z';
}

const pathCache = new WeakMap<InkStroke, Path2D>();
function path2d(st: InkStroke): Path2D {
  let p = pathCache.get(st);
  if (!p) { p = new Path2D(pathData(outline(st))); pathCache.set(st, p); }
  return p;
}

/** Paint strokes on a 2D context already transformed into page units. */
export interface PaintOpts { alpha?: number; tint?: string }
export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: InkStroke[], live?: InkStroke | null, lightPaper = false, opts: PaintOpts = {}) {
  // Highlighter goes underneath, so it never dulls the writing.
  const order = [...strokes.filter(s => s.t === 'highlighter'), ...strokes.filter(s => s.t !== 'highlighter')];
  for (const st of order) paintOne(ctx, st, path2d(st), lightPaper, opts);
  if (live && live.pts.length >= 3) paintOne(ctx, live, new Path2D(pathData(outline(live, false))), lightPaper, opts);
}

function paintOne(ctx: CanvasRenderingContext2D, st: InkStroke, p: Path2D, lightPaper: boolean, opts: PaintOpts) {
  const hl = st.t === 'highlighter';
  // Highlighter glows on dark paper (screen) and tints on light paper (multiply), like a real one.
  if (hl && !opts.tint) ctx.globalCompositeOperation = lightPaper ? 'multiply' : 'screen';
  ctx.globalAlpha = (hl ? (lightPaper ? 0.55 : 0.8) : TOOLS[st.t]?.alpha ?? 1) * (opts.alpha ?? 1);
  ctx.fillStyle = opts.tint ?? st.c;
  ctx.fill(p);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Page background (lines, grid or dots) in page units. */
export function paintBackground(ctx: CanvasRenderingContext2D, doc: InkDoc, paper: string, rule: string) {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, doc.w, doc.h);
  ctx.strokeStyle = rule; ctx.fillStyle = rule; ctx.lineWidth = 1.2;
  const gap = 40;
  if (doc.bg === 'lined') {
    ctx.beginPath();
    for (let y = 90; y < doc.h; y += gap) { ctx.moveTo(0, y); ctx.lineTo(doc.w, y); }
    ctx.stroke();
  } else if (doc.bg === 'grid') {
    ctx.beginPath();
    for (let y = gap; y < doc.h; y += gap) { ctx.moveTo(0, y); ctx.lineTo(doc.w, y); }
    for (let x = gap; x < doc.w; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, doc.h); }
    ctx.stroke();
  } else if (doc.bg === 'dots') {
    for (let y = gap; y < doc.h; y += gap) for (let x = gap; x < doc.w; x += gap) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
  }
}

/** A standalone SVG of the drawing (for previews and export). */
export function toSvg(doc: InkDoc, opts: { paper?: string; rule?: string; crop?: boolean } = {}): string {
  const light = doc.paper === 'light';
  const paper = opts.paper ?? (light ? '#fbf6ec' : '#1b1521');
  let [x0, y0, x1, y1] = [0, 0, doc.w, doc.h];
  if (opts.crop) {
    const b = bounds(doc.strokes);
    if (b) { const pad = 30; [x0, y0, x1, y1] = [Math.max(0, b[0] - pad), Math.max(0, b[1] - pad), Math.min(doc.w, b[2] + pad), Math.min(doc.h, b[3] + pad)]; }
  }
  const order = [...doc.strokes.filter(s => s.t === 'highlighter'), ...doc.strokes.filter(s => s.t !== 'highlighter')];
  const paths = order.map(st => `<path d="${pathData(outline(st))}" fill="${st.c}"${st.t === 'highlighter' ? ` fill-opacity="0.6" style="mix-blend-mode:${light ? 'multiply' : 'screen'}"` : TOOLS[st.t]?.alpha < 1 ? ` fill-opacity="${TOOLS[st.t].alpha}"` : ''}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" width="${x1 - x0}" height="${y1 - y0}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${paper}"/>${paths}</svg>`;
}

export function bounds(strokes: InkStroke[]): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of strokes) {
    const r = st.s * 1.2;
    for (let i = 0; i < st.pts.length; i += 3) {
      const x = st.pts[i], y = st.pts[i + 1];
      if (x - r < x0) x0 = x - r; if (y - r < y0) y0 = y - r;
      if (x + r > x1) x1 = x + r; if (y + r > y1) y1 = y + r;
    }
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/** Lowest point that has ink, so a note page can grow as she writes. */
export function inkBottom(strokes: InkStroke[]): number {
  const b = bounds(strokes); return b ? b[3] : 0;
}

/**
 * Precise eraser: remove the parts of strokes within `r` of the eraser path.
 * Strokes are split where the eraser crosses them. Returns null if nothing changed.
 */
export function eraseAt(strokes: InkStroke[], path: number[], r: number): InkStroke[] | null {
  let changed = false;
  const out: InkStroke[] = [];
  const near = (x: number, y: number, reach: number) => {
    for (let i = 0; i < path.length; i += 2) {
      const dx = x - path[i], dy = y - path[i + 1];
      if (dx * dx + dy * dy <= reach * reach) return true;
    }
    return false;
  };
  for (const st of strokes) {
    const reach = r + st.s * 0.6;
    let cur: number[] = [];
    let hit = false;
    const pieces: number[][] = [];
    for (let i = 0; i < st.pts.length; i += 3) {
      if (near(st.pts[i], st.pts[i + 1], reach)) { hit = true; if (cur.length) { pieces.push(cur); cur = []; } }
      else cur.push(st.pts[i], st.pts[i + 1], st.pts[i + 2]);
    }
    if (cur.length) pieces.push(cur);
    if (!hit) { out.push(st); continue; }
    changed = true;
    for (const p of pieces) if (p.length >= 6) out.push({ ...st, pts: p });
  }
  return changed ? out : null;
}

/** Whole-stroke eraser: remove any stroke the eraser touches. */
export function eraseWhole(strokes: InkStroke[], path: number[], r: number): InkStroke[] | null {
  const keep = strokes.filter(st => {
    const reach = r + st.s * 0.6;
    for (let i = 0; i < st.pts.length; i += 3) for (let j = 0; j < path.length; j += 2) {
      const dx = st.pts[i] - path[j], dy = st.pts[i + 1] - path[j + 1];
      if (dx * dx + dy * dy <= reach * reach) return false;
    }
    return true;
  });
  return keep.length === strokes.length ? null : keep;
}

/**
 * Render to a small image (data URL) for lists and cards. Handwritten pages are
 * cropped to the writing (so a few lines don't come out tiny); sketches show the whole canvas.
 */
export function thumbnail(doc: InkDoc, kind: 'note' | 'sketch' = 'sketch', maxW = 480, paper = '#1b1521', rule = 'rgba(245,230,208,.09)'): string {
  if (typeof document === 'undefined') return '';
  let [x0, y0, x1, y1] = [0, 0, doc.w, doc.h];
  const b = bounds(doc.strokes);
  if (kind === 'note') {
    if (b) {
      const pad = 40;
      x0 = Math.max(0, b[0] - pad); y0 = Math.max(0, b[1] - pad); x1 = Math.min(doc.w, b[2] + pad); y1 = Math.min(doc.h, b[3] + pad);
      // at least a third of the page wide, and no taller than wide, so it reads like a page
      const minW = doc.w / 3;
      if (x1 - x0 < minW) { const grow = (minW - (x1 - x0)) / 2; x0 = Math.max(0, x0 - grow); x1 = Math.min(doc.w, x0 + minW); }
      const want = (x1 - x0) * 0.75;
      if (y1 - y0 < want) y1 = Math.min(doc.h, y0 + want);
      if (y1 - y0 > (x1 - x0) * 1.4) y1 = y0 + (x1 - x0) * 1.4;
    } else { y1 = doc.w * 0.75; }
  }
  const w = x1 - x0, h = y1 - y0;
  const k = Math.min(maxW / w, 2);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.scale(k, k); ctx.translate(-x0, -y0);
  const light = doc.paper === 'light';
  paintBackground(ctx, doc, light ? '#fbf6ec' : paper, light ? 'rgba(70,45,20,.15)' : rule);
  paintStrokes(ctx, doc.strokes, null, light);
  if (doc.anim?.frames[0]) paintStrokes(ctx, doc.anim.frames[0].strokes, null, light);   // animations: the first frame
  return c.toDataURL('image/webp', 0.82);
}

/** Full-size PNG for saving to Photos / sharing. */
export async function exportPng(doc: InkDoc, scale = 2, paper = '#16101c', rule = 'rgba(245,230,208,.08)'): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = doc.w * scale; c.height = doc.h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  const light = doc.paper === 'light';
  paintBackground(ctx, doc, light ? '#fbf6ec' : paper, light ? 'rgba(70,45,20,.15)' : rule);
  paintStrokes(ctx, doc.strokes, null, light);
  if (doc.anim?.frames[0]) paintStrokes(ctx, doc.anim.frames[0].strokes, null, light);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
