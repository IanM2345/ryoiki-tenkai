import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient, missingEnv, sendTo, type SubRow } from '@/lib/push-server';
import { dueReminders, todayIn } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Daily reminders. Vercel Cron calls this every morning (see vercel.json) with
 * `Authorization: Bearer <CRON_SECRET>`. It works out today's birthday and letter
 * reminders for each person with notifications on and pushes them to their devices.
 * The response only has counts, never names or dates.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const missing = missingEnv();
  if (missing.length) return NextResponse.json({ error: 'Missing settings', missing }, { status: 500 });

  const db = adminClient();
  const today = todayIn(process.env.APP_TIMEZONE || 'Europe/London');

  const { data: subs, error } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
  if (error) return NextResponse.json({ error: 'Could not read subscriptions' }, { status: 500 });

  const byUser = new Map<string, SubRow[]>();
  for (const s of (subs ?? []) as SubRow[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  const totals = { users: byUser.size, reminders: 0, sent: 0, failed: 0, removed: 0 };
  for (const [userId, userSubs] of byUser) {
    const [{ data: souls }, { data: capsules }] = await Promise.all([
      db.from('souls').select('id, name, birthday').eq('user_id', userId).not('birthday', 'is', null),
      db.from('time_capsules').select('id, from_name, open_on, opened_at, created_at').eq('user_id', userId).eq('open_on', today).is('opened_at', null),
    ]);
    const messages = dueReminders({ today, souls: souls ?? [], capsules: capsules ?? [] });
    totals.reminders += messages.length;
    if (!messages.length) continue;
    const r = await sendTo(db, userSubs, messages);
    totals.sent += r.sent; totals.failed += r.failed; totals.removed += r.removed;
  }
  return NextResponse.json({ ok: true, today, ...totals });
}
