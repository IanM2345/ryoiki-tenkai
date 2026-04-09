import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 });
    }

    // ── Dev bypass ──────────────────────────────────────────────────────────
    // Set DEV_PASSWORD in .env.local to unlock a magic password in development.
    // This branch is never reachable in production.
    if (
      process.env.NODE_ENV !== 'production' &&
      process.env.DEV_PASSWORD &&
      password === process.env.DEV_PASSWORD
    ) {
      return NextResponse.json({ ok: true, access_token: 'dev', refresh_token: 'dev' });
    }
    // ────────────────────────────────────────────────────────────────────────

    const authorisedEmail = process.env.USER_EMAIL?.toLowerCase();
    if (!authorisedEmail) {
      return NextResponse.json({ message: 'Server misconfigured.' }, { status: 500 });
    }

    if (email.trim().toLowerCase() !== authorisedEmail) {
      return NextResponse.json({ message: 'Wrong email or password.' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authorisedEmail,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json({ message: 'Wrong email or password.' }, { status: 401 });
    }

    const authedSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        },
      }
    );

    await authedSupabase
      .from('user_settings')
      .upsert(
        { user_id: data.session.user.id },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

    const { access_token, refresh_token } = data.session;
    const isProd = process.env.NODE_ENV === 'production';

    const response = NextResponse.json({
      ok: true,
      access_token,
      refresh_token,
    });

    response.cookies.set('sb-access-token', access_token, {
      httpOnly: true,
      secure:   true,
      sameSite: 'lax',
      path:     '/',
      maxAge:   60 * 60 * 24 * 7,
    });

    response.cookies.set('sb-refresh-token', refresh_token, {
      httpOnly: true,
      secure:   true,
      sameSite: 'lax',
      path:     '/',
      maxAge:   60 * 60 * 24 * 30,
    });

    return response;

  } catch {
    return NextResponse.json({ message: 'Something went wrong.' }, { status: 500 });
  }
}