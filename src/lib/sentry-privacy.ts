/**
 * What Sentry is allowed to see: that something broke, where in the code, on which page
 * and device type. Never her words, names, photos, places or account details.
 *
 * Used by the browser, server and edge Sentry setups (instrumentation*.ts).
 */
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Keep only the path (no ?query, no #hash), with ids blanked: /journal/<id>. */
export function cleanUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url, 'https://x.invalid');
    const host = u.host === 'x.invalid' ? '' : `${u.protocol}//${u.host}`;
    return `${host}${u.pathname.replace(UUID, '<id>')}`;
  } catch {
    return url.split(/[?#]/)[0].replace(UUID, '<id>');
  }
}

export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  delete event.user;
  delete event.extra;
  delete event.server_name;
  if (event.request) {
    event.request = {
      url: cleanUrl(event.request.url),
      method: event.request.method,
      // user-agent only: tells us which phone or browser, nothing about her
      headers: event.request.headers?.['user-agent'] ? { 'user-agent': event.request.headers['user-agent'] } : undefined,
    };
  }
  if (event.contexts) {
    delete event.contexts.state;
    delete event.contexts.response;
  }
  if (event.transaction) event.transaction = event.transaction.replace(UUID, '<id>');
  event.breadcrumbs = event.breadcrumbs?.map(b => scrubBreadcrumb(b)).filter((b): b is Breadcrumb => !!b);
  return event;
}

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  switch (b.category) {
    // Page changes and network calls are useful, but only as bare paths.
    case 'navigation':
      return { ...b, data: { from: cleanUrl(b.data?.from as string), to: cleanUrl(b.data?.to as string) } };
    case 'fetch':
    case 'xhr':
      return { ...b, data: { method: b.data?.method, url: cleanUrl(b.data?.url as string), status_code: b.data?.status_code } };
    // Clicks and typing can carry labels like "Edit <place name>"; console logs can carry anything.
    case 'ui.click':
    case 'ui.input':
    case 'console':
      return null;
    default:
      return { ...b, message: b.message ? b.message.replace(UUID, '<id>') : b.message, data: undefined };
  }
}
