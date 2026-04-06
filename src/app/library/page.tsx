// src/app/library/page.tsx

'use client';
import React, { useState, useEffect } from 'react';
import s from './library.module.css';
import { Btn, Lbl, Tag, Stars, Pill, InnerTabs, SearchBar, Topbar, Modal, ModalTitle, ModalFooter, Confirm, FInput, FArea, TagInput, EmptyState, Toast, useToast, SoulPicker } from '@/components/ui';
import { getLibrary, addLibraryEntry, updateLibraryEntry, deleteLibraryEntry, getSoulLinksForItem, setSoulLinks, getSouls } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { uploadImage, deleteImage } from '@/lib/upload';
import ImagePicker from '@/components/ui/ImagePicker';
import type { DbLibraryEntry, DbSoul } from '@/lib/db';

type LibType = 'link' | 'media' | 'place' | 'note' | 'idea';

const TYPE_COL: Record<LibType, string> = {
  link:  '#a855f7',
  media: '#ff8c00',
  place: '#ffb347',
  note:  '#c084fc',
  idea:  '#8a7060',
};
const TYPES: LibType[] = ['link', 'media', 'place', 'note', 'idea'];

const EMPTY = {
  type:   'link' as LibType,
  title:  '',
  meta:   '',
  url:    '',
  rating: 0,
  tags:   [] as string[],
  notes:  '',
};

type FormState = typeof EMPTY;

