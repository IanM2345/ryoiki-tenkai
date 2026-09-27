'use client';
import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Plus, MapPin, List, Map as MapIcon, Navigation, Pencil, Trash2, Footprints, CalendarDays, MapPinOff } from 'lucide-react';
import s from './places.module.css';
import {
  Btn, Lbl, Tag, Stars, TagInput, SearchBar, Topbar, Modal, ModalTitle, ModalFooter, Confirm,
  FInput, FArea, EmptyState, Toast, useToast,
} from '@/components/ui';
import ImagePicker from '@/components/ui/ImagePicker';
import StoredImage from '@/components/ui/StoredImage';
import SoulLinkField from '@/components/ui/SoulLinkField';
import {
  getPlaces, addPlace, updatePlace, deletePlace, getSoulLinksForItem, setSoulLinks, deleteSoulLinksForItem, getSouls,
} from '@/lib/db';
import type { DbPlace, DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { prepareImage, deleteImage, preloadSignedUrls } from '@/lib/upload';
import { geocodeAddress, directionsUrl } from '@/lib/geocode';
import { fmtDate } from '@/lib/dates';

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <div className={`${s.mapWrap} skeleton`} />,
});

const EMPTY = { name: '', address: '', visit_date: '', rating: 0, notes: '', tags: [] as string[], visits: 1 };
type Form = typeof EMPTY;

function PlaceActions({ p, onVisit, onEdit, onDelete }: {
  p: DbPlace; onVisit: (p: DbPlace) => void; onEdit: (p: DbPlace) => void; onDelete: (p: DbPlace) => void;
}) {
  return (
    <div className={s.actions}>
      <button type="button" className={s.actBtn} onClick={() => onVisit(p)}><Footprints size={14} strokeWidth={2} /> Visited again</button>
      {p.lat != null && p.lng != null && (
        <a className={s.actBtn} href={directionsUrl({ lat: p.lat, lng: p.lng })} target="_blank" rel="noopener noreferrer"><Navigation size={14} strokeWidth={2} /> Directions</a>
      )}
      <button type="button" className={s.iconBtn} onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}><Pencil size={15} strokeWidth={2} /></button>
      <button type="button" className={`${s.iconBtn} ${s.danger}`} onClick={() => onDelete(p)} aria-label={`Delete ${p.name}`}><Trash2 size={15} strokeWidth={2} /></button>
    </div>
  );
}

