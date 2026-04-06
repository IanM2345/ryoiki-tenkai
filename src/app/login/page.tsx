'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, signInWithEmail } from '@/lib/supabase';
import s from './login.module.css';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [notice,   setNotice]   = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'inactivity')      setNotice('You were logged out due to inactivity.');
    if (reason === 'session_expired') setNotice('Your session expired. Please log in again.');
  }, [searchParams]);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      // Step 1: server-side email gate
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:    email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Wrong email or password.');

      // Step 2: sign in on the shared supabase instance (writes session to localStorage)
      await signInWithEmail(email.trim().toLowerCase(), password);

      // Step 3: wait for session to actually be available before navigating
      // Supabase writes to localStorage async — poll until confirmed or timeout
      let session = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 100));
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) { session = s; break; }
      }

      if (!session) throw new Error('Session did not initialise. Please try again.');

      router.push('/dashboard');

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Wrong email or password.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  return (
    <div className={s.page}>
      <div className={s.orb}>✦</div>
      <h1 className={s.title}>
        <span className={s.titleOr}>your</span>
        <span className={s.titlePu}>world</span>
      </h1>
      <p className={s.subtitle}>private &amp; just for you</p>

      {notice && <p className={s.noticeMsg}>{notice}</p>}

      <div className={s.form}>
        <div>
          <label className={s.inputLabel}>Email</label>
          <input
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handleLogin()}
            placeholder="your@email.com"
            className={`${s.passwordInput} ${error ? s.passwordInputError : ''}`}
          />
        </div>

        <div>
          <label className={s.inputLabel}>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canSubmit && handleLogin()}
            placeholder="Enter your password"
            className={`${s.passwordInput} ${error ? s.passwordInputError : ''}`}
          />
          {error && <p className={s.errorMsg}>{error}</p>}
        </div>

        <button
          className={s.submitBtn}
          onClick={handleLogin}
          disabled={loading || !canSubmit}
        >
          {loading ? 'Entering...' : 'Enter →'}
        </button>

        <p className={s.hint}>Only you have access to this place.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}