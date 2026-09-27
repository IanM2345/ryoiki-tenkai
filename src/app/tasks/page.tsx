'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, ListChecks, PartyPopper, CalendarDays, Sparkles, Eraser } from 'lucide-react';
import s from './tasks.module.css';
import {
  Btn, InnerTabs, SearchBar, Topbar, Pill, Modal, ModalTitle, ModalFooter, Confirm,
  Toast, useToast, FInput, EmptyState, Lbl,
} from '@/components/ui';
import TaskRow from '@/components/tasks/TaskRow';
import { getTasks, addTask, updateTask, deleteTask, clearDoneTasks } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import {
  type Task, type Priority, PRIORITIES, PRIO_COLOR, PRIO_LABEL,
  isOverdue, isDueToday, isUpcoming, sortOpen, sortDone,
} from '@/lib/tasks';
import { localDateStr } from '@/lib/dates';

type TabKey = 'today' | 'upcoming' | 'overdue' | 'done' | 'all';

function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className={s.prioPicker} role="radiogroup" aria-label="Priority">
      {PRIORITIES.map(p => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          className={`${s.prioOpt} ${value === p ? s.prioOptOn : ''}`}
          style={{ ['--c' as string]: PRIO_COLOR[p] }}
          onClick={() => onChange(p)}
        >
          <span className={s.prioDot} />
          {PRIO_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<TabKey>('today');
  const [search, setSearch]   = useState('');
  const [prioF, setPrioF]     = useState<Priority | 'all'>('all');

  const [newText, setNewText] = useState('');
  const [newDue, setNewDue]   = useState('');
  const [newPrio, setNewPrio] = useState<Priority>('medium');
  const [adding, setAdding]   = useState(false);

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editText, setEditText] = useState('');
  const [editDue, setEditDue]   = useState('');
  const [editPrio, setEditPrio] = useState<Priority>('medium');

  const [delId, setDelId]           = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, show] = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (!(await ensureSession())) return;
        setTasks(await getTasks());
      } catch {
        show('Could not load your tasks.', 'var(--red)');
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  const today = localDateStr();
  const buckets = useMemo(() => {
    const open = tasks.filter(t => !t.done).sort(sortOpen);
    return {
      today:    open.filter(t => isDueToday(t, today)),
      upcoming: open.filter(t => isUpcoming(t, today)),
      overdue:  open.filter(t => isOverdue(t, today)),
      done:     tasks.filter(t => t.done).sort(sortDone),
      all:      [...open, ...tasks.filter(t => t.done).sort(sortDone)],
    } satisfies Record<TabKey, Task[]>;
  }, [tasks, today]);

  const q = search.trim().toLowerCase();
  const visible = buckets[tab].filter(t =>
    (prioF === 'all' || t.priority === prioF) && (!q || t.text.toLowerCase().includes(q)));

  const tabs: [string, string][] = [
    ['today',    `Today ${buckets.today.length || ''}`.trim()],
    ['upcoming', `Upcoming ${buckets.upcoming.length || ''}`.trim()],
    ['overdue',  `Overdue ${buckets.overdue.length || ''}`.trim()],
    ['done',     'Done'],
    ['all',      'All'],
  ];

  const openCount = tasks.length - buckets.done.length;
  const sub = loading ? 'Loading your tasks'
    : openCount === 0 ? 'All clear. Nice work!'
    : `${openCount} to do${buckets.overdue.length ? `, ${buckets.overdue.length} overdue` : ''}`;

  // ── Actions (optimistic, rolled back on failure) ──────────────
  const handleAdd = async () => {
    const text = newText.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const created = await addTask({ text, priority: newPrio, due_date: newDue || today, created_date: today });
      setTasks(prev => [created, ...prev]);
      setNewText(''); setNewDue('');
      if (tab === 'done') setTab('today');
    } catch {
      show('Could not add that task.', 'var(--red)');
    } finally {
      setAdding(false);
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

  const openEdit = (t: Task) => { setEditTask(t); setEditText(t.text); setEditDue(t.due_date ?? ''); setEditPrio(t.priority); };

  const saveEdit = async () => {
    if (!editTask || !editText.trim()) return;
    const before = editTask;
    const updates = { text: editText.trim(), due_date: editDue || null, priority: editPrio };
    setTasks(prev => prev.map(t => t.id === before.id ? { ...t, ...updates } : t));
    setEditTask(null);
    try { await updateTask(before.id, updates); show('Task updated'); }
    catch { setTasks(prev => prev.map(t => t.id === before.id ? before : t)); show('Could not save your changes.', 'var(--red)'); }
  };

  const doDelete = async () => {
    const id = delId; if (!id) return;
    const snapshot = tasks;
    setTasks(prev => prev.filter(t => t.id !== id));
    setDelId(null);
    try { await deleteTask(id); show('Task deleted'); }
    catch { setTasks(snapshot); show('Could not delete that task.', 'var(--red)'); }
  };

  const doClearDone = async () => {
    const snapshot = tasks;
    setConfirmClear(false);
    setTasks(prev => prev.filter(t => !t.done));
    try { await clearDoneTasks(); show('Cleared finished tasks'); }
    catch { setTasks(snapshot); show('Could not clear them.', 'var(--red)'); }
  };

  const empty = {
    today:    { icon: <Sparkles size={26} />,     msg: 'Nothing for today. Add something above or enjoy the calm.' },
    upcoming: { icon: <CalendarDays size={26} />, msg: 'Nothing planned for later yet.' },
    overdue:  { icon: <PartyPopper size={26} />,  msg: "Nothing overdue. You're on top of it!" },
    done:     { icon: <ListChecks size={26} />,   msg: 'Finished tasks will show up here.' },
    all:      { icon: <ListChecks size={26} />,   msg: 'No tasks yet. Add your first one above.' },
  }[tab];

  return (
    <div className={s.page}>
      <Topbar title="Tasks" sub={sub} maxWidth={820} />

      <div className={s.wrap}>
        {/* Add */}
        <form className={s.addCard} onSubmit={e => { e.preventDefault(); handleAdd(); }}>
          <div className={s.addTop}>
            <Plus size={20} strokeWidth={2} className={s.addIcon} aria-hidden />
            <input
              className={s.addInput}
              placeholder="What needs doing?"
              aria-label="New task"
              value={newText}
              onChange={e => setNewText(e.target.value)}
            />
          </div>
          <div className={s.addBottom}>
            <PriorityPicker value={newPrio} onChange={setNewPrio} />
            <label className={s.dateWrap}>
              <span className={s.dateLabel}>Due</span>
              <input type="date" className={s.dateInput} value={newDue} min={today} onChange={e => setNewDue(e.target.value)} aria-label="Due date" />
            </label>
            <Btn type="submit" sm disabled={!newText.trim() || adding} className={s.addBtn}>
              {adding ? 'Adding' : 'Add task'}
            </Btn>
          </div>
        </form>

        {/* Filters */}
        <div className={s.toolbar}>
          <InnerTabs tabs={tabs} active={tab} onTab={t => setTab(t as TabKey)} />
          <div className={s.filters}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search tasks" className={s.search} />
            <div className={s.prioFilters}>
              <Pill active={prioF === 'all'} onClick={() => setPrioF('all')}>Any priority</Pill>
              {PRIORITIES.map(p => (
                <Pill key={p} active={prioF === p} color={PRIO_COLOR[p]} onClick={() => setPrioF(p)}>{PRIO_LABEL[p]}</Pill>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <section className={s.list} aria-live="polite">
          {loading ? (
            <div className={s.skeletons}>
              {[0, 1, 2, 3].map(i => <div key={i} className={`skeleton ${s.skel}`} />)}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState icon={empty.icon} msg={q || prioF !== 'all' ? 'No tasks match those filters.' : empty.msg} />
          ) : (
            visible.map(t => (
              <TaskRow key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit} onDelete={setDelId} />
            ))
          )}
        </section>

        {tab === 'done' && buckets.done.length > 0 && (
          <div className={s.footer}>
            <Btn variant="ghost" sm onClick={() => setConfirmClear(true)}>
              <Eraser size={15} /> Clear finished tasks
            </Btn>
          </div>
        )}
      </div>

      {editTask && (
        <Modal onClose={() => setEditTask(null)}>
          <ModalTitle>Edit task</ModalTitle>
          <FInput label="Task" value={editText} onChange={setEditText} />
          <FInput label="Due date" type="date" value={editDue} onChange={setEditDue} />
          <Lbl>Priority</Lbl>
          <PriorityPicker value={editPrio} onChange={setEditPrio} />
          <ModalFooter onCancel={() => setEditTask(null)} onSave={saveEdit} />
        </Modal>
      )}

      {delId && (
        <Modal onClose={() => setDelId(null)}>
          <Confirm msg="This task will be deleted for good." onConfirm={doDelete} onCancel={() => setDelId(null)} />
        </Modal>
      )}

      {confirmClear && (
        <Modal onClose={() => setConfirmClear(false)}>
          <Confirm msg={`All ${buckets.done.length} finished tasks will be deleted for good.`} onConfirm={doClearDone} onCancel={() => setConfirmClear(false)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
