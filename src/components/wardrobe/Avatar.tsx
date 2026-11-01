'use client';
// Draws her avatar wearing a list of layers. Everything comes from plain drawing data
// (lib/wardrobe); nothing is inserted as raw markup, and only https/blob images are shown.
import React, { useEffect, useId, useMemo, useState } from 'react';
import { Body, drawBody, drawHair, cleanLook, VIEW_W, VIEW_H, VIEW_Y, HEAD_T, type Look } from '@/lib/wardrobe/body';
import { drawPiece, CLOTH_DEFS, layerZ, pieceSlot, OVER_HAIR_Z, HEAD_SLOTS, type Layer, type PlacedPhoto } from '@/lib/wardrobe/garments';
import type { Art } from '@/lib/wardrobe/shapes';
import s from './avatar.module.css';

const SAFE_HREF = process.env.NODE_ENV === 'production' ? /^(https:\/\/|blob:)/i : /^(https:\/\/|blob:|http:\/\/(localhost|127\.0\.0\.1)[:/])/i;
const TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'stop', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'feGaussianBlur', 'clipPath']);

/** Give every gradient/pattern id a per-picture prefix so several avatars can share a page. */
function prefixed(a: Record<string, string | number>, pfx: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(a)) out[k] = typeof v === 'string' && v.includes('url(#') ? v.replace(/url\(#([\w-]+)\)/g, `url(#${pfx}$1)`) : v;
  return out;
}
function ArtView({ art, pfx }: { art: Art; pfx: string }) {
  return (
    <>
      {art.defs.length > 0 && (
        <defs>
          {art.defs.filter(d => TAGS.has(d.tag)).map(d => React.createElement(d.tag, { key: d.id, id: pfx + d.id, ...prefixed(d.a, pfx) },
            d.kids.filter(k => TAGS.has(k.tag)).map((k, i) => React.createElement(k.tag, { key: i, ...prefixed(k.a, pfx) }))))}
        </defs>
      )}
      {art.els.filter(e => TAGS.has(e.tag)).map((e, i) => React.createElement(e.tag, { key: i, ...prefixed(e.a, pfx) }))}
    </>
  );
}

export interface AvatarProps {
  look: Partial<Look> | Record<string, unknown> | null | undefined;
  layers?: Layer[];
  /** Signed URLs for closet photos, by closet item id. */
  photos?: Record<string, string>;
  /** Interactive stage: photos can be picked and dragged. */
  selected?: number | null;
  onPhotoDown?: (index: number, e: React.PointerEvent<SVGGElement>) => void;
  svgRef?: React.Ref<SVGSVGElement>;
  animate?: boolean;
  /** Crop to part of the figure, in avatar units (top, height). */
  crop?: [number, number];
  /** 'slice' fills the box (cutting off the sides) instead of fitting inside it. */
  fill?: boolean;
  className?: string;
  label?: string;
}

export default function Avatar({ look: raw, layers = [], photos = {}, selected = null, onPhotoDown, svgRef, animate = false, crop, fill = false, className = '', label = 'Avatar' }: AvatarProps) {
  const pfx = 'a' + useId().replace(/[^a-zA-Z0-9]/g, '') + '-';
  const look = useMemo(() => cleanLook(raw), [raw]);
  const b = useMemo(() => new Body(look), [look]);
  const hair = useMemo(() => drawHair(b), [b]);

  // Keep each layer's own index (for picking), drawn in z order.
  const ordered = useMemo(() => layers.map((l, i) => ({ l, i })).sort((x, y) => layerZ(x.l) - layerZ(y.l) || x.i - y.i), [layers]);
  const covered = useMemo(() => {
    const slots = layers.map(l => l.kind === 'piece' ? pieceSlot(l.piece) : null);
    return { top: slots.some(x => x === 'top' || x === 'dress'), bottom: slots.some(x => x === 'bottom' || x === 'dress') };
  }, [layers]);
  // While a new piece slides on, keep the base layer under it until it's fully on.
  const [settled, setSettled] = useState(covered);
  useEffect(() => { const t = setTimeout(() => setSettled(covered), animate ? 560 : 0); return () => clearTimeout(t); }, [covered, animate]);
  const shown = useMemo(() => ({ top: covered.top && settled.top, bottom: covered.bottom && settled.bottom }), [covered, settled]);
  const body = useMemo(() => drawBody(b, shown), [b, shown]);
  const arts = useMemo(() => ordered.map(({ l, i }) => l.kind === 'piece' ? drawPiece(b, l, `${i}`) : null), [ordered, b]);

  const layer = (k: number) => {
    const { l, i } = ordered[k];
    const key = l.kind === 'piece' ? `p-${l.piece}-${i}` : `f-${l.item}-${i}`;
    if (l.kind === 'piece') return <g key={key} className={animate ? s.wearIn : undefined}><ArtView art={arts[k]!} pfx={pfx} /></g>;
    return <Photo key={key} p={l} url={photos[l.item]} index={i} selected={selected === i} onDown={onPhotoDown} animate={animate} />;
  };
  const onHead = (l: Layer) => l.kind === 'piece' && HEAD_SLOTS.has(pieceSlot(l.piece)!);
  const under = ordered.map((o, k) => layerZ(o.l) < OVER_HAIR_Z && !onHead(o.l) ? layer(k) : null);
  const over = ordered.map((o, k) => layerZ(o.l) >= OVER_HAIR_Z && !onHead(o.l) ? layer(k) : null);
  const headWear = ordered.map((o, k) => onHead(o.l) ? layer(k) : null);
  const vb = crop ? `0 ${crop[0]} ${VIEW_W} ${crop[1]}` : `0 ${VIEW_Y} ${VIEW_W} ${VIEW_H}`;
  // The head (and hair) is drawn in its own space; this group puts it on the neck and lets it move.
  const head = (kids: React.ReactNode) => <g transform={HEAD_T}><g className={animate ? s.headMove : undefined}>{kids}</g></g>;

  return (
    <svg ref={svgRef} viewBox={vb} className={`${s.avatar} ${animate ? s.alive : ''} ${crop ? s.cropped : ''} ${className}`} role="img" aria-label={label} preserveAspectRatio={fill ? 'xMidYMid slice' : 'xMidYMid meet'}>
      <defs>
        {CLOTH_DEFS.map(d => React.createElement(d.tag, { key: d.id, id: pfx + d.id, ...d.a }, d.kids.map((k, i) => React.createElement(k.tag, { key: i, ...k.a }))))}
      </defs>
      <ellipse cx={200} cy={b.y.sole + 10} rx={100} ry={13} className={s.shadow} filter={`url(#${pfx}soft)`} />
      <g className={animate ? s.sway : undefined}>
        <g className={animate ? s.breathe : undefined}>
          {head(<ArtView art={hair.back} pfx={pfx} />)}
          <ArtView art={body} pfx={pfx} />
          {head(<ArtView art={{ defs: [], els: body.head }} pfx={pfx} />)}
          {under}
          {head(<><ArtView art={hair.front} pfx={pfx} />{headWear}</>)}
          {over}
        </g>
      </g>
    </svg>
  );
}

function Photo({ p, url, index, selected, onDown, animate }: { p: PlacedPhoto; url?: string; index: number; selected: boolean; onDown?: AvatarProps['onPhotoDown']; animate: boolean }) {
  if (!url || !SAFE_HREF.test(url)) return null;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  return (
    <g transform={`rotate(${p.rot} ${cx} ${cy})`} className={`${animate ? s.wearIn : ''} ${onDown ? s.movable : ''}`}
      onPointerDown={onDown ? e => onDown(index, e) : undefined}>
      <image href={url} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="xMidYMid meet" />
      {selected && <rect x={p.x - 4} y={p.y - 4} width={p.w + 8} height={p.h + 8} rx={10} className={s.selBox} />}
    </g>
  );
}
