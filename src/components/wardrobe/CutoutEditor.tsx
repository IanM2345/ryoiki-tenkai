'use client';
// Add a real piece of clothing: take or choose a photo, cut it out, name it.
import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Wand2, Eraser, Brush, Undo2, RotateCcw, Sparkles, LoaderCircle, Palette, Zap } from 'lucide-react';
import { Btn, Modal, ModalTitle } from '@/components/ui';
import { loadForCutout, autoRemove, wandAt, brush, render, exportCutout, type CutImage } from '@/lib/wardrobe/cutout';
import { smartCut, type CutModel } from '@/lib/wardrobe/autoCut';
import type { ClosetCategory } from '@/lib/db';
import s from './wardrobe-ui.module.css';

export const CLOSET_CATEGORIES: { id: ClosetCategory; name: string }[] = [
  { id: 'top', name: 'Top' }, { id: 'bottom', name: 'Bottom' }, { id: 'dress', name: 'Dress' }, { id: 'outerwear', name: 'Jacket' },
  { id: 'shoes', name: 'Shoes' }, { id: 'bag', name: 'Bag' }, { id: 'accessory', name: 'Accessory' },
];

type Tool = 'wand' | 'erase' | 'restore';
export interface CutoutResult { blob: Blob; back: Blob; color: string; name: string; category: ClosetCategory; tags: string[] }

/**
 * Every piece needs two photos, the front and the back (the 3D figure wears each on its own side). mode 'back' only
 * takes the back, for a piece added before backs were asked for.
 */
