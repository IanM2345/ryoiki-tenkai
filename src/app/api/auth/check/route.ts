import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const hasSession = request.cookies.has('sb-access-token') || request.cookies.has('sb-refresh-token');

  if (!hasSession) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
