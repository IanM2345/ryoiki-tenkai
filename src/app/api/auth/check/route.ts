import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const hasSession = request.cookies.has('sb-access-token');

  if (!hasSession) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

const {data} = await supabase.auth.getSession()
console.log('email:', data?.session?.user?.email)
console.log('token:', data?.session?.access_token?.slice(0,30))