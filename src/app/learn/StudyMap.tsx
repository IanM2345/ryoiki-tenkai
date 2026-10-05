'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Maximize } from 'lucide-react';
import type { DbStudyLink, DbStudyNode } from '@/lib/db';
import { layout, type NodeStats, type Pt, type Tree } from '@/lib/study';
import s from './learn.module.css';

interface View { x: number; y: number; k: number }
const MIN_K = 0.25, MAX_K = 2;

/** A drag from a node or the background, tracked through pointer capture. */
type Gesture =
  | { kind: 'node'; id: string; start: Pt; origin: Pt; moved: boolean; pointerId: number }
  | { kind: 'pan'; start: Pt; origin: View; pointerId: number }
  | null;

function curve(a: Pt, b: Pt) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  // bend a little sideways so lines read as branches
  const dx = b.x - a.x, dy = b.y - a.y;
  return `M${a.x},${a.y} Q${mx - dy * 0.12},${my + dx * 0.12} ${b.x},${b.y}`;
}

/**
 * The visual study map: subjects as big bubbles, topics around them, branches between them,
 * and dotted lines for cross-links. Drag to pan, pinch or scroll to zoom, drag a topic to move it.
 */
export default function StudyMap({ tree, stats, links, colorOf, selectedId, linkFrom, onSelect, onOpen, onMove }: {
  tree: Tree;
  stats: Map<string, NodeStats>;
  links: DbStudyLink[];
  colorOf: (id: string) => string;
  selectedId: string | null;
  linkFrom: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, p: Pt) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [dragPos, setDragPos] = useState<{ id: string; p: Pt } | null>(null);
  const gesture = useRef<Gesture>(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number; k: number; mid: Pt; origin: View } | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const fitted = useRef(false);

  const positions = useMemo(() => layout(tree), [tree]);
  const pos = useCallback((id: string) => (dragPos?.id === id ? dragPos.p : positions.get(id)), [positions, dragPos]);
  const all = useMemo(() => [...tree.byId.values()], [tree]);

  // ── Fit everything in view ──────────────────────────────
  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !positions.size) return;
    const pts = [...positions.values()];
    const minX = Math.min(...pts.map(p => p.x)) - 140, maxX = Math.max(...pts.map(p => p.x)) + 140;
    const minY = Math.min(...pts.map(p => p.y)) - 90, maxY = Math.max(...pts.map(p => p.y)) + 90;
    const w = el.clientWidth, h = el.clientHeight;
    const kFit = Math.min(w / (maxX - minX), h / (maxY - minY));
    if (kFit >= 0.55) {
      const k = Math.min(1.1, kFit);
      setView({ k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k });
    } else {
      // too much to show at a readable size: start on the first subject; she can pan to the rest
      const first = positions.get((tree.children.get(null) ?? [])[0]?.id ?? '') ?? pts[0];
      const k = 0.8;
      setView({ k, x: w / 2 - first.x * k, y: h / 2 - first.y * k });
    }
  }, [positions, tree]);

  // Fit everything in view until she moves the map herself; refit if the box changes size
  // (the side panel and fonts settle a moment after the first paint).
  const fitRef = useRef(fit);
  useEffect(() => { fitRef.current = fit; }, [fit]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (!fitted.current && el.clientWidth > 0) fitRef.current(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (fitted.current || !positions.size) return;
    const t = setTimeout(() => fitRef.current(), 0);
    return () => clearTimeout(t);
  }, [positions]);

  // ── Zoom around a point ────────────────────────────────
  const zoomAt = useCallback((factor: number, at?: Pt) => {
    fitted.current = true;
    setView(v => {
      const el = box.current;
      const c = at ?? (el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 });
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      return { k, x: c.x - (c.x - v.x) * f, y: c.y - (c.y - v.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ── Pointer handling (mouse, pen and fingers) ──────────
  const local = (e: React.PointerEvent): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent, nodeId?: string) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    box.current?.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      // second finger: pinch to zoom
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, origin: view };
      gesture.current = null;
      setDragPos(null);
      return;
    }
    if (nodeId) fitted.current = true; // she's working on the map: leave the view where it is
    const np = nodeId ? pos(nodeId) : undefined;
    gesture.current = nodeId && np
      ? { kind: 'node', id: nodeId, start: p, origin: np, moved: false, pointerId: e.pointerId }
      : { kind: 'pan', start: p, origin: view, pointerId: e.pointerId };
    e.stopPropagation();
  };

  const onMoveP = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const pc = pinch.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, pc.k * (Math.hypot(a.x - b.x, a.y - b.y) / pc.dist)));
      const f = k / pc.origin.k;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      fitted.current = true;
      setView({ k, x: mid.x - (pc.mid.x - pc.origin.x) * f, y: mid.y - (pc.mid.y - pc.origin.y) * f });
      return;
    }
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (g.kind === 'pan') {
      if (Math.hypot(dx, dy) > 4) fitted.current = true;
      setView({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy });
    } else {
      if (!g.moved && Math.hypot(dx, dy) < 6) return;
      g.moved = true;
      setDragPos({ id: g.id, p: { x: g.origin.x + dx / view.k, y: g.origin.y + dy / view.k } });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (g.kind === 'node') {
      if (g.moved && dragPos) {
        onMove(g.id, { x: Math.round(dragPos.p.x), y: Math.round(dragPos.p.y) });
      } else {
        // tap: select; tap again (or double-click) opens it
        const now = e.timeStamp;
        const again = lastTap.current?.id === g.id && now - lastTap.current.t < 450;
        lastTap.current = { id: g.id, t: now };
        if (again || (selectedId === g.id && !linkFrom)) onOpen(g.id);
        else onSelect(g.id);
      }
      setDragPos(null);
    } else if (Math.hypot(local(e).x - g.start.x, local(e).y - g.start.y) < 4) {
      onSelect(null);
    }
  };

  // ── Edges ──────────────────────────────────────────────
  const branches = all.filter(n => n.parent_id && tree.byId.has(n.parent_id));
  const linkFromPt = linkFrom ? pos(linkFrom) : null;

  return (
    <div
      ref={box}
      className={`${s.mapBox} ${linkFrom ? s.mapLinking : ''}`}
      onPointerDown={e => onDown(e)}
      onPointerMove={onMoveP}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="application"
      aria-label="Study map. Drag to move around, scroll or pinch to zoom."
    >
      <div className={s.mapLayer} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className={s.edges} aria-hidden>
          {branches.map(n => {
            const a = pos(n.parent_id!), b = pos(n.id);
            if (!a || !b) return null;
            return <path key={n.id} d={curve(a, b)} className={s.branch} style={{ ['--c' as string]: colorOf(n.id) }} />;
          })}
          {links.map(l => {
            const a = pos(l.from_id), b = pos(l.to_id);
            if (!a || !b) return null;
            const on = selectedId === l.from_id || selectedId === l.to_id;
            return <path key={l.id} d={curve(a, b)} className={`${s.crossLink} ${on ? s.crossOn : ''}`} />;
          })}
        </svg>

        {all.map(n => {
          const p = pos(n.id);
          if (!p) return null;
          const st = stats.get(n.id);
          const subject = !n.parent_id || !tree.byId.has(n.parent_id);
          const m = st?.mastery;
          return (
            <div
              key={n.id}
              className={`${subject ? s.mSubject : s.mTopic} ${selectedId === n.id ? s.mOn : ''} ${linkFrom === n.id ? s.mLinkFrom : ''} ${dragPos?.id === n.id ? s.mDragging : ''}`}
              style={{ left: p.x, top: p.y, ['--c' as string]: colorOf(n.id), ['--m' as string]: `${m ?? 0}%` }}
              onPointerDown={e => onDown(e, n.id)}
              onKeyDown={e => { if (e.key === 'Enter') onOpen(n.id); if (e.key === ' ') { e.preventDefault(); onSelect(n.id); } }}
              tabIndex={0}
              role="button"
              aria-label={`${n.title}${m != null ? `, ${m}% known` : ''}${st?.due ? `, ${st.due} cards due` : ''}`}
            >
              <span className={s.mTitle}>{n.title}</span>
              {!subject && <span className={s.mBar}><span /></span>}
              {subject && m != null && <span className={s.mPct}>{m}%</span>}
              {!!st?.due && <span className={s.mDue}>{st.due}</span>}
            </div>
          );
        })}

        {linkFromPt && <div className={s.linkHint} style={{ left: linkFromPt.x, top: linkFromPt.y }} />}
      </div>

      <div className={s.mapZoom} onPointerDown={e => e.stopPropagation()}>
        <button type="button" onClick={() => zoomAt(1.25)} aria-label="Zoom in"><Plus size={16} /></button>
        <button type="button" onClick={() => zoomAt(0.8)} aria-label="Zoom out"><Minus size={16} /></button>
        <button type="button" onClick={fit} aria-label="Show everything"><Maximize size={15} /></button>
      </div>
    </div>
  );
}

export type { DbStudyNode };
