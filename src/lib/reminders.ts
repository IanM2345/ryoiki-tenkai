// What to remind her about today. Pure functions, shared by the daily push job
// (server) and tests. Dates are her local calendar days (APP_TIMEZONE).
import { nextBirthday } from './birthdays';
import { parseLocalDate, fmtDate } from './dates';

export interface PushMessage {
  title: string;
  body: string;
  url: string;       // opened when the notification is tapped
  tag: string;       // same tag replaces an earlier notification instead of stacking
}

/** Birthday reminders go out this many days before, the day before, and on the day. */
export const BIRTHDAY_NOTIFY_DAYS = [3, 1, 0];

/** Today's date (YYYY-MM-DD) in the given time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function dueReminders(input: {
  today: string;
  souls: { id: string; name: string; birthday: string | null }[];
  capsules: { id: string; from_name: string | null; open_on: string; opened_at: string | null; created_at: string }[];
}): PushMessage[] {
  const out: PushMessage[] = [];
  const today = parseLocalDate(input.today);

  for (const s of input.souls) {
    if (!s.birthday) continue;
    const nb = nextBirthday(s.birthday, today);
    if (!BIRTHDAY_NOTIFY_DAYS.includes(nb.days)) continue;
    const turning = nb.turning !== null ? `They're turning ${nb.turning}.` : '';
    if (nb.days === 0) {
      out.push({ title: `🎂 It's ${s.name}'s birthday today!`, body: turning || 'Send them some love today.', url: `/souls/${s.id}`, tag: `bday-${s.id}` });
    } else if (nb.days === 1) {
      out.push({ title: `${s.name}'s birthday is tomorrow`, body: `${turning} Have you got something ready?`.trim(), url: `/souls/${s.id}`, tag: `bday-${s.id}` });
    } else {
      out.push({ title: `${s.name}'s birthday is in ${nb.days} days`, body: `${turning} Time to plan something nice.`.trim(), url: `/souls/${s.id}`, tag: `bday-${s.id}` });
    }
  }

  for (const c of input.capsules) {
    if (c.opened_at || c.open_on !== input.today) continue;
    // Never put the letter's title or words in the notification: it's a surprise.
    out.push(c.from_name
      ? { title: `💌 ${c.from_name} left you a letter`, body: 'It unlocks today. Open it in your time capsule.', url: '/capsules', tag: `capsule-${c.id}` }
      : { title: '💌 A letter from the past is ready', body: `You sealed it on ${fmtDate(c.created_at)}. It unlocks today.`, url: '/capsules', tag: `capsule-${c.id}` });
  }
  return out;
}
