import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminClient } from '@/lib/push-server';
import { userForKey, widgetTasks } from '@/lib/widget-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

/** Her open tasks for a Home Screen widget (Scriptable). Needs a widget key: ?k=ywk_... */
export async function GET(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Not set up' }, { status: 500, headers });
  const db = adminClient();
  const user = await userForKey(db, req.nextUrl.searchParams.get('k'));
  if (!user) return NextResponse.json({ error: 'This widget key is not valid (it may have been switched off).' }, { status: 401, headers });
  const data = await widgetTasks(db, user, process.env.APP_TIMEZONE || 'Europe/London');
  return NextResponse.json(data, { headers });
}
