// Sentry in the browser: reports crashes and errors on her phone, iPad or laptop.
// Off unless NEXT_PUBLIC_SENTRY_DSN is set. No session replay, no personal data (see sentry-privacy.ts).
import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@/lib/sentry-privacy';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
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
  // Errors from browser extensions and the like aren't the site's fault.
  denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-(web-)?extension:\/\//],
  ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications', 'AbortError'],
});

// A hidden check: open any page with ?sentry-test in the address to send one test error.
if (typeof window !== 'undefined' && dsn && new URLSearchParams(window.location.search).has('sentry-test')) {
  Sentry.captureException(new Error('Sentry test from yourworld (this is fine)'));
  console.info('Sentry test error sent.');
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
