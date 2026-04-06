'use client';
import React, { useEffect, useState } from 'react';
import s from './stats.module.css';
import { Stars, Bar, Divider } from '@/components/ui';
import { fonts } from '../../lib/token';
import {
  getTasks, getJournalEntries, getRatings,
  getMoodLogs, getIdeas, getQueue, getPlaces, getLibrary, getSouls,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';

const CAT_COLORS: Record<string, string> = {
  link:'#c084fc', media:'#ff8c00', place:'#ffb347', idea:'#a855f7', note:'#8a7060',
};

interface Stats {
  libraryCount:  number;
  placesCount:   number;
  journalCount:  number;
  ratingsCount:  number;
  moodCount:     number;
  ideasCount:    number;
  soulsCount:    number;
  tasksCount:    number;
  queueCount:    number;
  wordCount:     number;
  avgRating:     string;
  topRated:      { title: string; category: string; rating: number }[];
  libraryByType: Record<string, number>;
  ideasByStatus: Record<string, number>;
  moodFreq:      { name: string; color: string; count: number }[];
  tasksDone:     number;
  tasksPending:  number;
}

const MOOD_COLORS: Record<string, string> = {
  happy:'#f59e0b', calm:'#3b82f6', energised:'#ef4444', loved:'#ec4899',
  anxious:'#a855f7', sad:'#6366f1', tired:'#8a7060', frustrated:'#f97316',
};

export default function StatsPage() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [library, places, journals, ratings, moodLogs, ideas, queue, tasks, souls] =
          await Promise.all([
            getLibrary(), getPlaces(), getJournalEntries(), getRatings(),
            getMoodLogs(), getIdeas(), getQueue(), getTasks(), getSouls(),
          ]);

        // Word count from journal bodies
        const wordCount = journals.reduce((acc, j) =>
          acc + (j.body?.split(/\s+/).filter(Boolean).length ?? 0), 0);

        // Avg rating
        const avgRating = ratings.length
          ? (ratings.reduce((a, b) => a + b.rating, 0) / ratings.length).toFixed(1)
          : '—';

        // Top rated (up to 5)
        const topRated = [...ratings]
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 5)
          .map(r => ({ title: r.title, category: r.category, rating: r.rating }));

        // Library by type
        const libraryByType: Record<string, number> = {};
        library.forEach(l => {
          libraryByType[l.type] = (libraryByType[l.type] ?? 0) + 1;
        });

        // Ideas by status
        const ideasByStatus: Record<string, number> = {};
        ideas.forEach(i => {
          ideasByStatus[i.status] = (ideasByStatus[i.status] ?? 0) + 1;
        });

        // Mood frequency
        const moodMap: Record<string, number> = {};
        moodLogs.forEach(m => {
          moodMap[m.feeling_name] = (moodMap[m.feeling_name] ?? 0) + 1;
        });
        const moodFreq = Object.entries(moodMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, count]) => ({
            name, count,
            color: MOOD_COLORS[name] ?? '#ff8c00',
          }));

        // Tasks
        const tasksDone    = tasks.filter(t => t.done).length;
        const tasksPending = tasks.filter(t => !t.done).length;

        setStats({
          libraryCount:  library.length,
          placesCount:   places.length,
          journalCount:  journals.length,
          ratingsCount:  ratings.length,
          moodCount:     moodLogs.length,
          ideasCount:    ideas.length,
          soulsCount:    souls.length,
          tasksCount:    tasks.length,
          queueCount:    queue.length,
          wordCount,
          avgRating,
          topRated,
          libraryByType,
          ideasByStatus,
          moodFreq,
          tasksDone,
          tasksPending,
        });
      } catch(e) {
        console.error('[stats] load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontFamily: fonts.main, color:'#8a7060', fontSize:13 }}>Counting everything…</span>
    </div>
  );

  if (!stats) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ fontFamily: fonts.main, color:'#8a7060', fontSize:13 }}>Could not load stats.</span>
    </div>
  );

  const libraryTotal = Object.values(stats.libraryByType).reduce((a, b) => a + b, 0) || 1;
  const maxMood = Math.max(...stats.moodFreq.map(m => m.count), 1);

  return (
    <div className={`${s.page} aFadeUp`}>
      <div className={s.pageTitle}>Your World, in Numbers 📊</div>
      <div className={s.pageSub}>All time · updates as you add things</div>

      {/* Primary stats */}
      <div className={s.primaryGrid}>
        {([
          ['Library',  stats.libraryCount,  '#ff8c00'],
          ['Places',   stats.placesCount,   '#a855f7'],
          ['Journal',  stats.journalCount,  '#ffb347'],
          ['Rated',    stats.ratingsCount,  '#c084fc'],
        ] as [string, number, string][]).map(([l, n, c]) => (
          <div key={l} className={s.statCard}>
            <div className={s.statNum} style={{ color: c }}>{n}</div>
            <div className={s.statLabel}>{l}</div>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className={s.secondaryGrid}>
        {([
          ['Mood Logs', stats.moodCount,    '#60a5fa'],
          ['Ideas',     stats.ideasCount,   '#c084fc'],
          ['Souls',     stats.soulsCount,   '#a855f7'],
          ['Words',     stats.wordCount.toLocaleString(), '#ff8c00'],
          ['Tasks done',stats.tasksDone,    '#4ade80'],
          ['Queue',     stats.queueCount,   '#ffb347'],
        ] as [string, number | string, string][]).map(([l, n, c]) => (
          <div key={l} className={s.statCard}>
            <div className={s.statNum} style={{ color: c, fontSize: 20 }}>{n}</div>
            <div className={s.statLabel}>{l}</div>
          </div>
        ))}
      </div>

      <div className={s.detailGrid}>

        {/* Top rated */}
        <div className={s.detailCard}>
          <div className={s.detailTitle}>Top Rated</div>
          {stats.topRated.length === 0 ? (
            <div style={{ fontSize:11, color:'#8a7060', opacity:.5 }}>No ratings yet.</div>
          ) : stats.topRated.map(r => (
            <div key={r.title} className={s.ratedItem}>
              <div className={s.ratedRow}>
                <span className={s.ratedName}>{r.title}</span>
                <Stars n={r.rating} size={10} />
              </div>
              <Bar pct={r.rating * 20} />
            </div>
          ))}
          <Divider />
          <div className={s.avgRow}>
            <span className={s.detailTitle} style={{ marginBottom: 0 }}>Avg Rating</span>
            <span className={s.avgNum}>{stats.avgRating} ★</span>
          </div>
          <Divider />
          <div className={s.detailTitle} style={{ marginTop: 8 }}>Tasks</div>
          <div className={s.avgRow}>
            <span style={{ fontSize:11, color:'#4ade80' }}>✓ Done</span>
            <span className={s.avgNum} style={{ color:'#4ade80' }}>{stats.tasksDone}</span>
          </div>
          <div className={s.avgRow}>
            <span style={{ fontSize:11, color:'#8a7060' }}>○ Pending</span>
            <span className={s.avgNum} style={{ color:'#8a7060' }}>{stats.tasksPending}</span>
          </div>
        </div>

        {/* Library breakdown */}
        <div className={s.detailCard}>
          <div className={s.detailTitle}>Library Breakdown</div>
          {Object.keys(stats.libraryByType).length === 0 ? (
            <div style={{ fontSize:11, color:'#8a7060', opacity:.5 }}>No library entries yet.</div>
          ) : Object.entries(stats.libraryByType).map(([type, count]) => {
            const pct = Math.round(count / libraryTotal * 100);
            return (
              <div key={type} className={s.breakdownItem}>
                <div className={s.breakdownRow}>
                  <span>{type}</span>
                  <span className={s.breakdownPct} style={{ color: CAT_COLORS[type] ?? '#ff8c00' }}>
                    {count} · {pct}%
                  </span>
                </div>
                <Bar pct={pct} color={CAT_COLORS[type] ?? '#ff8c00'} />
              </div>
            );
          })}
          <Divider />
          <div className={s.detailTitle}>Ideas Pipeline</div>
          {Object.keys(stats.ideasByStatus).length === 0 ? (
            <div style={{ fontSize:11, color:'#8a7060', opacity:.5 }}>No ideas yet.</div>
          ) : Object.entries(stats.ideasByStatus).map(([st, n]) => (
            <div key={st} className={s.pipelineRow}>
              <span className={s.pipelineStatus}>{st}</span>
              <span className={s.pipelineCount}>{n}</span>
            </div>
          ))}
        </div>

        {/* Mood freq + words */}
        <div className={s.detailCard}>
          <div className={s.detailTitle}>Mood Frequency</div>
          {stats.moodFreq.length === 0 ? (
            <div style={{ fontSize:11, color:'#8a7060', opacity:.5 }}>No mood logs yet.</div>
          ) : stats.moodFreq.map(m => (
            <div key={m.name} className={s.moodItem}>
              <div className={s.moodRow}>
                <span style={{ color: m.color }}>{m.name}</span>
                <span className={s.moodCount}>×{m.count}</span>
              </div>
              <Bar pct={Math.round(m.count / maxMood * 100)} color={m.color} />
            </div>
          ))}
          <div className={s.wordsCard}>
            <div className={s.wordsNum}>{stats.wordCount.toLocaleString()}</div>
            <div className={s.wordsLabel}>Words Written</div>
          </div>
        </div>
      </div>
    </div>
  );
}