'use client';
// Browser side of push notifications: turn them on/off for this device and send a test.
import { supabase } from './supabase';

export type PushSupport =
  | 'ok'
  | 'ios-needs-install'     // iPhone/iPad Safari tab: Apple only allows push for Home Screen apps
  | 'ios-too-old'           // iOS/iPadOS before 16.4
  | 'unsupported'           // this browser can't do push
  | 'not-configured';       // the site has no VAPID public key set

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows computer';
  return 'This device';
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'not-configured';
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS()) {
    if (!isStandalone()) return 'ios-needs-install';
    return hasPush ? 'ok' : 'ios-too-old';
  }
  return hasPush ? 'ok' : 'unsupported';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

/** The push subscription for this device, if notifications are on. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * Turn notifications on for this device. Must be called from a tap
 * (Apple requires the permission prompt to come from a user gesture).
 */
export async function enablePush(): Promise<'on' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    device: deviceName(),
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  return 'on';
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

/** Ask the server to push a test notification to all of her devices. */
export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, message: 'Please sign in again.' };
  const res = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, message: body.error ?? 'The test could not be sent.' };
  return { ok: true, message: body.devices > 1 ? `Sent to ${body.devices} devices.` : 'Sent. It should arrive in a few seconds.' };
}
