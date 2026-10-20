'use client';
// The side panel: today's tasks and sticky notes, one tap away on every page.
// On a wide screen (laptop, iPad landscape) it can be pinned open beside the page.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, StickyNote, X, Pin, PinOff, Plus, Trash2, ArrowRight } from 'lucide-react';
import {
  getTasks, addTask, updateTask, getStickyNotes, addStickyNote, updateStickyNote, deleteStickyNote,
  type DbStickyNote, type StickyColor,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { useNow } from '@/lib/useNow';
import { type Task, sortOpen, dueAt, defaultReminders, rememberReminders } from '@/lib/tasks';
import { localDateStr } from '@/lib/dates';
import TaskRow from '@/components/tasks/TaskRow';
import { TimeInput } from '@/components/tasks/TimeAndReminders';
import s from './panel.module.css';

const HIDE_ON = ['/login', '/reset-password'];
const OPEN_KEY = 'yw-panel-open', PIN_KEY = 'yw-panel-pinned', TAB_KEY = 'yw-panel-tab';
export const STICKY_COLORS: { key: StickyColor; bg: string }[] = [
  { key: 'yellow', bg: '#fde68a' }, { key: 'pink', bg: '#fbcfe8' }, { key: 'mint', bg: '#bbf7d0' },
  { key: 'sky', bg: '#bae6fd' }, { key: 'lilac', bg: '#ddd6fe' }, { key: 'peach', bg: '#fed7aa' },
];
const bgOf = (c: string) => STICKY_COLORS.find(x => x.key === c)?.bg ?? STICKY_COLORS[0].bg;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export default function SidePanel() {
  const pathname = usePathname() ?? '';
  const hidden = HIDE_ON.some(p => pathname.startsWith(p));
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [tab, setTab] = useState<'tasks' | 'notes'>('tasks');
  const [wide, setWide] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<DbStickyNote[] | null>(null);
  const [notesMissing, setNotesMissing] = useState(false);
  const now = useNow(30000);

  // Restore how she left it (and only start saving changes after that).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setPinned(read(PIN_KEY) === '1');
      setOpen(read(OPEN_KEY) === '1' && read(PIN_KEY) === '1');   // only a pinned panel reopens by itself
      setTab(read(TAB_KEY) === 'notes' ? 'notes' : 'tasks');
      setRestored(true);
    }, 0);
    const mq = window.matchMedia('(min-width: 1100px)');
    const onMq = () => setWide(mq.matches);
    onMq(); mq.addEventListener('change', onMq);
    return () => { clearTimeout(t); mq.removeEventListener('change', onMq); };
  }, []);
  const docked = open && pinned && wide && !hidden;
  useEffect(() => {
    document.body.classList.toggle('panel-docked', docked);
    return () => document.body.classList.remove('panel-docked');
  }, [docked]);
  useEffect(() => { if (restored) write(OPEN_KEY, open ? '1' : '0'); }, [open, restored]);
  useEffect(() => { if (restored) write(PIN_KEY, pinned ? '1' : '0'); }, [pinned, restored]);
  useEffect(() => { if (restored) write(TAB_KEY, tab); }, [tab, restored]);

  // Esc closes it (unless pinned beside the page).
  useEffect(() => {
    if (!open || docked) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, docked]);

  const loadTasks = useCallback(async () => {
    try { if (!(await ensureSession())) return; setTasks(await getTasks()); } catch { /* offline */ }
  }, []);
  const editing = useRef(new Set<string>());
  const loadNotes = useCallback(async () => {
    try {
      if (!(await ensureSession())) return;
      const rows = await getStickyNotes();
      // Keep what she's typing in a note that's open, even if another device saved it.
      setNotes(prev => rows.map(r => (editing.current.has(r.id) ? prev?.find(p => p.id === r.id) ?? r : r)));
      setNotesMissing(false);
    } catch { setNotesMissing(true); setNotes([]); }
  }, []);
  useEffect(() => { if (hidden) return; const t = setTimeout(loadTasks, 0); return () => clearTimeout(t); }, [hidden, loadTasks]);
  useEffect(() => { if (!open || tab !== 'notes' || notes) return; const t = setTimeout(loadNotes, 0); return () => clearTimeout(t); }, [open, tab, notes, loadNotes]);
  useLiveTables(hidden ? [] : ['tasks'], loadTasks);
  useLiveTables(open && !hidden ? ['sticky_notes'] : [], loadNotes);

  const today = localDateStr();
  const groups = useMemo(() => {
    const openT = tasks.filter(t => !t.done).sort(sortOpen);
    const week = localDateStr(new Date(now + 7 * 864e5));
    return {
      overdue: openT.filter(t => { const d = dueAt(t); return !!d && d.getTime() < now; }),
      today: openT.filter(t => { const d = dueAt(t); return (!t.due_date || t.due_date === today) && !(d && d.getTime() < now); }),
      soon: openT.filter(t => !!t.due_date && t.due_date > today && t.due_date <= week),
    };
  }, [tasks, now, today]);
  // Badge: overdue, or due within the hour.
  const urgent = tasks.filter(t => { if (t.done) return false; const d = dueAt(t); return !!d && !!t.due_time && d.getTime() - now < 60 * 60000; }).length;

  const toggleTask = async (id: string) => {
    const before = tasks.find(t => t.id === id); if (!before) return;
    const upd = { done: !before.done, done_at: !before.done ? today : null };
    setTasks(p => p.map(t => (t.id === id ? { ...t, ...upd } : t)));
    try { await updateTask(id, upd); } catch { setTasks(p => p.map(t => (t.id === id ? before : t))); }
  };

  const [qText, setQText] = useState('');
  const [qTime, setQTime] = useState('');
  const quickAdd = async () => {
    const text = qText.trim(); if (!text) return;
    const remind = qTime ? defaultReminders() : [];
    setQText(''); setQTime('');
    try {
      const t = await addTask({ text, priority: 'medium', due_date: today, due_time: qTime || null, remind_before: remind, created_date: today });
      if (qTime) rememberReminders(remind);
      setTasks(p => [t, ...p]);
    } catch { setQText(text); }
  };

  if (hidden) return null;
  return (
    <>
      {!open && (
        <button type="button" className={s.tab} onClick={() => setOpen(true)} aria-label="Open tasks and sticky notes">
          <ListChecks size={18} />
          <StickyNote size={17} className={s.tabNote} />
          {urgent > 0 && <span className={s.badge}>{urgent}</span>}
        </button>
      )}
      {open && !docked && <div className={s.backdrop} onClick={() => setOpen(false)} aria-hidden />}
      <aside className={`${s.panel} ${open ? s.open : ''} ${docked ? s.docked : ''}`} aria-label="Tasks and sticky notes" aria-hidden={!open} inert={!open}>
        <header className={s.head}>
          <div className={s.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? s.tabOn : ''} onClick={() => setTab('tasks')}>
              <ListChecks size={16} /> Tasks{groups.overdue.length + groups.today.length ? <i>{groups.overdue.length + groups.today.length}</i> : null}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? s.tabOn : ''} onClick={() => setTab('notes')}>
              <StickyNote size={16} /> Notes{notes?.length ? <i>{notes.length}</i> : null}
            </button>
          </div>
          {wide && (
            <button type="button" className={s.iconBtn} onClick={() => setPinned(p => !p)} aria-pressed={pinned} title={pinned ? 'Unpin' : 'Keep it open beside the page'}>
              {pinned ? <PinOff size={17} /> : <Pin size={17} />}
            </button>
          )}
          <button type="button" className={s.iconBtn} onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
        </header>

        {tab === 'tasks' ? (
          <div className={s.body}>
            <form className={s.quick} onSubmit={e => { e.preventDefault(); quickAdd(); }}>
              <input value={qText} onChange={e => setQText(e.target.value)} placeholder="Add a task for today" aria-label="New task" />
              <div className={s.quickRow}>
                <TimeInput value={qTime} onChange={setQTime} />
                <button type="submit" className={s.addBtn} disabled={!qText.trim()}><Plus size={16} /> Add</button>
              </div>
            </form>
            {(['overdue', 'today', 'soon'] as const).map(k => groups[k].length > 0 && (
              <section key={k} className={s.group}>
                <h3 className={k === 'overdue' ? s.late : ''}>{k === 'overdue' ? 'Late' : k === 'today' ? 'Today' : 'Next 7 days'}</h3>
                {groups[k].map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} compact />)}
              </section>
            ))}
            {!groups.overdue.length && !groups.today.length && !groups.soon.length && (
              <p className={s.empty}>Nothing due this week. Enjoy it, or add something above.</p>
            )}
            <Link href="/tasks" className={s.more} onClick={() => !docked && setOpen(false)}>All tasks <ArrowRight size={14} /></Link>
          </div>
        ) : (
          <Notes notes={notes} missing={notesMissing} setNotes={setNotes} editing={editing} />
        )}
      </aside>
    </>
  );
}

