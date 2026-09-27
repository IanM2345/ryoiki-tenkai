'use client';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, X, NotebookPen, Library, ListChecks, Lightbulb, ListVideo, MapPin, Star, Users, ChevronRight, SearchX,
} from 'lucide-react';
import s from './search.module.css';
import { Stars, Pill, Topbar, Toast, useToast } from '@/components/ui';
import SoulAvatar from '@/components/souls/SoulAvatar';
import {
  getJournalEntries, getLibrary, getTasks, getIdeas, getQueue, getPlaces, getRatings, getSouls,
} from '@/lib/db';
import type { DbSoul } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { fmtDate } from '@/lib/dates';

type SectionKey = 'journal' | 'library' | 'tasks' | 'ideas' | 'queue' | 'places' | 'ratings' | 'souls';

const SECTIONS: { key: SectionKey; label: string; Icon: typeof Search; color: string }[] = [
  { key: 'journal', label: 'Journal', Icon: NotebookPen, color: 'var(--or)' },
  { key: 'souls',   label: 'Souls',   Icon: Users,       color: 'var(--pu-g)' },
  { key: 'library', label: 'Library', Icon: Library,     color: 'var(--pu-l)' },
  { key: 'ideas',   label: 'Ideas',   Icon: Lightbulb,   color: 'var(--yellow)' },
  { key: 'tasks',   label: 'Tasks',   Icon: ListChecks,  color: 'var(--gr)' },
  { key: 'queue',   label: 'Queue',   Icon: ListVideo,   color: 'var(--blue)' },
  { key: 'places',  label: 'Places',  Icon: MapPin,      color: 'var(--red)' },
  { key: 'ratings', label: 'Ratings', Icon: Star,        color: 'var(--or)' },
];
const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map(x => [x.key, x])) as Record<SectionKey, typeof SECTIONS[number]>;

interface SearchItem {
  id:      string;
  section: SectionKey;
  title:   string;
  preview: string;
  extra:   string;   // searchable but not shown (tags etc.)
  rating:  number;
  href:    string;
  soul?:   DbSoul;
}

const MIN_CHARS = 2;
const PER_SECTION = 5;
const cap = (t: string) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
const join = (...parts: (string | null | undefined)[]) => parts.map(p => (p ?? '').trim()).filter(Boolean).join(' · ');
const oneLine = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

