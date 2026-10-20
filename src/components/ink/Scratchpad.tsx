'use client';
// A quick scratch area (not saved): work an answer out with the Pencil before flipping a card.
import React, { useRef, useState } from 'react';
import { Eraser, PenLine, Trash2, Undo2 } from 'lucide-react';
import type { InkDoc } from '@/lib/ink';
import { InkCanvas, type InkCanvasHandle } from './InkCanvas';
import s from './ink.module.css';

const blank = (): InkDoc => ({ v: 1, w: 1350, h: 520, bg: 'dots', strokes: [] });

export default function Scratchpad({ hint = 'Scratchpad: work it out here (not saved)' }: { hint?: string }) {
  const [doc, setDoc] = useState<InkDoc>(blank);
  const [erase, setErase] = useState(false);
  const [gen, setGen] = useState(0);
  const ref = useRef<InkCanvasHandle>(null);
  return (
    <div className={s.scratch}>
      {!doc.strokes.length && <span className={s.scratchHint}>{hint}</span>}
      <div className={s.scratchBar}>
        <button type="button" onClick={() => setErase(e => !e)} aria-pressed={erase} aria-label={erase ? 'Pen' : 'Eraser'} title={erase ? 'Pen' : 'Eraser'}>
          {erase ? <PenLine size={16} /> : <Eraser size={16} />}
        </button>
        <button type="button" onClick={() => ref.current?.undo()} aria-label="Undo"><Undo2 size={16} /></button>
        <button type="button" onClick={() => { setDoc(blank()); setGen(g => g + 1); }} aria-label="Clear"><Trash2 size={16} /></button>
      </div>
      <InkCanvas key={gen} ref={ref} doc={doc} kind="sketch" onChange={setDoc}
        settings={{ mode: erase ? 'eraser' : 'pen', color: '#f5e6d0', size: 4, eraser: 'precise', finger: false }} />
    </div>
  );
}
