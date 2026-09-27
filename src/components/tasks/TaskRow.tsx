'use client';
import React from 'react';
import { Pencil, Trash2, CalendarClock, CalendarCheck2, TriangleAlert } from 'lucide-react';
import s from './TaskRow.module.css';
import { type Task, PRIO_COLOR, PRIO_LABEL, isOverdue } from '@/lib/tasks';
import { relDay } from '@/lib/dates';

export default function TaskRow({
  task, onToggle, onEdit, onDelete, compact,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}) {
  const overdue = isOverdue(task);
  const color = PRIO_COLOR[task.priority];

  return (
    <div className={`${s.row} ${task.done ? s.done : ''} ${compact ? s.compact : ''}`}>
      <button
        type="button"
        className={s.check}
        onClick={() => onToggle(task.id)}
        aria-pressed={task.done}
        aria-label={task.done ? `Mark "${task.text}" as not done` : `Mark "${task.text}" as done`}
        style={{ ['--prio' as string]: color }}
      >
        <svg viewBox="0 0 24 24" className={s.checkSvg} aria-hidden>
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </button>

      <div className={s.body}>
        <div className={s.text}>{task.text}</div>
        {!compact && (
          <div className={s.meta}>
            <span className={s.prio} style={{ color }}>
              <span className={s.dot} style={{ background: color }} />
              {PRIO_LABEL[task.priority]}
            </span>
            {overdue && task.due_date && (
              <span className={s.overdue}><TriangleAlert size={13} strokeWidth={2} />Was due {relDay(task.due_date)}</span>
            )}
            {!overdue && !task.done && task.due_date && (
              <span><CalendarClock size={13} strokeWidth={2} />Due {relDay(task.due_date)}</span>
            )}
            {task.done && task.done_at && (
              <span><CalendarCheck2 size={13} strokeWidth={2} />Done {relDay(task.done_at)}</span>
            )}
          </div>
        )}
        {compact && overdue && task.due_date && (
          <div className={s.meta}><span className={s.overdue}>Was due {relDay(task.due_date)}</span></div>
        )}
      </div>

      {(onEdit || onDelete) && (
        <div className={s.actions}>
          {onEdit && (
            <button type="button" className={s.iconBtn} onClick={() => onEdit(task)} aria-label={`Edit "${task.text}"`}>
              <Pencil size={15} strokeWidth={2} />
            </button>
          )}
          {onDelete && (
            <button type="button" className={`${s.iconBtn} ${s.danger}`} onClick={() => onDelete(task.id)} aria-label={`Delete "${task.text}"`}>
              <Trash2 size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
