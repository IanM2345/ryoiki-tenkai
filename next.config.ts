import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Stop the build if the Supabase settings don't fit together, so a mistyped or
// mixed-up key fails the deploy instead of locking her out of her site.
function checkSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const fail = (why: string) => { throw new Error(`Supabase settings problem: ${why}. Check Vercel → Settings → Environment Variables, then redeploy.`); };
  if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url!)?.[1];
  if (!ref) fail(`NEXT_PUBLIC_SUPABASE_URL should look like https://<project>.supabase.co (got "${url}")`);
  if (key!.startsWith('sb_secret_')) fail('NEXT_PUBLIC_SUPABASE_ANON_KEY is a SECRET key; use the publishable/anon key (it is sent to browsers)');
  if (key!.startsWith('sb_publishable_')) return;
  const parts = key!.split('.');
  if (parts.length !== 3) fail('NEXT_PUBLIC_SUPABASE_ANON_KEY is not a complete key (it should have three parts separated by dots)');
  let header: { alg?: string }, payload: { ref?: string; role?: string };
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch { return fail('NEXT_PUBLIC_SUPABASE_ANON_KEY is damaged (part of it is missing or changed)'); }
  if (payload.role !== 'anon') fail(`NEXT_PUBLIC_SUPABASE_ANON_KEY is the "${payload.role}" key; use the anon key (the service_role key must never reach browsers)`);
  if (payload.ref !== ref) fail(`NEXT_PUBLIC_SUPABASE_ANON_KEY belongs to project ${payload.ref}, but NEXT_PUBLIC_SUPABASE_URL points at ${ref}`);
  if (header.alg === 'HS256' && parts[2].length !== 43) fail(`the end of NEXT_PUBLIC_SUPABASE_ANON_KEY is ${parts[2].length > 43 ? 'too long (an extra character was pasted)' : 'too short (part of it is missing)'}`);
}

const nextConfig: NextConfig = {
  /* config options here */
};

const config = withSentryConfig(nextConfig, {
  // From Vercel's environment variables (see DEPLOY.md, "Sentry"). Without the auth token
  // the site still reports errors; stack traces just point at minified code.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
  // Errors go via the site itself, so ad blockers on her devices don't drop them.
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});

// The Supabase check runs only while building, so a running site is never taken down by it.
export default function nextConfigFor(phase: string) {
  if (phase === PHASE_PRODUCTION_BUILD) checkSupabaseEnv();
  return config;
}
