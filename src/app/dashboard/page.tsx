'use client';
import React, { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import s from './dashboard.module.css';
import { Btn, Tag, useToast, Toast } from '@/components/ui';
import {
  getTasks, addTask, updateTask, deleteTask, clearDoneTasks, type DbTask,
  getJournalEntries, type DbJournalEntry,
  getLibrary, type DbLibraryEntry,
  getSouls, type DbSoul,
  getPlaces, type DbPlace,
  getRatings, type DbRating,
  getSettings, saveSettings,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import BirthdayCard from '@/components/ui/BirthdayCard';

// ─── TASK TYPES — aligned with DB schema ─────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type Task = DbTask;

export const PRIO_COLOR: Record<Priority, string> = {
  high:   '#f87171',
  medium: '#ff8c00',
  low:    '#4ade80',
};

// ─── LIBRARY COLOR MAP ────────────────────────────────────────

const LIBRARY_COLOR: Record<DbLibraryEntry['type'], string> = {
  link:  '#a855f7',
  media: '#ff8c00',
  place: '#ffb347',
  note:  '#8a7060',
  idea:  '#c084fc',
};

// ─── HELPERS ──────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];

export const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IE', {
    day: 'numeric', month: 'short',
  });

export const isOverdue = (t: Task) =>
  !t.done && t.due_date !== null && t.due_date < todayStr();

