// Birthday helpers. Birthdays are stored as YYYY-MM-DD; year 1904 means "year unknown"
// (1904 is a leap year, so 29 February can still be saved).
import { localDateStr, parseLocalDate } from './dates';

export const UNKNOWN_YEAR = 1904;
export const REMIND_DAYS = 3;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface NextBirthday {
  date: Date;          // the next occurrence (today counts)
  days: number;        // 0 = today
  turning: number | null;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The next time this birthday comes round, counting today. */
export function nextBirthday(birthday: string, today: Date = new Date()): NextBirthday {
  const [y, m, d] = birthday.slice(0, 10).split('-').map(Number);
  const start = parseLocalDate(localDateStr(today));
  const on = (year: number) => {
    // 29 Feb in a non-leap year is celebrated on 28 Feb.
    const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d;
    return new Date(year, m - 1, day);
  };
  let date = on(start.getFullYear());
  if (date < start) date = on(start.getFullYear() + 1);
  const days = Math.round((date.getTime() - start.getTime()) / 86_400_000);
  const turning = y && y !== UNKNOWN_YEAR ? date.getFullYear() - y : null;
  return { date, days, turning };
}

/** "12 March", or "12 March 1994" when the year is known. */
export function fmtBirthday(birthday: string, withYear = false): string {
  const [y, m, d] = birthday.slice(0, 10).split('-').map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return withYear && y !== UNKNOWN_YEAR ? `${base} ${y}` : base;
}

/** "Today", "Tomorrow", "In 5 days", "In 3 weeks". */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 14) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  if (days < 350) return `In ${Math.round(days / 30.4)} months`;
  return 'In a year';
}

export interface Upcoming<T> { person: T; next: NextBirthday }

/** People with birthdays, soonest first. */
export function upcomingBirthdays<T extends { birthday?: string | null }>(people: T[], today = new Date()): Upcoming<T>[] {
  return people
    .filter(p => !!p.birthday)
    .map(p => ({ person: p, next: nextBirthday(p.birthday as string, today) }))
    .sort((a, b) => a.next.days - b.next.days);
}
