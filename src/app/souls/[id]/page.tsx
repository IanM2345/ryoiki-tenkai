'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, NotebookPen, Music, Tv, MapPin, LibraryBig, Star, ListVideo, Lightbulb,
  Plus, X, Heart, Link2, UserRoundX, CalendarHeart,
} from 'lucide-react';
import s from './profile.module.css';
import { Btn, Tag, InnerTabs, Modal, Confirm, Toast, useToast, EmptyState } from '@/components/ui';
import SoulAvatar from '@/components/souls/SoulAvatar';
import SoulForm from '@/components/souls/SoulForm';
import {
  getSoul, deleteSoul, getSoulMedia, addSoulMedia, deleteSoulMedia, getJournalEntries, getSoulLinks,
  getJournalEntryIdsForSoul, type DbSoul, type DbSoulMedia, type DbSoulLink, type DbJournalEntry,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { deleteImage } from '@/lib/upload';
import { fmtDate, relDay } from '@/lib/dates';

type Tab = 'timeline' | 'favourites' | 'connected' | 'notes';

const LINK_META: Record<DbSoulLink['table_name'], { label: string; href: string; Icon: typeof Star }> = {
  library: { label: 'Library', href: '/library', Icon: LibraryBig },
  places:  { label: 'Places',  href: '/places',  Icon: MapPin },
  ratings: { label: 'Ratings', href: '/ratings', Icon: Star },
  queue:   { label: 'Queue',   href: '/queue',   Icon: ListVideo },
  ideas:   { label: 'Ideas',   href: '/ideas',   Icon: Lightbulb },
};

type FavKind = 'music' | 'show' | 'place';
const FAV: Record<FavKind, { label: string; add: string; Icon: typeof Music; placeholder: string }> = {
  music: { label: 'Music',        add: 'Add a song or artist',  Icon: Music,  placeholder: 'Song, album or artist' },
  show:  { label: 'Films & shows', add: 'Add a film or show',   Icon: Tv,     placeholder: 'Film or series' },
  place: { label: 'Places',       add: 'Add a place',           Icon: MapPin, placeholder: 'A place that reminds you of them' },
};
const favKindOf = (m: DbSoulMedia): FavKind | null =>
  m.kind === 'music' ? 'music' : m.kind === 'show' || m.kind === 'film' ? 'show' : m.kind === 'other' && m.meta === 'place' ? 'place' : null;

function FavList({ kind, items, onAdd, onDelete }: {
  kind: FavKind; items: DbSoulMedia[]; onAdd: (kind: FavKind, title: string, meta: string) => void; onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [meta, setMeta] = useState('');
  const F = FAV[kind];
  const submit = () => { if (!title.trim()) return; onAdd(kind, title.trim(), meta.trim()); setTitle(''); setMeta(''); };
  return (
    <section className={s.favBlock}>
      <h3 className={s.favTitle}><F.Icon size={16} strokeWidth={2} /> {F.label}<span>{items.length}</span></h3>
      {items.map(m => (
        <div key={m.id} className={s.favItem}>
          <span className={s.favText}>
            <span className={s.favName}>{m.title}</span>
            {m.meta && m.meta !== 'place' && <span className={s.favMeta}>{m.meta}</span>}
          </span>
          <button type="button" className={s.favDel} onClick={() => onDelete(m.id)} aria-label={`Remove ${m.title}`}><X size={14} strokeWidth={2.25} /></button>
        </div>
      ))}
      <form className={s.favAdd} onSubmit={e => { e.preventDefault(); submit(); }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={F.placeholder} aria-label={F.add} />
        {kind !== 'place' && <input value={meta} onChange={e => setMeta(e.target.value)} placeholder="Details (optional)" aria-label="Details" className={s.favMetaInput} />}
        <button type="submit" disabled={!title.trim()} aria-label={F.add}><Plus size={16} strokeWidth={2.25} /></button>
      </form>
    </section>
  );
}

export default function SoulProfilePage() {
  const id = useParams()?.id as string;
  const router = useRouter();
  const [soul, setSoul]         = useState<DbSoul | null>(null);
  const [media, setMedia]       = useState<DbSoulMedia[]>([]);
  const [entries, setEntries]   = useState<DbJournalEntry[]>([]);
  const [links, setLinks]       = useState<DbSoulLink[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>('timeline');
  const [editing, setEditing]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [toast, show] = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!id || !(await ensureSession())) return;
        const [so, m, journals, soulLinks, linkedIds] = await Promise.all([
          getSoul(id), getSoulMedia(id).catch(() => []), getJournalEntries().catch(() => []),
          getSoulLinks(id).catch(() => []), getJournalEntryIdsForSoul(id).catch(() => [] as string[]),
        ]);
        setSoul(so);
        setMedia(m);
        setLinks(soulLinks);
        // Linked through @mentions, plus older entries that name them in the text
        const ids = new Set(linkedIds);
        const nameRe = new RegExp(`@${so.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu');
        setEntries(journals.filter(j => ids.has(j.id) || nameRe.test(j.body ?? '')));
      } catch {
        setSoul(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const favs = useMemo(() => {
    const out: Record<FavKind, DbSoulMedia[]> = { music: [], show: [], place: [] };
    media.forEach(m => { const k = favKindOf(m); if (k) out[k].push(m); });
    return out;
  }, [media]);

  const linkGroups = useMemo(() => {
    const g = new Map<DbSoulLink['table_name'], DbSoulLink[]>();
    links.forEach(l => g.set(l.table_name, [...(g.get(l.table_name) ?? []), l]));
    return [...g.entries()];
  }, [links]);

  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.wrap}>
          <div className={`skeleton ${s.skelHero}`} />
          <div className={`skeleton ${s.skelBody}`} />
        </div>
      </div>
    );
  }

  if (!soul) {
    return (
      <div className={s.page}>
        <div className={s.wrap}>
          <EmptyState icon={<UserRoundX size={26} />} msg="We couldn't find this person. They may have been removed."
            action={<Link href="/souls" className={s.linkReset}><Btn variant="ghost" sm><ArrowLeft size={15} /> Back to Souls</Btn></Link>} />
        </div>
      </div>
    );
  }

  const addFav = async (kind: FavKind, title: string, meta: string) => {
    const payload = { soul_id: soul.id, kind: (kind === 'place' ? 'other' : kind) as DbSoulMedia['kind'], title, meta: kind === 'place' ? 'place' : (meta || null) };
    try { const saved = await addSoulMedia(payload); setMedia(m => [...m, saved]); }
    catch { show('Could not add that.', 'var(--red)'); }
  };
  const delFav = async (mediaId: string) => {
    const snapshot = media;
    setMedia(m => m.filter(x => x.id !== mediaId));
    try { await deleteSoulMedia(mediaId); } catch { setMedia(snapshot); show('Could not remove that.', 'var(--red)'); }
  };
  const doDelete = async () => {
    try { await deleteSoul(soul.id); await deleteImage(soul.image_url); router.push('/souls'); }
    catch { setConfirmDel(false); show('Could not remove them.', 'var(--red)'); }
  };

  const favCount = favs.music.length + favs.show.length + favs.place.length;
  const tabs: [string, string][] = [
    ['timeline', `Journal${entries.length ? ` ${entries.length}` : ''}`],
    ['favourites', `Favourites${favCount ? ` ${favCount}` : ''}`],
    ['connected', `Connected${links.length ? ` ${links.length}` : ''}`],
    ['notes', 'Notes'],
  ];

  return (
    <div className={s.page} style={{ ['--c' as string]: soul.color }}>
      <div className={s.hero}>
        <div className={s.heroGlow} aria-hidden />
        <div className={s.heroInner}>
          <Link href="/souls" className={s.back}><ArrowLeft size={16} strokeWidth={2} /> Souls</Link>
          <div className={s.heroMain}>
            <SoulAvatar soul={soul} size={112} />
            <div className={s.heroText}>
              <h1 className={s.name}>{soul.name}</h1>
              <p className={s.role}>
                {soul.role && <span>{soul.role}</span>}
                {soul.since && <span className={s.since}><CalendarHeart size={14} /> Since {soul.since}</span>}
              </p>
              {soul.description && <p className={s.desc}>{soul.description}</p>}
              {(soul.tags?.length ?? 0) > 0 && <div className={s.tags}>{soul.tags.map(t => <Tag key={t} color={soul.color}>{t}</Tag>)}</div>}
            </div>
            <Btn variant="ghost" sm onClick={() => setEditing(true)} className={s.editBtn}><Pencil size={14} /> Edit</Btn>
          </div>
        </div>
      </div>

      <div className={s.wrap}>
        <InnerTabs tabs={tabs} active={tab} onTab={t => setTab(t as Tab)} />

        {tab === 'timeline' && (
          entries.length === 0 ? (
            <EmptyState icon={<NotebookPen size={26} />} msg={`Mention @${soul.name} in a journal entry and it will show up here.`}
              action={<Link href="/journal/new" className={s.linkReset}><Btn sm><Plus size={15} /> Write an entry</Btn></Link>} />
          ) : (
            <ol className={s.timeline}>
              {[...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).map(e => (
                <li key={e.id} className={s.tlItem}>
                  <span className={s.tlDot} aria-hidden />
                  <Link href={`/journal/${e.id}`} className={s.tlCard}>
                    <span className={s.tlDate}>{relDay(e.entry_date).replace(/^./, c => c.toUpperCase())}{e.mood ? ` ${e.mood}` : ''}</span>
                    <span className={s.tlTitle}>{e.title || 'Untitled'}</span>
                    {e.body && <span className={s.tlBody}>{e.body}</span>}
                  </Link>
                </li>
              ))}
            </ol>
          )
        )}

        {tab === 'favourites' && (
          <div className={s.favGrid}>
            {(Object.keys(FAV) as FavKind[]).map(k => <FavList key={k} kind={k} items={favs[k]} onAdd={addFav} onDelete={delFav} />)}
          </div>
        )}

        {tab === 'connected' && (
          linkGroups.length === 0 ? (
            <EmptyState icon={<Link2 size={26} />} msg={`Nothing linked yet. When you add a find, place, idea or rating, choose ${soul.name} under "Connected people".`} />
          ) : (
            <div className={s.connected}>
              {linkGroups.map(([table, items]) => {
                const M = LINK_META[table];
                return (
                  <section key={table}>
                    <h3 className={s.favTitle}><M.Icon size={16} strokeWidth={2} /> {M.label}<span>{items.length}</span></h3>
                    <div className={s.linkList}>
                      {items.map(l => (
                        <Link key={l.id} href={M.href} className={s.linkItem}>
                          <span className={s.favName}>{l.item_title}</span>
                          {l.item_meta && <span className={s.favMeta}>{l.item_meta}</span>}
                          <span className={s.linkDate}>Linked {fmtDate(l.created_at)}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )
        )}

        {tab === 'notes' && (
          soul.notes ? (
            <div className={s.notes}>{soul.notes}</div>
          ) : (
            <EmptyState icon={<Heart size={26} />} msg="Keep birthdays, favourite things and little details here."
              action={<Btn sm variant="ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Add notes</Btn>} />
          )
        )}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)}>
          <SoulForm
            soul={soul}
            onCancel={() => setEditing(false)}
            onError={m => show(m, 'var(--red)')}
            onDelete={() => setConfirmDel(true)}
            onSaved={saved => { setSoul(saved); setEditing(false); show('Changes saved'); }}
          />
        </Modal>
      )}
      {confirmDel && (
        <Modal onClose={() => setConfirmDel(false)}>
          <Confirm msg={`Remove ${soul.name}? Your journal entries stay exactly as they are.`} onConfirm={doDelete} onCancel={() => setConfirmDel(false)} />
        </Modal>
      )}
      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
