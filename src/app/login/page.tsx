'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Eye, EyeOff, ArrowRight, Loader2, Info } from 'lucide-react';
import { restoreSession } from '@/lib/supabase';
import s from './login.module.css';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [shake, setShake]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const reason = searchParams.get('reason');
  const notice =
    reason === 'inactivity' ? 'You were signed out after a while of inactivity. Welcome back!'
    : reason === 'session_expired' ? 'Your session ended. Please sign in again.'
    : '';

  // Replay the shake animation each time a login fails
  useEffect(() => {
    if (!shake || !formRef.current) return;
    const el = formRef.current;
    el.classList.remove('t-shake');
    void el.offsetWidth;
    el.classList.add('t-shake');
  }, [shake]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "That email and password don't match.");
      const session = await restoreSession(data.access_token, data.refresh_token);
      if (!session) throw new Error('Something went wrong signing you in. Please try again.');
      // Full page load so no page cached from before sign in gets reused
      // Only ever go back to a page on this site (a crafted ?next= could point elsewhere).
      window.location.replace(safeNext(searchParams.get('next')));
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Wrong email or password.' ? err.message : "That email and password don't match.");
      setShake(n => n + 1);
      setLoading(false);
    }
  }

  return (
    <main className={s.page}>
      <div className={s.glow} aria-hidden />
      <div className={s.card}>
        <div className={s.orb} aria-hidden><Sparkles size={28} strokeWidth={1.75} /></div>
        <h1 className={s.title}><span className={s.titleOr}>your</span><span className={s.titlePu}>world</span></h1>
        <p className={s.subtitle}>A private little place, just for you</p>

        {notice && <p className={s.notice}><Info size={15} /> {notice}</p>}

        <form ref={formRef} className={s.form} onSubmit={handleLogin} noValidate>
          <label className={s.field}>
            <span className={s.label}>Email</span>
            <input
              type="email"
              autoFocus
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@example.com"
              className={`${s.input} ${error ? s.inputError : ''}`}
              aria-invalid={!!error}
            />
          </label>

          <label className={s.field}>
            <span className={s.label}>Password</span>
            <span className={s.pwWrap}>
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Your password"
                className={`${s.input} ${error ? s.inputError : ''}`}
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error' : undefined}
              />
              <button type="button" className={s.eye} onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {error && <p id="login-error" className={s.error} role="alert">{error}</p>}

          <button type="submit" className={s.submit} disabled={loading || !email.trim() || !password}>
            {loading ? <><Loader2 size={18} className="aSpin" /> Opening your world</> : <>Come in <ArrowRight size={18} /></>}
          </button>
        </form>

        <p className={s.hint}>Only you can get in here.</p>
      </div>
    </main>
  );
}

/** The page to open after sign in: a same-site path, or the dashboard. */
function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin === window.location.origin && !u.pathname.startsWith('//')) return u.href;
  } catch {}
  return '/dashboard';
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
