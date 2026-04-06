'use client';
import React, { useState, useEffect } from 'react';
import s from './tasks.module.css';
import { Btn, InnerTabs, SearchBar, Topbar, Pill, Modal, Confirm, Toast, useToast } from '@/components/ui';
import { getTasks, addTask, updateTask, deleteTask, clearDoneTasks } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { type Task, type Priority, PRIO_COLOR, isOverdue, fmtDate } from '../dashboard/page';

const todayStr = () => new Date().toISOString().split('T')[0];

type TabKey = 'today' | 'overdue' | 'done' | 'all';

// ─── TASK ROW ─────────────────────────────────────────────────

function TaskRow({
  task, onToggle, onEdit, onDelete,
}: {
  task:     Task;
  onToggle: (id: string) => void;
  onEdit:   (task: Task) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div className={`${s.row} ${task.done ? s.rowDone : ''} ${overdue ? s.rowOverdue : ''}`}>
      <div
        className={`${s.check} ${task.done ? s.checkOn : s.checkOff}`}
        onClick={() => onToggle(task.id)}
      >
        {task.done && <span className={s.checkMark}>✓</span>}
      </div>
      <div className={s.prioDot} style={{ background: PRIO_COLOR[task.priority] }} />
      <div className={s.rowBody}>
        <div className={`${s.rowText} ${task.done ? s.rowTextDone : ''}`}>{task.text}</div>
        <div className={s.rowMeta}>
          {overdue && task.due_date    && <span className={s.overdueTag}>⚠ was due {fmtDate(task.due_date)}</span>}
          {!overdue && !task.done && task.due_date && <span className={s.dueTag}>due {fmtDate(task.due_date)}</span>}
          {task.done && task.done_at   && <span className={s.doneTag}>✓ completed {fmtDate(task.done_at)}</span>}
          <span className={s.createdTag}>added {fmtDate(task.created_date)}</span>
        </div>
      </div>
      <span className={s.prioLabel} style={{ color: PRIO_COLOR[task.priority], borderColor: PRIO_COLOR[task.priority]+'44' }}>{task.priority}</span>
      <div className={s.rowActions}>
        <button className={s.editBtn} onClick={() => onEdit(task)}>edit</button>
        <button className={s.delBtn}  onClick={() => onDelete(task.id)}>×</button>
      </div>
    </div>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,   setTab]     = useState<TabKey>('today');
  const [search, setSearch] = useState('');
  const [prioF,  setPrioF]  = useState<Priority | 'all'>('all');

  // add form
  const [newText, setNewText] = useState('');
  const [newDue,  setNewDue]  = useState('');
  const [newPrio, setNewPrio] = useState<Priority>('medium');

  // edit modal
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editText, setEditText] = useState('');
  const [editDue,  setEditDue]  = useState('');
  const [editPrio, setEditPrio] = useState<Priority>('medium');

  // delete confirm
  const [delId, setDelId] = useState<string | null>(null);

  const [toast, show] = useToast();

  // ── Load from Supabase — wait for session first ──────────────
  useEffect(() => {
    async function load() {
      const ready = await ensureSession();
      if (!ready) {
        console.error('No session available');
        setLoading(false);
        return;
      }
      try {
        const data = await getTasks();
        setTasks(data);
      } catch (err) {
        console.error('getTasks error:', err);
        show('Could not load tasks.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────
  const todayTasks   = tasks.filter(t => !t.done && !isOverdue(t));
  const overdueTasks = tasks.filter(t => isOverdue(t));
  const doneTasks    = tasks.filter(t => t.done).sort((a,b) => (b.done_at??'').localeCompare(a.done_at??''));

  const buckets: Record<TabKey, Task[]> = {
    today: todayTasks, overdue: overdueTasks, done: doneTasks, all: tasks,
  };

  const visible = buckets[tab]
    .filter(t => (prioF === 'all' || t.priority === prioF) &&
      (!search || t.text.toLowerCase().includes(search.toLowerCase())));

  const tabs: [string, string][] = [
    ['today',   `Today (${todayTasks.length})`   ],
    ['overdue', `Overdue (${overdueTasks.length})`],
    ['done',    `Done (${doneTasks.length})`      ],
    ['all',     `All (${tasks.length})`           ],
  ];

  // ── Actions ───────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newText.trim()) return;
    try {
      const created = await addTask({
        text:         newText.trim(),
        priority:     newPrio,
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
    const updates = { done: !task.done, done_at: !task.done ? todayStr() : null };
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    try { await updateTask(id, updates); }
    catch { setTasks(prev => prev.map(t => t.id === id ? task : t)); show('Could not update.'); }
  };

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditText(task.text);
    setEditDue(task.due_date ?? '');
    setEditPrio(task.priority);
  };

  const saveEdit = async () => {
    if (!editTask || !editText.trim()) return;
    const updates = { text: editText.trim(), due_date: editDue || null, priority: editPrio };
    setTasks(prev => prev.map(t => t.id === editTask.id ? { ...t, ...updates } : t));
    setEditTask(null);
    try { await updateTask(editTask.id, updates); show('Task updated!'); }
    catch { show('Could not update task.'); }
  };

  const doDelete = async () => {
    if (!delId) return;
    setTasks(prev => prev.filter(t => t.id !== delId));
    setDelId(null);
    try { await deleteTask(delId); show('Deleted.'); }
    catch { show('Could not delete task.'); }
  };

  const handleClearDone = async () => {
    setTasks(prev => prev.filter(t => !t.done));
    try { await clearDoneTasks(); show('Done tasks cleared.'); }
    catch { show('Could not clear tasks.'); }
  };

  return (
    <div className={`${s.page} aFadeUp`}>
      <Topbar
        title="Tasks ✓"
        sub={`${tasks.filter(t=>!t.done).length} active · ${overdueTasks.length} overdue · ${doneTasks.length} done`}
      />

      <InnerTabs tabs={tabs} active={tab} onTab={t => setTab(t as TabKey)} />

      <div className={s.filterBar}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search tasks..." className={s.searchBar} />
        <div className={s.prioFilters}>
          {(['all','high','medium','low'] as (Priority|'all')[]).map(p => (
            <Pill key={p} active={prioF===p} color={p==='all'?'#ff8c00':PRIO_COLOR[p as Priority]} onClick={()=>setPrioF(p)}>{p}</Pill>
          ))}
        </div>
        {tab === 'done' && doneTasks.length > 0 && (
          <button className={s.clearAllBtn} onClick={handleClearDone}>clear all</button>
        )}
      </div>

      {/* Add bar — not on done tab */}
      {tab !== 'done' && (
        <div className={s.addBar}>
          <input className={s.addInput} placeholder="New task…" value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <input type="date" className={s.dateInput} value={newDue}
            onChange={e => setNewDue(e.target.value)} />
          <div className={s.addPrioRow}>
            {(['high','medium','low'] as Priority[]).map(p => (
              <span key={p} className={s.addPrioChip} onClick={() => setNewPrio(p)}
                style={{ background: newPrio===p?PRIO_COLOR[p]:'transparent', borderColor: PRIO_COLOR[p]+'55', color: newPrio===p?'#000':PRIO_COLOR[p] }}
              >{p}</span>
            ))}
          </div>
          <Btn sm onClick={handleAdd}>+ Add</Btn>
        </div>
      )}

      {/* Task list */}
      <div className={s.list}>
        {loading ? (
          <div className={s.empty}><div className={s.emptyIcon}>⋯</div><div className={s.emptyMsg}>Loading tasks...</div></div>
        ) : visible.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyIcon}>{tab==='overdue'?'✦':tab==='done'?'🎉':'✓'}</div>
            <div className={s.emptyMsg}>
              {tab==='overdue' ? "Nothing overdue — you're on top of it!"
               :tab==='done'   ? 'No completed tasks yet'
               :tab==='today'  ? 'No tasks for today — add one above'
               : 'No tasks match your filters'}
            </div>
          </div>
        ) : visible.map(task => (
          <TaskRow key={task.id} task={task} onToggle={handleToggle} onEdit={openEdit} onDelete={id => setDelId(id)} />
        ))}
      </div>

      {/* Edit modal */}
      {editTask && (
        <Modal onClose={() => setEditTask(null)}>
          <div className={s.modalTitle}>Edit Task</div>
          <div className={s.modalField}>
            <label className={s.modalLabel}>Task</label>
            <input className={s.modalInput} value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key==='Enter' && saveEdit()} autoFocus />
          </div>
          <div className={s.modalField}>
            <label className={s.modalLabel}>Due Date</label>
            <input type="date" className={s.modalInput} value={editDue} onChange={e => setEditDue(e.target.value)} style={{colorScheme:'dark'}} />
          </div>
          <div className={s.modalField}>
            <label className={s.modalLabel}>Priority</label>
            <div className={s.editPrioRow}>
              {(['high','medium','low'] as Priority[]).map(p => (
                <span key={p} className={s.editPrioChip} onClick={() => setEditPrio(p)}
                  style={{ background: editPrio===p?PRIO_COLOR[p]:'transparent', borderColor: PRIO_COLOR[p]+'55', color: editPrio===p?'#000':PRIO_COLOR[p] }}
                >{p}</span>
              ))}
            </div>
          </div>
          <div className={s.modalFooter}>
            <Btn variant="ghost" onClick={() => setEditTask(null)}>Cancel</Btn>
            <Btn onClick={saveEdit}>Save</Btn>
          </div>
        </Modal>
      )}

      {delId !== null && (
        <Modal onClose={() => setDelId(null)}>
          <Confirm msg="This task will be deleted permanently." onConfirm={doDelete} onCancel={() => setDelId(null)} />
        </Modal>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
