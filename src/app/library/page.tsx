'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Link2, Clapperboard, MapPin, StickyNote, Lightbulb, ExternalLink, Trash2, LibraryBig } from 'lucide-react';
import s from './library.module.css';
import {
  Btn, Lbl, Stars, Pill, InnerTabs, SearchBar, Topbar, Modal, ModalTitle, ModalFooter, Confirm,
  FInput, FArea, TagInput, EmptyState, Toast, useToast, Tag,
} from '@/components/ui';
import ImagePicker from '@/components/ui/ImagePicker';
import StoredImage from '@/components/ui/StoredImage';
import SoulLinkField from '@/components/ui/SoulLinkField';
import {
  getLibrary, addLibraryEntry, updateLibraryEntry, deleteLibraryEntry,
  getSoulLinksForItem, setSoulLinks, deleteSoulLinksForItem, getSouls,
} from '@/lib/db';
import type { DbLibraryEntry, DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { prepareImage, deleteImage, preloadSignedUrls } from '@/lib/upload';

type LibType = DbLibraryEntry['type'];

const TYPE_META: Record<LibType, { label: string; plural: string; color: string; Icon: typeof Link2 }> = {
  link:  { label: 'Link',  plural: 'Links',  color: 'var(--pu-l)', Icon: Link2 },
  media: { label: 'Media', plural: 'Media',  color: 'var(--or)',   Icon: Clapperboard },
  place: { label: 'Place', plural: 'Places', color: 'var(--or-l)', Icon: MapPin },
  note:  { label: 'Note',  plural: 'Notes',  color: 'var(--pu-g)', Icon: StickyNote },
  idea:  { label: 'Idea',  plural: 'Ideas',  color: 'var(--yellow)', Icon: Lightbulb },
};
const TYPES = Object.keys(TYPE_META) as LibType[];

const EMPTY = { type: 'link' as LibType, title: '', meta: '', url: '', rating: 0, tags: [] as string[], notes: '' };
type Form = typeof EMPTY;

const normaliseUrl = (u: string) => {
  const t = u.trim();
  if (!t) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
};
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export default function LibraryPage() {
  const [items, setItems]   = useState<DbLibraryEntry[]>([]);
  const [souls, setSouls]   = useState<DbSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<'all' | LibType>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort]     = useState<'newest' | 'rating' | 'alpha'>('newest');

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<DbLibraryEntry | null>(null);
  const [form, setForm]         = useState<Form>(EMPTY);
  const [soulIds, setSoulIds]   = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [delItem, setDelItem]   = useState<DbLibraryEntry | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const [data, soulData] = await Promise.all([getLibrary(), getSouls().catch(() => [] as DbSoul[])]);
        await preloadSignedUrls(data.map(d => d.image_url)).catch(() => {});
        setItems(data);
        setSouls(soulData);
      } catch {
        show('Could not load your library.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    items.forEach(i => { c[i.type] = (c[i.type] ?? 0) + 1; });
    return c;
  }, [items]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => items
    .filter(e => tab === 'all' || e.type === tab)
    .filter(e => !q || `${e.title} ${e.meta ?? ''} ${e.notes ?? ''} ${(e.tags ?? []).join(' ')}`.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === 'rating' ? b.rating - a.rating || b.created_at.localeCompare(a.created_at)
      : sort === 'alpha' ? a.title.localeCompare(b.title)
      : b.created_at.localeCompare(a.created_at)),
  [items, tab, q, sort]);

  const tabs: [string, string][] = [
    ['all', 'All'],
    ...TYPES.filter(t => counts[t]).map(t => [t, TYPE_META[t].plural] as [string, string]),
  ];

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY, type: tab === 'all' ? 'link' : tab, tags: [] });
    setSoulIds([]); setImageFile(null); setImagePreview(null);
    setFormOpen(true);
  };

  const openEdit = (e: DbLibraryEntry) => {
    setEditItem(e);
    setForm({ type: e.type, title: e.title, meta: e.meta ?? '', url: e.url ?? '', rating: e.rating ?? 0, tags: [...(e.tags ?? [])], notes: e.notes ?? '' });
    setSoulIds([]); setImageFile(null); setImagePreview(e.image_url ?? null);
    setFormOpen(true);
    getSoulLinksForItem('library', e.id).then(l => setSoulIds(l.map(x => x.soul_id))).catch(() => {});
  };

  const save = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    let img: Awaited<ReturnType<typeof prepareImage>> | null = null;
    try {
      img = await prepareImage({ current: editItem?.image_url, file: imageFile, cleared: !imagePreview, folder: 'library' });
      const payload = {
        type: form.type,
        title: form.title.trim(),
        meta: form.meta.trim() || null,
        url: normaliseUrl(form.url),
        rating: form.rating,
        tags: form.tags,
        notes: form.notes.trim() || null,
        image_url: img.value,
      };
      const saved = editItem ? await updateLibraryEntry(editItem.id, payload) : await addLibraryEntry(payload);
      setItems(list => editItem ? list.map(x => x.id === saved.id ? saved : x) : [saved, ...list]);
      await img.cleanup();
      await setSoulLinks('library', saved.id, saved.title, saved.meta ?? null, soulIds).catch(() => show('Saved, but the people links did not update.', 'var(--red)'));
      setFormOpen(false);
      show(editItem ? 'Changes saved' : 'Added to your library');
    } catch (err) {
      await img?.rollback();
      show(err instanceof Error && err.message.includes('image') ? err.message : 'Could not save that. Please try again.', 'var(--red)');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    const item = delItem; if (!item) return;
    const snapshot = items;
    setItems(l => l.filter(x => x.id !== item.id));
    setDelItem(null);
    setFormOpen(false);
    try {
      await deleteLibraryEntry(item.id);
      await Promise.allSettled([deleteImage(item.image_url), deleteSoulLinksForItem('library', item.id)]);
      show('Removed from your library');
    } catch {
      setItems(snapshot);
      show('Could not delete that.', 'var(--red)');
    }
  };

  return (
    <div className={s.page}>
      <Topbar
        title="Library"
        sub={loading ? 'Loading your finds' : items.length ? `${items.length} saved ${items.length === 1 ? 'find' : 'finds'}` : 'Links, films, places and notes worth keeping'}
        action={<Btn onClick={openAdd}><Plus size={16} strokeWidth={2.25} /> Add</Btn>}
      />

      <div className={s.wrap}>
        {items.length > 0 && (
          <div className={s.toolbar}>
            <InnerTabs tabs={tabs} active={tab} onTab={t => setTab(t as 'all' | LibType)} />
            <div className={s.filters}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search your library" className={s.search} />
              <div className={s.sorts}>
                <Pill active={sort === 'newest'} onClick={() => setSort('newest')}>Newest</Pill>
                <Pill active={sort === 'rating'} onClick={() => setSort('rating')}>Top rated</Pill>
                <Pill active={sort === 'alpha'} onClick={() => setSort('alpha')}>A to Z</Pill>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className={s.grid}>{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<LibraryBig size={26} />}
            msg={q ? 'Nothing matches that search.' : 'Nothing here yet. Save your first find!'}
            action={!q ? <Btn sm onClick={openAdd}><Plus size={15} /> Add something</Btn> : undefined}
          />
        ) : (
          <div className={s.grid}>
            {filtered.map(e => {
              const meta = TYPE_META[e.type];
              return (
                <article key={e.id} className={s.card} style={{ ['--c' as string]: meta.color }}>
                  <button type="button" className={s.cardMain} onClick={() => openEdit(e)} aria-label={`Edit ${e.title}`}>
                    {e.image_url && <StoredImage src={e.image_url} alt="" className={s.cardImage} />}
                    <span className={s.cardBody}>
                      <span className={s.typeBadge}><meta.Icon size={13} strokeWidth={2.25} /> {meta.label}</span>
                      <span className={s.cardTitle}>{e.title}</span>
                      {e.meta && <span className={s.cardMeta}>{e.meta}</span>}
                      {e.rating > 0 && <Stars n={e.rating} size={13} />}
                      {e.notes && <span className={s.cardNotes}>{e.notes}</span>}
                      {(e.tags?.length ?? 0) > 0 && <span className={s.cardTags}>{e.tags.map(t => <Tag key={t} color="var(--tx-s)">{t}</Tag>)}</span>}
                    </span>
                  </button>
                  <div className={s.cardFoot}>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className={s.openLink}>
                        <ExternalLink size={14} strokeWidth={2} /> {hostOf(e.url)}
                      </a>
                    ) : <span />}
                    <button type="button" className={s.delBtn} onClick={() => setDelItem(e)} aria-label={`Delete ${e.title}`}>
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <Modal onClose={() => !saving && setFormOpen(false)}>
          <ModalTitle>{editItem ? 'Edit find' : 'Add to your library'}</ModalTitle>
          <div className={s.typeRow} role="radiogroup" aria-label="Type">
            {TYPES.map(t => {
              const m = TYPE_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={form.type === t}
                  className={`${s.typeOpt} ${form.type === t ? s.typeOptOn : ''}`}
                  style={{ ['--c' as string]: m.color }}
                  onClick={() => set('type', t)}
                >
                  <m.Icon size={15} strokeWidth={2} /> {m.label}
                </button>
              );
            })}
          </div>
          <FInput label="Title" value={form.title} onChange={v => set('title', v)} placeholder="What is it?" />
          <FInput label="Details" value={form.meta} onChange={v => set('meta', v)} placeholder="Author, director, where you found it" />
          <FInput label="Link" value={form.url} onChange={v => set('url', v)} placeholder="example.com" type="url" />
          <div className={s.ratingRow}>
            <Lbl>Your rating</Lbl>
            <Stars n={form.rating} onSet={r => set('rating', r)} size={24} />
          </div>
          <FArea label="Notes" value={form.notes} onChange={v => set('notes', v)} rows={3} placeholder="Why it's worth keeping" />
          <div className={s.field}>
            <Lbl>Tags</Lbl>
            <TagInput tags={form.tags} onAdd={t => set('tags', [...form.tags, t])} onRemove={t => set('tags', form.tags.filter(x => x !== t))} />
          </div>
          <ImagePicker
            label="Photo"
            value={imagePreview}
            onChange={(file, preview) => { setImageFile(file); setImagePreview(preview); }}
            onClear={() => { setImageFile(null); setImagePreview(null); }}
          />
          <SoulLinkField souls={souls} value={soulIds} onChange={setSoulIds} />
          <ModalFooter
            onCancel={() => setFormOpen(false)}
            onSave={save}
            saveLabel={saving ? 'Saving' : editItem ? 'Save changes' : 'Add'}
          />
        </Modal>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${delItem.title}" will be removed from your library.`} onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
