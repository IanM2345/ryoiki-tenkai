'use client';
import React, { useEffect, useState } from 'react';
import {
  BookOpen, MapPin, NotebookPen, Star, Smile, Lightbulb, Users, CircleCheck, ListVideo,
  PenLine, CalendarDays, Trophy, LibraryBig, Heart, ChartColumn,
} from 'lucide-react';
import s from './stats.module.css';
import { Stars, Topbar, EmptyState, Toast, useToast } from '@/components/ui';
import {
  getTasks, getJournalEntries, getRatings, getMoodLogs, getMoodDefs,
  getIdeas, getQueue, getPlaces, getLibrary, getSouls,
} from '@/lib/db';
import type { DbIdea, DbLibraryEntry, DbMoodDef } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { localDateStr } from '@/lib/dates';

const MAX_W = 1100;

type LibType = DbLibraryEntry['type'];
const LIB_META: Record<LibType, { label: string; color: string }> = {
  link:  { label: 'Links',  color: 'var(--pu-l)' },
  media: { label: 'Media',  color: 'var(--or)' },
  place: { label: 'Places', color: 'var(--or-l)' },
  note:  { label: 'Notes',  color: 'var(--pu-g)' },
  idea:  { label: 'Ideas',  color: 'var(--yellow)' },
};

type IStatus = DbIdea['status'];
const IDEA_ORDER: IStatus[] = ['thinking', 'planning', 'doing', 'done'];
const IDEA_META: Record<IStatus, { label: string; color: string }> = {
  thinking: { label: 'Thinking', color: 'var(--pu-l)' },
  planning: { label: 'Planning', color: 'var(--or)' },
  doing:    { label: 'Doing',    color: 'var(--gr)' },
  done:     { label: 'Done',     color: 'var(--tx-m)' },
};

interface BarRow { key: string; label: string; value: number; color: string; note?: string }

interface Stats {
  counts: { library: number; places: number; journal: number; ratings: number; moods: number; ideas: number; souls: number; queue: number };
  words: number;
  avgRating: number | null;
  topRated: { id: string; title: string; category: string; rating: number }[];
  tasksDone: number;
  tasksOpen: number;
  library: BarRow[];
  ideas: BarRow[];
  moods: BarRow[];
  month: { entries: number; tasks: number; places: number };
}

