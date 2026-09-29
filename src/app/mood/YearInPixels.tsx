'use client';
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Grid3x3 } from 'lucide-react';
import s from './pixels.module.css';
import { localDateStr } from '@/lib/dates';

export interface PixelLog { date: string; name: string; color: string; intensity: number }

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

interface DayInfo { color: string; name: string; logs: PixelLog[] }

/** The day's feeling = the one with the most total intensity (latest wins a tie). */
function summarise(logs: PixelLog[]): DayInfo {
  const weight = new Map<string, { w: number; color: string }>();
  for (const l of logs) {
    const cur = weight.get(l.name);
    weight.set(l.name, { w: (cur?.w ?? 0) + l.intensity, color: l.color });
  }
  let best = { name: logs[0].name, w: -1, color: logs[0].color };
  for (const [name, v] of weight) if (v.w > best.w) best = { name, w: v.w, color: v.color };
  return { color: best.color, name: best.name, logs };
}

export default function YearInPixels({ logs }: { logs: PixelLog[] }) {
  const today = localDateStr();
  const thisYear = Number(today.slice(0, 4));
  const years = useMemo(() => {
    const set = new Set<number>([thisYear]);
    logs.forEach(l => set.add(Number(l.date.slice(0, 4))));
    return [...set].sort((a, b) => a - b);
  }, [logs, thisYear]);
  const [year, setYear] = useState(thisYear);
  const [picked, setPicked] = useState<string | null>(null);

  const days = useMemo(() => {
    const byDate = new Map<string, PixelLog[]>();
    for (const l of logs) {
      if (!l.date.startsWith(String(year))) continue;
      const arr = byDate.get(l.date) ?? [];
      arr.push(l);
      byDate.set(l.date, arr);
    }
    const out = new Map<string, DayInfo>();
    byDate.forEach((arr, d) => out.set(d, summarise(arr)));
    return out;
  }, [logs, year]);

  const legend = useMemo(() => {
    const count = new Map<string, { n: number; color: string }>();
    days.forEach(d => count.set(d.name, { n: (count.get(d.name)?.n ?? 0) + 1, color: d.color }));
    return [...count].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  }, [days]);

  const idx = years.indexOf(year);
  const pickedInfo = picked ? days.get(picked) : undefined;
  const pickedLabel = picked
    ? `${Number(picked.slice(8, 10))} ${MONTH_NAMES[Number(picked.slice(5, 7)) - 1]}`
    : '';

  return (
    <section className={s.wrap} aria-labelledby="pixels-title">
      <div className={s.head}>
        <h2 id="pixels-title" className={s.title}><Grid3x3 size={17} strokeWidth={2} /> Your year in colour</h2>
        <div className={s.yearNav}>
          <button type="button" className={s.navBtn} onClick={() => { setYear(years[idx - 1]); setPicked(null); }} disabled={idx <= 0} aria-label="Previous year">
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span className={s.year}>{year}</span>
          <button type="button" className={s.navBtn} onClick={() => { setYear(years[idx + 1]); setPicked(null); }} disabled={idx >= years.length - 1} aria-label="Next year">
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.grid} role="grid" aria-label={`Moods for ${year}`}>
          <span className={s.corner} />
          {MONTHS.map((m, i) => <span key={i} className={s.month} title={MONTH_NAMES[i]}>{m}</span>)}
          {Array.from({ length: 31 }, (_, di) => {
            const day = di + 1;
            return (
              <React.Fragment key={day}>
                <span className={s.dayNum}>{day % 5 === 0 || day === 1 ? day : ''}</span>
                {MONTHS.map((_, mi) => {
                  const exists = day <= new Date(year, mi + 1, 0).getDate();
                  if (!exists) return <span key={mi} className={s.none} />;
                  const date = `${year}-${pad(mi + 1)}-${pad(day)}`;
                  const info = days.get(date);
                  const future = date > today;
                  const cls = [s.px, info ? s.filled : '', future ? s.future : '', date === today ? s.today : '', picked === date ? s.picked : ''].join(' ');
                  return (
                    <button
                      key={mi}
                      type="button"
                      className={cls}
                      style={info ? { ['--c' as string]: info.color } : undefined}
                      onClick={() => setPicked(p => (p === date ? null : date))}
                      disabled={future}
                      aria-label={`${day} ${MONTH_NAMES[mi]}${info ? `: ${info.name}` : ''}`}
                      title={info ? `${day} ${MONTH_NAMES[mi]}: ${info.name}` : `${day} ${MONTH_NAMES[mi]}`}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        <div className={s.side}>
          <div className={s.detail} aria-live="polite">
            {picked ? (
              pickedInfo ? (
                <>
                  <span className={s.detailDate}>{pickedLabel}</span>
                  <ul className={s.detailList}>
                    {pickedInfo.logs.map((l, i) => (
                      <li key={i}><span className={s.dot} style={{ ['--c' as string]: l.color }} /> {l.name}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <><span className={s.detailDate}>{pickedLabel}</span><span className={s.muted}>No feelings logged that day.</span></>
              )
            ) : (
              <span className={s.muted}>
                {days.size ? `${days.size} ${days.size === 1 ? 'day' : 'days'} coloured in ${year}. Tap a square to see that day.` : `Nothing logged in ${year} yet. Each day you log a feeling fills in a square.`}
              </span>
            )}
          </div>
          {legend.length > 0 && (
            <ul className={s.legend}>
              {legend.map(([name, v]) => (
                <li key={name}><span className={s.dot} style={{ ['--c' as string]: v.color }} /> {name} <span className={s.legendN}>{v.n}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
