'use client';
import React, { useState } from 'react';
import { UserPlus, X, ChevronUp } from 'lucide-react';
import { SoulPicker } from './index';
import type { DbSoul } from '@/lib/db';
import s from './ui.module.css';
import SoulAvatar from '@/components/souls/SoulAvatar';

/** "Who is this connected to?" field used in every item modal. */
export default function SoulLinkField({ souls, value, onChange, label = 'Connected people' }: {
  souls: DbSoul[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!souls.length) return null;
  const linked = souls.filter(x => value.includes(x.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

  return (
    <div className={s.fieldWrap}>
      <span className={s.lbl}>{label}</span>
      <div className={s.linkRow}>
        {linked.map(soul => (
          <span key={soul.id} className={s.linkChip} style={{ ['--c' as string]: soul.color }}>
            <SoulAvatar soul={soul} size={22} />{soul.name}
            <button type="button" onClick={() => toggle(soul.id)} aria-label={`Unlink ${soul.name}`}><X size={12} strokeWidth={2.5} /></button>
          </span>
        ))}
        <button type="button" className={s.linkAdd} onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? <><ChevronUp size={14} strokeWidth={2.25} /> Done</> : <><UserPlus size={14} strokeWidth={2.25} /> {linked.length ? 'Edit' : 'Link someone'}</>}
        </button>
      </div>
      {open && (
        <div className={s.linkPanel}>
          <SoulPicker souls={souls} linkedIds={value} onToggle={toggle} />
        </div>
      )}
    </div>
  );
}
