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
  const at = a.due_time ?? '99', bt = b.due_time ?? '99';       // timed tasks first, earliest first
  if (at !== bt) return at.localeCompare(bt);
  if (a.priority !== b.priority) return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  return b.created_at.localeCompare(a.created_at);
}

export const sortDone = (a: Task, b: Task) => (b.done_at ?? '').localeCompare(a.done_at ?? '');

// ── Times, countdowns and reminders ────────────────────────────

/** 'HH:MM' from a stored time ('HH:MM:SS' or 'HH:MM'). */
export const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');

/** When a task is due, in her local time. Date-only tasks count to the end of that day. */
export function dueAt(t: Pick<Task, 'due_date' | 'due_time'>): Date | null {
  if (!t.due_date) return null;
  const [y, m, d] = t.due_date.split('-').map(Number);
  const [hh, mm] = t.due_time ? hhmm(t.due_time).split(':').map(Number) : [23, 59];
  return new Date(y, m - 1, d, hh, mm, t.due_time ? 0 : 59);
}

export type CountdownTone = 'over' | 'now' | 'soon' | 'today' | 'later';

/** "in 25 min", "in 3h 10m", "in 2 days", "due now", "40 min late"... */
export function countdown(t: Task, now = Date.now()): { label: string; tone: CountdownTone } | null {
  if (t.done) return null;
  const due = dueAt(t);
  if (!due) return null;
  const ms = due.getTime() - now;
  const min = Math.round(Math.abs(ms) / 60000);
  const span = (m: number) => m < 60 ? `${m} min`
    : m < 60 * 24 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
    : `${Math.round(m / 60 / 24)} ${Math.round(m / 60 / 24) === 1 ? 'day' : 'days'}`;
  if (!t.due_time) {
    // Date only: count whole days.
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const day = new Date(due); day.setHours(0, 0, 0, 0);
    const days = Math.round((day.getTime() - today.getTime()) / 864e5);
    if (days < 0) return { label: `${-days} ${days === -1 ? 'day' : 'days'} late`, tone: 'over' };
    if (days === 0) return { label: `${span(Math.max(1, Math.round(ms / 60000)))} left today`, tone: 'today' };
    return { label: days === 1 ? 'tomorrow' : `in ${days} days`, tone: 'later' };
  }
  if (ms <= -60000) return { label: `${span(min)} late`, tone: 'over' };
  if (ms < 60000) return { label: 'due now', tone: 'now' };
  return { label: `in ${span(min)}`, tone: min <= 60 ? 'soon' : min <= 60 * 24 ? 'today' : 'later' };
}

/** Reminder choices: minutes before the due time. */
export const REMIND_OPTIONS: { min: number; label: string }[] = [
  { min: 0, label: 'At the time' },
  { min: 5, label: '5 min before' },
  { min: 15, label: '15 min before' },
  { min: 30, label: '30 min before' },
  { min: 60, label: '1 hour before' },
  { min: 60 * 24, label: '1 day before' },
];
const REMIND_KEY = 'yw-task-remind-default';
/** The reminders she picked last time are the default for the next timed task. */
export function defaultReminders(): number[] {
  try { const v = JSON.parse(localStorage.getItem(REMIND_KEY) || 'null'); if (Array.isArray(v)) return v.filter(n => typeof n === 'number'); } catch { /* ignore */ }
  return [15, 0];
}
export function rememberReminders(v: number[]) { try { localStorage.setItem(REMIND_KEY, JSON.stringify(v)); } catch { /* ignore */ } }
export const remindLabel = (m: number) => REMIND_OPTIONS.find(o => o.min === m)?.label ?? `${m} min before`;
