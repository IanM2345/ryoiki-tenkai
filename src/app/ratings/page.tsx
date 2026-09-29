'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus, Star, Trash2, Clapperboard, BookOpen, Music, MapPin, Tv, Newspaper, Sparkles,
  ArrowDownWideNarrow, Clock, ArrowDownAZ,
} from 'lucide-react';
import s from './ratings.module.css';
import {
  Btn, Lbl, Stars, Pill, SearchBar, InnerTabs, Topbar, Modal, ModalTitle, ModalFooter, Confirm,
  FInput, FArea, EmptyState, Toast, useToast,
} from '@/components/ui';
import SoulLinkField from '@/components/ui/SoulLinkField';
import {
  getRatings, addRating, updateRating, deleteRating, getSoulLinksForItem, setSoulLinks, deleteSoulLinksForItem, getSouls,
} from '@/lib/db';
import type { DbRating, DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { fmtDate } from '@/lib/dates';

const CATS = ['Film', 'Book', 'Music', 'Place', 'Series', 'Article', 'Experience'] as const;
type RCat = typeof CATS[number];

interface CatMeta { Icon: typeof Star; color: string }
const CAT: Record<RCat, CatMeta> = {
  Film:       { Icon: Clapperboard, color: 'var(--or)' },
  Book:       { Icon: BookOpen,     color: 'var(--blue)' },
  Music:      { Icon: Music,        color: 'var(--pu-l)' },
  Place:      { Icon: MapPin,       color: 'var(--gr)' },
  Series:     { Icon: Tv,           color: 'var(--red)' },
  Article:    { Icon: Newspaper,    color: 'var(--yellow)' },
  Experience: { Icon: Sparkles,     color: 'var(--pu-g)' },
};
const FALLBACK: CatMeta = { Icon: Star, color: 'var(--tx-m)' };
const catMeta = (c: string): CatMeta => (CAT as Record<string, CatMeta>)[c] ?? FALLBACK;

type Sort = 'rating' | 'newest' | 'alpha';
const SORTS: { k: Sort; label: string; Icon: typeof Star }[] = [
  { k: 'rating', label: 'Top rated', Icon: ArrowDownWideNarrow },
  { k: 'newest', label: 'Newest',    Icon: Clock },
  { k: 'alpha',  label: 'A to Z',    Icon: ArrowDownAZ },
];

const STAR_LABELS = ['Tap a star to rate', 'Disappointing', 'It was ok', 'Pretty good', 'Really good', 'Perfect'];
const EMPTY = { title: '', category: 'Film' as string, rating: 0, notes: '' };
type Form = typeof EMPTY;

const average = (list: DbRating[]) => list.length ? list.reduce((a, b) => a + b.rating, 0) / list.length : 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function RatingsPage() {
  const [ratings, setRatings] = useState<DbRating[]>([]);
  const [souls, setSouls]     = useState<DbSoul[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<string>('all');
  const [sort, setSort]       = useState<Sort>('rating');
  const [search, setSearch]   = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm]       = useState<Form>(EMPTY);
  const [editItem, setEditItem] = useState<DbRating | null>(null);
  const [soulIds, setSoulIds] = useState<string[]>([]);
  const [saving, setSaving]   = useState(false);
  const [delItem, setDelItem] = useState<DbRating | null>(null);
  const linksReady = useRef(true);
  const [toast, show] = useToast();

  const reload = useCallback(async () => {
      try {
        if (!(await ensureSession())) return;
        const [data, soulData] = await Promise.all([getRatings(), getSouls().catch(() => [] as DbSoul[])]);
        setRatings(data);
        setSouls(soulData);
      } catch {
        show('Could not load your ratings.', 'var(--red)');
      } finally {
        setLoading(false);
      }
  }, [show]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['ratings', 'soul_links'], reload);

  const q = search.trim().toLowerCase();

  const catStats = useMemo(() => CATS.map(cat => {
    const list = ratings.filter(r => r.category === cat);
    return { cat, count: list.length, avg: average(list) };
  }), [ratings]);

  const filtered = useMemo(() => ratings
    .filter(r => tab === 'all' || r.category === tab)
    .filter(r => !q || `${r.title} ${r.notes ?? ''} ${r.category}`.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === 'rating' ? b.rating - a.rating || b.created_at.localeCompare(a.created_at) :
      sort === 'alpha'  ? a.title.localeCompare(b.title) :
      b.created_at.localeCompare(a.created_at)),
  [ratings, tab, q, sort]);

  const groups = useMemo(() => sort === 'rating'
    ? [5, 4, 3, 2, 1].map(n => ({ n, items: filtered.filter(r => r.rating === n) })).filter(g => g.items.length > 0)
    : [{ n: 0, items: filtered }],
  [filtered, sort]);

  const tabs: [string, string][] = [
    ['all', `All ${ratings.length}`],
    ...catStats.map(({ cat, count }) => [cat, count ? `${cat} ${count}` : cat] as [string, string]),
  ];

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY, category: tab === 'all' ? 'Film' : tab });
    setSoulIds([]);
    linksReady.current = true;
    setFormOpen(true);
  };

  const openEdit = (r: DbRating) => {
    setEditItem(r);
    setForm({ title: r.title, category: r.category, rating: r.rating, notes: r.notes ?? '' });
    setSoulIds([]);
    linksReady.current = false;
    setFormOpen(true);
    getSoulLinksForItem('ratings', r.id)
      .then(l => { setSoulIds(l.map(x => x.soul_id)); linksReady.current = true; })
      .catch(() => {});
  };

  const save = async () => {
    if (saving) return;
    if (!form.title.trim()) { show('Give it a name first.', 'var(--red)'); return; }
    if (!form.rating) { show('Pick a star rating first.', 'var(--red)'); return; }
    setSaving(true);
    const payload = { title: form.title.trim(), category: form.category, rating: form.rating, notes: form.notes.trim() || null };
    try {
      const saved = editItem ? await updateRating(editItem.id, payload) : await addRating(payload);
      setRatings(l => editItem ? l.map(x => x.id === saved.id ? saved : x) : [saved, ...l]);
      if (linksReady.current) {
        await setSoulLinks('ratings', saved.id, saved.title, saved.notes ?? null, soulIds)
          .catch(() => show('Saved, but the people links did not update.', 'var(--red)'));
      }
      setFormOpen(false);
      show(editItem ? 'Rating updated' : 'Rating saved');
    } catch {
      show('Could not save that rating.', 'var(--red)');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    const item = delItem; if (!item) return;
    const snapshot = ratings;
    setRatings(l => l.filter(x => x.id !== item.id));
    setDelItem(null); setFormOpen(false);
    try {
      await deleteRating(item.id);
      await deleteSoulLinksForItem('ratings', item.id).catch(() => {});
      show('Rating deleted');
    } catch {
      setRatings(snapshot);
      show('Could not delete that rating.', 'var(--red)');
    }
  };

  const sub = loading
    ? 'Loading your ratings'
    : ratings.length
      ? `${plural(ratings.length, 'rating')}, ${average(ratings).toFixed(1)} average`
      : 'No ratings yet';

  const activeMeta = tab === 'all' ? null : catMeta(tab);

  return (
    <div className={s.page}>
      <Topbar
        title="Ratings"
        sub={sub}
        maxWidth={880}
        action={<Btn onClick={openAdd}><Plus size={16} strokeWidth={2.25} /> Rate something</Btn>}
      />

      <div className={s.wrap}>
        {loading ? (
          <>
            <div className={s.overview}>
              {CATS.map(c => <div key={c} className={`skeleton ${s.skelChip}`} />)}
            </div>
            {[0, 1, 2, 3].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}
          </>
        ) : ratings.length === 0 ? (
          <EmptyState
            icon={<Star size={26} />}
            msg="Nothing rated yet. Start with the last film you watched or a book you loved."
            action={<Btn sm onClick={openAdd}><Plus size={15} /> Rate something</Btn>}
          />
        ) : (
          <>
            {tab === 'all' && (
              <section className={s.overview} aria-label="Averages by category">
                {catStats.map(({ cat, count, avg }) => {
                  const m = CAT[cat];
                  return (
                    <button key={cat} type="button" className={s.catCard} style={{ ['--c' as string]: m.color }}
                      onClick={() => setTab(cat)} aria-label={`${cat}: ${count ? `${plural(count, 'rating')}, ${avg.toFixed(1)} average` : 'no ratings yet'}`}>
                      <span className={s.catIcon}><m.Icon size={17} strokeWidth={2} /></span>
                      <span className={s.catText}>
                        <span className={s.catName}>{cat}</span>
                        <span className={s.catCount}>{count ? plural(count, 'rating') : 'None yet'}</span>
                      </span>
                      <span className={`${s.catAvg} ${count ? '' : s.catAvgEmpty}`}>
                        {count ? <>{avg.toFixed(1)}<Star size={12} strokeWidth={2} fill="currentColor" /></> : null}
                      </span>
                    </button>
                  );
                })}
              </section>
            )}

            <div className={s.tabs}><InnerTabs tabs={tabs} active={tab} onTab={setTab} /></div>

            <div className={s.toolbar}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search ratings" className={s.search} />
              <div className={s.sorts} role="group" aria-label="Sort by">
                {SORTS.map(({ k, label, Icon }) => (
                  <Pill key={k} active={sort === k} onClick={() => setSort(k)}>
                    <Icon size={14} strokeWidth={2} /> {label}
                  </Pill>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={activeMeta ? <activeMeta.Icon size={26} /> : <Star size={26} />}
                msg={q ? 'Nothing matches that search.' : `No ${tab.toLowerCase()} ratings yet.`}
                action={q ? undefined : <Btn sm onClick={openAdd}><Plus size={15} /> Rate one</Btn>}
              />
            ) : groups.map(({ n, items }) => (
              <section key={n} className={s.group} aria-label={n ? `${n} stars` : 'Ratings'}>
                {n > 0 && (
                  <header className={s.groupHead}>
                    <Stars n={n} size={14} />
                    <span className={s.groupLabel}>{STAR_LABELS[n]}</span>
                    <span className={s.groupCount}>{items.length}</span>
                  </header>
                )}
                <div className={s.list}>
                  {items.map(r => {
                    const m = catMeta(r.category);
                    return (
                      <article key={r.id} className={s.card} style={{ ['--c' as string]: m.color }}>
                        <button type="button" className={s.cardMain} onClick={() => openEdit(r)} aria-label={`Edit ${r.title}`}>
                          <span className={s.cardIcon}><m.Icon size={18} strokeWidth={2} /></span>
                          <span className={s.cardText}>
                            <span className={s.cardTitle}>{r.title}</span>
                            <span className={s.cardMeta}>{r.category} · {fmtDate(r.created_at)}</span>
                            {r.notes && <span className={s.cardNotes}>{r.notes}</span>}
                          </span>
                          <span className={s.cardStars}><Stars n={r.rating} size={13} /></span>
                        </button>
                        <button type="button" className={s.delBtn} onClick={() => setDelItem(r)} aria-label={`Delete ${r.title}`}>
                          <Trash2 size={15} strokeWidth={2} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {formOpen && (
        <Modal onClose={() => !saving && setFormOpen(false)}>
          <ModalTitle>{editItem ? 'Edit rating' : 'Rate something'}</ModalTitle>
          <FInput label="What are you rating?" value={form.title} onChange={v => set('title', v)} placeholder="A film, a book, a trip" />

          <Lbl>Category</Lbl>
          <div className={s.optRow} role="radiogroup" aria-label="Category">
            {CATS.map(c => {
              const m = CAT[c];
              return (
                <button key={c} type="button" role="radio" aria-checked={form.category === c}
                  className={`${s.opt} ${form.category === c ? s.optOn : ''}`} style={{ ['--c' as string]: m.color }}
                  onClick={() => set('category', c)}>
                  <m.Icon size={14} strokeWidth={2} /> {c}
                </button>
              );
            })}
          </div>

          <div className={s.starPicker}>
            <Lbl>Your rating</Lbl>
            <Stars n={form.rating} onSet={v => set('rating', v)} size={34} />
            <p className={`${s.starLabel} ${form.rating ? '' : s.starHint}`}>{STAR_LABELS[form.rating]}</p>
          </div>

          <FArea label="Notes" value={form.notes} onChange={v => set('notes', v)} rows={3} placeholder="What did you think?" />
          <SoulLinkField souls={souls} value={soulIds} onChange={setSoulIds} />

          {editItem && (
            <button type="button" className={s.modalDelete} onClick={() => { setFormOpen(false); setDelItem(editItem); }}>
              <Trash2 size={14} strokeWidth={2} /> Delete this rating
            </button>
          )}
          <ModalFooter onCancel={() => setFormOpen(false)} onSave={save} saveLabel={saving ? 'Saving' : editItem ? 'Save changes' : 'Save rating'} />
        </Modal>
      )}

      {delItem && (
        <Modal onClose={() => setDelItem(null)}>
          <Confirm msg={`"${delItem.title}" will be deleted for good.`} onConfirm={doDelete} onCancel={() => setDelItem(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
