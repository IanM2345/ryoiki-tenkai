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

/**
 * Sign in using the SHARED supabase instance so the session is
 * available to all db.ts queries immediately after.
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Check session is ready before making DB queries.
 */
export async function ensureSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}