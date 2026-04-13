'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { restoreSession } from '@/lib/supabase';
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
      console.log('[1] Hitting /api/auth/login...');
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:    email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      console.log('[2] API response:', res.status, data.ok, 'has token:', !!data.access_token);
      if (!res.ok) throw new Error(data.message ?? 'Wrong email or password.');

      if (data.access_token === 'dev') {
        console.log('[dev] Bypassing Supabase, going to dashboard');
        router.push('/dashboard');
        return;
      }

      console.log('[3] Restoring session from tokens...');
      const session = await restoreSession(data.access_token, data.refresh_token);
      console.log('[4] Session restored:', !!session);

      if (!session) throw new Error('Session did not initialise. Please try again.');

      console.log('[5] Navigating to dashboard');
      router.push('/dashboard');

    } catch (err: unknown) {
      console.error('[ERR]', err);
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