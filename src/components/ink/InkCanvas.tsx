'use client';
// The drawing surface. Apple Pencil draws (with pressure); fingers scroll, pan and
// pinch-zoom, so her hand can rest on the screen. Without a Pencil (phone, laptop,
// or "draw with finger" on), a finger or mouse draws with simulated pressure.
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import {
  type InkDoc, type InkStroke, type InkTool, PAGE_W, paintBackground, paintStrokes, eraseAt, eraseWhole, inkBottom,
} from '@/lib/ink';
import s from './ink.module.css';

export type InkMode = InkTool | 'eraser';
export interface InkSettings { mode: InkMode; color: string; size: number; eraser: 'precise' | 'stroke'; finger: boolean; }
export interface InkCanvasHandle { undo(): void; redo(): void; fit(): void; zoomBy(f: number): void; }

interface View { k: number; x: number; y: number }
type Gesture =
  | { kind: 'draw'; id: number; stroke: InkStroke }
  | { kind: 'erase'; id: number; path: number[]; before: InkStroke[]; cur: InkStroke[] }
  | { kind: 'pan'; id: number; sx: number; sy: number; v0: View }
  | { kind: 'pinch'; a: number; b: number; d0: number; mx: number; my: number; v0: View }
  | null;

const PEN_KEY = 'yw-ink-pen-seen';

export function paperColors(doc: InkDoc) {
  const light = doc.paper === 'light';
  return { paper: light ? '#fbf6ec' : '#1b1521', rule: light ? 'rgba(70,45,20,.15)' : 'rgba(245,230,208,.09)', light };
}

export interface InkLayer { strokes: InkStroke[]; alpha?: number; tint?: string }

