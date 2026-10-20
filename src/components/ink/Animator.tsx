'use client';
// Flipbook animation: the frame strip, playback, and GIF export.
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Play, Pause, Plus, Copy, Trash2, ChevronLeft, ChevronRight, Layers, Image as ImageIcon, Repeat, ArrowLeftRight, Timer,
} from 'lucide-react';
import { type InkDoc, type InkFrame, MAX_FRAMES, newFrameId, paintFrame, playOrder } from '@/lib/ink';
import s from './ink.module.css';

export const FPS_CHOICES = [2, 4, 6, 8, 12, 15, 24];

// Small previews for the frame strip, remembered per frame drawing.
const thumbCache = new WeakMap<object, string>();
function frameThumb(doc: InkDoc, f: InkFrame, i: number): string {
  const hit = thumbCache.get(f.strokes); if (hit) return hit;
  const c = document.createElement('canvas');
  const k = 132 / doc.w;
  c.width = Math.round(doc.w * k); c.height = Math.round(doc.h * k);
  const ctx = c.getContext('2d'); if (!ctx) return '';
  ctx.scale(k, k);
  paintFrame(ctx, doc, i);
  const url = c.toDataURL('image/webp', 0.7);
  thumbCache.set(f.strokes, url);
  return url;
}

export function Timeline({ doc, frame, layer, playing, onFrame, onLayer, onPlay, onDoc }: {
  doc: InkDoc;
  frame: number;
  layer: 'frame' | 'bg';
  playing: boolean;
  onFrame: (i: number) => void;
  onLayer: (l: 'frame' | 'bg') => void;
  onPlay: (p: boolean) => void;
  onDoc: (d: InkDoc, frame?: number) => void;
}) {
  const anim = doc.anim!;
  const frames = anim.frames;
  const strip = useRef<HTMLDivElement>(null);
  const setAnim = (patch: Partial<typeof anim>, f?: number) => onDoc({ ...doc, anim: { ...anim, ...patch } }, f);
  const setFrames = (next: InkFrame[], f: number) => setAnim({ frames: next }, f);

  const add = () => { if (frames.length >= MAX_FRAMES) return; const n = [...frames]; n.splice(frame + 1, 0, { id: newFrameId(), strokes: [] }); setFrames(n, frame + 1); };
  const dup = () => { if (frames.length >= MAX_FRAMES) return; const n = [...frames]; n.splice(frame + 1, 0, { id: newFrameId(), strokes: frames[frame].strokes.map(st => ({ ...st, pts: [...st.pts] })), hold: frames[frame].hold }); setFrames(n, frame + 1); };
  const del = () => { if (frames.length < 2) { setFrames([{ ...frames[0], strokes: [] }], 0); return; } const n = frames.filter((_, i) => i !== frame); setFrames(n, Math.min(frame, n.length - 1)); };
  const move = (dir: -1 | 1) => { const j = frame + dir; if (j < 0 || j >= frames.length) return; const n = [...frames]; [n[frame], n[j]] = [n[j], n[frame]]; setFrames(n, j); };
  const hold = () => { const n = [...frames]; const h = (n[frame].hold ?? 1) % 4 + 1; n[frame] = { ...n[frame], hold: h > 1 ? h : undefined }; setFrames(n, frame); };

  // Keep the selected frame in view.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-frame="${frame}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [frame]);

  const seconds = (playOrder(anim).length / anim.fps).toFixed(1);
  return (
    <div className={s.timeline} aria-label="Animation frames">
      <div className={s.tlRow}>
        <button type="button" className={`${s.tlPlay} ${playing ? s.tlPlayOn : ''}`} onClick={() => onPlay(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className={s.tlStrip} ref={strip} role="listbox" aria-label="Frames">
          {frames.map((f, i) => (
            <button key={f.id} type="button" role="option" aria-selected={i === frame} data-frame={i}
              className={`${s.tlFrame} ${i === frame && layer === 'frame' ? s.tlFrameOn : ''}`}
              onClick={() => { onPlay(false); onLayer('frame'); onFrame(i); }} aria-label={`Frame ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated previews */}
              <img src={frameThumb(doc, f, i)} alt="" draggable={false} />
              <span>{i + 1}{f.hold ? ` ×${f.hold}` : ''}</span>
            </button>
          ))}
          <button type="button" className={s.tlAdd} onClick={add} disabled={frames.length >= MAX_FRAMES} aria-label="Add a frame"><Plus size={20} /></button>
        </div>
      </div>
      <div className={s.tlRow2}>
        <div className={s.tlBtns}>
          <button type="button" onClick={() => move(-1)} disabled={frame === 0} aria-label="Move frame earlier" title="Move earlier"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => move(1)} disabled={frame === frames.length - 1} aria-label="Move frame later" title="Move later"><ChevronRight size={16} /></button>
          <button type="button" onClick={dup} aria-label="Duplicate frame" title="Duplicate"><Copy size={15} /> <span>Copy</span></button>
          <button type="button" onClick={hold} aria-label="Hold this frame longer" title="Hold longer"><Timer size={15} /> <span>{frames[frame]?.hold ? `×${frames[frame].hold}` : 'Hold'}</span></button>
          <button type="button" onClick={del} aria-label="Delete frame" title="Delete frame"><Trash2 size={15} /></button>
        </div>
        <div className={s.tlBtns}>
          <button type="button" className={anim.onion ? s.tlOn : ''} onClick={() => setAnim({ onion: !anim.onion })} aria-pressed={anim.onion} title="See the frames either side"><Layers size={15} /> <span>Onion skin</span></button>
          <button type="button" className={layer === 'bg' ? s.tlOn : ''} onClick={() => { onPlay(false); onLayer(layer === 'bg' ? 'frame' : 'bg'); }} aria-pressed={layer === 'bg'} title="Draw the background shown under every frame"><ImageIcon size={15} /> <span>Background</span></button>
          <button type="button" onClick={() => setAnim({ loop: anim.loop === 'loop' ? 'bounce' : 'loop' })} title={anim.loop === 'loop' ? 'Plays round and round' : 'Plays forwards, then backwards'}>
            {anim.loop === 'loop' ? <Repeat size={15} /> : <ArrowLeftRight size={15} />} <span>{anim.loop === 'loop' ? 'Loop' : 'Bounce'}</span>
          </button>
          <label className={s.tlFps} title="Frames per second">
            <select value={anim.fps} onChange={e => setAnim({ fps: Number(e.target.value) })} aria-label="Speed">
              {FPS_CHOICES.map(f => <option key={f} value={f}>{f} fps</option>)}
            </select>
          </label>
          <span className={s.tlInfo}>{frames.length} {frames.length === 1 ? 'frame' : 'frames'} · {seconds}s</span>
        </div>
      </div>
    </div>
  );
}

/** Plays the animation over the stage. */
export function Player({ doc, startAt = 0 }: { doc: InkDoc; startAt?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const order = useMemo(() => playOrder(doc.anim!), [doc.anim]);
  useEffect(() => {
    const el = wrap.current, c = cv.current; if (!el || !c) return;
    const r = el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = Math.min((r.width - 32) / doc.w, (r.height - 32) / doc.h);
    c.width = Math.round(doc.w * k * dpr); c.height = Math.round(doc.h * k * dpr);
    c.style.width = `${doc.w * k}px`; c.style.height = `${doc.h * k}px`;
    const ctx = c.getContext('2d'); if (!ctx) return;
    let raf = 0, last = -1;
    const t0 = performance.now();
    const start = Math.max(0, order.indexOf(startAt));
    const tick = (now: number) => {
      const step = (start + Math.floor((now - t0) / (1000 / doc.anim!.fps))) % order.length;
      if (step !== last) {
        last = step;
        ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
        paintFrame(ctx, doc, order[step]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doc, order, startAt]);
  return <div ref={wrap} className={s.player}><canvas ref={cv} aria-label="Animation playing" role="img" /></div>;
}

/** Encode the animation as a looping GIF (about 640 px wide). */
export async function exportGif(doc: InkDoc, maxW = 640): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const anim = doc.anim!;
  const order = playOrder(anim);
  const k = Math.min(1, maxW / doc.w);
  const w = Math.round(doc.w * k), h = Math.round(doc.h * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const delay = Math.round(1000 / anim.fps);
  // Render each distinct frame once, then write them in play order.
  const cache = new Map<number, { index: Uint8Array; palette: number[][] }>();
  for (const i of order) {
    let fr = cache.get(i);
    if (!fr) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      paintFrame(ctx, doc, i);
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256);
      fr = { index: applyPalette(data, palette), palette };
      cache.set(i, fr);
      await new Promise(r => setTimeout(r, 0));     // keep the page responsive
    }
    gif.writeFrame(fr.index, w, h, { palette: fr.palette, delay });
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}
