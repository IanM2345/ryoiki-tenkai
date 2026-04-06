// src/app/places/page.tsx

'use client';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { colors as C, fonts } from '../../lib/token';
import {
  Btn, Lbl, Tag, Stars, TagInput, SearchBar, Topbar, Modal,
  ModalTitle, ModalFooter, Confirm, FInput, FArea, EmptyState, Toast, useToast, SoulPicker,
} from '@/components/ui';
import { getPlaces, addPlace, updatePlace, deletePlace, getSoulLinksForItem, setSoulLinks, getSouls } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { uploadImage, deleteImage } from '@/lib/upload';
import ImagePicker from '@/components/ui/ImagePicker';
import type { DbPlace, DbSoul } from '@/lib/db';
import { geocodeAddress } from '../../lib/geocode';

const MapView = dynamic(() => import('../places/MapView'), { ssr: false, loading: () => (
  <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8a7060', fontFamily:'monospace', fontSize:11 }}>Loading map...</div>
)});

const EMPTY_FORM = {
  name: '', address: '', visit_date: '', rating: 0,
  notes: '', tags: [] as string[], visits: 1,
};
type FormState = typeof EMPTY_FORM;
const card = () => ({ background: C.card, borderRadius: 8, border: `1px solid ${C.bd}`, padding: 10 });

