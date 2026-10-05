// Sentry on the server (pages, API routes, the daily reminder job) and in middleware.
// Off unless NEXT_PUBLIC_SENTRY_DSN is set. No personal data (see sentry-privacy.ts).
import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@/lib/sentry-privacy';

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  Sentry.init({
    dsn,
    enabled: !!dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    // Collect nothing personal: no user, cookies, bodies, query strings or local variable values.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['user-agent'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeBreadcrumb: b => scrubBreadcrumb(b),
  });
}

export const onRequestError = Sentry.captureRequestError;
