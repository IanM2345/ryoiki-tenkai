// Date helpers that use the viewer's local calendar day.
// (toISOString() is UTC, which puts "today" on the wrong day near midnight.)

/** YYYY-MM-DD for the given moment in local time. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string as a local date (not UTC midnight). */
export function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(ymd: string, n: number): string {
  const d = parseLocalDate(ymd);
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

/** "12 Mar", or "12 Mar 2024" when not this year. Accepts dates or timestamps. */
export function fmtDate(iso: string): string {
  const d = iso.length <= 10 ? parseLocalDate(iso) : new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Friendly relative day: Today, Tomorrow, Yesterday, else fmtDate. */
export function relDay(ymd: string): string {
  const today = localDateStr();
  if (ymd === today) return 'today';
  if (ymd === addDays(today, 1)) return 'tomorrow';
  if (ymd === addDays(today, -1)) return 'yesterday';
  return fmtDate(ymd);
}

/** Current local time as HH:MM. */
export function localTimeStr(d: Date = new Date()): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
