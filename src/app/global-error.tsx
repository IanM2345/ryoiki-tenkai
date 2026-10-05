'use client';
// Last-resort error screen (when even the layout fails). Reports the crash to Sentry.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import s from './global-error.module.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body className={s.body}>
        <main className={s.box}>
          <h1>Something went wrong</h1>
          <p>Sorry about that. It&rsquo;s been reported, so it can be fixed.</p>
          <div className={s.row}>
            <button type="button" onClick={() => reset()}>Try again</button>
            <button type="button" onClick={() => window.location.assign('/dashboard')}>Go home</button>
          </div>
        </main>
      </body>
    </html>
  );
}
