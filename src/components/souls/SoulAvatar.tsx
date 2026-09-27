'use client';
import React from 'react';
import StoredImage from '@/components/ui/StoredImage';
import type { DbSoul } from '@/lib/db';
import s from './souls.module.css';

/** Round avatar: the person's photo if they have one, otherwise their emoji on their colour. */
export default function SoulAvatar({ soul, size = 44 }: { soul: Pick<DbSoul, 'name' | 'emoji' | 'color' | 'image_url'>; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.5, ['--c' as string]: soul.color } as React.CSSProperties;
  const emoji = <span className={s.avatar} style={style} aria-hidden>{soul.emoji}</span>;
  if (!soul.image_url) return emoji;
  return <StoredImage src={soul.image_url} alt={soul.name} className={`${s.avatar} ${s.avatarImg}`} style={style} fallback={emoji} />;
}
