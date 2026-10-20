'use client';
// Full-screen handwriting / drawing editor: toolbar, autosave, export.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Undo2, Redo2, PenLine, Pencil, Brush, Highlighter, Eraser, Hand, Maximize2, ZoomIn, ZoomOut,
  MoreHorizontal, Download, Trash2, Check, Loader2, CloudOff, Star, Film,
} from 'lucide-react';
import {
  type InkDoc, type InkTool, type InkBackground, type SketchSize, emptyDoc, emptyAnimation, asDoc, compactDoc, thumbnail, exportPng,
  INK_COLORS, HIGHLIGHT_COLORS, TOOLS, SKETCH_SIZES,
} from '@/lib/ink';
import { addDrawing, updateDrawing, getDrawing, deleteDrawing, type DbDrawing, type DrawingAttach, type DrawingKind } from '@/lib/db';
import { InkCanvas, type InkCanvasHandle, type InkSettings, type InkMode, type InkLayer, paperColors } from './InkCanvas';
import { Timeline, Player, exportGif } from './Animator';
import s from './ink.module.css';

const SETTINGS_KEY = 'yw-ink-settings';
type ToolPrefs = Record<InkTool, { color: string; size: number }>;
const DEFAULT_PREFS: ToolPrefs = {
  pen: { color: INK_COLORS[0], size: TOOLS.pen.sizes[1] },
  pencil: { color: INK_COLORS[0], size: TOOLS.pencil.sizes[1] },
  marker: { color: INK_COLORS[1], size: TOOLS.marker.sizes[1] },
  highlighter: { color: HIGHLIGHT_COLORS[0], size: TOOLS.highlighter.sizes[1] },
};
const TOOL_ICONS: Record<InkMode, typeof PenLine> = { pen: PenLine, pencil: Pencil, marker: Brush, highlighter: Highlighter, eraser: Eraser };

function loadPrefs(): { mode: InkMode; prefs: ToolPrefs; eraser: 'precise' | 'stroke'; finger: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { mode: raw.mode ?? 'pen', prefs: { ...DEFAULT_PREFS, ...(raw.prefs ?? {}) }, eraser: raw.eraser ?? 'precise', finger: !!raw.finger };
  } catch { return { mode: 'pen', prefs: DEFAULT_PREFS, eraser: 'precise', finger: false }; }
}

export interface InkSheetProps {
  /** Existing drawing to open; leave out for a new one. */
  id?: string | null;
  kind: DrawingKind;
  /** For a new sketch: the canvas shape. */
  size?: SketchSize;
  attach?: { type: DrawingAttach; id: string };
  /** Shown in the header (e.g. the journal entry's title). */
  context?: string;
  /** View only: no pens, no editing. */
  readOnly?: boolean;
  onClose: (saved: DbDrawing | null) => void;
}

