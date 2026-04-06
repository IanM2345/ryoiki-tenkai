'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import s from './search.module.css';
import { Tag, Stars, Pill } from '@/components/ui';
import {
  getJournalEntries,
  getLibrary,
  getTasks,
  getIdeas,
  getQueue,
  getPlaces,
  getRatings,
  getSouls,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';

interface SearchItem {
  id:      string;
  section: string;
  type:    string;
  color:   string;
  title:   string;
  preview: string;
  rating:  number;
  goTo:    string;
}

const SECTIONS = ['all', 'journal', 'library', 'tasks', 'ideas', 'queue', 'places', 'ratings', 'souls'];

function Hl({ text, query, max = 120 }: { text: string; query: string; max?: number }) {
  const t = text.slice(0, max);
  if (!query.trim()) return <>{t}</>;
  const i = t.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{t}</>;
  return <>{t.slice(0, i)}<mark>{t.slice(i, i + query.length)}</mark>{t.slice(i + query.length)}</>;
}

export default function SearchPage() {
  const router = useRouter();
  const [q,       setQ]       = useState('');
  const [filter,  setFilter]  = useState('all');
  const [items,   setItems]   = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const inp = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inp.current?.focus(), 50); }, []);

  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }

      try {
        const [journal, library, tasks, ideas, queue, places, ratings, souls] = await Promise.all([
          getJournalEntries(),
          getLibrary(),
          getTasks(),
          getIdeas(),
          getQueue(),
          getPlaces(),
          getRatings(),
          getSouls(),
        ]);

        const LIBRARY_COLOR: Record<string, string> = {
          link: '#a855f7', media: '#ff8c00', place: '#ffb347', note: '#8a7060', idea: '#c084fc',
        };
        const PRIO_COLOR: Record<string, string> = {
          high: '#f87171', medium: '#ff8c00', low: '#4ade80',
        };

        const all: SearchItem[] = [
          ...journal.map(e => ({
            id: `J-${e.id}`, section: 'Journal', type: 'Journal', color: '#ffb347',
            title: e.title,
            preview: e.body?.slice(0, 120) ?? '',
            rating: 0, goTo: `/journal/${e.id}`,
          })),
          ...library.map(e => ({
            id: `L-${e.id}`, section: 'Library', type: e.type,
            color: LIBRARY_COLOR[e.type] ?? '#a855f7',
            title: e.title,
            preview: [e.meta, e.notes].filter(Boolean).join(' · ').slice(0, 120),
            rating: e.rating ?? 0, goTo: '/library',
          })),
          ...tasks.map(t => ({
            id: `T-${t.id}`, section: 'Tasks', type: t.priority,
            color: PRIO_COLOR[t.priority] ?? '#ff8c00',
            title: t.text,
            preview: t.due_date ? `Due ${t.due_date}` : '',
            rating: 0, goTo: '/tasks',
          })),
          ...ideas.map(e => ({
            id: `I-${e.id}`, section: 'Ideas', type: e.status, color: '#c084fc',
            title: e.title,
            preview: e.body?.slice(0, 120) ?? '',
            rating: 0, goTo: '/ideas',
          })),
          ...queue.map(e => ({
            id: `Q-${e.id}`, section: 'Queue', type: e.tab,
            color: e.color || '#a855f7',
            title: e.title,
            preview: e.meta ?? '',
            rating: 0, goTo: '/queue',
          })),
          ...places.map(e => ({
            id: `P-${e.id}`, section: 'Places', type: 'Place', color: '#a855f7',
            title: e.name,
            preview: [e.address, e.notes].filter(Boolean).join(' · ').slice(0, 120),
            rating: e.rating ?? 0, goTo: '/places',
          })),
          ...ratings.map(e => ({
            id: `R-${e.id}`, section: 'Ratings', type: e.category, color: '#ff8c00',
            title: e.title,
            preview: e.notes?.slice(0, 120) ?? '',
            rating: e.rating ?? 0, goTo: '/ratings',
          })),
          ...souls.map(e => ({
            id: `S-${e.id}`, section: 'Souls', type: e.role ?? 'Soul', color: e.color,
            title: e.name,
            preview: e.description?.slice(0, 120) ?? '',
            rating: 0, goTo: `/souls/${e.id}`,
          })),
        ];

        setItems(all);
      } catch (err) {
        console.error('search load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const results = q.trim().length >= 2
    ? items.filter(e => {
        const matchesQuery   = (e.title + '|' + e.preview).toLowerCase().includes(q.toLowerCase());
        const matchesSection = filter === 'all' || e.section.toLowerCase() === filter;
        return matchesQuery && matchesSection;
      })
    : [];

  const grouped: Record<string, SearchItem[]> = {};
  results.forEach(r => {
    if (!grouped[r.section]) grouped[r.section] = [];
    grouped[r.section].push(r);
  });

  return (
    <div className={`${s.page} aFadeUp`}>
      <div className={s.header}>
        <h1 className={s.pageTitle}>What are you looking for?</h1>
        <div className={s.searchWrap}>
          <span className={s.searchIcon}>⌕</span>
          <input
            ref={inp}
            className={s.searchInput}
            placeholder={loading ? 'Loading…' : 'Search everything...'}
            value={q}
            onChange={e => setQ(e.target.value)}
            disabled={loading}
          />
          {results.length > 0 && <span className={s.resultCount}>{results.length}</span>}
          {q && <button className={s.clearBtn} onClick={() => setQ('')}>×</button>}
        </div>
        <div className={s.sectionFilters}>
          {SECTIONS.map(sec => (
            <Pill key={sec} active={filter === sec} onClick={() => setFilter(sec)}>
              {sec.charAt(0).toUpperCase() + sec.slice(1)}
            </Pill>
          ))}
        </div>
      </div>

      <div className={s.results}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:'#8a7060', opacity:.4 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⌕</div>
            <div style={{ fontSize: 13 }}>Loading your world…</div>
          </div>
        ) : q.trim().length < 2 ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:'#8a7060', opacity:.4 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⌕</div>
            <div style={{ fontSize: 13 }}>
              {items.length > 0
                ? `Searching across ${items.length} items — type at least 2 characters`
                : 'Type at least 2 characters to search'}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:'#8a7060', opacity:.4 }}>
            No results for &ldquo;{q}&rdquo;
          </div>
        ) : Object.entries(grouped).map(([section, sectionItems]) => (
          <div key={section} className={s.resultGroup}>
            <div className={s.groupLabel}>{section} ({sectionItems.length})</div>
            {sectionItems.map(item => (
              <div key={item.id} className={s.resultCard} onClick={() => router.push(item.goTo)}>
                <div className={s.resultTop}>
                  <Tag color={item.color}>{item.type}</Tag>
                  <div className={s.resultTitle}><Hl text={item.title} query={q} /></div>
                  {item.rating > 0 && <Stars n={item.rating} size={10} />}
                </div>
                {item.preview && (
                  <div className={s.resultPreview}><Hl text={item.preview} query={q} max={100} /></div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}