export default function PlacesPage() {
  const [places,           setPlaces]           = useState<DbPlace[]>([]);
  const [souls,            setSouls]            = useState<DbSoul[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [viewMode,         setViewMode]         = useState<'list' | 'map'>('list');
  const [modal,            setModal]            = useState<'form' | 'delete' | null>(null);
  const [form,             setForm]             = useState<FormState>(EMPTY_FORM);
  const [editItem,         setEditItem]         = useState<DbPlace | null>(null);
  const [selected,         setSelected]         = useState<DbPlace | null>(null);
  const [search,           setSearch]           = useState('');
  const [linkedSoulIds,    setLinkedSoulIds]    = useState<string[]>([]);
  const [soulPickerActive, setSoulPickerActive] = useState(false);
  // ── image state ──────────────────────────────────────────
  const [imageFile,        setImageFile]        = useState<File | null>(null);
  const [imagePreview,     setImagePreview]     = useState<string | null>(null);
  const [toast,            show]                = useToast();

  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [data, soulData] = await Promise.all([getPlaces(), getSouls()]);
        setPlaces(data);
        setSouls(soulData);
      } catch (err) {
        console.error('Places load error:', err);
        show('Could not load places.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = places.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.address ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const resetImageState = () => { setImageFile(null); setImagePreview(null); };

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, tags: [] });
    setEditItem(null);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    resetImageState();
    setModal('form');
  };

  const openEdit = async (p: DbPlace) => {
    setForm({
      name:       p.name,
      address:    p.address    ?? '',
      visit_date: p.visit_date ?? '',
      rating:     p.rating     ?? 0,
      notes:      p.notes      ?? '',
      tags:       [...(p.tags  ?? [])],
      visits:     p.visits     ?? 1,
    });
    setEditItem(p);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    resetImageState();
    setImagePreview((p as DbPlace & { image_url?: string }).image_url ?? null);
    setModal('form');
    try {
      const links = await getSoulLinksForItem('places', p.id);
      setLinkedSoulIds(links.map(l => l.soul_id));
      if (links.length > 0) setSoulPickerActive(true);
    } catch { /* non-fatal */ }
  };

  const save = async () => {
    if (!form.name.trim()) return;

    // ── resolve image URL ────────────────────────────────
    const existingImageUrl = editItem
      ? ((editItem as DbPlace & { image_url?: string }).image_url ?? null)
      : null;

    let finalImageUrl: string | null = existingImageUrl;

    if (imageFile) {
      if (existingImageUrl) await deleteImage(existingImageUrl).catch(() => {});
      finalImageUrl = await uploadImage(imageFile, 'places');
    } else if (!imagePreview && existingImageUrl) {
      await deleteImage(existingImageUrl).catch(() => {});
      finalImageUrl = null;
    }

    let lat: number | null = null;
    let lng: number | null = null;
    if (editItem?.lat && editItem?.lng && form.address === (editItem.address ?? '')) {
      lat = editItem.lat;
      lng = editItem.lng;
    } else if (form.address) {
      const coords = await geocodeAddress(form.address);
      if (coords) { lat = coords.lat; lng = coords.lng; }
    }

    const payload = {
      name:       form.name.trim(),
      address:    form.address    || null,
      visit_date: form.visit_date || null,
      rating:     form.rating,
      notes:      form.notes      || null,
      tags:       form.tags,
      visits:     form.visits,
      lat,
      lng,
      image_url:  finalImageUrl,
    };

    if (editItem) {
      setPlaces(l => l.map(x => x.id === editItem.id ? { ...x, ...payload } : x));
      if (selected?.id === editItem.id) setSelected(s => s ? { ...s, ...payload } : s);
      setModal(null);
      try {
        await updatePlace(editItem.id, payload);
        if (soulPickerActive) {
          await setSoulLinks('places', editItem.id, payload.name, payload.address, linkedSoulIds);
        }
        show('Updated!');
      } catch {
        setPlaces(l => l.map(x => x.id === editItem.id ? editItem : x));
        show('Could not update.');
      }
    } else {
      setModal(null);
      try {
        const created = await addPlace(payload);
        setPlaces(l => [created, ...l]);
        if (soulPickerActive) {
          await setSoulLinks('places', created.id, created.name, created.address ?? null, linkedSoulIds);
        }
        show('Place logged!');
      } catch {
        show('Could not save place.');
      }
    }
  };

  const doDelete = async () => {
    if (!selected) return;
    const imgUrl = (selected as DbPlace & { image_url?: string }).image_url;
    const snapshot = [...places];
    setPlaces(l => l.filter(x => x.id !== selected.id));
    setSelected(null); setModal(null);
    try {
      await deletePlace(selected.id);
      if (imgUrl) await deleteImage(imgUrl).catch(() => {});
      show('Deleted.');
    } catch { setPlaces(snapshot); show('Could not delete.'); }
  };

  const incVisit = async (place: DbPlace) => {
    const newVisits = (place.visits ?? 1) + 1;
    setPlaces(l => l.map(x => x.id === place.id ? { ...x, visits: newVisits } : x));
    if (selected?.id === place.id) setSelected(s => s ? { ...s, visits: newVisits } : s);
    try { await updatePlace(place.id, { visits: newVisits }); show('Visit logged!'); }
    catch { setPlaces(l => l.map(x => x.id === place.id ? place : x)); show('Could not log visit.'); }
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', zIndex:0 }} className="animate-fade-up">
      <Topbar
        title="Places ◎"
        sub={loading ? 'Loading...' : `${places.length} visited`}
        action={
          <div style={{ display:'flex', gap:7 }}>
            <Btn variant="ghost" sm onClick={() => setViewMode(v => v === 'map' ? 'list' : 'map')}>
              {viewMode === 'map' ? '≡ List' : '◉ Map'}
            </Btn>
            <Btn onClick={openAdd}>+ Log Place</Btn>
          </div>
        }
      />

      <div style={{ display:'flex', gap:8, padding:'8px 14px', borderBottom:`1px solid ${C.bds}` }}>
        <div style={{ flex:1 }}><SearchBar value={search} onChange={setSearch} placeholder="Search places..." /></div>
        <span style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm, alignSelf:'center' }}>{filtered.length}</span>
      </div>

      {viewMode === 'map' ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <MapView places={filtered} selected={selected} onSelect={setSelected} onAdd={openAdd} />
          {selected && (
            <div style={{ ...card(), margin:'8px 12px', display:'flex', gap:10, alignItems:'flex-start' }}>
              {/* Show image thumbnail in map detail panel if available */}
              {(selected as DbPlace & { image_url?: string }).image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={(selected as DbPlace & { image_url?: string }).image_url!}
                  alt={selected.name}
                  style={{ width:54, height:54, borderRadius:6, objectFit:'cover', flexShrink:0 }}
                />
              )}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.tx, marginBottom:2 }}>{selected.name}</div>
                <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm, marginBottom:5 }}>{selected.address} · {selected.visit_date}</div>
                <Stars n={selected.rating ?? 0} size={13} />
                {selected.notes && <div style={{ fontSize:11, color:C.txs, marginTop:5, lineHeight:1.6 }}>{selected.notes}</div>}
              </div>
              <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                <Btn variant="ghost" sm onClick={() => incVisit(selected)}>+visit</Btn>
                <Btn variant="ghost" sm onClick={() => openEdit(selected)}>edit</Btn>
                <Btn variant="danger" sm onClick={() => setModal('delete')}>del</Btn>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'8px 12px', display:'flex', flexDirection:'column', gap:7 }}>
          {loading ? (
            <EmptyState icon="◎" msg="Loading your places..." />
          ) : filtered.length === 0 ? (
            <EmptyState icon="◎" msg="No places logged yet." />
          ) : filtered.map(p => {
            const imgUrl = (p as DbPlace & { image_url?: string }).image_url;
            return (
              <div
                key={p.id}
                style={{ ...card(), display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer' }}
                onClick={() => openEdit(p)}
                onMouseEnter={ev => { ev.currentTarget.style.background = C.cardHov; (ev.currentTarget.querySelector('.p-actions') as HTMLElement | null)?.style && ((ev.currentTarget.querySelector('.p-actions') as HTMLElement).style.opacity = '1'); }}
                onMouseLeave={ev => { ev.currentTarget.style.background = C.card;    (ev.currentTarget.querySelector('.p-actions') as HTMLElement | null)?.style && ((ev.currentTarget.querySelector('.p-actions') as HTMLElement).style.opacity = '0'); }}
              >
                {/* Place thumbnail or icon */}
                {imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt={p.name}
                    style={{ width:42, height:42, borderRadius:6, objectFit:'cover', flexShrink:0 }} />
                ) : (
                  <div style={{ width:32, height:32, borderRadius:6, background:`${C.or}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>📍</div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.tx, marginBottom:2 }}>{p.name}</div>
                  <div style={{ fontFamily:fonts.mono, fontSize:9, color:C.txm, marginBottom:4 }}>{p.address} · {p.visit_date}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Stars n={p.rating ?? 0} size={11} />
                    {(p.visits ?? 1) > 1 && <span style={{ fontFamily:fonts.mono, fontSize:8, color:C.txm }}>{p.visits}× visited</span>}
                  </div>
                  {p.notes && <div style={{ fontSize:11, color:C.txs, opacity:.65, marginTop:3, lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical' }}>{p.notes}</div>}
                  <div style={{ marginTop:4 }}>{(p.tags ?? []).map(t => <Tag key={t} color={C.or}>{t}</Tag>)}</div>
                </div>
                <div className="p-actions" style={{ display:'flex', gap:4, opacity:0, transition:'opacity .15s', flexShrink:0 }}>
                  <button onClick={e => { e.stopPropagation(); incVisit(p); }} style={{ background:'none', border:`1px solid ${C.bd}`, borderRadius:5, padding:'3px 8px', fontSize:9, cursor:'pointer', color:C.txs, fontFamily:fonts.main }}>+visit</button>
                  <button onClick={e => { e.stopPropagation(); setSelected(p); setModal('delete'); }} style={{ background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)', color:C.red, borderRadius:5, padding:'3px 7px', fontSize:9, cursor:'pointer', fontFamily:fonts.main }}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal === 'form' && (
        <Modal onClose={() => setModal(null)}>
          <ModalTitle>{editItem ? 'Edit Place' : 'Log a Place ◎'}</ModalTitle>
          <FInput label="Place Name"         value={form.name}       onChange={v => setForm(f => ({ ...f, name: v }))} />
          <FInput label="Address / Location" value={form.address}    onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="e.g. Temple Bar, Dublin" />
          <div style={{ fontFamily:fonts.mono, fontSize:8, color:C.txm, marginTop:-6, marginBottom:10, opacity:.6 }}>
            💡 Just type the address — the pin will be placed automatically
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <FInput label="Visit Date"    value={form.visit_date}    onChange={v => setForm(f => ({ ...f, visit_date: v }))} type="date" />
            <FInput label="Times Visited" value={String(form.visits)} onChange={v => setForm(f => ({ ...f, visits: parseInt(v) || 1 }))} type="number" />
          </div>
          <div style={{ marginBottom:10 }}><Lbl>Rating</Lbl><Stars n={form.rating} onSet={r => setForm(f => ({ ...f, rating: r }))} size={22} /></div>
          <FArea label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={3} placeholder="What made this place special?" />
          <div style={{ marginBottom:10 }}>
            <Lbl>Tags</Lbl>
            <TagInput tags={form.tags} color={C.or}
              onAdd={t => setForm(f => ({ ...f, tags: [...f.tags, t] }))}
              onRemove={t => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}
            />
          </div>

          {/* Image picker */}
          <div style={{ marginBottom:10 }}>
            <ImagePicker
              label="Photo"
              value={imagePreview}
              onChange={(file, preview) => { setImageFile(file); setImagePreview(preview); }}
              onClear={() => { setImageFile(null); setImagePreview(null); }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            {!soulPickerActive ? (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setSoulPickerActive(true); }}
                style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 11, padding: '5px 10px', width: '100%' }}
              >+ Link souls</button>
            ) : (
              <>
                <Lbl>Linked Souls</Lbl>
                <SoulPicker
                  souls={souls}
                  linkedIds={linkedSoulIds}
                  onToggle={id => setLinkedSoulIds(prev =>
                    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                  )}
                />
              </>
            )}
          </div>

          <ModalFooter onCancel={() => setModal(null)} onSave={save} saveLabel={editItem ? 'Update' : 'Save Place'} />
        </Modal>
      )}

      {modal === 'delete' && selected && (
        <Modal onClose={() => setModal(null)}>
          <Confirm msg={`Remove "${selected.name}"?`} onConfirm={doDelete} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}