export const InkCanvas = forwardRef<InkCanvasHandle, {
  doc: InkDoc;
  kind: 'note' | 'sketch';
  settings: InkSettings;
  onChange: (doc: InkDoc) => void;
  onHistory?: (canUndo: boolean, canRedo: boolean) => void;
  onPenSeen?: () => void;
  readOnly?: boolean;
  /** Extra strokes painted under / over the editable ones (animation background, onion skin). */
  under?: InkLayer[];
  over?: InkLayer[];
  /** Change this when switching to a different frame or layer: starts a fresh undo history. */
  layerKey?: string;
}>(function InkCanvas({ doc, kind, settings, onChange, onHistory, onPenSeen, readOnly, under, over, layerKey }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef<View>({ k: 1, x: 0, y: 0 });
  const fitted = useRef(false);
  const gesture = useRef<Gesture>(null);
  const pointers = useRef(new Map<number, { type: string; x: number; y: number }>());
  const penDown = useRef(false);
  const penSeen = useRef(false);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<InkStroke[][]>([]);
  const redoStack = useRef<InkStroke[][]>([]);
  const docRef = useRef(doc);
  const settingsRef = useRef(settings);
  const frame = useRef(0);

  const layersRef = useRef<{ under?: InkLayer[]; over?: InkLayer[] }>({});
  useEffect(() => { docRef.current = doc; layersRef.current = { under, over }; scheduleBase(); });
  // New frame or layer: its own undo history.
  useEffect(() => {
    undoStack.current = []; redoStack.current = [];
    onHistory?.(false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerKey]);
  useEffect(() => { settingsRef.current = settings; });
  useEffect(() => { try { penSeen.current = localStorage.getItem(PEN_KEY) === '1'; } catch { /* private mode */ } }, []);

  // ── view ────────────────────────────────────────────────────
  const clampView = useCallback((v: View): View => {
    const d = docRef.current, { w, h } = sizeRef.current;
    const pw = d.w * v.k, ph = d.h * v.k;
    const margin = kind === 'sketch' ? 80 : 0;
    let x = v.x, y = v.y;
    x = pw + 2 * margin <= w ? (w - pw) / 2 : Math.min(margin, Math.max(w - pw - margin, x));
    const bottomRoom = kind === 'note' ? h * 0.5 : margin;
    y = ph + margin + bottomRoom <= h && kind === 'sketch' ? (h - ph) / 2 : Math.min(kind === 'note' ? 16 : margin, Math.max(h - ph - bottomRoom, y));
    return { k: v.k, x, y };
  }, [kind]);
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; });

  const fitView = useCallback(() => {
    const d = docRef.current, { w, h } = sizeRef.current;
    if (!w || !h) return;
    if (kind === 'note') {
      const k = Math.min(w - 24, 860) / d.w;
      view.current = clampView({ k, x: (w - d.w * k) / 2, y: 16 });
    } else {
      const k = Math.min((w - 32) / d.w, (h - 32) / d.h);
      view.current = { k, x: (w - d.w * k) / 2, y: (h - d.h * k) / 2 };
    }
    scheduleBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, clampView]);

  // Watch the container size.
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const c of [base.current, live.current]) {
      if (!c) continue;
      c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
      c.style.width = size.w + 'px'; c.style.height = size.h + 'px';
    }
    if (!fitted.current) { fitted.current = true; fitView(); } else { view.current = clampView(view.current); scheduleBase(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ── painting ────────────────────────────────────────────────
  const drawBase = useCallback(() => {
    const c = base.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const dpr = c.width / Math.max(1, sizeRef.current.w);
    const d = docRef.current, v = view.current;
    const { paper, rule, light } = paperColors(d);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 30 / v.k;
    ctx.fillStyle = paper; ctx.fillRect(0, 0, d.w, d.h);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, d.w, d.h); ctx.clip();
    paintBackground(ctx, d, paper, rule);
    const g = gesture.current;
    for (const l of layersRef.current.under ?? []) paintStrokes(ctx, l.strokes, null, light, { alpha: l.alpha, tint: l.tint });
    paintStrokes(ctx, g?.kind === 'erase' ? g.cur : d.strokes, null, light);
    for (const l of layersRef.current.over ?? []) paintStrokes(ctx, l.strokes, null, light, { alpha: l.alpha, tint: l.tint });
    ctx.restore();
  }, []);

  const drawLive = useCallback(() => {
    const c = live.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const dpr = c.width / Math.max(1, sizeRef.current.w);
    const v = view.current, st = settingsRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
    const g = gesture.current;
    if (g?.kind === 'draw') {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, docRef.current.w, docRef.current.h); ctx.clip();
      paintStrokes(ctx, [], g.stroke, docRef.current.paper === 'light'); ctx.restore();
    }
    const h = hover.current;
    if (h || g?.kind === 'erase') {
      const p = g?.kind === 'erase' ? { x: g.path[g.path.length - 2], y: g.path[g.path.length - 1] } : h!;
      const eraser = st.mode === 'eraser';
      const r = eraser ? eraserRadius() : Math.max(1.5, st.size * 0.8);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 1.5 / v.k;
      ctx.strokeStyle = eraser ? 'rgba(255,255,255,.75)' : st.color;
      ctx.fillStyle = eraser ? 'rgba(255,255,255,.12)' : 'transparent';
      ctx.fill(); ctx.stroke();
    }
  }, []);

  const eraserRadius = () => 14 / view.current.k;

  const scheduleBase = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { drawBase(); drawLive(); });
  }, [drawBase, drawLive]);
  const liveFrame = useRef(0);
  const scheduleLive = useCallback(() => {
    cancelAnimationFrame(liveFrame.current);
    liveFrame.current = requestAnimationFrame(drawLive);
  }, [drawLive]);

  // ── history ─────────────────────────────────────────────────
  const commit = useCallback((strokes: InkStroke[]) => {
    const d = docRef.current;
    undoStack.current.push(d.strokes);
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
    let h = d.h;
    if (kind === 'note') { const bottom = inkBottom(strokes); if (bottom > h - 320) h = Math.ceil((bottom + 900) / 100) * 100; }
    const next = { ...d, strokes, h };
    docRef.current = next;
    onChange(next);
    onHistory?.(true, false);
  }, [kind, onChange, onHistory]);

  useImperativeHandle(ref, () => ({
    undo() {
      const prev = undoStack.current.pop(); if (!prev) return;
      redoStack.current.push(docRef.current.strokes);
      const next = { ...docRef.current, strokes: prev };
      docRef.current = next; onChange(next); scheduleBase();
      onHistory?.(undoStack.current.length > 0, true);
    },
    redo() {
      const nx = redoStack.current.pop(); if (!nx) return;
      undoStack.current.push(docRef.current.strokes);
      const next = { ...docRef.current, strokes: nx };
      docRef.current = next; onChange(next); scheduleBase();
      onHistory?.(true, redoStack.current.length > 0);
    },
    fit() { fitView(); },
    zoomBy(f: number) {
      const { w, h } = sizeRef.current, v = view.current;
      const k = Math.min(8, Math.max(minK(), v.k * f));
      const cx = w / 2, cy = h / 2;
      view.current = clampView({ k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) });
      scheduleBase();
    },
  }), [onChange, onHistory, scheduleBase, fitView, clampView]); // eslint-disable-line react-hooks/exhaustive-deps

  const minK = () => {
    const d = docRef.current, { w, h } = sizeRef.current;
    return kind === 'note' ? Math.min(w - 24, 860) / d.w * 0.6 : Math.min((w - 32) / d.w, (h - 32) / d.h) * 0.5;
  };

  // ── input ───────────────────────────────────────────────────
  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect(), v = view.current;
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startInk = (e: React.PointerEvent, sim: boolean) => {
    const st = settingsRef.current, p = toPage(e);
    if (st.mode === 'eraser') {
      const before = docRef.current.strokes;
      gesture.current = { kind: 'erase', id: e.pointerId, path: [p.x, p.y], before, cur: before };
      applyErase();
    } else {
      gesture.current = { kind: 'draw', id: e.pointerId, stroke: { t: st.mode, c: st.color, s: st.size, pts: [p.x, p.y, pressureOf(e, sim)], sim: sim || undefined } };
    }
    scheduleLive();
  };
  const pressureOf = (e: { pressure: number; pointerType: string }, sim: boolean) =>
    sim ? 0.5 : e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;

  const applyErase = () => {
    const g = gesture.current; if (g?.kind !== 'erase') return;
    const st = settingsRef.current;
    const tail = g.path.slice(-4);
    const res = (st.eraser === 'stroke' ? eraseWhole : eraseAt)(g.cur, tail, eraserRadius());
    if (res) { g.cur = res; drawBase(); }
  };

  const startPan = (id: number, e: { clientX: number; clientY: number }) => {
    const p = local(e);
    gesture.current = { kind: 'pan', id, sx: p.x, sy: p.y, v0: { ...view.current } };
  };
  const startPinch = () => {
    const ids = [...pointers.current.entries()].filter(([, v]) => v.type === 'touch').map(([id]) => id);
    if (ids.length < 2) return;
    const [a, b] = ids, pa = pointers.current.get(a)!, pb = pointers.current.get(b)!;
    gesture.current = { kind: 'pinch', a, b, d0: Math.hypot(pa.x - pb.x, pa.y - pb.y) || 1, mx: (pa.x + pb.x) / 2, my: (pa.y + pb.y) / 2, v0: { ...view.current } };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly && e.pointerType !== 'touch' && e.button === 0) return;
    e.preventDefault();
    const lp = local(e);
    pointers.current.set(e.pointerId, { type: e.pointerType, ...lp });
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const g = gesture.current;

    if (e.pointerType === 'pen') {
      penDown.current = true; hover.current = null;
      if (!penSeen.current) { penSeen.current = true; try { localStorage.setItem(PEN_KEY, '1'); } catch { /* ignore */ } onPenSeen?.(); }
      // A palm or finger that started a stroke a moment ago is dropped.
      if (g && g.kind === 'draw' && pointers.current.get(g.id)?.type === 'touch') gesture.current = null;
      if (readOnly) return;
      startInk(e, false);
      return;
    }
    if (e.pointerType === 'touch') {
      if (penDown.current) return;                              // palm while writing
      const touches = [...pointers.current.values()].filter(v => v.type === 'touch').length;
      if (touches >= 2) {
        if (g?.kind === 'draw') { gesture.current = null; scheduleLive(); }   // two fingers: cancel the finger stroke
        if (g?.kind === 'erase') { docRef.current = { ...docRef.current }; gesture.current = null; drawBase(); }
        startPinch(); return;
      }
      const fingerDraws = !readOnly && (settingsRef.current.finger || !penSeen.current);
      if (fingerDraws) startInk(e, true); else startPan(e.pointerId, e);
      return;
    }
    // mouse / trackpad
    if (e.button === 1 || e.button === 2 || readOnly) { startPan(e.pointerId, e); return; }
    if (e.button === 0) startInk(e, true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const lp = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { type: e.pointerType, ...lp });
    const g = gesture.current;
    if (!g) {
      // Pencil hovering above the screen (newer iPads), or a mouse: show where the tip is.
      if ((e.pointerType === 'pen' || e.pointerType === 'mouse') && e.buttons === 0 && !readOnly) { hover.current = toPage(e); scheduleLive(); }
      return;
    }
    if (g.kind === 'draw' && g.id === e.pointerId) {
      const evs = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
      for (const ce of evs.length ? evs : [e.nativeEvent]) {
        const p = toPage(ce);
        const pts = g.stroke.pts, n = pts.length;
        if (Math.hypot(p.x - pts[n - 3], p.y - pts[n - 2]) * view.current.k < 0.6) continue;
        pts.push(p.x, p.y, pressureOf(ce, !!g.stroke.sim));
      }
      scheduleLive();
    } else if (g.kind === 'erase' && g.id === e.pointerId) {
      const p = toPage(e); g.path.push(p.x, p.y); applyErase(); scheduleLive();
    } else if (g.kind === 'pan' && g.id === e.pointerId) {
      const v0 = g.v0;
      view.current = clampView({ k: v0.k, x: v0.x + (kind === 'note' && v0.k <= fitK() + 1e-6 ? 0 : lp.x - g.sx), y: v0.y + lp.y - g.sy });
      scheduleBase();
    } else if (g.kind === 'pinch' && (e.pointerId === g.a || e.pointerId === g.b)) {
      const pa = pointers.current.get(g.a), pb = pointers.current.get(g.b);
      if (!pa || !pb) return;
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y), mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      const k = Math.min(8, Math.max(minK(), g.v0.k * d / g.d0));
      const px = (g.mx - g.v0.x) / g.v0.k, py = (g.my - g.v0.y) / g.v0.k;
      view.current = clampView({ k, x: mx - px * k, y: my - py * k });
      scheduleBase();
    }
  };

  const fitK = () => {
    const d = docRef.current, { w } = sizeRef.current;
    return Math.min(w - 24, 860) / d.w;
  };

  const finish = (e: React.PointerEvent, cancelled = false) => {
    pointers.current.delete(e.pointerId);
    if (e.pointerType === 'pen') penDown.current = false;
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'draw' && g.id === e.pointerId) {
      gesture.current = null;
      if (!cancelled && g.stroke.pts.length >= 3) commit([...docRef.current.strokes, g.stroke]);
      scheduleBase();
    } else if (g.kind === 'erase' && g.id === e.pointerId) {
      gesture.current = null;
      if (g.cur !== g.before) { docRef.current = { ...docRef.current, strokes: g.before }; commit(g.cur); }
      scheduleBase();
    } else if (g.kind === 'pan' && g.id === e.pointerId) {
      gesture.current = null;
    } else if (g.kind === 'pinch' && (e.pointerId === g.a || e.pointerId === g.b)) {
      gesture.current = null;
      const left = [...pointers.current.entries()].find(([, v]) => v.type === 'touch');
      if (left) startPan(left[0], { clientX: left[1].x + wrap.current!.getBoundingClientRect().left, clientY: left[1].y + wrap.current!.getBoundingClientRect().top });
    }
  };

  const onLeave = (e: React.PointerEvent) => { if (e.pointerType !== 'touch' && !pointers.current.has(e.pointerId)) { hover.current = null; scheduleLive(); } };

  // Mouse wheel / trackpad: scroll, and pinch (ctrl+wheel) to zoom.
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
        const k = Math.min(8, Math.max(minK(), v.k * Math.exp(-e.deltaY * 0.01)));
        view.current = clampView({ k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) });
      } else {
        view.current = clampView({ k: v.k, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
      scheduleBase();
    };
    // Safari: stop the Pencil from scrolling or selecting the page.
    const stopStylus = (e: TouchEvent) => {
      if ([...e.touches].some(t => (t as Touch & { touchType?: string }).touchType === 'stylus')) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchmove', stopStylus, { passive: false });
    el.addEventListener('touchstart', stopStylus, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('touchmove', stopStylus); el.removeEventListener('touchstart', stopStylus); };
  }, [clampView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: undo / redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      const h = (ref as React.RefObject<InkCanvasHandle | null>)?.current;
      if (e.shiftKey) h?.redo(); else h?.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);

  return (
    <div
      ref={wrap}
      className={s.surface}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => finish(e)}
      onPointerCancel={e => finish(e, true)}
      onPointerLeave={onLeave}
      onContextMenu={e => e.preventDefault()}
      data-ink-surface
      data-page-width={kind === 'note' ? PAGE_W : undefined}
    >
      <canvas ref={base} className={s.layer} aria-hidden />
      <canvas ref={live} className={s.layer} aria-label={kind === 'note' ? 'Handwriting page' : 'Drawing canvas'} role="img" />
    </div>
  );
});