export default function PlacesPage() {
  const [places, setPlaces]   = useState<DbPlace[]>([]);
  const [souls, setSouls]     = useState<DbSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState<'list' | 'map'>('list');
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState<DbPlace | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<DbPlace | null>(null);
  const [form, setForm]         = useState<Form>(EMPTY);
  const [soulIds, setSoulIds]   = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [delItem, setDelItem]   = useState<DbPlace | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const [data, soulData] = await Promise.all([getPlaces(), getSouls().catch(() => [] as DbSoul[])]);
        await preloadSignedUrls(data.map(p => p.image_url)).catch(() => {});
        setPlaces(data);
        setSouls(soulData);
      } catch {
        show('Could not load your places.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => places
    .filter(p => !q || `${p.name} ${p.address ?? ''} ${p.notes ?? ''} ${(p.tags ?? []).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) => (b.visit_date ?? b.created_at).localeCompare(a.visit_date ?? a.created_at)),
  [places, q]);
  const unpinned = filtered.filter(p => p.lat == null || p.lng == null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditItem(null); setForm({ ...EMPTY, tags: [] }); setSoulIds([]); setImageFile(null); setImagePreview(null); setFormOpen(true);
  };
  const openEdit = (p: DbPlace) => {
    setEditItem(p);
    setForm({ name: p.name, address: p.address ?? '', visit_date: p.visit_date ?? '', rating: p.rating ?? 0, notes: p.notes ?? '', tags: [...(p.tags ?? [])], visits: p.visits ?? 1 });
    setSoulIds([]); setImageFile(null); setImagePreview(p.image_url ?? null);
    setFormOpen(true);
    getSoulLinksForItem('places', p.id).then(l => setSoulIds(l.map(x => x.soul_id))).catch(() => {});
  };

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    let img: Awaited<ReturnType<typeof prepareImage>> | null = null;
    try {
      // Only look the address up again when it changed
      const address = form.address.trim();
      let lat = editItem?.lat ?? null, lng = editItem?.lng ?? null, notFound = false;
      if (address !== (editItem?.address ?? '')) {
        const c = address ? await geocodeAddress(address) : null;
        lat = c?.lat ?? null; lng = c?.lng ?? null;
        notFound = !!address && !c;
      }
      img = await prepareImage({ current: editItem?.image_url, file: imageFile, cleared: !imagePreview, folder: 'places' });
      const payload = {
        name: form.name.trim(), address: address || null, visit_date: form.visit_date || null,
        rating: form.rating, notes: form.notes.trim() || null, tags: form.tags,
        visits: Math.max(1, form.visits || 1), lat, lng, image_url: img.value,
      };
      const saved = editItem ? await updatePlace(editItem.id, payload) : await addPlace(payload);
      setPlaces(l => editItem ? l.map(x => x.id === saved.id ? saved : x) : [saved, ...l]);
      if (selected?.id === saved.id) setSelected(saved);
      await img.cleanup();
      await setSoulLinks('places', saved.id, saved.name, saved.address ?? null, soulIds).catch(() => {});
      setFormOpen(false);
      show(notFound ? "Saved. We couldn't find that address, so it isn't on the map yet." : editItem ? 'Changes saved' : 'Place saved', notFound ? 'var(--yellow)' : undefined);
    } catch {
      await img?.rollback();
      show('Could not save that place.', 'var(--red)');
    } finally {
      setSaving(false);
    }
  };

  const logVisit = async (p: DbPlace) => {
    const visits = (p.visits ?? 1) + 1;
    setPlaces(l => l.map(x => x.id === p.id ? { ...x, visits } : x));
    if (selected?.id === p.id) setSelected({ ...p, visits });
    try { await updatePlace(p.id, { visits }); show(`Visit number ${visits} logged`); }
    catch { setPlaces(l => l.map(x => x.id === p.id ? p : x)); show('Could not log that visit.', 'var(--red)'); }
  };

  const doDelete = async () => {
    const item = delItem; if (!item) return;
    const snapshot = places;
    setPlaces(l => l.filter(x => x.id !== item.id));
    if (selected?.id === item.id) setSelected(null);
    setDelItem(null); setFormOpen(false);
    try {
      await deletePlace(item.id);
      await Promise.allSettled([deleteImage(item.image_url), deleteSoulLinksForItem('places', item.id)]);
      show('Place removed');
    } catch { setPlaces(snapshot); show('Could not delete that place.', 'var(--red)'); }
  };

  return (
    <div className={s.page}>
      <Topbar
        title="Places"
        sub={loading ? 'Loading your places' : places.length ? `${places.length} ${places.length === 1 ? 'place' : 'places'} you've been` : 'Everywhere worth remembering'}
        action={<Btn onClick={openAdd}><Plus size={16} strokeWidth={2.25} /> Add place</Btn>}
      />

      <div className={s.wrap}>
        {places.length > 0 && (
          <div className={s.toolbar}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search places" className={s.search} />
            <div className={s.viewSwitch} role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? s.viewOn : ''} onClick={() => setView('list')}><List size={16} /> List</button>
              <button type="button" role="tab" aria-selected={view === 'map'} className={view === 'map' ? s.viewOn : ''} onClick={() => setView('map')}><MapIcon size={16} /> Map</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className={s.grid}>{[0, 1, 2].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}</div>
        ) : places.length === 0 ? (
          <EmptyState icon={<MapPin size={26} />} msg="No places yet. Add the first spot you want to remember." action={<Btn sm onClick={openAdd}><Plus size={15} /> Add a place</Btn>} />
        ) : view === 'map' ? (
          <>
            <MapView places={filtered} selected={selected} onSelect={setSelected} />
            {selected && (
              <div className={s.detail}>
                {selected.image_url && <StoredImage src={selected.image_url} alt="" className={s.detailImg} />}
                <div className={s.detailBody}>
                  <h2 className={s.detailName}>{selected.name}</h2>
                  {selected.address && <p className={s.muted}>{selected.address}</p>}
                  {selected.rating > 0 && <Stars n={selected.rating} size={14} />}
                  {selected.notes && <p className={s.detailNotes}>{selected.notes}</p>}
                  <PlaceActions p={selected} onVisit={logVisit} onEdit={openEdit} onDelete={setDelItem} />
                </div>
              </div>
            )}
            {unpinned.length > 0 && (
              <p className={s.unpinned}>
                <MapPinOff size={15} /> Not on the map yet: {unpinned.map(p => p.name).join(', ')}. Add an address to pin them.
              </p>
            )}
          </>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<MapPin size={26} />} msg="No places match that search." />
        ) : (
          <div className={s.grid}>
            {filtered.map(p => (
              <article key={p.id} className={s.card}>
                <button type="button" className={s.cardMain} onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                  {p.image_url
                    ? <StoredImage src={p.image_url} alt="" className={s.cardImg} />
                    : <span className={s.cardIcon}><MapPin size={22} strokeWidth={1.75} /></span>}
                  <span className={s.cardBody}>
                    <span className={s.cardName}>{p.name}</span>
                    {p.address && <span className={s.muted}>{p.address}</span>}
                    <span className={s.cardMeta}>
                      {p.rating > 0 && <Stars n={p.rating} size={13} />}
                      {p.visit_date && <span><CalendarDays size={13} /> {fmtDate(p.visit_date)}</span>}
                      {(p.visits ?? 1) > 1 && <span><Footprints size={13} /> {p.visits} visits</span>}
                    </span>
                    {p.notes && <span className={s.cardNotes}>{p.notes}</span>}
                    {(p.tags?.length ?? 0) > 0 && <span>{p.tags.map(t => <Tag key={t}>{t}</Tag>)}</span>}
                  </span>
                </button>
                <PlaceActions p={p} onVisit={logVisit} onEdit={openEdit} onDelete={setDelItem} />
              </article>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <Modal onClose={() => !saving && setFormOpen(false)}>
          <ModalTitle>{editItem ? 'Edit place' : 'Add a place'}</ModalTitle>
          <FInput label="Name" value={form.name} onChange={v => set('name', v)} placeholder="The little cafe by the station" />
          <FInput label="Address" value={form.address} onChange={v => set('address', v)} placeholder="Street, town or landmark" />
          <p className={s.hint}>Type an address and the pin drops itself on the map.</p>
          <div className={s.twoCol}>
            <FInput label="Date visited" type="date" value={form.visit_date} onChange={v => set('visit_date', v)} />
            <FInput label="Times visited" type="number" value={String(form.visits)} onChange={v => set('visits', Math.max(1, parseInt(v) || 1))} />
          </div>
          <div className={s.field}><Lbl>Your rating</Lbl><Stars n={form.rating} onSet={r => set('rating', r)} size={24} /></div>
          <FArea label="Notes" value={form.notes} onChange={v => set('notes', v)} rows={3} placeholder="What made it special?" />
          <div className={s.field}>
            <Lbl>Tags</Lbl>
            <TagInput tags={form.tags} onAdd={t => set('tags', [...form.tags, t])} onRemove={t => set('tags', form.tags.filter(x => x !== t))} />
          </div>
          <ImagePicker label="Photo" value={imagePreview} onChange={(f, p) => { setImageFile(f); setImagePreview(p); }} onClear={() => { setImageFile(null); setImagePreview(null); }} />
          <SoulLinkField souls={souls} value={soulIds} onChange={setSoulIds} label="Who were you with?" />
          <ModalFooter onCancel={() => setFormOpen(false)} onSave={save} saveLabel={saving ? 'Saving' : editItem ? 'Save changes' : 'Save place'} />
        </Modal>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${delItem.name}" will be removed from your places.`} onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