/** Cut long text so the first match stays visible. */
function snippet(text: string, q: string, max: number): string {
  if (text.length <= max) return text;
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0 || i + q.length < max - 10) return text.slice(0, max).trimEnd() + '…';
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, start + max);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let from = 0;
  let i = lower.indexOf(q);
  while (i >= 0) {
    if (i > from) out.push(text.slice(from, i));
    out.push(<mark key={i} className={s.mark}>{text.slice(i, i + q.length)}</mark>);
    from = i + q.length;
    i = lower.indexOf(q, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return <>{out}</>;
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export default function SearchPage() {
  const router = useRouter();
  const [raw, setRaw]         = useState('');
  const [q, setQ]             = useState('');
  const [filter, setFilter]   = useState<'all' | SectionKey>('all');
  const [items, setItems]     = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const inp = useRef<HTMLInputElement>(null);
  const [toast, show] = useToast();

  // Debounce typing.
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [raw]);

  // "/" focuses the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      inp.current?.focus();
      inp.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        let failed = false;
        const safe = <T,>(p: Promise<T[]>) => p.catch(() => { failed = true; return [] as T[]; });
        const [journal, library, tasks, ideas, queue, places, ratings, souls] = await Promise.all([
          safe(getJournalEntries()), safe(getLibrary()), safe(getTasks()), safe(getIdeas()),
          safe(getQueue()), safe(getPlaces()), safe(getRatings()), safe(getSouls()),
        ]);

        const all: SearchItem[] = [
          ...journal.map(e => ({
            id: `J-${e.id}`, section: 'journal' as const,
            title: e.title || 'Untitled entry',
            preview: join(e.entry_date ? fmtDate(e.entry_date) : '', oneLine(e.body)),
            extra: (e.tags ?? []).join(' '), rating: 0, href: `/journal/${e.id}`,
          })),
          ...souls.map(e => ({
            id: `S-${e.id}`, section: 'souls' as const,
            title: e.name,
            preview: join(e.role, oneLine(e.description)),
            extra: `${(e.tags ?? []).join(' ')} ${e.notes ?? ''}`, rating: 0, href: `/souls/${e.id}`, soul: e,
          })),
          ...library.map(e => ({
            id: `L-${e.id}`, section: 'library' as const,
            title: e.title,
            preview: join(cap(e.type), e.meta, oneLine(e.notes)),
            extra: `${(e.tags ?? []).join(' ')} ${e.url ?? ''}`, rating: e.rating ?? 0, href: '/library',
          })),
          ...ideas.map(e => ({
            id: `I-${e.id}`, section: 'ideas' as const,
            title: e.title,
            preview: join(cap(e.status), oneLine(e.body)),
            extra: (e.tags ?? []).join(' '), rating: 0, href: '/ideas',
          })),
          ...tasks.map(t => ({
            id: `T-${t.id}`, section: 'tasks' as const,
            title: t.text,
            preview: join(t.done ? 'Done' : `${cap(t.priority)} priority`, t.due_date ? `Due ${fmtDate(t.due_date)}` : ''),
            extra: '', rating: 0, href: '/tasks',
          })),
          ...queue.map(e => ({
            id: `Q-${e.id}`, section: 'queue' as const,
            title: e.title,
            preview: join(cap(e.tab), e.meta, oneLine(e.notes)),
            extra: '', rating: 0, href: '/queue',
          })),
          ...places.map(e => ({
            id: `P-${e.id}`, section: 'places' as const,
            title: e.name,
            preview: join(e.address, oneLine(e.notes)),
            extra: (e.tags ?? []).join(' '), rating: e.rating ?? 0, href: '/places',
          })),
          ...ratings.map(e => ({
            id: `R-${e.id}`, section: 'ratings' as const,
            title: e.title,
            preview: join(e.category, oneLine(e.notes)),
            extra: '', rating: e.rating ?? 0, href: '/ratings',
          })),
        ];
        setItems(all);
        if (failed) show('Some sections could not be loaded.', 'var(--red)');
      } catch {
        show('Could not load your things to search.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(SECTIONS.map(x => [x.key, 0])) as Record<SectionKey, number>;
    items.forEach(i => { c[i.section]++; });
    return c;
  }, [items]);

  const active = q.length >= MIN_CHARS;

  const matches = useMemo(() => active
    ? items.filter(e => `${e.title}\n${e.preview}\n${e.extra}`.toLowerCase().includes(q))
    : [], [items, q, active]);

  const grouped = useMemo(() => SECTIONS
    .map(sec => {
      const list = matches.filter(m => m.section === sec.key);
      // Title hits first.
      list.sort((a, b) => Number(b.title.toLowerCase().includes(q)) - Number(a.title.toLowerCase().includes(q)));
      return { ...sec, list };
    })
    .filter(g => g.list.length > 0), [matches, q]);

  const visible = filter === 'all' ? grouped : grouped.filter(g => g.key === filter);
  const shownCount = visible.reduce((a, g) => a + g.list.length, 0);
  const firstHit = visible[0]?.list[0];

  const pickFilter = (k: 'all' | SectionKey) => { setFilter(k); inp.current?.focus({ preventScroll: true }); };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && raw) { e.preventDefault(); setRaw(''); }
    if (e.key === 'Enter' && firstHit) { e.preventDefault(); router.push(firstHit.href); }
  };

  const sub = loading
    ? 'Gathering your world'
    : items.length ? `${items.length} things you can search` : 'Nothing to search yet';

  return (
    <div className={s.page}>
      <Topbar title="Search" sub={sub} maxWidth={820} />

      <div className={s.wrap}>
        <div className={s.searchBox}>
          <Search size={20} strokeWidth={2} className={s.searchIcon} aria-hidden />
          <input
            ref={inp}
            autoFocus
            type="search"
            className={s.searchInput}
            placeholder={loading ? 'Loading' : 'Search everything'}
            aria-label="Search everything"
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onKeyDown={onInputKey}
          />
          {raw ? (
            <button type="button" className={s.clearBtn} onClick={() => { setRaw(''); inp.current?.focus(); }} aria-label="Clear search">
              <X size={16} strokeWidth={2.25} />
            </button>
          ) : (
            <kbd className={s.kbd} aria-hidden>/</kbd>
          )}
        </div>

        {active && !loading && (
          <div className={s.filters} role="group" aria-label="Filter by section">
            <Pill active={filter === 'all'} onClick={() => pickFilter('all')}>All {matches.length}</Pill>
            {grouped.map(g => (
              <Pill key={g.key} active={filter === g.key} onClick={() => pickFilter(g.key)}>
                <g.Icon size={14} strokeWidth={2} /> {g.label} {g.list.length}
              </Pill>
            ))}
          </div>
        )}

        <div aria-live="polite" className={s.srOnly}>
          {active && !loading ? `${shownCount} result${shownCount === 1 ? '' : 's'}` : ''}
        </div>

        {loading ? (
          <div className={s.intro}>
            <div className={s.countGrid}>
              {SECTIONS.map(x => <div key={x.key} className={`skeleton ${s.skel}`} />)}
            </div>
          </div>
        ) : !active ? (
          <div className={s.intro}>
            <p className={s.introMsg}>
              {raw.trim().length > 0
                ? 'Keep going, one more letter and the search begins.'
                : 'Looking for something? Start typing and matches show up as you go.'}
            </p>
            <p className={s.introHint}>Press <kbd className={s.kbdInline}>/</kbd> anywhere on this page to jump back here, and Enter to open the top result.</p>
            <div className={s.countGrid}>
              {SECTIONS.map(x => (
                <button key={x.key} type="button" className={s.countCard} style={{ ['--c' as string]: x.color }}
                  onClick={() => pickFilter(x.key)} aria-pressed={filter === x.key}
                  aria-label={`Search only ${x.label}, ${counts[x.key]} items`}>
                  <span className={s.countIcon}><x.Icon size={17} strokeWidth={2} /></span>
                  <span className={s.countNum}>{counts[x.key]}</span>
                  <span className={s.countLabel}>{x.label}</span>
                </button>
              ))}
            </div>
            {filter !== 'all' && (
              <p className={s.introHint}>
                Searching only {SECTION_BY_KEY[filter].label}.{' '}
                <button type="button" className={s.linkBtn} onClick={() => pickFilter('all')}>Search everything</button>
              </p>
            )}
          </div>
        ) : visible.length === 0 ? (
          <div className={s.intro}>
            <span className={s.emptyIcon}><SearchX size={26} strokeWidth={1.75} /></span>
            <p className={s.introMsg}>
              Nothing matches &ldquo;{raw.trim()}&rdquo;{filter !== 'all' ? ` in ${SECTION_BY_KEY[filter].label}` : ''}.
            </p>
            {filter !== 'all' && (
              <button type="button" className={s.linkBtn} onClick={() => pickFilter('all')}>Search everything instead</button>
            )}
          </div>
        ) : visible.map(g => {
          const limited = filter === 'all' && g.list.length > PER_SECTION;
          const list = limited ? g.list.slice(0, PER_SECTION) : g.list;
          return (
            <section key={g.key} className={s.group} style={{ ['--c' as string]: g.color }} aria-labelledby={`sec-${g.key}`}>
              <header className={s.groupHead}>
                <h2 id={`sec-${g.key}`} className={s.groupTitle}><g.Icon size={16} strokeWidth={2} /> {g.label}</h2>
                <span className={s.groupCount}>{g.list.length}</span>
              </header>
              <ul className={s.list}>
                {list.map(item => (
                  <li key={item.id}>
                    <Link href={item.href} className={s.result}>
                      {item.soul
                        ? <span className={s.avatar}><SoulAvatar soul={item.soul} size={34} /></span>
                        : <span className={s.resultIcon}><g.Icon size={16} strokeWidth={2} /></span>}
                      <span className={s.resultText}>
                        <span className={s.resultTitle}><Hl text={snippet(item.title, q, 90)} q={q} /></span>
                        {item.preview && (
                          <span className={s.resultPreview}><Hl text={snippet(item.preview, q, 140)} q={q} /></span>
                        )}
                      </span>
                      {item.rating > 0 && <span className={s.resultStars}><Stars n={item.rating} size={11} /></span>}
                      <ChevronRight size={16} strokeWidth={2} className={s.chev} aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              {limited && (
                <button type="button" className={s.moreBtn} onClick={() => pickFilter(g.key)}>
                  Show all {g.list.length} in {g.label} <ChevronRight size={14} strokeWidth={2.25} />
                </button>
              )}
            </section>
          );
        })}
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
