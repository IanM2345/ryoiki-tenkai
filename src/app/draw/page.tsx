'use client';
// Sketchbook: her drawings, plus every handwritten page from around the site.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Brush, Star, RectangleHorizontal, RectangleVertical, Square, NotebookPen, Film, Play } from 'lucide-react';
import { Btn, Topbar, EmptyState, SearchBar } from '@/components/ui';
import { getAllDrawingSummaries, type DbDrawingSummary, type DrawingAttach, type DrawingKind } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { relDay, localDateStr } from '@/lib/dates';
import type { SketchSize } from '@/lib/ink';
import s from './draw.module.css';

const InkSheet = dynamic(() => import('@/components/ink/InkSheet'), { ssr: false });

const WHERE: Record<DrawingAttach, string> = {
  journal: 'Journal', study_node: 'Learn', card_front: 'Flashcard', card_back: 'Flashcard', soul: 'Souls', place: 'Places',
  route: 'Routes', idea: 'Ideas', task: 'Tasks', library: 'Library', capsule: 'Time capsule', queue: 'Queue', rating: 'Ratings', mood: 'Mood',
};
type Tab = 'drawings' | 'animations' | 'fav' | 'handwriting';

export default function SketchbookPage() {
  const [all, setAll] = useState<DbDrawingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('drawings');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ id: string | null; kind: DrawingKind; size?: SketchSize; attach?: { type: DrawingAttach; id: string } } | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    try {
      if (!(await ensureSession())) return;
      setAll(await getAllDrawingSummaries());
    } catch { /* offline: keep what's shown */ } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveTables(['drawings'], load);

  const sketches = all.filter(d => !d.attached_type);
  // Letters' pages stay out of here, so a sealed letter can't be peeked at.
  const notes = all.filter(d => d.attached_type && d.attached_type !== 'capsule');
  const shown = useMemo(() => {
    const list = tab === 'handwriting' ? notes : tab === 'fav' ? sketches.filter(d => d.favourite)
      : tab === 'animations' ? sketches.filter(d => d.kind === 'animation') : sketches.filter(d => d.kind !== 'animation');
    const needle = q.trim().toLowerCase();
    return needle ? list.filter(d => d.title.toLowerCase().includes(needle) || (d.attached_type && WHERE[d.attached_type].toLowerCase().includes(needle))) : list;
  }, [tab, sketches, notes, q]);

  const [newKind, setNewKind] = useState<'sketch' | 'animation'>('sketch');
  const start = (size: SketchSize) => { setPicking(false); setOpen({ id: null, kind: newKind, size }); };
  const animCount = sketches.filter(d => d.kind === 'animation').length;
  const when = (iso: string) => { const d = relDay(localDateStr(new Date(iso))); return d[0].toUpperCase() + d.slice(1); };

  return (
    <div className={s.page}>
      <Topbar
        title="Sketchbook"
        sub={loading ? 'Opening your sketchbook' : sketches.length ? `${sketches.length - animCount} ${sketches.length - animCount === 1 ? 'drawing' : 'drawings'}${animCount ? `, ${animCount} ${animCount === 1 ? 'animation' : 'animations'}` : ''}${notes.length ? `, ${notes.length} handwritten ${notes.length === 1 ? 'page' : 'pages'}` : ''}` : 'Draw and animate with your Apple Pencil, a finger or a mouse'}
        action={<Btn onClick={() => setPicking(p => !p)}><Plus size={16} strokeWidth={2.25} /> New</Btn>}
      />
      <div className={s.wrap}>
        {picking && (
          <div className={s.picker} role="group" aria-label="What to make">
            <div className={s.kinds} role="radiogroup" aria-label="Type">
              <button type="button" role="radio" aria-checked={newKind === 'sketch'} className={newKind === 'sketch' ? s.kindOn : ''} onClick={() => setNewKind('sketch')}><Brush size={18} /> Drawing</button>
              <button type="button" role="radio" aria-checked={newKind === 'animation'} className={newKind === 'animation' ? s.kindOn : ''} onClick={() => setNewKind('animation')}><Film size={18} /> Animation</button>
            </div>
            <span>Pick a shape</span>
            <button type="button" onClick={() => start('landscape')}><RectangleHorizontal size={22} /> Landscape</button>
            <button type="button" onClick={() => start('portrait')}><RectangleVertical size={22} /> Portrait</button>
            <button type="button" onClick={() => start('square')}><Square size={20} /> Square</button>
          </div>
        )}

        {!loading && all.length > 0 && (
          <div className={s.bar}>
            <div className={s.tabs} role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'drawings'} className={tab === 'drawings' ? s.tabOn : ''} onClick={() => setTab('drawings')}><Brush size={14} /> Drawings</button>
              <button type="button" role="tab" aria-selected={tab === 'animations'} className={tab === 'animations' ? s.tabOn : ''} onClick={() => setTab('animations')}><Film size={14} /> Animations{animCount ? ` (${animCount})` : ''}</button>
              <button type="button" role="tab" aria-selected={tab === 'fav'} className={tab === 'fav' ? s.tabOn : ''} onClick={() => setTab('fav')}><Star size={14} /> Favourites</button>
              <button type="button" role="tab" aria-selected={tab === 'handwriting'} className={tab === 'handwriting' ? s.tabOn : ''} onClick={() => setTab('handwriting')}><NotebookPen size={14} /> Handwriting</button>
            </div>
            <SearchBar value={q} onChange={setQ} placeholder="Search by name" className={s.search} />
          </div>
        )}

        {loading ? (
          <div className={s.grid}>{[0, 1, 2, 3].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Brush size={26} />}
            msg={q ? 'Nothing matches that name.'
              : tab === 'handwriting' ? 'No handwriting yet. Look for "Handwrite" on a journal entry, a study topic, a person or a place.'
              : tab === 'fav' ? 'No favourites yet. Open a drawing, tap ⋯ and choose Favourite.'
              : tab === 'animations' ? 'No animations yet. Tap New, choose Animation, and draw one frame at a time.'
              : 'Your sketchbook is empty. Start a drawing: Apple Pencil, finger or mouse all work.'}
            action={(tab === 'drawings' || tab === 'animations') && !q ? <Btn sm onClick={() => { setNewKind(tab === 'animations' ? 'animation' : 'sketch'); setPicking(true); }}><Plus size={15} /> {tab === 'animations' ? 'New animation' : 'New drawing'}</Btn> : undefined}
          />
        ) : (
          <div className={s.grid}>
            {shown.map(d => (
              <button key={d.id} type="button" className={s.card}
                onClick={() => setOpen({ id: d.id, kind: d.kind, attach: d.attached_type && d.attached_id ? { type: d.attached_type, id: d.attached_id } : undefined })}>
                {d.kind === 'animation' && <span className={s.animBadge}><Play size={12} fill="currentColor" /> Animation</span>}
                {/* eslint-disable-next-line @next/next/no-img-element -- small data-URL previews */}
                <span className={s.art}>{d.thumb ? <img src={d.thumb} alt="" draggable={false} /> : <Brush size={26} />}</span>
                <span className={s.meta}>
                  <b>{d.title || (d.attached_type ? `${WHERE[d.attached_type]} page` : d.kind === 'animation' ? 'Untitled animation' : 'Untitled')}</b>
                  <small>{d.attached_type ? `${WHERE[d.attached_type]} · ` : ''}{when(d.updated_at)}</small>
                </span>
                {d.favourite && <Star size={14} className={s.fav} fill="currentColor" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {open && <InkSheet id={open.id} kind={open.kind} size={open.size} attach={open.attach}
        context={open.attach ? WHERE[open.attach.type] : undefined} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
}
