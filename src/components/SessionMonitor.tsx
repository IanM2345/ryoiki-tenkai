'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// ─── CONFIG ───────────────────────────────────────────────────
// How long before auto-logout due to inactivity (in milliseconds)
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// How often we check if the session cookie is still there (ms)
const SESSION_CHECK_INTERVAL_MS = 60 * 1000; // every 1 minute

// ─────────────────────────────────────────────────────────────

export default function SessionMonitor() {
  const router      = useRouter();
  const pathname    = usePathname();
  const timerRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const logout = useCallback(async (reason: 'inactivity' | 'session_expired') => {
    // Clear the auth cookies via API
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    // Redirect to login with reason so we can show a message
    router.push(`/login?reason=${reason}`);
  }, [router]);

  // ── Reset the inactivity timer on any user activity ──────────
  const resetTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      logout('inactivity');
    }, INACTIVITY_TIMEOUT_MS);
  }, [logout]);

  // ── Check cookie still exists (catches expiry / manual clear) ─
  const checkSession = useCallback(() => {
    // We can't read httpOnly cookies from JS — instead ping a lightweight
    // endpoint that returns 401 if the cookie is gone
    fetch('/api/auth/check')
      .then(res => {
        if (res.status === 401) logout('session_expired');
      })
      .catch(() => {}); // ignore network errors (offline etc)
  }, [logout]);

  useEffect(() => {
    // Don't run on the login page itself
    if (pathname.startsWith('/login')) return;

    // Start the inactivity timer
    resetTimer();

    // Start periodic session check
    intervalRef.current = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);

    // Listen for user activity — reset timer on any interaction
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(intervalRef.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [pathname, resetTimer, checkSession]);

  // This component renders nothing — it's purely behavioural
  return null;
}

