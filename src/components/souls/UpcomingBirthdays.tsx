'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cake, ArrowRight, BellRing, X, PartyPopper } from 'lucide-react';
import StoredImage from '@/components/ui/StoredImage';
import type { DbSoul } from '@/lib/db';
import { upcomingBirthdays, countdownLabel, fmtBirthday, REMIND_DAYS } from '@/lib/birthdays';
import { localDateStr } from '@/lib/dates';
import s from './birthdays.module.css';

const DISMISS_KEY = 'yw-bday-banner';

function Face({ soul }: { soul: DbSoul }) {
  return (
    <span className={s.face} style={{ ['--c' as string]: soul.color }}>
      {soul.image_url ? <StoredImage src={soul.image_url} alt="" /> : <span aria-hidden>{soul.emoji}</span>}
    </span>
  );
}

/** Dashboard card: the next few birthdays with a countdown. */
export function UpcomingBirthdaysCard({ souls, loading }: { souls: DbSoul[]; loading: boolean }) {
  const list = upcomingBirthdays(souls).slice(0, 4);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);

  const askPermission = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  };

  return (
    <section className={s.card} aria-labelledby="bday-h">
      <div className={s.head}>
        <h2 id="bday-h" className={s.title}><Cake size={17} strokeWidth={2} /> Birthdays</h2>
        <Link href="/souls" className={s.link}>Souls <ArrowRight size={14} /></Link>
      </div>

      {loading ? (
        <div className={`skeleton ${s.skel}`} />
      ) : list.length === 0 ? (
        <p className={s.muted}>Add a birthday to someone in Souls and a countdown will appear here.</p>
      ) : (
        <ul className={s.list}>
          {list.map(({ person, next }) => (
            <li key={person.id}>
              <Link href={`/souls/${person.id}`} className={`${s.row} ${next.days === 0 ? s.today : next.days <= REMIND_DAYS ? s.soon : ''}`}>
                <Face soul={person} />
                <span className={s.text}>
                  <span className={s.name}>{person.name}</span>
                  <span className={s.meta}>
                    {fmtBirthday(person.birthday as string)}
                    {next.turning !== null && <> · turning {next.turning}</>}
                  </span>
                </span>
                <span className={s.when}>
                  {next.days === 0 ? <><PartyPopper size={14} strokeWidth={2.25} /> Today</> : countdownLabel(next.days)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.length > 0 && perm === 'default' && (
        <button type="button" className={s.notifyBtn} onClick={askPermission}>
          <BellRing size={14} strokeWidth={2.25} /> Remind me on this device too
        </button>
      )}
    </section>
  );
}

/** Banner at the top of the dashboard when a birthday is today or within a few days. */
export function BirthdayReminder({ souls }: { souls: DbSoul[] }) {
  const today = localDateStr();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    let v: string | null = null;
    try { v = localStorage.getItem(DISMISS_KEY); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(v === today);
  }, [today]);

  const soon = upcomingBirthdays(souls).filter(u => u.next.days <= REMIND_DAYS);
  if (dismissed || soon.length === 0) return null;

  const first = soon[0];
  const others = soon.length - 1;
  const lead = first.next.days === 0
    ? `It's ${first.person.name}'s birthday today!`
    : `${first.person.name}'s birthday is ${first.next.days === 1 ? 'tomorrow' : `in ${first.next.days} days`}`;
  const extra = others > 0 ? ` And ${others} more coming up soon.` : '';
  const turning = first.next.turning !== null ? ` They're turning ${first.next.turning}.` : '';

  return (
    <div className={`${s.banner} ${first.next.days === 0 ? s.bannerToday : ''}`} role="status">
      <Face soul={first.person} />
      <p className={s.bannerText}>
        <strong>{lead}</strong>
        <span>{turning}{extra}</span>
      </p>
      <Link href={`/souls/${first.person.id}`} className={s.bannerLink}>See {first.person.name}</Link>
      <button
        type="button"
        className={s.bannerClose}
        aria-label="Dismiss for today"
        onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, today); } catch { /* ignore */ } }}
      >
        <X size={16} strokeWidth={2.25} />
      </button>
    </div>
  );
}
