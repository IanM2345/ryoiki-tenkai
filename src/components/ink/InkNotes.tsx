'use client';
// Handwritten pages and sketches attached to anything (a journal entry, a topic,
// a person, a place...). Drop <InkNotes type="journal" id={entry.id} /> into a page.
import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { PenLine, Shapes, NotebookPen } from 'lucide-react';
import { getDrawingsFor, type DbDrawingSummary, type DrawingAttach, type DrawingKind } from '@/lib/db';
import { useLiveTables } from '@/lib/realtime';
import s from './ink.module.css';

const InkSheet = dynamic(() => import('./InkSheet'), { ssr: false });

export function InkThumb({ d, onOpen, className = '', label }: { d: DbDrawingSummary; onOpen: () => void; className?: string; label?: string }) {
  return (
    <button type="button" className={`${s.thumb} ${className}`} onClick={onOpen} aria-label={label ?? (d.title ? `Open ${d.title}` : 'Open handwriting')}>
{/* eslint-disable-next-line @next/next/no-img-element -- small data-URL previews */}
      {d.thumb ? <img src={d.thumb} alt="" draggable={false} /> : <span className={s.thumbEmpty}><PenLine size={22} /></span>}
    </button>
  );
}

export type OpenInk = { id: string | null; kind: DrawingKind } | null;

export default function InkNotes({ type, id, context, variant = 'section', label = 'Handwriting', onCount, readOnly }: {
  type: DrawingAttach;
  id: string | null | undefined;
  context?: string;
  /** 'section' for pages, 'compact' for edit windows, 'inline' for big previews only (view mode). */
  variant?: 'section' | 'compact' | 'inline';
  label?: string;
  onCount?: (n: number) => void;
  /** Show and open only (e.g. a letter that has been opened). */
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<DbDrawingSummary[]>([]);
  const [open, setOpen] = useState<OpenInk>(null);

  const load = useCallback(async () => {
    try {
      if (!id) return;
      const rows = await getDrawingsFor(type, id);
      setItems(rows); onCount?.(rows.length);
    } catch { /* offline: keep what's shown */ }
  }, [type, id, onCount]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  useLiveTables(id ? ['drawings'] : [], load);

  if (!id || (readOnly && !items.length)) return null;
  const sheet = open && (
    <InkSheet id={open.id} kind={open.kind} attach={{ type, id }} context={context} readOnly={readOnly}
      onClose={() => { setOpen(null); load(); }} />
  );

  if (variant === 'inline') {
    return items.length ? (
      <div className={s.thumbs}>
        {items.map(d => <InkThumb key={d.id} d={d} className={s.thumbBig} onOpen={() => setOpen({ id: d.id, kind: d.kind })} />)}
        {sheet}
      </div>
    ) : null;
  }

  if (variant === 'compact') {
    return (
      <div className={s.notes}>
        <div className={s.notesHead}>
          <span className={s.notesLbl}><NotebookPen size={15} /> {label}{items.length ? ` (${items.length})` : ''}</span>
        </div>
        <div className={s.compactRow}>
          {items.map(d => <InkThumb key={d.id} d={d} className={s.mini} onOpen={() => setOpen({ id: d.id, kind: d.kind })} />)}
          {!readOnly && <>
            <button type="button" className={s.addBtn} onClick={() => setOpen({ id: null, kind: 'note' })}><PenLine size={15} /> Handwrite</button>
            <button type="button" className={s.addBtn} onClick={() => setOpen({ id: null, kind: 'sketch' })}><Shapes size={15} /> Sketch</button>
          </>}
        </div>
        {sheet}
      </div>
    );
  }

  return (
    <section className={s.notes} aria-label={label}>
      <div className={s.notesHead}>
        <span className={s.notesLbl}><NotebookPen size={16} /> {label}</span>
        {!readOnly && (
          <div className={s.addBtns}>
            <button type="button" className={s.addBtn} onClick={() => setOpen({ id: null, kind: 'note' })}><PenLine size={15} /> Handwrite</button>
            <button type="button" className={s.addBtn} onClick={() => setOpen({ id: null, kind: 'sketch' })}><Shapes size={15} /> Sketch</button>
          </div>
        )}
      </div>
      {items.length > 0 && (
        <div className={s.thumbs}>
          {items.map(d => <InkThumb key={d.id} d={d} onOpen={() => setOpen({ id: d.id, kind: d.kind })} />)}
        </div>
      )}
      {sheet}
    </section>
  );
}
