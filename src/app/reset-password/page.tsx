'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './reset-password.module.css';

export default function ResetPasswordPage() {
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,           setError]           = useState<string | null>(null);
  const [success,         setSuccess]         = useState(false);
  const [loading,         setLoading]         = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.seal}>🔑</div>
        <h1 className={styles.heading}>change password</h1>
        <p className={styles.sub}>pick something you&apos;ll remember</p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-password">new password</label>
          <input
            id="new-password"
            type="password"
            className={styles.input}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="at least 8 characters"
            autoComplete="new-password"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm-password">confirm password</label>
          <input
            id="confirm-password"
            type="password"
            className={styles.input}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="same again"
            autoComplete="new-password"
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          />
        </div>

        {error !== null && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>password updated ✓</p>}

        <button
          className={styles.btn}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'saving...' : 'update password →'}
        </button>
      </div>
    </div>
  );
}