const fmt = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** Horizontal bar chart. Values are shown as text; the bar itself is decorative. */
function BarList({ rows, total, emptyMsg, unit }: { rows: BarRow[]; total?: number; emptyMsg: string; unit: [string, string] }) {
  if (rows.length === 0) return <p className={s.empty}>{emptyMsg}</p>;
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <ul className={s.bars}>
      {rows.map(r => {
        const pct = total ? Math.round((r.value / total) * 100) : null;
        return (
          <li key={r.key} className={s.barRow} style={{ ['--c' as string]: r.color }}>
            <span className={s.barLabel}>{r.label}</span>
            <span className={s.barValue}>
              {r.value === 1 ? `1 ${unit[0]}` : `${fmt(r.value)} ${unit[1]}`}
              {pct !== null && <span className={s.barPct}> ({pct}%)</span>}
            </span>
            <span className={s.barTrack} aria-hidden>
              <span className={s.barFill} style={{ ['--w' as string]: `${(r.value / max) * 100}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Tile({ icon, label, value, color, hint }: { icon: React.ReactNode; label: string; value: string; color: string; hint?: string }) {
  return (
    <div className={s.tile} style={{ ['--c' as string]: color }}>
      <span className={s.tileIcon} aria-hidden>{icon}</span>
      <span className={s.tileBody}>
        <span className={s.tileValue}>{value}</span>
        <span className={s.tileLabel}>{label}</span>
        {hint && <span className={s.tileHint}>{hint}</span>}
      </span>
    </div>
  );
}

function Panel({ title, icon, children, className = '' }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${s.panel} ${className}`} aria-label={title}>
      <h2 className={s.panelTitle}><span aria-hidden>{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, show] = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        const [library, places, journals, ratings, moodLogs, moodDefs, ideas, queue, tasks, souls] = await Promise.all([
          getLibrary(), getPlaces(), getJournalEntries(), getRatings(), getMoodLogs(),
          getMoodDefs().catch(() => [] as DbMoodDef[]),
          getIdeas(), getQueue(), getTasks(), getSouls(),
        ]);

        const words = journals.reduce((acc, j) => acc + (j.body?.split(/\s+/).filter(Boolean).length ?? 0), 0);
        const avgRating = ratings.length ? ratings.reduce((a, b) => a + b.rating, 0) / ratings.length : null;
        const topRated = [...ratings]
          .sort((a, b) => b.rating - a.rating || b.updated_at.localeCompare(a.updated_at))
          .slice(0, 5)
          .map(r => ({ id: r.id, title: r.title, category: r.category, rating: r.rating }));

        const libCounts = new Map<LibType, number>();
        library.forEach(l => libCounts.set(l.type, (libCounts.get(l.type) ?? 0) + 1));
        const libRows: BarRow[] = [...libCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, value]) => ({
            key: type, value,
            label: LIB_META[type]?.label ?? type,
            color: LIB_META[type]?.color ?? 'var(--or)',
          }));

        const ideaRows: BarRow[] = IDEA_ORDER
          .map(st => ({ key: st, label: IDEA_META[st].label, color: IDEA_META[st].color, value: ideas.filter(i => i.status === st).length }))
          .filter(r => r.value > 0);

        const defById = new Map(moodDefs.map(d => [d.id, d]));
        const defByName = new Map(moodDefs.map(d => [d.name.toLowerCase(), d]));
        const moodMap = new Map<string, BarRow>();
        moodLogs.forEach(m => {
          const key = m.feeling_name.toLowerCase();
          const row = moodMap.get(key);
          if (row) { row.value += 1; return; }
          const def = (m.mood_def_id && defById.get(m.mood_def_id)) || defByName.get(key);
          moodMap.set(key, { key, label: m.feeling_name, value: 1, color: def?.color || m.feeling_color || 'var(--pu-l)' });
        });
        const moodRows = [...moodMap.values()].sort((a, b) => b.value - a.value).slice(0, 8);

        const month = localDateStr().slice(0, 7);
        const inMonth = (d: string | null | undefined) => !!d && d.slice(0, 7) === month;

        setStats({
          counts: {
            library: library.length, places: places.length, journal: journals.length, ratings: ratings.length,
            moods: moodLogs.length, ideas: ideas.length, souls: souls.length, queue: queue.length,
          },
          words,
          avgRating,
          topRated,
          tasksDone: tasks.filter(t => t.done).length,
          tasksOpen: tasks.filter(t => !t.done).length,
          library: libRows,
          ideas: ideaRows,
          moods: moodRows,
          month: {
            entries: journals.filter(j => inMonth(j.entry_date)).length,
            tasks: tasks.filter(t => t.done && inMonth(t.done_at)).length,
            places: places.filter(p => inMonth(p.visit_date)).length,
          },
        });
      } catch {
        show('Could not load your stats.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  return (
    <div className={s.page}>
      <Topbar title="Stats" sub="Your world in numbers, all time" maxWidth={MAX_W} />

      <div className={s.wrap}>
        {loading ? (
          <>
            <div className={s.monthRow}>{[0, 1, 2].map(i => <div key={i} className={`skeleton ${s.skelTile}`} />)}</div>
            <div className={s.tiles}>{Array.from({ length: 10 }, (_, i) => <div key={i} className={`skeleton ${s.skelTile}`} />)}</div>
            <div className={s.panels}>{[0, 1, 2, 3].map(i => <div key={i} className={`skeleton ${s.skelPanel}`} />)}</div>
          </>
        ) : !stats ? (
          <EmptyState icon={<ChartColumn size={26} />} msg="Your stats could not load right now. Try again in a moment." />
        ) : (
          <>
            <section className={s.month} aria-labelledby="month-title">
              <h2 id="month-title" className={s.sectionTitle}><CalendarDays size={16} strokeWidth={2} aria-hidden /> This month, {monthName}</h2>
              <div className={s.monthRow}>
                <Tile icon={<NotebookPen size={18} />} color="var(--or)" value={fmt(stats.month.entries)}
                  label={stats.month.entries === 1 ? 'entry written' : 'entries written'} />
                <Tile icon={<CircleCheck size={18} />} color="var(--gr)" value={fmt(stats.month.tasks)}
                  label={stats.month.tasks === 1 ? 'task finished' : 'tasks finished'} />
                <Tile icon={<MapPin size={18} />} color="var(--pu-l)" value={fmt(stats.month.places)}
                  label={stats.month.places === 1 ? 'place visited' : 'places visited'} />
              </div>
            </section>

            <h2 className={s.sectionTitle}><ChartColumn size={16} strokeWidth={2} aria-hidden /> All time</h2>
            <div className={s.tiles}>
              <Tile icon={<BookOpen size={18} />}    color="var(--or)"     value={fmt(stats.counts.library)} label="Library" />
              <Tile icon={<MapPin size={18} />}      color="var(--pu-l)"   value={fmt(stats.counts.places)}  label="Places" />
              <Tile icon={<NotebookPen size={18} />} color="var(--or-l)"   value={fmt(stats.counts.journal)} label="Journal entries" />
              <Tile icon={<PenLine size={18} />}     color="var(--or)"     value={fmt(stats.words)}          label="Words written" />
              <Tile icon={<Star size={18} />}        color="var(--yellow)" value={fmt(stats.counts.ratings)} label="Things rated" />
              <Tile icon={<Smile size={18} />}       color="var(--blue)"   value={fmt(stats.counts.moods)}   label="Moods logged" />
              <Tile icon={<Lightbulb size={18} />}   color="var(--pu-g)"   value={fmt(stats.counts.ideas)}   label="Ideas" />
              <Tile icon={<Users size={18} />}       color="var(--pu-l)"   value={fmt(stats.counts.souls)}   label="Souls" />
              <Tile icon={<CircleCheck size={18} />} color="var(--gr)"     value={fmt(stats.tasksDone)}      label="Tasks done"
                hint={stats.tasksOpen ? `${fmt(stats.tasksOpen)} still open` : 'All caught up'} />
              <Tile icon={<ListVideo size={18} />}   color="var(--or-l)"   value={fmt(stats.counts.queue)}   label="In the queue" />
            </div>

            <div className={s.panels}>
              <Panel title="Top rated" icon={<Trophy size={16} strokeWidth={2} />}>
                {stats.topRated.length === 0 ? (
                  <p className={s.empty}>Nothing rated yet. Rate something and it will show up here.</p>
                ) : (
                  <>
                    <ol className={s.rated}>
                      {stats.topRated.map((r, i) => (
                        <li key={r.id} className={s.ratedRow}>
                          <span className={s.ratedRank} aria-hidden>{i + 1}</span>
                          <span className={s.ratedText}>
                            <span className={s.ratedName}>{r.title}</span>
                            {r.category && <span className={s.ratedCat}>{r.category}</span>}
                          </span>
                          <Stars n={r.rating} size={13} />
                        </li>
                      ))}
                    </ol>
                    <p className={s.avg}>
                      Average rating <strong>{stats.avgRating?.toFixed(1)}</strong> out of 5
                    </p>
                  </>
                )}
              </Panel>

              <Panel title="Library breakdown" icon={<LibraryBig size={16} strokeWidth={2} />}>
                <BarList rows={stats.library} total={stats.counts.library} unit={['item', 'items']}
                  emptyMsg="Your library is empty so far." />
              </Panel>

              <Panel title="Ideas pipeline" icon={<Lightbulb size={16} strokeWidth={2} />}>
                <BarList rows={stats.ideas} total={stats.counts.ideas} unit={['idea', 'ideas']}
                  emptyMsg="No ideas yet. The first one is always the hardest." />
              </Panel>

              <Panel title="Mood frequency" icon={<Heart size={16} strokeWidth={2} />}>
                <BarList rows={stats.moods} unit={['time', 'times']}
                  emptyMsg="No moods logged yet." />
                {stats.counts.moods > 0 && (
                  <p className={s.avg}>{plural(stats.counts.moods, 'check in')} in total</p>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
