// Server-only: sends Web Push messages. Never import this from a client component
// (it uses the service role key and the private VAPID key).
import webpush from 'web-push';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PushMessage } from './reminders';

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

/** Names (never values) of settings that are missing. */
export function missingEnv(): string[] {
  return REQUIRED.filter(k => !process.env[k]);
}

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface SubRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

/**
 * Send messages to a user's devices. Devices that no longer exist (the app was
 * removed from the Home Screen, notifications turned off) are cleaned up.
 */
export async function sendTo(db: SupabaseClient, subs: SubRow[], messages: PushMessage[]) {
  setup();
  let sent = 0, failed = 0, removed = 0;
  for (const sub of subs) {
    let ok = false;
    for (const m of messages) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(m),
          { TTL: 60 * 60 * 20, urgency: 'normal' },
        );
        sent++; ok = true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('id', sub.id);
          removed++;
          break;                                       // gone: skip its other messages
        }
        failed++;
      }
    }
    if (ok) await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', sub.id);
  }
  return { sent, failed, removed };
}
