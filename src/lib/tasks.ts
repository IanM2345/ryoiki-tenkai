import type { DbTask } from './db';
import { localDateStr } from './dates';

export type Priority = 'high' | 'medium' | 'low';
export type Task = DbTask;

export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export const PRIO_COLOR: Record<Priority, string> = {
  high:   'var(--red)',
  medium: 'var(--or)',
  low:    'var(--gr)',
};

export const PRIO_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

const PRIO_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const isOverdue = (t: Task, today = localDateStr()) =>
  !t.done && !!t.due_date && t.due_date < today;

export const isDueToday = (t: Task, today = localDateStr()) =>
  !t.done && (!t.due_date || t.due_date === today);

export const isUpcoming = (t: Task, today = localDateStr()) =>
  !t.done && !!t.due_date && t.due_date > today;

/** Open tasks first by due date, then priority, then newest. */
export function sortOpen(a: Task, b: Task): number {
  const ad = a.due_date ?? '9999', bd = b.due_date ?? '9999';
  if (ad !== bd) return ad.localeCompare(bd);
  if (a.priority !== b.priority) return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  return b.created_at.localeCompare(a.created_at);
}

export const sortDone = (a: Task, b: Task) => (b.done_at ?? '').localeCompare(a.done_at ?? '');
