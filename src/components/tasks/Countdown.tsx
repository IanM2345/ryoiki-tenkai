'use client';
// The little clock chip on a task: how long until it's due ("in 25 min", "2 days late").
import React from 'react';
import { Timer, BellRing } from 'lucide-react';
import { countdown, type Task } from '@/lib/tasks';
import s from './Countdown.module.css';

export default function Countdown({ task, now, bell = true }: { task: Task; now: number; bell?: boolean }) {
  const c = countdown(task, now);
  if (!c) return null;
  const reminders = bell && !!task.due_time && (task.remind_before?.length ?? 0) > 0;
  return (
    <span className={`${s.chip} ${s[c.tone]}`} title={reminders ? 'Reminder set' : undefined}>
      <Timer size={13} strokeWidth={2.25} aria-hidden />
      {c.label}
      {reminders && <BellRing size={12} strokeWidth={2.25} aria-label="Reminder set" />}
    </span>
  );
}
