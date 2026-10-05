'use client';
import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/lib/routing';

type WakeLockSentinelLike = { release: () => Promise<void> };

/** Keeps the screen on while `active` (iOS 16.4+ and most browsers). Returns whether it's holding. */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  const lock = useRef<WakeLockSentinelLike | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    if (!active || !nav.wakeLock) return;
    let cancelled = false;
    const grab = async () => {
      try {
        const l = await nav.wakeLock!.request('screen');
        if (cancelled) { l.release().catch(() => {}); return; }
        lock.current = l; setHeld(true);
      } catch { setHeld(false); }
    };
    grab();
    const onVis = () => { if (document.visibilityState === 'visible') grab(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock.current?.release().catch(() => {});
      lock.current = null;
      setHeld(false);
    };
  }, [active]);
  return held;
}

/** Follows her position while `active`. */
export function usePosition(active: boolean): { pos: (LatLng & { accuracy: number }) | null; error: string | null } {
  const [pos, setPos] = useState<(LatLng & { accuracy: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setError(null); },
      err => setError(err.code === err.PERMISSION_DENIED ? 'Location is blocked, so stops won’t tick off by themselves.' : 'Looking for GPS…'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return { pos, error };
}
