// Which task reminders are due right now (server side, used by /api/cron/tasks).
// Pure functions so they can be tested. Due times are her local wall-clock time (APP_TIMEZONE).
import type { PushMessage } from './reminders';

export interface ReminderTask {
  id: string; text: string; due_date: string | null; due_time: string | null;
  remind_before: number[] | null; reminders_sent: number[] | null; done: boolean;
}

/** UTC instant for a local date + time in a time zone (handles summer time). */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.slice(0, 5).split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
    const seen = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess += wall - seen;
  }
  return new Date(guess);
}

const say = (min: number) => min === 0 ? 'now'
  : min < 60 ? `in ${min} minutes`
  : min < 60 * 24 ? `in ${min / 60 === 1 ? 'an hour' : `${Math.round(min / 60)} hours`}`
  : min === 60 * 24 ? 'tomorrow' : `in ${Math.round(min / 60 / 24)} days`;

/**
 * Reminders that should go out now. A reminder is sent once, when its moment has
 * passed, as long as the task isn't more than an hour overdue (no late spam after downtime).
 */
export function dueTaskReminders(tasks: ReminderTask[], timeZone: string, now = new Date()): { messages: PushMessage[]; sent: Map<string, number[]> } {
  const messages: PushMessage[] = [];
  const sent = new Map<string, number[]>();
  for (const t of tasks) {
    if (t.done || !t.due_date || !t.due_time || !t.remind_before?.length) continue;
    const due = zonedToUtc(t.due_date, t.due_time, timeZone).getTime();
    if (now.getTime() > due + 60 * 60 * 1000) continue;
    const already = new Set(t.reminders_sent ?? []);
    // Only the most recent reminder that is due (if two are due at once, one notification is enough).
    const ready = t.remind_before.filter(m => !already.has(m) && now.getTime() >= due - m * 60000).sort((a, b) => a - b);
    if (!ready.length) continue;
    const m = ready[0];
    const time = t.due_time.slice(0, 5);
    messages.push({
      title: m === 0 ? `⏰ ${t.text}` : `⏰ ${t.text} ${say(m)}`,
      body: m === 0 ? `It's time (${time}).` : `Due at ${time}.`,
      url: '/tasks',
      tag: `task-${t.id}`,
    });
    sent.set(t.id, [...already, ...ready]);
  }
  return { messages, sent };
}
