// Server-only: Home Screen widgets. A widget sends its private key; we look up the
// key's hash, then return only that person's open tasks (text, due time, priority).
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { zonedToUtc } from './taskReminders';
import { todayIn } from './reminders';

export const hashKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');
const KEY_SHAPE = /^ywk_[A-Za-z0-9_-]{32,64}$/;

/** The user a widget key belongs to, or null. Notes when it was last used. */
export async function userForKey(db: SupabaseClient, key: string | null): Promise<string | null> {
  if (!key || !KEY_SHAPE.test(key)) return null;
  const { data } = await db.from('widget_keys').select('id, user_id').eq('key_hash', hashKey(key)).maybeSingle();
  if (!data) return null;
  db.from('widget_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {}, () => {});
  return data.user_id as string;
}

export interface WidgetTask {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  date: string | null;     // YYYY-MM-DD (her local date)
  time: string | null;     // HH:MM (her local time), null = any time that day
  due: string | null;      // ISO instant (end of the day for date-only tasks)
  late: boolean;
}
export interface WidgetData { now: string; today: string; tz: string; tasks: WidgetTask[]; total: number; late: number }

/** Open tasks that are late, due today, in the next 7 days, or undated; soonest first. */
export async function widgetTasks(db: SupabaseClient, userId: string, tz: string, limit = 12): Promise<WidgetData> {
  const now = new Date();
  const today = todayIn(tz, now);
  const week = todayIn(tz, new Date(now.getTime() + 7 * 864e5));
  // due_time may not exist yet if the tasks update isn't applied: fall back to the old columns.
  let res = await db.from('tasks').select('id, text, priority, due_date, due_time').eq('user_id', userId).eq('done', false);
  if (res.error) res = await db.from('tasks').select('id, text, priority, due_date').eq('user_id', userId).eq('done', false) as typeof res;
  const rows = (res.data ?? []) as { id: string; text: string; priority: WidgetTask['priority']; due_date: string | null; due_time?: string | null }[];
  const tasks: WidgetTask[] = rows
    .filter(r => !r.due_date || r.due_date <= week)
    .map(r => {
      const time = r.due_time ? r.due_time.slice(0, 5) : null;
      const due = r.due_date ? zonedToUtc(r.due_date, time ?? '23:59', tz) : null;
      return { id: r.id, text: r.text, priority: r.priority, date: r.due_date, time, due: due?.toISOString() ?? null, late: !!due && due.getTime() < now.getTime() };
    })
    .sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9') || ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]));
  return { now: now.toISOString(), today, tz, tasks: tasks.slice(0, limit), total: tasks.length, late: tasks.filter(t => t.late).length };
}