export default function LibraryPage() {
  const [items,            setItems]            = useState<DbLibraryEntry[]>([]);
  const [souls,            setSouls]            = useState<DbSoul[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [tab,              setTab]              = useState('all');
  const [search,           setSearch]           = useState('');
  const [sort,             setSort]             = useState('newest');
  const [modal,            setModal]            = useState<'form' | 'delete' | null>(null);
  const [editItem,         setEditItem]         = useState<DbLibraryEntry | null>(null);
  const [delItem,          setDelItem]          = useState<DbLibraryEntry | null>(null);
  const [form,             setForm]             = useState<FormState>(EMPTY);
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
        const [data, soulData] = await Promise.all([getLibrary(), getSouls()]);
        setItems(data);
        setSouls(soulData);
      } catch (err) {
        console.error('Library load error:', err);
        show('Could not load library.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = items
    .filter(e => tab === 'all' || e.type === tab)
    .filter(e => !search || (e.title + (e.meta ?? '') + (e.notes ?? '')).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === 'rating' ? b.rating - a.rating :
      sort === 'alpha'  ? a.title.localeCompare(b.title) :
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const tabsData: [string, string][] = [
    ['all',   `All (${items.length})`],
    ['link',  'Links'],
    ['media', 'Media'],
    ['place', 'Places'],
    ['idea',  'Ideas'],
    ['note',  'Notes'],
  ];

  const resetImageState = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const openAdd = () => {
    setForm({ ...EMPTY, tags: [] });
    setEditItem(null);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    resetImageState();
    setModal('form');
  };

  const openEdit = async (e: DbLibraryEntry) => {
    setForm({
      type:   e.type,
      title:  e.title,
      meta:   e.meta   ?? '',
      url:    e.url    ?? '',
      rating: e.rating ?? 0,
      tags:   [...(e.tags ?? [])],
      notes:  e.notes  ?? '',
    });
    setEditItem(e);
    setLinkedSoulIds([]);
    setSoulPickerActive(false);
    resetImageState();
    // Pre-fill image preview from existing entry
    setImagePreview((e as DbLibraryEntry & { image_url?: string }).image_url ?? null);
    setModal('form');
    try {
      const links = await getSoulLinksForItem('library', e.id);
      setLinkedSoulIds(links.map(l => l.soul_id));
      if (links.length > 0) setSoulPickerActive(true);
    } catch { /* non-fatal */ }
  };

  const save = async () => {
    if (!form.title.trim()) return;

    // ── resolve image URL ──────────────────────────────────
    const existingImageUrl = editItem
      ? ((editItem as DbLibraryEntry & { image_url?: string }).image_url ?? null)
      : null;

    let finalImageUrl: string | null = existingImageUrl;

    if (imageFile) {
      // New file selected — upload it, delete old if exists
      if (existingImageUrl) await deleteImage(existingImageUrl).catch(() => {});
      finalImageUrl = await uploadImage(imageFile, 'library');
    } else if (!imagePreview && existingImageUrl) {
      // User cleared the image
      await deleteImage(existingImageUrl).catch(() => {});
      finalImageUrl = null;
    }

    const payload = {
      type:      form.type,
      title:     form.title.trim(),
      meta:      form.meta   || null,
      url:       form.url    || null,
      rating:    form.rating,
      tags:      form.tags,
      notes:     form.notes  || null,
      image_url: finalImageUrl,
    };

    if (editItem) {
      setItems(l => l.map(x => x.id === editItem.id ? { ...x, ...payload } : x));
      setModal(null);
      try {
        await updateLibraryEntry(editItem.id, payload);
        if (soulPickerActive) {
          await setSoulLinks('library', editItem.id, payload.title, payload.meta, linkedSoulIds);
        }
        show('Updated!');
      } catch {
        setItems(l => l.map(x => x.id === editItem.id ? editItem : x));
        show('Could not update.');
      }
    } else {
      setModal(null);
      try {
        const created = await addLibraryEntry(payload);
        setItems(l => [created, ...l]);
        if (soulPickerActive) {
          await setSoulLinks('library', created.id, created.title, created.meta ?? null, linkedSoulIds);
        }
        show('Saved!');
      } catch {
        show('Could not save.');
      }
    }
  };

  const doDelete = async () => {
    if (!delItem) return;
    const snapshot = [...items];
    // Also clean up storage image
    const imageUrl = (delItem as DbLibraryEntry & { image_url?: string }).image_url;
    setItems(l => l.filter(x => x.id !== delItem.id));
    setDelItem(null);
    setModal(null);
    try {
      await deleteLibraryEntry(delItem.id);
      if (imageUrl) await deleteImage(imageUrl).catch(() => {});
      show('Deleted.');
    } catch {
      setItems(snapshot);
      show('Could not delete.');
    }
  };

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className={`${s.page} aFadeUp`}>
      <Topbar
        title="Library ◫"
        sub={loading ? 'Loading...' : `${filtered.length} items`}
        action={<Btn onClick={openAdd}>+ Add Entry</Btn>}
      />
      <InnerTabs tabs={tabsData} active={tab} onTab={setTab} />

      <div className={s.filterRow}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search titles, notes..." />
        <div className={s.sortPills}>
          {([['newest','New'],['rating','★'],['alpha','A–Z']] as [string,string][]).map(([k, l]) => (
            <Pill key={k} active={sort === k} onClick={() => setSort(k)}>{l}</Pill>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={s.loadingState}>Loading your library...</div>
      ) : filtered.length === 0 ? (
        <EmptyState msg={search ? 'No results found.' : 'Nothing here yet — add your first entry!'} />
      ) : (
        <div className={s.grid}>
          {filtered.map(e => {
            const imgUrl = (e as DbLibraryEntry & { image_url?: string }).image_url;
            return (
              <div key={e.id} className={s.entryCard} onClick={() => openEdit(e)}>
                {imgUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt={e.title} className={s.cardImage} />
                )}
                <div className={s.cardActions}>
                 <button
                  onClick={ev => { ev.stopPropagation(); setDelItem(e); setModal('delete'); }}
                  style={{
                    background: 'rgba(185,28,28,0.15)',
                    border: '1px solid rgba(185,28,28,0.3)',
                    borderRadius: '50%',
                    color: '#f87171',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    padding: 0,
                  }}
                >×</button>
                </div>
                <Tag color={TYPE_COL[e.type]}>{cap(e.type)}</Tag>
                <div className={s.entryTitle}>{e.title}</div>
                {e.meta  && <div className={s.entryMeta}>{e.meta}</div>}
                {e.rating > 0 && <Stars n={e.rating} size={11} />}
                {e.notes && <div className={s.entryNotes}>{e.notes}</div>}
                <div className={s.tagRow}>{(e.tags ?? []).map(t => <Pill key={t}>{t}</Pill>)}</div>
              </div>
            );
          })}
          <div className={s.addCard} onClick={openAdd}>
            <span className={s.addCardIcon}>+</span>
            <span className={s.addCardLabel}>Add entry</span>
          </div>
        </div>
      )}

      {modal === 'form' && (
        <Modal onClose={() => setModal(null)}>
          <ModalTitle>{editItem ? 'Edit Entry' : 'Add to Library'}</ModalTitle>
          <div className={s.typeRow}>
            {TYPES.map(t => (
              <Pill key={t} active={form.type === t} color={TYPE_COL[t]} onClick={() => setForm(f => ({ ...f, type: t }))}>
                {cap(t)}
              </Pill>
            ))}
          </div>
          <FInput label="Title"            value={form.title}  onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="What is this?" />
          <FInput label="Source / Details" value={form.meta}   onChange={v => setForm(f => ({ ...f, meta: v }))} />
          <FInput label="URL (optional)"   value={form.url}    onChange={v => setForm(f => ({ ...f, url: v }))}   placeholder="https://..." />
          <div className={s.ratingRow}>
            <Lbl>Rating</Lbl>
            <Stars n={form.rating} onSet={r => setForm(f => ({ ...f, rating: r }))} size={22} />
          </div>
          <FArea label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={3} />
          <div>
            <Lbl>Tags</Lbl>
            <TagInput
              tags={form.tags}
              onAdd={t => setForm(f => ({ ...f, tags: [...f.tags, t] }))}
              onRemove={t => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}
            />
          </div>

          {/* Image picker */}
          <div style={{ marginTop: 10 }}>
            <ImagePicker
              label="Image"
              value={imagePreview}
              onChange={(file, preview) => { setImageFile(file); setImagePreview(preview); }}
              onClear={() => { setImageFile(null); setImagePreview(null); }}
            />
          </div>

          <div style={{ marginTop: 10, marginBottom: 4 }}>
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

          <ModalFooter onCancel={() => setModal(null)} onSave={save} saveLabel={editItem ? 'Update' : 'Save'} />
        </Modal>
      )}

      {modal === 'delete' && delItem && (
        <Modal onClose={() => setModal(null)}>
          <Confirm
            msg={`"${delItem.title}" will be removed.`}
            onConfirm={doDelete}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}