export default function CutoutEditor({ onClose, onSave, mode = 'new', onSaveBack }: {
  onClose: () => void; onSave?: (r: CutoutResult) => Promise<void>; mode?: 'new' | 'back'; onSaveBack?: (blob: Blob) => Promise<void>;
}) {
  const [side, setSide] = useState<'front' | 'back'>(mode === 'back' ? 'back' : 'front');
  const [front, setFront] = useState<{ blob: Blob; color: string; url: string } | null>(null);
  const [img, setImg] = useState<CutImage | null>(null);
  const [step, setStep] = useState<'pick' | 'cut' | 'details'>('pick');
  const [busy, setBusy] = useState(false);
  const [cutting, setCutting] = useState<'' | CutModel>('');   // the smart cut is running (first time: downloading)
  const [how, setHow] = useState<'smart' | 'strong' | 'colour'>('smart');
  const [err, setErr] = useState('');
  const [tol, setTol] = useState(28);
  const [tool, setTool] = useState<Tool>('wand');
  const [size, setSize] = useState(18);
  const [, setTick] = useState(0);
  const [undoN, setUndoN] = useState(0);
  const undo = useRef<Uint8Array[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [result, setResult] = useState<{ blob: Blob; color: string; url: string } | null>(null);
  const [name, setName] = useState('');
  const [cat, setCat] = useState<ClosetCategory>('top');
  const [tags, setTags] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const redraw = () => { if (img && canvas.current) render(img, canvas.current.getContext('2d')!); setTick(t => t + 1); };
  useEffect(() => { if (step === 'cut' && img && canvas.current) render(img, canvas.current.getContext('2d')!); }, [step, img]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => () => { if (front) URL.revokeObjectURL(front.url); }, [front]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('That file is not a photo.'); return; }
    setBusy(true); setErr('');
    try {
      const im = await loadForCutout(f);
      setCutting('quick');
      // the smart cut first; if it can't run here, the colour cut
      if (await smartCut(im, 'quick')) setHow('smart'); else { autoRemove(im, tol); setHow('colour'); }
      undo.current = []; setUndoN(0);
      setImg(im); setStep('cut');
    } catch { setErr("That photo couldn't be opened. Try a JPG or PNG."); } finally { setBusy(false); setCutting(''); }
  };
  const smartAgain = async (model: CutModel) => {
    if (!img || busy) return;
    save(); setBusy(true); setCutting(model); setErr('');
    try {
      if (await smartCut(img, model)) setHow(model === 'strong' ? 'strong' : 'smart');
      else { doUndo(); setErr(model === 'strong' ? "The stronger cut couldn't run here. Check your connection, or use the colour cut." : "The smart cut couldn't run here. Use the colour cut instead."); }
      redraw();
    } finally { setBusy(false); setCutting(''); }
  };
  const save = () => { if (img) { undo.current.push(img.mask.slice()); if (undo.current.length > 25) undo.current.shift(); setUndoN(undo.current.length); } };
  const doUndo = () => { const m = undo.current.pop(); setUndoN(undo.current.length); if (img && m) { img.mask.set(m); redraw(); } };
  const reAuto = (t: number) => { if (!img) return; save(); img.mask.fill(255); autoRemove(img, t); setHow('colour'); redraw(); };
  const keepAll = () => { if (!img) return; save(); img.mask.fill(255); redraw(); };

  const at = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(e.clientX - r.left) * img!.w / r.width, (e.clientY - r.top) * img!.h / r.height];
  };
  const brushR = () => size * (img ? img.w / (canvas.current?.getBoundingClientRect().width || img.w) : 1);
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    save();
    if (tool === 'wand') { wandAt(img, x, y, tol, 0); redraw(); return; }
    drag.current = { x, y };
    brush(img, x, y, x, y, brushR(), tool === 'erase' ? 0 : 255); redraw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img || !drag.current) return;
    const [x, y] = at(e);
    brush(img, drag.current.x, drag.current.y, x, y, brushR(), tool === 'erase' ? 0 : 255);
    drag.current = { x, y }; redraw();
  };
  const up = () => { drag.current = null; };

  const next = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const r = await exportCutout(img);
      if (!r) { setErr('Nothing is left of the photo. Undo or start over.'); return; }
      const cut = { blob: r.blob, color: r.color, url: URL.createObjectURL(r.blob) };
      if (side === 'front') { setFront(cut); setSide('back'); setImg(null); setErr(''); setStep('pick'); return; }   // now the back
      if (mode === 'back') { await onSaveBack?.(cut.blob); return; }
      setResult(cut);
      setStep('details');
    } finally { setBusy(false); }
  };
  const finish = async () => {
    if (!result || !front) return;
    setBusy(true); setErr('');
    try {
      await onSave?.({ blob: front.blob, back: result.blob, color: front.color, name: name.trim() || CLOSET_CATEGORIES.find(c => c.id === cat)!.name, category: cat,
        tags: tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 12) });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save it. Try again."); setBusy(false); }
  };

  return (
    <Modal onClose={busy ? undefined : onClose}>
      <ModalTitle>{mode === 'back' ? 'Add the back' : 'Add to my closet'}</ModalTitle>
      {step !== 'details' && <p className={s.hint}><b>{side === 'front' ? (mode === 'new' ? 'Step 1 of 2: the front' : 'The front') : mode === 'new' ? 'Step 2 of 2: the back' : 'The back'}</b></p>}
      {step === 'pick' && (
        <div className={s.pickBox}>
          {side === 'front'
            ? <p className={s.hint}>Lay the piece flat or hang it up against a plain wall or bed sheet, then take the photo straight on. The smart cut copes with most backgrounds; a plain one is still easiest. You&apos;ll take the back next.</p>
            : <p className={s.hint}>Now turn it over and take the back the same way, from the same distance. The 3D view uses it for her back.</p>}
          {front && side === 'back' && (
            <div className={s.checker} style={{ maxWidth: 140, margin: '0 auto' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={front.url} alt="The front" className={s.preview} />
            </div>
          )}
          <div className={s.pickBtns}>
            <button type="button" onClick={() => camRef.current?.click()} disabled={busy}><Camera size={22} /> Take a photo</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}><ImagePlus size={22} /> Choose a photo</button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {busy && <p className={s.hint}><LoaderCircle size={16} className={s.spin} /> Cutting it out{cutting ? ' (the first time takes a few seconds)' : ''}</p>}
        </div>
      )}

      {step === 'cut' && img && (
        <div className={s.cutWrap}>
          <div className={s.checker}>
            <canvas ref={canvas} width={img.w} height={img.h} className={s.cutCanvas} style={{ aspectRatio: `${img.w} / ${img.h}` }}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          </div>
          <div className={s.tools}>
            <div className={s.toolRow} role="group" aria-label="Tool">
              <button type="button" className={tool === 'wand' ? s.on : ''} onClick={() => setTool('wand')}><Wand2 size={16} /> Tap to remove</button>
              <button type="button" className={tool === 'erase' ? s.on : ''} onClick={() => setTool('erase')}><Eraser size={16} /> Erase</button>
              <button type="button" className={tool === 'restore' ? s.on : ''} onClick={() => setTool('restore')}><Brush size={16} /> Bring back</button>
            </div>
            <label className={s.slider}>
              <span>{tool === 'wand' ? 'How much it takes' : 'Brush size'}</span>
              {tool === 'wand'
                ? <input type="range" min={2} max={80} value={tol} onChange={e => setTol(+e.target.value)} onPointerUp={() => reAuto(tol)} onKeyUp={() => reAuto(tol)} />
                : <input type="range" min={4} max={60} value={size} onChange={e => setSize(+e.target.value)} />}
            </label>
            <div className={s.toolRow} role="group" aria-label="Cut it out again">
              <button type="button" className={how === 'smart' ? s.on : ''} onClick={() => smartAgain('quick')} disabled={busy}><Sparkles size={16} /> Smart cut</button>
              <button type="button" className={how === 'strong' ? s.on : ''} onClick={() => smartAgain('strong')} disabled={busy}><Zap size={16} /> Stronger cut</button>
              <button type="button" className={how === 'colour' ? s.on : ''} onClick={() => reAuto(tol)} disabled={busy}><Palette size={16} /> Colour cut</button>
            </div>
            {cutting && <p className={s.hint}><LoaderCircle size={16} className={s.spin} /> {cutting === 'strong' ? 'Running the stronger cut. The first time it downloads 44 MB, then it is saved on this device.' : 'Cutting it out'}</p>}
            <div className={s.toolRow}>
              <button type="button" onClick={doUndo} disabled={!undoN || busy}><Undo2 size={16} /> Undo</button>
              <button type="button" onClick={keepAll} disabled={busy}><RotateCcw size={16} /> Keep whole photo</button>
            </div>
            <p className={s.hint}>{how !== 'colour' ? 'Smart cut finds the piece by itself, on this device. If it missed a bit, try the stronger cut, or touch it up with the tools above. ' : ''}{tool === 'wand' ? 'Tap any bit of background that is still there. Moving the slider redoes the colour cut.' : tool === 'erase' ? 'Paint over anything that should go.' : 'Paint over any part of the piece that went missing.'}</p>
          </div>
          {err && <p className={s.err}>{err}</p>}
          <div className={s.footer}>
            <Btn variant="ghost" onClick={() => { setImg(null); setStep('pick'); }}>Different photo</Btn>
            <Btn onClick={next} disabled={busy}>{side === 'front' ? 'Next: the back' : mode === 'back' ? (busy ? 'Saving' : 'Save the back') : 'Looks good'}</Btn>
          </div>
        </div>
      )}

      {step === 'details' && result && (
        <div className={s.details}>
          <div className={s.twoSides}>
            {front && (
              <div className={s.checker}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={front.url} alt="The front" className={s.preview} /><small>Front</small>
              </div>
            )}
            <div className={s.checker}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.url} alt="The back" className={s.preview} /><small>Back</small>
            </div>
          </div>
          <div className={s.fields}>
            <label className={s.field}><span>Name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Black denim jacket" maxLength={80} /></label>
            <div className={s.field}><span>What is it?</span>
              <div className={s.catRow}>{CLOSET_CATEGORIES.map(c => <button key={c.id} type="button" className={cat === c.id ? s.on : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}</div>
            </div>
            <label className={s.field}><span>Tags (optional, comma separated)</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="work, summer, favourite" maxLength={200} /></label>
            {err && <p className={s.err}>{err}</p>}
            <div className={s.footer}>
              <Btn variant="ghost" onClick={() => setStep('cut')} disabled={busy}>Redo the back</Btn>
              <Btn onClick={finish} disabled={busy}>{busy ? 'Saving' : 'Add to closet'}</Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
