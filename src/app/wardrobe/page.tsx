'use client';
// Wardrobe: dress her avatar up in the built-in clothes or photos of her own, save outfits,
// and shape the avatar to look like her.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Camera, Shuffle, Shirt, Plus, Trash2, Star, Save, X, ArrowUp, ArrowDown, Sparkles, UserRound, Layers, Check } from 'lucide-react';
import { Btn, Topbar, EmptyState, Modal, ModalTitle, Confirm, Toast, useToast } from '@/components/ui';
import StoredImage from '@/components/ui/StoredImage';
import Avatar from '@/components/wardrobe/Avatar';
import { CLOSET_CATEGORIES, type CutoutResult } from '@/components/wardrobe/CutoutEditor';
import {
  getAvatarLook, saveAvatarLook, getClosetItems, addClosetItem, updateClosetItem, deleteClosetItem,
  getOutfits, addOutfit, updateOutfit, deleteOutfit, type DbClosetItem, type DbOutfit, type ClosetCategory,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { uploadImage, deleteImage, signedUrl, preloadSignedUrls } from '@/lib/upload';
import {
  Body, cleanLook, DEFAULT_LOOK, SKIN_TONES, HAIR_COLOURS, EYE_COLOURS, LIP_COLOURS, HAIR_STYLES, FACE_SHAPES, MEASURE, fromCm, toCm, type Look,
} from '@/lib/wardrobe/body';
import {
  CATALOGUE, SLOTS, PATTERNS, CLOTH_COLOURS, wear, putOn, cleanLayers, photoBox, randomOutfit, pieceSlot,
  type Layer, type Slot, type WornPiece, type PlacedPhoto, type PatternId,
} from '@/lib/wardrobe/garments';
import s from './wardrobe.module.css';

const CutoutEditor = dynamic(() => import('@/components/wardrobe/CutoutEditor'), { ssr: false });
const PhotoMatchDialog = dynamic(() => import('@/components/wardrobe/PhotoMatchDialog'), { ssr: false });

type Tab = 'dress' | 'closet' | 'outfits' | 'avatar';
type Shelf = Slot | 'closet';
const DRAFT_KEY = 'yw-wardrobe-draft';
const CROPS: Record<Slot, [number, number]> = {
  top: [200, 400], bottom: [410, 680], dress: [200, 880], outer: [200, 700], shoes: [960, 120], bag: [330, 560],
  hat: [66, 150], glasses: [130, 70], ears: [130, 90], neck: [190, 150], belt: [400, 130],
};
const SHAPE: { k: 'shoulders' | 'bust' | 'waist' | 'hips' | 'thighs'; name: string; lo: string; hi: string }[] = [
  { k: 'shoulders', name: 'Shoulders', lo: 'Narrow', hi: 'Broad' }, { k: 'bust', name: 'Bust', lo: 'Small', hi: 'Full' },
  { k: 'waist', name: 'Waist', lo: 'Small', hi: 'Wide' }, { k: 'hips', name: 'Hips', lo: 'Slim', hi: 'Curvy' },
  { k: 'thighs', name: 'Thighs', lo: 'Slim', hi: 'Thick' },
];
const FACE: { k: 'cheeks' | 'jaw' | 'eyeSize' | 'eyeGap' | 'eyeTilt' | 'noseWidth' | 'lipFull' | 'browThick' | 'browArch'; name: string; lo: string; hi: string }[] = [
  { k: 'cheeks', name: 'Cheekbones', lo: 'Soft', hi: 'High' }, { k: 'jaw', name: 'Jaw', lo: 'Narrow', hi: 'Wide' },
  { k: 'eyeSize', name: 'Eye size', lo: 'Smaller', hi: 'Bigger' }, { k: 'eyeGap', name: 'Eye spacing', lo: 'Close', hi: 'Wide' },
  { k: 'eyeTilt', name: 'Eye tilt', lo: 'Down', hi: 'Up' }, { k: 'noseWidth', name: 'Nose', lo: 'Narrow', hi: 'Wide' },
  { k: 'lipFull', name: 'Lips', lo: 'Thin', hi: 'Full' }, { k: 'browThick', name: 'Brows', lo: 'Thin', hi: 'Thick' },
  { k: 'browArch', name: 'Brow arch', lo: 'Straight', hi: 'Arched' },
];
const MEASURES = [{ k: 'bust', cm: 'bustCm', name: 'Bust' }, { k: 'waist', cm: 'waistCm', name: 'Waist' }, { k: 'hips', cm: 'hipsCm', name: 'Hips' }] as const;
const pieceName = (id: string) => CATALOGUE.find(c => c.id === id)?.name ?? 'Piece';
const imageAspect = (url: string) => new Promise<number>(res => {
  const im = new Image();
  im.onload = () => res(im.naturalWidth ? im.naturalHeight / im.naturalWidth : 1);
  im.onerror = () => res(1);
  im.src = url;
});

export default function WardrobePage() {
  const [tab, setTab] = useState<Tab>('dress');
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [items, setItems] = useState<DbClosetItem[]>([]);
  const [outfits, setOutfits] = useState<DbOutfit[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [shelf, setShelf] = useState<Shelf>('top');
  const [outfitId, setOutfitId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [matching, setMatching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<DbClosetItem | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; run: () => void } | null>(null);
  const [toast, showToast] = useToast();
  const lookEdited = useRef(0);
  const draftRead = useRef(false);

  // ─── Loading ───────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      if (!(await ensureSession())) return;
      const [lk, its, ofs] = await Promise.all([getAvatarLook(), getClosetItems(), getOutfits()]);
      // Don't overwrite the avatar while she is in the middle of changing it.
      if (Date.now() - lookEdited.current > 3000) setLook(cleanLook(lk ?? DEFAULT_LOOK));
      setItems(its); setOutfits(ofs);
      await preloadSignedUrls(its.map(i => i.image_path));
      const pairs = await Promise.all(its.map(async i => [i.id, await signedUrl(i.image_path)] as const));
      setUrls(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p[1])));
    } catch { /* offline: keep what's shown */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveTables(['avatars', 'closet_items', 'outfits'], load);

  // The outfit she is putting together survives a reload (on this device).
  useEffect(() => {
    const t = setTimeout(() => {
      try { const raw = localStorage.getItem(DRAFT_KEY); if (raw) setLayers(cleanLayers(JSON.parse(raw))); } catch { /* ignore */ }
      draftRead.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!draftRead.current) return;   // don't save the empty start over the saved draft
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(layers)); } catch { /* ignore */ }
  }, [layers]);

  // ─── Avatar look (saved automatically) ─────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [lookSaved, setLookSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const editLook = (patch: Partial<Look>) => {
    lookEdited.current = Date.now();
    const next = { ...look, ...patch };
    setLook(next);
    clearTimeout(saveTimer.current);
    setLookSaved('saving');
    saveTimer.current = setTimeout(() => {
      saveAvatarLook(next as unknown as Record<string, unknown>).then(() => setLookSaved('saved'), () => setLookSaved('error'));
    }, 700);
  };

  // ─── Dressing ──────────────────────────────────────────────
  const body = useMemo(() => new Body(look), [look]);
  const selected = sel !== null ? layers[sel] ?? null : null;
  const putOnPiece = (id: string) => {
    const w = wear(id);
    if (!w) return;
    const next = putOn(layers, w);
    setLayers(next); setSel(next.length - 1);
  };
  const wearPhoto = async (item: DbClosetItem) => {
    const url = urls[item.id];
    const box = photoBox(body, item.category, url ? await imageAspect(url) : 1);
    const p: PlacedPhoto = { kind: 'photo', item: item.id, ...box, rot: 0 };
    const next = [...layers, p];
    setLayers(next); setSel(next.length - 1);
    setTab('dress');
  };
  const change = (i: number, patch: Partial<WornPiece> | Partial<PlacedPhoto>) =>
    setLayers(prev => prev.map((l, k) => k === i ? { ...l, ...patch } as Layer : l));
  const remove = (i: number) => { setLayers(prev => prev.filter((_, k) => k !== i)); setSel(null); };
  const random = () => { const next = randomOutfit(Math.random); setLayers(next); setSel(null); setOutfitId(null); };

  // Dragging a closet photo around on the avatar.
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ i: number; dx: number; dy: number } | null>(null);
  const toSvg = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const onPhotoDown = (i: number, e: React.PointerEvent<SVGGElement>) => {
    const l = layers[i];
    if (l?.kind !== 'photo') return;
    e.preventDefault();
    setSel(i);
    const p = toSvg(e);
    dragging.current = { i, dx: p.x - l.x, dy: p.y - l.y };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onStageMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d) return;
    const p = toSvg(e);
    change(d.i, { x: Math.round(p.x - d.dx), y: Math.round(p.y - d.dy) });
  };
  const onStageUp = () => { dragging.current = null; };

  // ─── Closet ────────────────────────────────────────────────
  const addPiece = async (r: CutoutResult) => {
    const file = new File([r.blob], r.blob.type === 'image/webp' ? 'piece.webp' : 'piece.png', { type: r.blob.type });
    const path = await uploadImage(file, 'closet');
    try {
      const item = await addClosetItem({ name: r.name, category: r.category, image_path: path, color: r.color, tags: r.tags });
      setItems(prev => [item, ...prev]);
      const url = await signedUrl(path);
      if (url) setUrls(prev => ({ ...prev, [item.id]: url }));
      setAdding(false);
      showToast('Added to your closet');
    } catch (e) { await deleteImage(path); throw e; }
  };
  const removeItem = (item: DbClosetItem) => setConfirm({
    msg: `Remove "${item.name}" from your closet? Outfits that use it will show without it.`,
    run: async () => {
      setConfirm(null); setEditItem(null);
      try {
        await deleteClosetItem(item.id); await deleteImage(item.image_path);
        setItems(prev => prev.filter(x => x.id !== item.id));
        setLayers(prev => prev.filter(l => l.kind !== 'photo' || l.item !== item.id)); setSel(null);
      } catch { showToast("Couldn't remove it", 'var(--red)'); }
    },
  });

  // ─── Outfits ───────────────────────────────────────────────
  const [naming, setNaming] = useState<{ name: string } | null>(null);
  const current = outfits.find(o => o.id === outfitId) ?? null;
  const saveOutfit = async (asNew: boolean) => {
    if (!layers.length || !naming) return;
    setSaving(true);
    try {
      const name = naming.name.trim() || 'My outfit';
      if (current && !asNew) {
        const o = await updateOutfit(current.id, { name, layers });
        setOutfits(prev => prev.map(x => x.id === o.id ? o : x));
      } else {
        const o = await addOutfit({ name, layers });
        setOutfits(prev => [o, ...prev]); setOutfitId(o.id);
      }
      setNaming(null); showToast('Outfit saved');
    } catch { showToast("Couldn't save the outfit", 'var(--red)'); } finally { setSaving(false); }
  };
  const wearOutfit = (o: DbOutfit) => { setLayers(cleanLayers(o.layers)); setSel(null); setOutfitId(o.id); setTab('dress'); };
  const favOutfit = async (o: DbOutfit) => {
    setOutfits(prev => prev.map(x => x.id === o.id ? { ...x, favourite: !o.favourite } : x));
    try { await updateOutfit(o.id, { favourite: !o.favourite }); } catch { load(); }
  };
  const removeOutfit = (o: DbOutfit) => setConfirm({
    msg: `Delete the outfit "${o.name}"? The clothes stay in your closet.`,
    run: async () => {
      setConfirm(null);
      try { await deleteOutfit(o.id); setOutfits(prev => prev.filter(x => x.id !== o.id)); if (outfitId === o.id) setOutfitId(null); }
      catch { showToast("Couldn't delete it", 'var(--red)'); }
    },
  });

  // ─── Views ─────────────────────────────────────────────────
  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const layerName = (l: Layer) => l.kind === 'piece' ? pieceName(l.piece) : itemById.get(l.item)?.name ?? 'Closet piece';
  const sortedOutfits = useMemo(() => [...outfits].sort((a, b) => Number(b.favourite) - Number(a.favourite)), [outfits]);
  const [closetCat, setClosetCat] = useState<ClosetCategory | 'all'>('all');
  const shownItems = closetCat === 'all' ? items : items.filter(i => i.category === closetCat);

  const tabs: [Tab, string, React.ReactNode][] = [
    ['dress', 'Dress up', <Shirt key="d" size={16} />], ['closet', 'My closet', <Layers key="c" size={16} />],
    ['outfits', 'Outfits', <Star key="o" size={16} />], ['avatar', 'My avatar', <UserRound key="a" size={16} />],
  ];

  return (
    <div className={s.page}>
      <Topbar title="Wardrobe" sub={loading ? 'Opening your wardrobe'
        : `${CATALOGUE.length} pieces to try${items.length ? `, ${items.length} of your own` : ''}${outfits.length ? `, ${outfits.length} saved ${outfits.length === 1 ? 'outfit' : 'outfits'}` : ''}`} />
      <div className={s.wrap}>
        <div className={s.tabs} role="tablist">
          {tabs.map(([k, label, icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? s.tabOn : ''} onClick={() => setTab(k)}>{icon}{label}</button>
          ))}
        </div>

        {tab === 'dress' && (
          <div className={s.dress}>
            <div className={s.stage} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageUp}>
              <Avatar look={look} layers={layers} photos={urls} animate selected={selected?.kind === 'photo' ? sel : null}
                onPhotoDown={onPhotoDown} svgRef={svgRef} className={s.stageAvatar} label="Your avatar wearing the outfit" />
              <div className={s.stageBar}>
                <Btn sm variant="ghost" onClick={random}><Shuffle size={15} /> Surprise me</Btn>
                <Btn sm variant="ghost" onClick={() => { setLayers([]); setSel(null); setOutfitId(null); }} disabled={!layers.length}><X size={15} /> Take it all off</Btn>
                <Btn sm onClick={() => setNaming({ name: current?.name ?? '' })} disabled={!layers.length}><Save size={15} /> Save outfit</Btn>
              </div>
            </div>

            <div className={s.panel}>
              {layers.length > 0 && (
                <section className={s.section}>
                  <h3>Wearing{current ? <small> · {current.name}</small> : null}</h3>
                  <div className={s.wearing}>
                    {layers.map((l, i) => (
                      <span key={i} className={`${s.chip} ${sel === i ? s.chipOn : ''}`}>
                        <button type="button" onClick={() => setSel(sel === i ? null : i)}>
                          {l.kind === 'piece' ? <i style={{ background: l.color }} /> : <i className={s.photoDot} />}{layerName(l)}
                        </button>
                        <button type="button" aria-label={`Take off ${layerName(l)}`} onClick={() => remove(i)}><X size={13} /></button>
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {selected?.kind === 'piece' && sel !== null && (
                <PieceEditor w={selected} onChange={p => change(sel, p)} />
              )}
              {selected?.kind === 'photo' && sel !== null && (
                <section className={s.section}>
                  <h3>{layerName(selected)} <small>· drag it on the avatar to move it</small></h3>
                  <label className={s.range}><span>Size</span>
                    <input type="range" min={30} max={260} value={Math.round(selected.w / photoBox(body, itemById.get(selected.item)?.category ?? 'top', selected.h / selected.w).w * 100)}
                      onChange={e => {
                        const k = +e.target.value / 100, base = photoBox(body, itemById.get(selected.item)?.category ?? 'top', selected.h / selected.w);
                        const w = base.w * k, h = base.h * k;
                        change(sel, { w, h, x: selected.x + (selected.w - w) / 2, y: selected.y + (selected.h - h) / 2 });
                      }} /></label>
                  <label className={s.range}><span>Turn</span>
                    <input type="range" min={-45} max={45} value={selected.rot} onChange={e => change(sel, { rot: +e.target.value })} /></label>
                  <div className={s.row}>
                    <Btn sm variant="ghost" onClick={() => change(sel, { z: Math.min(99, selected.z + 6) })}><ArrowUp size={14} /> In front</Btn>
                    <Btn sm variant="ghost" onClick={() => change(sel, { z: Math.max(0, selected.z - 6) })}><ArrowDown size={14} /> Behind</Btn>
                    <Btn sm variant="danger" onClick={() => remove(sel)}><X size={14} /> Take off</Btn>
                  </div>
                </section>
              )}

              <section className={s.section}>
                <div className={s.shelves}>
                  {SLOTS.map(sl => <button key={sl.id} type="button" className={shelf === sl.id ? s.on : ''} onClick={() => setShelf(sl.id)}>{sl.name}</button>)}
                  <button type="button" className={`${s.mine} ${shelf === 'closet' ? s.on : ''}`} onClick={() => setShelf('closet')}><Sparkles size={14} /> My closet</button>
                </div>
                {shelf === 'closet' ? (
                  items.length ? (
                    <div className={s.grid}>
                      {items.map(it => (
                        <button key={it.id} type="button" className={s.tile} onClick={() => wearPhoto(it)} title={`Wear ${it.name}`}>
                          <StoredImage src={it.image_path} alt={it.name} className={s.tileImg} />
                          <span>{it.name}</span>
                        </button>
                      ))}
                      <button type="button" className={`${s.tile} ${s.addTile}`} onClick={() => setAdding(true)}><Plus size={22} /><span>Add a piece</span></button>
                    </div>
                  ) : (
                    <EmptyState icon={<Shirt size={28} />} msg="Take a photo of something you own and it will appear here to try on."
                      action={<Btn onClick={() => setAdding(true)}><Plus size={15} /> Add a piece</Btn>} />
                  )
                ) : (
                  <div className={s.grid}>
                    {CATALOGUE.filter(c => c.slot === shelf).map(c => {
                      const worn = layers.some(l => l.kind === 'piece' && l.piece === c.id);
                      return (
                        <button key={c.id} type="button" className={`${s.tile} ${worn ? s.tileOn : ''}`} onClick={() => worn ? remove(layers.findIndex(l => l.kind === 'piece' && l.piece === c.id)) : putOnPiece(c.id)}
                          aria-pressed={worn}>
                          <PieceThumb look={look} id={c.id} slot={c.slot} />
                          <span>{c.name}</span>
                          {worn && <Check size={14} className={s.tick} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === 'closet' && (
          <div className={s.col}>
            <div className={s.bar}>
              <div className={s.shelves}>
                <button type="button" className={closetCat === 'all' ? s.on : ''} onClick={() => setClosetCat('all')}>Everything</button>
                {CLOSET_CATEGORIES.map(c => <button key={c.id} type="button" className={closetCat === c.id ? s.on : ''} onClick={() => setClosetCat(c.id)}>{c.name}</button>)}
              </div>
              <Btn onClick={() => setAdding(true)}><Plus size={15} /> Add a piece</Btn>
            </div>
            {!items.length ? (
              <EmptyState icon={<Shirt size={28} />} msg="Your closet is empty. Take a photo of a piece of clothing, cut it out, and try it on your avatar."
                action={<Btn onClick={() => setAdding(true)}><Plus size={15} /> Add your first piece</Btn>} />
            ) : (
              <div className={s.bigGrid}>
                {shownItems.map(it => (
                  <button key={it.id} type="button" className={s.card} onClick={() => setEditItem(it)}>
                    <div className={s.cardArt}><StoredImage src={it.image_path} alt={it.name} /></div>
                    <div className={s.cardMeta}><b>{it.name}</b><small>{CLOSET_CATEGORIES.find(c => c.id === it.category)?.name}{it.tags.length ? ` · ${it.tags.join(', ')}` : ''}</small></div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'outfits' && (
          !outfits.length ? (
            <EmptyState icon={<Star size={28} />} msg="Outfits you save from Dress up live here."
              action={<Btn onClick={() => setTab('dress')}><Shirt size={15} /> Start dressing up</Btn>} />
          ) : (
            <div className={s.bigGrid}>
              {sortedOutfits.map(o => (
                <div key={o.id} className={s.card}>
                  <button type="button" className={s.outfitArt} onClick={() => wearOutfit(o)} aria-label={`Wear ${o.name}`}>
                    <Avatar look={look} layers={cleanLayers(o.layers)} photos={urls} label={o.name} />
                  </button>
                  <div className={s.cardMeta}>
                    <b>{o.name}</b>
                    <div className={s.row}>
                      <Btn sm onClick={() => wearOutfit(o)}><Shirt size={14} /> Wear</Btn>
                      <button type="button" className={`${s.iconBtn} ${o.favourite ? s.favOn : ''}`} onClick={() => favOutfit(o)} aria-label={o.favourite ? 'Unfavourite' : 'Favourite'} aria-pressed={o.favourite}><Star size={16} /></button>
                      <button type="button" className={s.iconBtn} onClick={() => removeOutfit(o)} aria-label={`Delete ${o.name}`}><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'avatar' && (
          <div className={s.dress}>
            <div className={s.stage}>
              <Avatar look={look} layers={layers} photos={urls} animate className={s.stageAvatar} label="Your avatar" />
              <p className={s.savedNote}>{lookSaved === 'saving' ? 'Saving…' : lookSaved === 'error' ? "Couldn't save. Check your connection." : 'Saved'}</p>
            </div>
            <div className={s.panel}>
              <section className={`${s.section} ${s.photoStart}`}>
                <div><h3>Make it look like you</h3><p className={s.label}>Pick a photo and the avatar takes your colouring and face shape. The photo never leaves this device.</p></div>
                <Btn onClick={() => setMatching(true)}><Camera size={15} /> Start from a photo</Btn>
              </section>
              <section className={s.section}><h3>Skin</h3>
                <Swatches colours={SKIN_TONES} value={look.skin} onPick={c => editLook({ skin: c })} custom /></section>
              <section className={s.section}><h3>Hair</h3>
                <div className={s.shelves}>{HAIR_STYLES.map(h => <button key={h.id} type="button" className={look.hair === h.id ? s.on : ''} onClick={() => editLook({ hair: h.id })}>{h.name}</button>)}</div>
                <Swatches colours={HAIR_COLOURS} value={look.hairColor} onPick={c => editLook({ hairColor: c })} custom /></section>
              <section className={s.section}><h3>Eyes</h3><Swatches colours={EYE_COLOURS} value={look.eyes} onPick={c => editLook({ eyes: c })} custom /></section>
              <section className={s.section}><h3>Lips</h3><Swatches colours={LIP_COLOURS} value={look.lips} onPick={c => editLook({ lips: c })} custom /></section>
              <section className={s.section}><h3>Face</h3>
                <div className={s.shelves}>{FACE_SHAPES.map(f => <button key={f.id} type="button" className={look.faceShape === f.id ? s.on : ''} onClick={() => editLook({ faceShape: f.id })}>{f.name}</button>)}</div>
                {FACE.map(fc => (
                  <label key={fc.k} className={s.range}><span>{fc.name}</span>
                    <span className={s.ends}><small>{fc.lo}</small><input type="range" min={0} max={100} value={Math.round(look[fc.k] * 100)} onChange={e => editLook({ [fc.k]: +e.target.value / 100 } as Partial<Look>)} /><small>{fc.hi}</small></span>
                  </label>
                ))}
              </section>
              <section className={s.section}><h3>Body</h3>
                <label className={s.range}><span>Height <b>{look.height} cm</b></span>
                  <input type="range" min={140} max={195} value={look.height} onChange={e => editLook({ height: +e.target.value })} /></label>
                <p className={s.label}>Know your measurements? Type them in (cm) and the body takes that exact shape. Or use the sliders.</p>
                <div className={s.measures}>
                  {MEASURES.map(mz => (
                    <label key={mz.k} className={s.field}><span>{mz.name}</span>
                      <input type="number" inputMode="numeric" min={40} max={170} value={look[mz.cm] ?? ''} placeholder={`about ${toCm(look[mz.k], MEASURE[mz.k])}`}
                        onChange={e => {
                          const v = e.target.value === '' ? null : Math.round(+e.target.value);
                          editLook(v === null || !isFinite(v) ? { [mz.cm]: null } as Partial<Look> : { [mz.cm]: v, [mz.k]: fromCm(v, MEASURE[mz.k]) } as Partial<Look>);
                        }} /></label>
                  ))}
                </div>
                {SHAPE.map(sh => (
                  <label key={sh.k} className={s.range}><span>{sh.name}</span>
                    <span className={s.ends}><small>{sh.lo}</small><input type="range" min={0} max={100} value={Math.round(look[sh.k] * 100)} onChange={e => editLook({ [sh.k]: +e.target.value / 100, ...(sh.k === 'bust' || sh.k === 'waist' || sh.k === 'hips' ? { [`${sh.k}Cm`]: null } : {}) } as Partial<Look>)} /><small>{sh.hi}</small></span>
                  </label>
                ))}
              </section>
              <section className={s.section}><h3>Little things</h3>
                <div className={s.shelves}>
                  {([['blush', 'Blush'], ['freckles', 'Freckles'], ['lashes', 'Lashes']] as const).map(([k, n]) =>
                    <button key={k} type="button" className={look[k] ? s.on : ''} aria-pressed={look[k]} onClick={() => editLook({ [k]: !look[k] } as Partial<Look>)}>{n}</button>)}
                </div>
                <h3>Underneath (shown when nothing else is on)</h3>
                <Swatches colours={['#e9ddd0', '#f4f1ea', '#111111', '#c8a27a', '#f7c6d3', '#9cc9ec']} value={look.basics} onPick={c => editLook({ basics: c })} custom />
                <div className={s.row}><Btn sm variant="ghost" onClick={() => editLook({ ...DEFAULT_LOOK })}>Start over</Btn></div>
              </section>
            </div>
          </div>
        )}
      </div>

      {adding && <CutoutEditor onClose={() => setAdding(false)} onSave={addPiece} />}
      {matching && <PhotoMatchDialog look={look} onClose={() => setMatching(false)} onApply={p => { editLook(p); showToast('Avatar updated from your photo'); }} />}
      {editItem && <ItemModal item={editItem} url={urls[editItem.id]} onClose={() => setEditItem(null)} onWear={() => { wearPhoto(editItem); setEditItem(null); }}
        onDelete={() => removeItem(editItem)} onSave={async patch => {
          try { const it = await updateClosetItem(editItem.id, patch); setItems(prev => prev.map(x => x.id === it.id ? it : x)); setEditItem(null); }
          catch { showToast("Couldn't save", 'var(--red)'); }
        }} />}
      {naming && (
        <Modal onClose={() => setNaming(null)}>
          <ModalTitle>Save this outfit</ModalTitle>
          <div className={s.saveBox}>
            <div className={s.savePreview}><Avatar look={look} layers={layers} photos={urls} /></div>
            <label className={s.field}><span>Name</span>
              <input autoFocus value={naming.name} onChange={e => setNaming({ name: e.target.value })} placeholder="e.g. Sunday brunch" maxLength={80}
                onKeyDown={e => { if (e.key === 'Enter') saveOutfit(false); }} /></label>
            <div className={s.row}>
              {current && <Btn variant="ghost" onClick={() => saveOutfit(true)} disabled={saving}>Save as new</Btn>}
              <Btn onClick={() => saveOutfit(false)} disabled={saving}>{saving ? 'Saving' : current ? `Update "${current.name}"` : 'Save'}</Btn>
            </div>
          </div>
        </Modal>
      )}
      {confirm && <Confirm msg={confirm.msg} onConfirm={confirm.run} onCancel={() => setConfirm(null)} />}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}

function PieceThumb({ look, id, slot }: { look: Look; id: string; slot: Slot }) {
  const layers = useMemo(() => { const w = wear(id); return w ? [w] : []; }, [id]);
  return <Avatar look={look} layers={layers} crop={CROPS[slot]} className={s.thumb} label="" />;
}

function Swatches({ colours, value, onPick, custom }: { colours: string[]; value: string; onPick: (c: string) => void; custom?: boolean }) {
  return (
    <div className={s.swatches}>
      {colours.map(c => <button key={c} type="button" className={value === c ? s.swOn : ''} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} aria-pressed={value === c} />)}
      {custom && <label className={s.customSw} title="Any colour"><input type="color" value={value} onChange={e => onPick(e.target.value)} aria-label="Pick any colour" /></label>}
    </div>
  );
}

function PieceEditor({ w, onChange }: { w: WornPiece; onChange: (p: Partial<WornPiece>) => void }) {
  return (
    <section className={s.section}>
      <h3>{pieceName(w.piece)} <small>· {pieceSlot(w.piece) && SLOTS.find(x => x.id === pieceSlot(w.piece))?.name}</small></h3>
      <Swatches colours={CLOTH_COLOURS} value={w.color} onPick={c => onChange({ color: c })} custom />
      <div className={s.shelves}>
        {PATTERNS.map(p => <button key={p.id} type="button" className={w.pattern === p.id ? s.on : ''} onClick={() => onChange({ pattern: p.id as PatternId })}>{p.name}</button>)}
      </div>
      {w.pattern !== 'solid' && <><small className={s.label}>Pattern colour</small><Swatches colours={CLOTH_COLOURS} value={w.color2} onPick={c => onChange({ color2: c })} custom /></>}
    </section>
  );
}

function ItemModal({ item, url, onClose, onWear, onDelete, onSave }: {
  item: DbClosetItem; url?: string; onClose: () => void; onWear: () => void; onDelete: () => void;
  onSave: (p: Partial<Pick<DbClosetItem, 'name' | 'category' | 'tags'>>) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [cat, setCat] = useState<ClosetCategory>(item.category);
  const [tags, setTags] = useState(item.tags.join(', '));
  return (
    <Modal onClose={onClose}>
      <ModalTitle>{item.name}</ModalTitle>
      <div className={s.saveBox}>
        <div className={s.itemArt}>{url ? <StoredImage src={item.image_path} alt={item.name} /> : null}</div>
        <label className={s.field}><span>Name</span><input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></label>
        <div className={s.shelves}>{CLOSET_CATEGORIES.map(c => <button key={c.id} type="button" className={cat === c.id ? s.on : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}</div>
        <label className={s.field}><span>Tags</span><input value={tags} onChange={e => setTags(e.target.value)} maxLength={200} /></label>
        <div className={s.row}>
          <Btn variant="danger" onClick={onDelete}><Trash2 size={14} /> Remove</Btn>
          <Btn variant="ghost" onClick={onWear}><Shirt size={14} /> Try it on</Btn>
          <Btn onClick={() => onSave({ name: name.trim() || item.name, category: cat, tags: tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 12) })}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
