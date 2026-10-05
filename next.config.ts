import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
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
