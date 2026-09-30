import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient, missingEnv, sendTo, type SubRow } from '@/lib/push-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** "Send a test notification" from the App & backup page. Only reaches the signed-in person's own devices. */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const missing = missingEnv();
  if (missing.length) return NextResponse.json({ error: 'Notifications are not set up on the server yet.', missing }, { status: 500 });

  const db = adminClient();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: subs } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').eq('user_id', user.id);
  if (!subs?.length) return NextResponse.json({ error: 'No devices have notifications turned on yet.' }, { status: 404 });

  const r = await sendTo(db, subs as SubRow[], [{
    title: '✨ Notifications are on',
    body: "You'll hear from yourworld about birthdays and letters.",
    url: '/settings',
    tag: 'test',
  }]);
  return NextResponse.json({ ok: true, devices: subs.length, ...r });
}
