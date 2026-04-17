import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: false,
    storage:            typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

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

/**
 * Check session is ready before making DB queries.
 */
export async function ensureSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}