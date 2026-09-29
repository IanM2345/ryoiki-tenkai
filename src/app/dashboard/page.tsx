'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Sunrise, Sun, Sunset, MoonStar, Plus, ArrowRight, Shuffle, LibraryBig, MapPin,
  NotebookPen, Star, PenLine, TriangleAlert, CheckCheck, Sparkles, Users,
} from 'lucide-react';
import s from './dashboard.module.css';
import { Btn, Tag, useToast, Toast } from '@/components/ui';
import TaskRow from '@/components/tasks/TaskRow';
import {
  getTasks, addTask, updateTask,
  getJournalEntries, type DbJournalEntry,
  getLibrary, type DbLibraryEntry,
  getSouls, type DbSoul,
  getPlaces, type DbPlace,
  getRatings, type DbRating,
  getSettings, saveSettings,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { type Task, isOverdue, isDueToday, sortOpen } from '@/lib/tasks';
import { localDateStr, fmtDate, relDay } from '@/lib/dates';
import BirthdayCard from '@/components/ui/BirthdayCard';
import StoredImage from '@/components/ui/StoredImage';

const LIBRARY_COLOR: Record<DbLibraryEntry['type'], string> = {
  link: 'var(--pu-l)', media: 'var(--or)', place: 'var(--or-l)', note: 'var(--tx-s)', idea: 'var(--pu-g)',
};

function greetingFor(h: number) {
  if (h < 5)  return { text: 'Good night',     Icon: MoonStar };
  if (h < 12) return { text: 'Good morning',   Icon: h < 8 ? Sunrise : Sun };
  if (h < 17) return { text: 'Good afternoon', Icon: Sun };
  if (h < 21) return { text: 'Good evening',   Icon: Sunset };
  return { text: 'Good night', Icon: MoonStar };
}

/** Ticks once a minute so the greeting and clock stay current. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  return now;
}

export default function DashboardPage() {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [journal, setJournal]   = useState<DbJournalEntry[]>([]);
  const [library, setLibrary]   = useState<DbLibraryEntry[]>([]);
  const [souls, setSouls]       = useState<DbSoul[]>([]);
  const [places, setPlaces]     = useState<DbPlace[]>([]);
  const [ratings, setRatings]   = useState<DbRating[]>([]);
  const [loading, setLoading]   = useState(true);
  const [newText, setNewText]   = useState('');
  const [randIdx, setRandIdx]   = useState(0);
  const [showBirthday, setShowBirthday] = useState(false);
  const [toast, show] = useToast();
  const now = useNow();

  const reload = useCallback(async () => {
      try {
        if (!(await ensureSession())) return;
        const results = await Promise.allSettled([
          getTasks(), getJournalEntries(), getLibrary(), getSouls(), getPlaces(), getRatings(), getSettings(),
        ]);
        const [t, j, l, so, pl, ra, st] = results;
        if (t.status === 'fulfilled')  setTasks(t.value);
        if (j.status === 'fulfilled')  setJournal(j.value);
        if (l.status === 'fulfilled')  { setLibrary(l.value); setRandIdx(Math.floor(Math.random() * Math.max(1, l.value.length))); }
        if (so.status === 'fulfilled') setSouls(so.value);
        if (pl.status === 'fulfilled') setPlaces(pl.value);
        if (ra.status === 'fulfilled') setRatings(ra.value);
        if (st.status === 'fulfilled' && st.value && !st.value.first_login_done) setShowBirthday(true);
        if (results.some(r => r.status === 'rejected')) show('Some things could not load. Try refreshing.', 'var(--red)');
      } finally {
        setLoading(false);
      }
  }, [show]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['tasks', 'journal_entries', 'library', 'souls', 'places', 'ratings', 'user_settings'], reload);

  const today = localDateStr(now ?? undefined);
  const { overdue, dueToday, doneToday } = useMemo(() => {
    const open = tasks.filter(t => !t.done).sort(sortOpen);
    return {
      overdue:   open.filter(t => isOverdue(t, today)),
      dueToday:  open.filter(t => isDueToday(t, today)),
      doneToday: tasks.filter(t => t.done && t.done_at === today),
    };
  }, [tasks, today]);

  const greet = now ? greetingFor(now.getHours()) : null;
  const dateLabel = now?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeLabel = now?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const rand = library.length ? library[randIdx % library.length] : null;

  const stats = [
    { n: library.length, label: 'Saved finds', href: '/library', Icon: LibraryBig,  c: 'var(--or)' },
    { n: places.length,  label: 'Places',      href: '/places',  Icon: MapPin,      c: 'var(--pu-l)' },
    { n: journal.length, label: 'Journal entries', href: '/journal', Icon: NotebookPen, c: 'var(--or-l)' },
    { n: ratings.length, label: 'Ratings',     href: '/ratings', Icon: Star,        c: 'var(--pu-g)' },
  ];

  // ── Task actions ───────────────────────────────────────────
  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    setNewText('');
    try {
      const created = await addTask({ text, priority: 'medium', due_date: today, created_date: today });
      setTasks(prev => [created, ...prev]);
    } catch {
      setNewText(text);
      show('Could not add that task.', 'var(--red)');
    }
  };

  const handleToggle = async (id: string) => {
    const before = tasks.find(t => t.id === id);
    if (!before) return;
    const updates = { done: !before.done, done_at: !before.done ? today : null };
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try { await updateTask(id, updates); }
    catch { setTasks(prev => prev.map(t => t.id === id ? before : t)); show('Could not update that task.', 'var(--red)'); }
  };

  const shuffle = () => {
    if (library.length < 2) return;
    setRandIdx(i => {
      let n = Math.floor(Math.random() * library.length);
      if (n === i % library.length) n = (n + 1) % library.length;
      return n;
    });
  };

  const taskCount = overdue.length + dueToday.length;

  return (
    <div className={s.page}>
      {/* Hero */}
      <header className={s.hero}>
        <div className={s.heroText}>
          <h1 className={s.greeting}>
            {greet ? <><greet.Icon className={s.greetIcon} size={30} strokeWidth={1.75} aria-hidden />{greet.text}</> : ' '}
          </h1>
          <p className={s.date}>{dateLabel}{timeLabel ? <span className={s.time}>{timeLabel}</span> : null}</p>
        </div>
        <div className={s.heroActions}>
          <Link href="/journal/new" className={s.linkReset}>
            <Btn><PenLine size={16} strokeWidth={2} /> Write in journal</Btn>
          </Link>
        </div>
      </header>

      {/* Stats */}
      <nav className={s.stats} aria-label="Your collections">
        {stats.map(({ n, label, href, Icon, c }) => (
          <Link key={label} href={href} className={s.stat} style={{ ['--c' as string]: c }}>
            <span className={s.statIcon}><Icon size={18} strokeWidth={1.75} /></span>
            <span className={s.statNum}>{loading ? <span className={`skeleton ${s.statSkel}`} /> : n}</span>
            <span className={s.statLabel}>{label}</span>
          </Link>
        ))}
      </nav>

      <div className={s.grid}>
        {/* Today */}
        <section className={`${s.card} ${s.todayCard}`} aria-labelledby="today-h">
          <div className={s.cardHead}>
            <h2 id="today-h" className={s.cardTitle}>
              Today
              {taskCount > 0 && <span className={s.count}>{taskCount}</span>}
            </h2>
            <Link href="/tasks" className={s.cardLink}>All tasks <ArrowRight size={14} /></Link>
          </div>

          <form className={s.quickAdd} onSubmit={e => { e.preventDefault(); handleAdd(); }}>
            <Plus size={18} strokeWidth={2} className={s.quickIcon} aria-hidden />
            <input
              className={s.quickInput}
              placeholder="Add something for today"
              aria-label="Add a task for today"
              value={newText}
              onChange={e => setNewText(e.target.value)}
            />
            {newText.trim() && <Btn type="submit" sm>Add</Btn>}
          </form>

          {loading ? (
            <div className={s.skels}>{[0, 1, 2].map(i => <div key={i} className={`skeleton ${s.rowSkel}`} />)}</div>
          ) : (
            <>
              {overdue.length > 0 && (
                <div className={s.group}>
                  <div className={s.groupLabel} data-tone="red"><TriangleAlert size={14} strokeWidth={2} /> Overdue</div>
                  {overdue.map(t => <TaskRow key={t.id} task={t} onToggle={handleToggle} compact />)}
                </div>
              )}
              <div className={s.group}>
                {overdue.length > 0 && dueToday.length > 0 && <div className={s.groupLabel}>Due today</div>}
                {dueToday.map(t => <TaskRow key={t.id} task={t} onToggle={handleToggle} compact />)}
                {taskCount === 0 && (
                  <div className={s.allClear}>
                    <Sparkles size={20} strokeWidth={1.75} />
                    <span>{tasks.length ? 'All clear for today. Enjoy it!' : 'Nothing planned yet. Add a task above.'}</span>
                  </div>
                )}
              </div>
              {doneToday.length > 0 && (
                <div className={s.doneNote}><CheckCheck size={15} strokeWidth={2} /> {doneToday.length} finished today</div>
              )}
            </>
          )}
        </section>

        <div className={s.side}>
          {/* Journal */}
          <section className={s.card} aria-labelledby="journal-h">
            <div className={s.cardHead}>
              <h2 id="journal-h" className={s.cardTitle}>Recent journal</h2>
              <Link href="/journal" className={s.cardLink}>See all <ArrowRight size={14} /></Link>
            </div>
            {loading ? (
              <div className={s.skels}>{[0, 1].map(i => <div key={i} className={`skeleton ${s.rowSkel}`} />)}</div>
            ) : journal.length === 0 ? (
              <p className={s.muted}>No entries yet. Your first one is a click away.</p>
            ) : (
              <ul className={s.entries}>
                {journal.slice(0, 3).map(e => (
                  <li key={e.id}>
                    <Link href={`/journal/${e.id}`} className={s.entry}>
                      <span className={s.entryMood} aria-hidden>{e.mood || <NotebookPen size={16} />}</span>
                      <span className={s.entryText}>
                        <span className={s.entryTitle}>{e.title || 'Untitled'}</span>
                        <span className={s.entryDate}>{relDay(e.entry_date).replace(/^./, c => c.toUpperCase())}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Random pick */}
          <section className={`${s.card} ${s.randomCard}`} aria-labelledby="rand-h">
            <div className={s.cardHead}>
              <h2 id="rand-h" className={s.cardTitle}>From your library</h2>
              {library.length > 1 && (
                <button type="button" className={s.iconBtn} onClick={shuffle} aria-label="Show another">
                  <Shuffle size={16} strokeWidth={2} />
                </button>
              )}
            </div>
            {loading ? <div className={`skeleton ${s.rowSkel}`} /> : rand ? (
              <Link href="/library" className={s.randLink} key={rand.id}>
                <span className={s.randTitle}>{rand.title}</span>
                <span className={s.randMeta}>
                  <Tag color={LIBRARY_COLOR[rand.type]}>{rand.type.charAt(0).toUpperCase() + rand.type.slice(1)}</Tag>
                  <span className={s.muted}>Saved {fmtDate(rand.created_at)}</span>
                </span>
              </Link>
            ) : (
              <p className={s.muted}>Save links, films, books and notes to see one pop up here.</p>
            )}
          </section>

          {/* Souls */}
          <section className={s.card} aria-labelledby="souls-h">
            <div className={s.cardHead}>
              <h2 id="souls-h" className={s.cardTitle}>Souls</h2>
              <Link href="/souls" className={s.cardLink}>View all <ArrowRight size={14} /></Link>
            </div>
            {!loading && souls.length === 0 ? (
              <p className={s.muted}><Users size={15} /> The people who matter will live here.</p>
            ) : (
              <div className={s.avatars}>
                {souls.slice(0, 8).map(soul => {
                  const img = (soul as DbSoul & { image_url?: string | null }).image_url;
                  return (
                    <Link
                      key={soul.id}
                      href={`/souls/${soul.id}`}
                      className={s.avatar}
                      title={soul.name}
                      aria-label={soul.name}
                      style={{ ['--c' as string]: soul.color }}
                    >
                      {img
                        ? <StoredImage src={img} alt="" />
                        : <span aria-hidden>{soul.emoji}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} color={toast.color} />}

      {showBirthday && (
        <BirthdayCard onDismiss={async () => {
          setShowBirthday(false);
          await saveSettings({ first_login_done: true }).catch(() => {});
        }} />
      )}
    </div>
  );
}