export default function InkSheet({ id: initialId, kind, size = 'landscape', attach, context, readOnly, onClose }: InkSheetProps) {
  const [id, setId] = useState<string | null>(initialId ?? null);
  const isAnim = kind === 'animation';
  const [doc, setDoc] = useState<InkDoc | null>(initialId ? null : isAnim ? emptyAnimation(size) : emptyDoc(kind, size));
  // Animation: which frame is being drawn, background layer or frame, and playback.
  const [frame, setFrame] = useState(0);
  const [layer, setLayer] = useState<'frame' | 'bg'>('frame');
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [row, setRow] = useState<DbDrawing | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [{ mode, prefs, eraser, finger }, setTools] = useState(() => typeof window === 'undefined'
    ? { mode: 'pen' as InkMode, prefs: DEFAULT_PREFS, eraser: 'precise' as const, finger: false } : loadPrefs());
  const [penSeen, setPenSeen] = useState(() => { try { return localStorage.getItem('yw-ink-pen-seen') === '1'; } catch { return false; } });
  const [mounted, setMounted] = useState(false);
  const canvas = useRef<InkCanvasHandle>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastThumb = useRef(0);
  const docRef = useRef(doc);
  const idRef = useRef(id);
  const titleRef = useRef(title);
  const saving = useRef<Promise<void> | null>(null);

  useEffect(() => { docRef.current = doc; idRef.current = id; titleRef.current = title; });
  useEffect(() => { setMounted(true); }, []);

  // Load an existing drawing.
  useEffect(() => {
    if (!initialId) return;
    let cancelled = false;
    getDrawing(initialId).then(r => {
      if (cancelled) return;
      if (!r) { onClose(null); return; }
      setRow(r); setTitle(r.title); setDoc(asDoc(r.doc, r.kind));
    }).catch(() => !cancelled && setStatus('error'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, prefs, eraser, finger })); } catch { /* ignore */ }
  }, [mode, prefs, eraser, finger]);

  // Lock the page behind the editor.
  useEffect(() => {
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, []);

  const save = useCallback(async (withThumb: boolean) => {
    const d = docRef.current; if (!d || !dirty.current) return;
    if (saving.current) await saving.current;
    if (!dirty.current) return;
    dirty.current = false;
    setStatus('saving');
    const job = (async () => {
      const body = compactDoc(d);
      const tkind = kind === 'note' ? 'note' : 'sketch';
      const thumb = withThumb || Date.now() - lastThumb.current > 6000 ? thumbnail(d, tkind) : undefined;
      if (thumb !== undefined) lastThumb.current = Date.now();
      try {
        if (!idRef.current) {
          if (!d.strokes.length && !d.anim?.frames.some(f => f.strokes.length)) { setStatus('idle'); return; }
          const r = await addDrawing({ kind, title: titleRef.current.trim(), doc: body, thumb: thumb ?? thumbnail(d, tkind), attached_type: attach?.type ?? null, attached_id: attach?.id ?? null });
          idRef.current = r.id; setId(r.id); setRow(r);
        } else {
          const r = await updateDrawing(idRef.current, { doc: body, title: titleRef.current.trim(), ...(thumb !== undefined ? { thumb } : {}) });
          setRow(r);
        }
        setStatus('saved');
      } catch {
        dirty.current = true; setStatus('error');
      }
    })();
    saving.current = job;
    await job;
    saving.current = null;
  }, [kind, attach]);

  const onChange = useCallback((d: InkDoc) => {
    setDoc(d); docRef.current = d; dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(false), d.anim ? 1600 : 900);
  }, [save]);

  // Animation: the canvas edits one frame (or the background); map its changes back into the document.
  const fr = doc?.anim ? Math.min(frame, doc.anim.frames.length - 1) : 0;
  const canvasDoc: InkDoc | null = !doc ? null : !doc.anim ? doc
    : { ...doc, strokes: layer === 'bg' ? doc.strokes : doc.anim.frames[fr].strokes };
  const onCanvasChange = useCallback((d: InkDoc) => {
    const cur = docRef.current;
    if (!cur?.anim) { onChange(d); return; }
    if (layer === 'bg') { onChange({ ...cur, strokes: d.strokes }); return; }
    const frames = cur.anim.frames.map((f, i) => (i === fr ? { ...f, strokes: d.strokes } : f));
    onChange({ ...cur, anim: { ...cur.anim, frames } });
  }, [onChange, layer, fr]);
  let under: InkLayer[] | undefined, over: InkLayer[] | undefined;
  if (doc?.anim) {
    const fs = doc.anim.frames;
    if (layer === 'frame') {
      under = [{ strokes: doc.strokes }];
      if (doc.anim.onion) {
        if (fr > 1) under.push({ strokes: fs[fr - 2].strokes, alpha: 0.12, tint: '#f87171' });
        if (fr > 0) under.push({ strokes: fs[fr - 1].strokes, alpha: 0.3, tint: '#f87171' });
        if (fr < fs.length - 1) under.push({ strokes: fs[fr + 1].strokes, alpha: 0.22, tint: '#4ade80' });
      }
    } else {
      over = [{ strokes: fs[fr].strokes, alpha: 0.3 }];
    }
  }

  const saveGif = async () => {
    if (!doc?.anim || exporting) return;
    setExporting(true);
    try {
      const blob = await exportGif(doc);
      const name = `${(title || 'animation').replace(/[^\w\- ]+/g, '').trim() || 'animation'}.gif`;
      const file = new File([blob], name, { type: 'image/gif' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return; } catch { /* cancelled */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally { setExporting(false); }
  };

  const close = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (docRef.current && idRef.current) dirty.current = true;     // refresh the preview on the way out
    await save(true);
    const r = idRef.current ? await getDrawing(idRef.current).catch(() => null) : null;
    onClose(r ?? row);
  }, [save, onClose, row]);

  // Save if the tab is hidden or closed mid-drawing.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !menu) { close(); return; }
      const n = docRef.current?.anim?.frames.length;
      if (!n || (e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setLayer('frame'); setFrame(f => Math.max(0, f - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); setLayer('frame'); setFrame(f => Math.min(n - 1, f + 1)); }
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, menu]);

  const tool: InkTool = mode === 'eraser' ? 'pen' : mode;
  const settings: InkSettings = { mode, color: prefs[tool].color, size: prefs[tool].size, eraser, finger };
  const setPref = (patch: Partial<{ color: string; size: number }>) =>
    setTools(t => ({ ...t, prefs: { ...t.prefs, [tool]: { ...t.prefs[tool], ...patch } } }));
  const pickMode = (m: InkMode) => setTools(t => ({ ...t, mode: m }));

  const setBg = (bg: InkBackground) => { if (doc) onChange({ ...doc, bg }); };
  const setPaper = (paper: 'dark' | 'light') => {
    if (!doc) return;
    const next: InkDoc = { ...doc, paper: paper === 'light' ? 'light' : undefined };
    onChange(next);
    // Pick a pen colour that shows on the new paper.
    setTools(t => {
      const p = { ...t.prefs };
      for (const k of ['pen', 'pencil'] as InkTool[]) {
        if (paper === 'light' && p[k].color === INK_COLORS[0]) p[k] = { ...p[k], color: '#1c1420' };
        if (paper === 'dark' && p[k].color === '#1c1420') p[k] = { ...p[k], color: INK_COLORS[0] };
      }
      return { ...t, prefs: p };
    });
  };

  const exportImage = async () => {
    if (!doc) return;
    const blob = await exportPng(doc);
    if (!blob) return;
    const name = `${(title || (kind === 'note' ? 'handwriting' : 'drawing')).replace(/[^\w\- ]+/g, '').trim() || 'drawing'}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch { /* cancelled */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const remove = async () => {
    clearTimeout(saveTimer.current); dirty.current = false;
    if (idRef.current) await deleteDrawing(idRef.current).catch(() => {});
    onClose(null);
  };

  const toggleFav = async () => {
    if (!idRef.current || !row) return;
    const r = await updateDrawing(idRef.current, { favourite: !row.favourite }).catch(() => null);
    if (r) setRow(r);
  };

  const colors = tool === 'highlighter' ? HIGHLIGHT_COLORS : doc && paperColors(doc).light
    ? ['#1c1420', ...INK_COLORS.slice(1, -1)] : INK_COLORS.slice(0, -1);
  const statusEl = status === 'saving' ? <><Loader2 size={14} className={s.spin} /> Saving</>
    : status === 'saved' ? <><Check size={14} /> Saved</>
    : status === 'error' ? <><CloudOff size={14} /> Not saved, retrying</> : null;

  useEffect(() => {
    if (status !== 'error') return;
    const t = setTimeout(() => { dirty.current = true; save(false); }, 4000);
    return () => clearTimeout(t);
  }, [status, save]);

  if (!mounted) return null;
  return createPortal(
    <div className={s.sheet} role="dialog" aria-modal="true" aria-label={kind === 'note' ? 'Handwriting' : 'Drawing'}>
      <header className={s.head}>
        <button type="button" className={s.done} onClick={close}><X size={18} /> Done</button>
        <div className={s.titleBox}>
          {kind !== 'note' && !readOnly ? (
            <input className={s.titleInput} value={title} placeholder={isAnim ? 'Untitled animation' : 'Untitled drawing'} aria-label={isAnim ? 'Animation name' : 'Drawing name'}
              onChange={e => { setTitle(e.target.value); dirty.current = true; clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => save(false), 900); }} />
          ) : (
            <span className={s.titleText}>{kind !== 'note' && title ? <b>{title}</b> : context ? <>Handwriting · <b>{context}</b></> : 'Handwriting'}</span>
          )}
          <span className={`${s.status} ${status === 'error' ? s.statusErr : ''}`} aria-live="polite">{statusEl}</span>
        </div>
        <div className={s.headBtns}>
          {!readOnly && <button type="button" className={s.iconBtn} onClick={() => canvas.current?.undo()} disabled={!hist.undo} aria-label="Undo" title="Undo"><Undo2 size={19} /></button>}
          {!readOnly && <button type="button" className={s.iconBtn} onClick={() => canvas.current?.redo()} disabled={!hist.redo} aria-label="Redo" title="Redo"><Redo2 size={19} /></button>}
          <button type="button" className={s.iconBtn} onClick={() => setMenu(m => !m)} aria-label="More" aria-expanded={menu}><MoreHorizontal size={19} /></button>
        </div>
        {menu && doc && (
          <div className={s.menu} role="menu">
            {!readOnly && <>
            <div className={s.menuLbl}>Page</div>
            <div className={s.seg}>
              {(['blank', 'lined', 'grid', 'dots'] as InkBackground[]).map(b => (
                <button key={b} type="button" className={doc.bg === b ? s.segOn : ''} onClick={() => setBg(b)}>{b[0].toUpperCase() + b.slice(1)}</button>
              ))}
            </div>
            <div className={s.seg}>
              <button type="button" className={doc.paper !== 'light' ? s.segOn : ''} onClick={() => setPaper('dark')}>Dark paper</button>
              <button type="button" className={doc.paper === 'light' ? s.segOn : ''} onClick={() => setPaper('light')}>Light paper</button>
            </div>
            {penSeen && (
              <label className={s.menuRow}>
                <input type="checkbox" checked={finger} onChange={e => setTools(t => ({ ...t, finger: e.target.checked }))} />
                <Hand size={16} /> Draw with finger too
              </label>
            )}
            </>}
            {isAnim && <button type="button" className={s.menuRow} onClick={() => { setMenu(false); saveGif(); }} disabled={exporting}><Film size={16} /> {exporting ? 'Making the GIF…' : 'Save as GIF'}</button>}
            <button type="button" className={s.menuRow} onClick={() => { setMenu(false); exportImage(); }}><Download size={16} /> {isAnim ? 'Save first frame as image' : 'Save as image'}</button>
            {kind !== 'note' && row && <button type="button" className={s.menuRow} onClick={() => { setMenu(false); toggleFav(); }}><Star size={16} fill={row.favourite ? 'currentColor' : 'none'} /> {row.favourite ? 'Unfavourite' : 'Favourite'}</button>}
            {!readOnly && (id || doc.strokes.length > 0 || !!doc.anim) && (confirmDelete
              ? <button type="button" className={`${s.menuRow} ${s.danger}`} onClick={remove}><Trash2 size={16} /> Tap again to delete</button>
              : <button type="button" className={`${s.menuRow} ${s.danger}`} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete {kind === 'note' ? 'page' : isAnim ? 'animation' : 'drawing'}</button>)}
          </div>
        )}
      </header>

      <div className={s.stage} onPointerDown={() => { if (menu) { setMenu(false); setConfirmDelete(false); } }}>
        {canvasDoc ? (
          <InkCanvas ref={canvas} doc={canvasDoc} kind={kind === 'note' ? 'note' : 'sketch'} settings={settings} onChange={onCanvasChange}
            onHistory={(u, r) => setHist({ undo: u, redo: r })} onPenSeen={() => setPenSeen(true)} readOnly={readOnly || playing}
            under={under} over={over} layerKey={doc?.anim ? `${layer}:${doc.anim.frames[fr]?.id}` : undefined} />
        ) : (
          <div className={s.loading}><Loader2 size={22} className={s.spin} /> Opening…</div>
        )}
        {playing && doc?.anim && <Player doc={doc} startAt={fr} />}
        {doc?.anim && layer === 'bg' && !playing && <div className={s.layerBadge}>Drawing the background: it shows under every frame</div>}
        <div className={s.zoom}>
          <button type="button" onClick={() => canvas.current?.zoomBy(1.25)} aria-label="Zoom in"><ZoomIn size={17} /></button>
          <button type="button" onClick={() => canvas.current?.zoomBy(0.8)} aria-label="Zoom out"><ZoomOut size={17} /></button>
          <button type="button" onClick={() => canvas.current?.fit()} aria-label="Fit to screen"><Maximize2 size={16} /></button>
        </div>
      </div>

      {doc?.anim && !readOnly && (
        <Timeline doc={doc} frame={fr} layer={layer} playing={playing}
          onFrame={setFrame} onLayer={setLayer} onPlay={setPlaying}
          onDoc={(d, f) => { onChange(d); if (f !== undefined) setFrame(f); }} />
      )}
      {!readOnly && <div className={`${s.toolbar} ${isAnim ? s.toolbarDocked : ''}`} role="toolbar" aria-label="Pens">
        <div className={s.tools}>
          {(['pen', 'pencil', 'marker', 'highlighter', 'eraser'] as InkMode[]).map(m => {
            const Icon = TOOL_ICONS[m];
            const col = m === 'eraser' ? undefined : prefs[m as InkTool].color;
            return (
              <button key={m} type="button" className={`${s.tool} ${mode === m ? s.toolOn : ''}`} onClick={() => pickMode(m)}
                aria-pressed={mode === m} aria-label={m === 'eraser' ? 'Eraser' : TOOLS[m as InkTool].label} title={m === 'eraser' ? 'Eraser' : TOOLS[m as InkTool].label}>
                <Icon size={20} />
                {col && <i className={s.toolTip} style={{ background: col }} />}
              </button>
            );
          })}
        </div>
        <span className={s.sep} />
        {mode === 'eraser' ? (
          <div className={s.seg} role="group" aria-label="Eraser">
            <button type="button" className={eraser === 'precise' ? s.segOn : ''} onClick={() => setTools(t => ({ ...t, eraser: 'precise' }))}>Precise</button>
            <button type="button" className={eraser === 'stroke' ? s.segOn : ''} onClick={() => setTools(t => ({ ...t, eraser: 'stroke' }))}>Whole stroke</button>
          </div>
        ) : (
          <>
            <div className={s.swatches} role="radiogroup" aria-label="Colour">
              {colors.map(c => (
                <button key={c} type="button" role="radio" aria-checked={settings.color === c} aria-label={`Colour ${c}`}
                  className={`${s.swatch} ${settings.color === c ? s.swatchOn : ''}`} style={{ background: c }} onClick={() => setPref({ color: c })} />
              ))}
              <label className={s.custom} title="Any colour" aria-label="Pick any colour">
                <input type="color" value={settings.color.length === 7 ? settings.color : '#ff8c00'} onChange={e => setPref({ color: e.target.value })} />
              </label>
            </div>
            <span className={s.sep} />
            <div className={s.sizes} role="radiogroup" aria-label="Size">
              {TOOLS[tool].sizes.map((z, i) => (
                <button key={z} type="button" role="radio" aria-checked={settings.size === z} aria-label={['Fine', 'Medium', 'Bold'][i]}
                  className={`${s.size} ${settings.size === z ? s.sizeOn : ''}`} onClick={() => setPref({ size: z })}>
                  <i style={{ width: 4 + i * 5, height: 4 + i * 5, background: settings.color }} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>}
      {!penSeen && !readOnly && (
        <p className={s.hint}>Your finger or an Apple Pencil both draw. Once you use a Pencil, fingers scroll and zoom instead.</p>
      )}
    </div>,
    document.body,
  );
}

export { SKETCH_SIZES };