function getGreeting(hour: number): string {
  if (hour >= 0  && hour < 7)  return 'Good night';
  if (hour >= 7  && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getGreetingEmoji(hour: number): string {
  if (hour >= 0  && hour < 7)  return '⭐';
  if (hour >= 7  && hour < 12) return '☀️';
  if (hour >= 12 && hour < 17) return '✨';
  return '🌙';
}

const noopSubscribe = () => () => {};

// ─── MINI TASK ROW ─────────────────────────────────────────────

function MiniTaskRow({
  task, onToggle, onDelete,
  showDueDate = false, showDoneDate = false, showOverdueBadge = false,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete:  (id: string) => void;
  showDueDate?:      boolean;
  showDoneDate?:     boolean;
  showOverdueBadge?: boolean;
}) {
  return (
    <div className={`${s.taskRow} ${task.done ? s.taskRowDone : ''}`}>
      <div
        className={`${s.taskCheck} ${task.done ? s.taskCheckOn : s.taskCheckOff}`}
        onClick={() => onToggle(task.id)}
      >
        {task.done && <span className={s.taskCheckMark}>✓</span>}
      </div>
      <div className={s.taskPrioDot} style={{ background: PRIO_COLOR[task.priority] }} />
      <div className={s.taskBody}>
        <span className={`${s.taskText} ${task.done ? s.taskTextDone : ''}`}>{task.text}</span>
        {showOverdueBadge && task.due_date && (
          <span className={s.overdueTag}>⚠ due {fmtDate(task.due_date)}</span>
        )}
        {showDueDate && task.due_date && !showOverdueBadge && (
          <span className={s.dueTag}>due {fmtDate(task.due_date)}</span>
        )}
        {showDoneDate && task.done_at && (
          <span className={s.doneTag}>✓ {fmtDate(task.done_at)}</span>
        )}
      </div>
      <button className={s.taskDel} onClick={() => onDelete(task.id)}>×</button>
    </div>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tasks,            setTasks]            = useState<Task[]>([]);
  const [journal,          setJournal]          = useState<DbJournalEntry[]>([]);
  const [library,          setLibrary]          = useState<DbLibraryEntry[]>([]);
  const [souls,            setSouls]            = useState<DbSoul[]>([]);
  const [places,           setPlaces]           = useState<DbPlace[]>([]);
  const [ratings,          setRatings]          = useState<DbRating[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [newText,          setNewText]          = useState('');
  const [newDue,           setNewDue]           = useState('');
  const [prio,             setPrio]             = useState<Priority>('medium');
  const [randIdx,          setRandIdx]          = useState(0);
  const [showBirthdayCard, setShowBirthdayCard] = useState(false);
  const [toast, show]                           = useToast();

  // ── Load everything on mount ──────────────────────────────────
  useEffect(() => {
    async function load() {
      await new Promise(r => setTimeout(r, 100));
      const ready = await ensureSession();
      if (!ready) { setLoading(false); return; }
      try {
        const [t, j, l, so, pl, ra, settings] = await Promise.all([
          getTasks(),
          getJournalEntries(),
          getLibrary(),
          getSouls(),
          getPlaces(),
          getRatings(),
          getSettings(),
        ]);
        setTasks(t);
        setJournal(j);
        setLibrary(l);
        setSouls(so);
        setPlaces(pl);
        setRatings(ra);
        if (settings && !settings.first_login_done) {
          setShowBirthdayCard(true);
        }
      } catch (err) {
        console.error('dashboard load error:', err);
        show('Could not load some data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Time-based greeting ───────────────────────────────────────
  const greeting = useSyncExternalStore(noopSubscribe, () => getGreeting(new Date().getHours()), () => '');
  const emoji    = useSyncExternalStore(noopSubscribe, () => getGreetingEmoji(new Date().getHours()), () => '');
  const today    = useSyncExternalStore(noopSubscribe, () => new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' }), () => '');
  const time     = useSyncExternalStore(noopSubscribe, () => new Date().toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }), () => '');

  // ── Derived buckets ──────────────────────────────────────────
  const todayTasks   = tasks.filter(t => !t.done && !isOverdue(t));
  const overdueTasks = tasks.filter(t => isOverdue(t));
  const doneTasks    = tasks
    .filter(t => t.done)
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));

  const recentJournal = journal.slice(0, 3);
  const rand          = library.length > 0 ? library[randIdx % library.length] : null;

  const STATS = [
    { n: library.length,  label: 'Saved Items',    color: '#ff8c00', href: '/library'  },
    { n: places.length,   label: 'Places',          color: '#a855f7', href: '/places'   },
    { n: journal.length,  label: 'Journal Entries', color: '#ffb347', href: '/journal'  },
    { n: ratings.length,  label: 'Rated',           color: '#c084fc', href: '/ratings'  },
  ];

  // ── Actions ───────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newText.trim()) return;
    try {
      const created = await addTask({
        text:         newText.trim(),
        priority:     prio,
        due_date:     newDue || todayStr(),
        created_date: todayStr(),
      });
      setTasks(prev => [created, ...prev]);
      setNewText(''); setNewDue('');
      show('Task added!');
    } catch { show('Could not add task.'); }
  };

  const handleToggle = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const updates = {
      done:    !task.done,
      done_at: !task.done ? todayStr() : null,
    };
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try {
      await updateTask(id, updates);
    } catch {
      setTasks(prev => prev.map(t => t.id === id ? task : t));
      show('Could not update task.');
    }
  };

  const handleDelete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await deleteTask(id);
    } catch { show('Could not delete task.'); }
  };

  const handleClearDone = async () => {
    setTasks(prev => prev.filter(t => !t.done));
    try {
      await clearDoneTasks();
      show('Done tasks cleared.');
    } catch { show('Could not clear tasks.'); }
  };

  return (
    <div className={`${s.page} aFadeUp`}>

      {/* Header */}
      <div className={s.header}>
        <div>
          <div className={s.greeting}>{greeting} {emoji}</div>
          <div className={s.date}>{today}{time ? ` · ${time}` : ''}</div>
        </div>
        <div className={s.headerActions}>
          <Link href="/tasks"><Btn variant="ghost" sm>All Tasks</Btn></Link>
          <Link href="/journal/new"><Btn sm>+ New entry</Btn></Link>
        </div>
      </div>

      {/* Stats */}
      <div className={s.statsGrid}>
        {STATS.map(({ n, label, color, href }) => (
          <Link key={label} href={href} className={s.statCard}>
            <div className={s.statNum} style={{ color }}>{loading ? '…' : n}</div>
            <div className={s.statLabel}>{label}</div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className={s.mainGrid}>

        {/* Recent Journal */}
        <div className={s.widget}>
          <div className={s.widgetHeader}>
            <span className={s.widgetTitle}>Recent Journal</span>
            <Link href="/journal" className={s.widgetLink}>see all →</Link>
          </div>
          {loading ? (
            <div className={s.journalEntry} style={{ opacity: 0.4 }}>Loading…</div>
          ) : recentJournal.length === 0 ? (
            <div className={s.journalEntry} style={{ opacity: 0.4 }}>No entries yet ✦</div>
          ) : recentJournal.map(e => (
            <Link key={e.id} href={`/journal/${e.id}`} className={s.journalEntry}>
              <div className={s.journalEntryLeft}>
                <div className={s.journalEntryTitle}>{e.title}</div>
                <div className={s.journalEntryDate}>{e.entry_date}</div>
              </div>
              {e.mood && <span className={s.journalEntryMood}>{e.mood}</span>}
            </Link>
          ))}
        </div>

        <div className={s.rightCol}>

          {/* Random Pick */}
          <div className={s.randomCard}>
            <div className={s.randomHeader}>
              <span className={s.widgetTitle}>✦ Random Pick</span>
              {library.length > 1 && (
                <button
                  className={s.shuffleBtn}
                  onClick={() => {
                    setRandIdx(i => {
                      let next = Math.floor(Math.random() * library.length);
                      if (library.length > 1 && next === i) next = (i + 1) % library.length;
                      return next;
                    });
                    show('Shuffled!');
                  }}
                >↻</button>
              )}
            </div>
            {loading ? (
              <div className={s.randomTitle} style={{ opacity: 0.4 }}>Loading…</div>
            ) : rand ? (
              <>
                <div className={s.randomTitle}>{rand.title}</div>
                <Tag color={LIBRARY_COLOR[rand.type]}>{rand.type}</Tag>
              </>
            ) : (
              <div className={s.randomTitle} style={{ opacity: 0.4 }}>Add items to your library ✦</div>
            )}
          </div>

          {/* Souls */}
          <div className={s.soulsWidget}>
            <div className={s.widgetHeader}>
              <span className={s.widgetTitle}>Souls</span>
              <Link href="/souls" className={s.widgetLink}>view all →</Link>
            </div>
            <div className={s.soulsAvatarRow}>
              {loading ? null : souls.length === 0 ? (
                <span style={{ opacity: 0.4, fontSize: 13 }}>No souls yet ✦</span>
              ) : souls.slice(0, 6).map(soul => {
                const imgUrl = (soul as DbSoul & { image_url?: string }).image_url;
                return (
                  <Link
                    key={soul.id}
                    href={`/souls/${soul.id}`}
                    title={soul.name}
                    className={s.soulBubble}
                    style={{
                      background: imgUrl
                        ? 'transparent'
                        : `radial-gradient(circle at 35% 35%,${soul.color}cc,${soul.color}44)`,
                      border: `2px solid ${soul.color}44`,
                      overflow: 'hidden',
                      padding: imgUrl ? 0 : undefined,
                    }}
                  >
                    {imgUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={imgUrl} alt={soul.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : soul.emoji
                    }
                  </Link>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Task section */}
      <div className={s.taskSection}>

        {/* Today */}
        <div className={s.taskCard}>
          <div className={s.taskCardHeader}>
            <span className={s.widgetTitle}>
              Today <span className={s.taskCount}>{todayTasks.length}</span>
            </span>
            <div className={s.prioRow}>
              {(['high','medium','low'] as Priority[]).map(p => (
                <span key={p} className={s.prioChip} onClick={() => setPrio(p)}
                  style={{ background: prio===p ? PRIO_COLOR[p] : 'transparent', borderColor: PRIO_COLOR[p]+'55', color: prio===p ? '#000' : PRIO_COLOR[p] }}
                >{p}</span>
              ))}
            </div>
          </div>
          <div className={s.taskList}>
            {loading
              ? <div className={s.taskEmpty}>Loading...</div>
              : todayTasks.length === 0
                ? <div className={s.taskEmpty}>All done for today 🎉</div>
                : todayTasks.map(t => <MiniTaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} showDueDate />)
            }
          </div>
          <div className={s.addRow}>
            <div className={s.addRowTop}>
              <input className={s.taskInput} placeholder="Add a task…" value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              <Btn sm onClick={handleAdd}>+ Add</Btn>
            </div>
            <div className={s.addRowBottom}>
              <input type="date" className={s.dateInput} value={newDue}
                onChange={e => setNewDue(e.target.value)} title="Due date (optional)" />
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div className={`${s.taskCard} ${s.taskCardOverdue}`}>
          <div className={s.taskCardHeader}>
            <span className={s.widgetTitle}>
              Overdue {overdueTasks.length > 0 && <span className={s.taskCountRed}>{overdueTasks.length}</span>}
            </span>
            {overdueTasks.length === 0 && <span className={s.allClearBadge}>✓ clear</span>}
          </div>
          <div className={s.taskList}>
            {overdueTasks.length === 0
              ? <div className={s.taskEmpty}>Nothing overdue ✦</div>
              : overdueTasks.map(t => <MiniTaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} showOverdueBadge />)
            }
          </div>
        </div>

        {/* Finished */}
        <div className={`${s.taskCard} ${s.taskCardDone}`}>
          <div className={s.taskCardHeader}>
            <span className={s.widgetTitle}>
              Finished {doneTasks.length > 0 && <span className={s.taskCount}>{doneTasks.length}</span>}
            </span>
            {doneTasks.length > 0 && <button className={s.clearBtn} onClick={handleClearDone}>clear all</button>}
          </div>
          <div className={s.taskList}>
            {doneTasks.length === 0
              ? <div className={s.taskEmpty}>Nothing finished yet</div>
              : doneTasks.map(t => <MiniTaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} showDoneDate />)
            }
          </div>
        </div>

      </div>

      {toast !== null && <Toast msg={toast.msg} color={toast.color} />}

      {/* Birthday card — only on first ever login */}
      {showBirthdayCard && (
        <BirthdayCard onDismiss={async () => {
          setShowBirthdayCard(false);
          await saveSettings({ first_login_done: true });
        }} />
      )}

    </div>
  );
}