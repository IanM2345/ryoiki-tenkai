'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { KeyRound, ArrowLeft, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import s from './reset-password.module.css';

function strength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Too short', 'Weak', 'Okay', 'Good', 'Strong', 'Very strong'];
  return { score, label: pw ? labels[score] : '' };
}

export default function ResetPasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow]       = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail]     = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null), () => {});
  }, []);

  const st = strength(next);
  const mismatch = !!confirm && next !== confirm;
  const canSubmit = !!current && next.length >= 8 && next === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    if (next === current) { setError('Your new password needs to be different from the current one.'); return; }
    setLoading(true);
    try {
      if (!email) throw new Error('You need to be signed in to change your password.');
      // Confirm it's really her before changing anything
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (authError) throw new Error("Your current password isn't right.");
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const type = show ? 'text' : 'password';

  return (
    <main className={s.page}>
      <Link href="/dashboard" className={s.back}><ArrowLeft size={16} /> Back to your world</Link>
      <div className={s.card}>
        <div className={s.seal} aria-hidden><KeyRound size={24} strokeWidth={1.75} /></div>
        <h1 className={s.heading}>Change your password</h1>
        <p className={s.sub}>Pick something you&apos;ll remember but others won&apos;t guess.</p>

        {done ? (
          <div className={s.success} role="status">
            <span className={s.successIcon}><Check size={22} strokeWidth={2.5} /></span>
            <p>Your password has been updated. Use the new one next time you sign in.</p>
            <Link href="/dashboard" className={s.btn}>Back to your world</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={s.form} noValidate>
            <label className={s.field}>
              <span className={s.label}>Current password</span>
              <input type={type} className={s.input} value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
            </label>
            <label className={s.field}>
              <span className={s.label}>New password</span>
              <input type={type} className={s.input} value={next} onChange={e => setNext(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
              {next && (
                <span className={s.meter} data-score={st.score}>
                  <span className={s.meterBar}><span style={{ transform: `scaleX(${Math.max(1, st.score) / 5})` }} /></span>
                  <span className={s.meterLabel}>{st.label}</span>
                </span>
              )}
            </label>
            <label className={s.field}>
              <span className={s.label}>Type it again</span>
              <input type={type} className={`${s.input} ${mismatch ? s.inputError : ''}`} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" aria-invalid={mismatch} />
              {mismatch && <span className={s.fieldError}>These don&apos;t match yet.</span>}
            </label>

            <button type="button" className={s.showBtn} onClick={() => setShow(v => !v)}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />} {show ? 'Hide passwords' : 'Show passwords'}
            </button>

            {error && <p className={s.error} role="alert">{error}</p>}

            <button type="submit" className={s.btn} disabled={!canSubmit}>
              {loading ? <><Loader2 size={17} className="aSpin" /> Updating</> : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
