'use client';
// Pick a time for a task, and when to be reminded (push notification).
import React from 'react';
import { Clock, Bell, X } from 'lucide-react';
import { REMIND_OPTIONS, hhmm } from '@/lib/tasks';
import s from './TimeAndReminders.module.css';

export function TimeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <span className={s.time}>
      <Clock size={14} aria-hidden />
      <input type="time" value={hhmm(value)} onChange={e => onChange(e.target.value)} aria-label="Time" disabled={disabled} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="No time"><X size={13} /></button>}
    </span>
  );
}

export function ReminderPicker({ value, onChange, hint = true }: { value: number[]; onChange: (v: number[]) => void; hint?: boolean }) {
  const toggle = (m: number) => onChange(value.includes(m) ? value.filter(x => x !== m) : [...value, m].sort((a, b) => b - a));
  return (
    <div className={s.reminders}>
      <span className={s.lbl}><Bell size={13} /> Remind me</span>
      <div className={s.chips} role="group" aria-label="Reminders">
        {REMIND_OPTIONS.map(o => (
          <button key={o.min} type="button" aria-pressed={value.includes(o.min)} className={value.includes(o.min) ? s.on : ''} onClick={() => toggle(o.min)}>{o.label}</button>
        ))}
      </div>
      {hint && <span className={s.hint}>{value.length ? 'Sent to your devices with notifications on.' : 'No reminder for this one.'}</span>}
    </div>
  );
}
