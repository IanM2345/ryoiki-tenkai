import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();   // a stray space or line break pasted into Vercel would break every request

export const supabase = createClient(url, key, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
    storage:            typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

/**
 * Restore session from tokens returned by the API route.
 * Avoids a second Supabase auth call — no rate limiting risk.
 */
export async function restoreSession(accessToken: string, refreshToken: string) {
  const { data, error } = await supabase.auth.setSession({
    access_token:  accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data.session;
}

/** Shown when a save finds no session (signed out, or the session expired and couldn't be renewed). */
export const SIGNED_OUT = "You're signed out. Sign in again, then try once more.";

/**
 * The signed-in user from the saved session (renewed first if it has expired). It doesn't ask the auth server,
 * so a slow or blocked connection to it can't make a signed-in person look signed out.
 */
export async function sessionUser() {
  if (typeof window === 'undefined') return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

/**
 * Check session is ready before making DB queries.
 */
export async function ensureSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}