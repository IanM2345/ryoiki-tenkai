'use client';
import { useEffect } from 'react';
import { getSouls } from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { upcomingBirthdays, REMIND_DAYS } from '@/lib/birthdays';
import { localDateStr } from '@/lib/dates';

/**
 * When the site is opened and she has allowed notifications, show one device
 * notification per upcoming birthday per day. It needs no server: it runs when
 * the site (or the installed app) is opened.
 */
export default function BirthdayNotifier() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        if (!(await ensureSession()) || cancelled) return;
        const today = localDateStr();
        const soon = upcomingBirthdays(await getSouls()).filter(u => u.next.days <= REMIND_DAYS);
        for (const { person, next } of soon) {
          const key = `yw-bday-notified-${person.id}`;
          let last: string | null = null;
          try { last = localStorage.getItem(key); } catch { /* ignore */ }
          if (last === today) continue;
          const when = next.days === 0 ? 'is today!' : next.days === 1 ? 'is tomorrow' : `is in ${next.days} days`;
          const body = next.turning !== null ? `They're turning ${next.turning}.` : 'Time to plan something nice.';
          const opts = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: `bday-${person.id}` };
          const title = `${person.name}'s birthday ${when}`;
          const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => undefined);
          if (reg) await reg.showNotification(title, opts);
          else new Notification(title, opts);
          try { localStorage.setItem(key, today); } catch { /* ignore */ }
        }
      } catch { /* a reminder must never break the page */ }
    }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);
  return null;
}
