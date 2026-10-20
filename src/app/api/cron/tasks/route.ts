import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient, missingEnv, sendTo, type SubRow } from '@/lib/push-server';
import { dueTaskReminders, type ReminderTask } from '@/lib/taskReminders';
import { todayIn } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Task reminders. Called every minute by a scheduler (Supabase Cron, see DEPLOY.md,
 * "Task reminders") with `Authorization: Bearer <CRON_SECRET>`. Sends a push for each
 * task reminder whose moment has come, and remembers it so it only goes out once.
 * The response only has counts, never task names.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const missing = missingEnv();
  if (missing.length) return NextResponse.json({ error: 'Missing settings', missing }, { status: 500 });

  const db = adminClient();
  const tz = process.env.APP_TIMEZONE || 'Europe/London';
  const now = new Date();
  const today = todayIn(tz, now);
  const shift = (days: number) => todayIn(tz, new Date(now.getTime() + days * 864e5));

  const { data: subs, error } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
  if (error) return NextResponse.json({ error: 'Could not read subscriptions' }, { status: 500 });
  const byUser = new Map<string, SubRow[]>();
  for (const s of (subs ?? []) as SubRow[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const totals = { users: byUser.size, reminders: 0, sent: 0, failed: 0, removed: 0 };
  for (const [userId, userSubs] of byUser) {
    // Only tasks with reminders, due between yesterday and a couple of days ahead.
    const { data: tasks, error: tErr } = await db.from('tasks')
      .select('id, text, due_date, due_time, remind_before, reminders_sent, done')
      .eq('user_id', userId).eq('done', false).not('due_time', 'is', null)
      .gte('due_date', shift(-1)).lte('due_date', shift(2));
    if (tErr) continue;    // e.g. the tasks update isn't applied yet
    const { messages, sent } = dueTaskReminders((tasks ?? []) as ReminderTask[], tz, now);
    if (!messages.length) continue;
    totals.reminders += messages.length;
    // Mark first, so a slow push can never cause a repeat on the next run.
    await Promise.all([...sent].map(([id, list]) => db.from('tasks').update({ reminders_sent: list }).eq('id', id).eq('user_id', userId)));
    const r = await sendTo(db, userSubs, messages, { ttl: 60 * 60, urgency: 'high' });   // on time, or not at all after an hour
    totals.sent += r.sent; totals.failed += r.failed; totals.removed += r.removed;
  }
  return NextResponse.json({ ok: true, today, ...totals });
}