function Notes({ notes, missing, setNotes, editing }: {
  notes: DbStickyNote[] | null; missing: boolean;
  setNotes: React.Dispatch<React.SetStateAction<DbStickyNote[] | null>>; editing: React.RefObject<Set<string>>;
}) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const add = async () => {
    const used = new Set((notes ?? []).slice(0, 3).map(n => n.color));
    const color = STICKY_COLORS.find(c => !used.has(c.key))?.key ?? 'yellow';
    try { const n = await addStickyNote({ color }); setNotes(p => [n, ...(p ?? [])]); setFresh(n.id); } catch { /* offline */ }
  };
  const patch = (id: string, p: Partial<DbStickyNote>, debounce = 0) => {
    setNotes(list => (list ?? []).map(n => (n.id === id ? { ...n, ...p } : n)));
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => {
      updateStickyNote(id, p).catch(() => {});
    }, debounce));
  };
  const remove = async (id: string) => {
    setNotes(list => (list ?? []).filter(n => n.id !== id)); setConfirmDel(null);
    deleteStickyNote(id).catch(() => {});
  };

  if (missing) return <div className={s.body}><p className={s.empty}>Sticky notes need the latest database update.</p></div>;
  if (!notes) return <div className={s.body}><p className={s.empty}>Loading…</p></div>;
  const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return (
    <div className={s.body}>
      <button type="button" className={s.newNote} onClick={add}><Plus size={16} /> New sticky note</button>
      {!notes.length && <p className={s.empty}>Jot anything down. With an Apple Pencil you can write straight into a note.</p>}
      <div className={s.notes}>
        {sorted.map((n, i) => (
          <div key={n.id} className={s.note} style={{ ['--bg' as string]: bgOf(n.color), ['--tilt' as string]: `${i % 2 ? 0.6 : -0.6}deg` }}>
            {n.pinned && <Pin size={13} className={s.pinMark} aria-label="Pinned" />}
            <textarea
              value={n.body}
              placeholder="Write something…"
              aria-label="Sticky note"
              autoFocus={fresh === n.id}
              onFocus={() => editing.current.add(n.id)}
              onBlur={() => { editing.current.delete(n.id); if (fresh === n.id) setFresh(null); }}
              onChange={e => patch(n.id, { body: e.target.value }, 700)}
              rows={Math.min(10, Math.max(3, n.body.split('\n').length + 1))}
            />
            <div className={s.noteBar}>
              <div className={s.colors}>
                {STICKY_COLORS.map(c => (
                  <button key={c.key} type="button" aria-label={`${c.key} note`} aria-pressed={n.color === c.key}
                    style={{ background: c.bg }} className={n.color === c.key ? s.colorOn : ''} onClick={() => patch(n.id, { color: c.key })} />
                ))}
              </div>
              <button type="button" onClick={() => patch(n.id, { pinned: !n.pinned })} aria-label={n.pinned ? 'Unpin note' : 'Pin note to the top'} title={n.pinned ? 'Unpin' : 'Pin to the top'}>
                {n.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              {confirmDel === n.id
                ? <button type="button" className={s.delConfirm} onClick={() => remove(n.id)}>Delete?</button>
                : <button type="button" onClick={() => setConfirmDel(n.id)} aria-label="Delete note"><Trash2 size={14} /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
