'use client';
// Every What's new video, newest first, so any update can be watched again.
import React from 'react';
import Link from 'next/link';
import { Play, Sparkles, PlayCircle, ChevronRight } from 'lucide-react';
import { Topbar } from '@/components/ui';
import { WHATS_NEW_VIDEOS, openWhatsNew } from '@/lib/whatsNew';
import { TUTORIALS, TUTORIAL_ORDER } from '@/lib/tutorials';
import s from './updates.module.css';

const MAX = 860;
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const mins = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)} min${sec % 60 ? ` ${sec % 60} s` : ''}` : `${sec} s`);

export default function UpdatesPage() {
  const tutorials = TUTORIAL_ORDER.map(slug => [slug, TUTORIALS[slug]] as const);
  return (
    <div className={s.page}>
      <Topbar title="What's new" sub="Every update, newest first. Tap one to watch it again." maxWidth={MAX} />
      <div className={s.wrap}>
        <ol className={s.list}>
          {WHATS_NEW_VIDEOS.map((v, i) => (
            <li key={v.id}>
              <button type="button" className={s.card} onClick={() => openWhatsNew(v.id)} aria-label={`Watch ${v.title}`}>
                <span className={s.thumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- static poster */}
                  <img src={v.landscape.poster} alt="" loading="lazy" />
                  <span className={s.play}><Play size={22} strokeWidth={2.5} /></span>
                </span>
                <span className={s.text}>
                  <span className={s.meta}>
                    <time dateTime={v.date}>{fmt(v.date)}</time>
                    {i === 0 && <span className={s.newest}><Sparkles size={12} /> Newest</span>}
                  </span>
                  <span className={s.title}>{v.title}</span>
                  <span className={s.blurb}>{v.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        {tutorials.length > 0 && (<>
          <h2 className={s.section}>How to play videos</h2>
          <div className={s.tuts}>
            {tutorials.map(([slug, t]) => (
              <Link key={slug} href={t.href} className={s.tut}>
                <PlayCircle size={20} strokeWidth={2} /> <b>{t.title}</b> <span>{mins(t.seconds)}</span> <ChevronRight size={16} className={s.chev} />
              </Link>
            ))}
          </div>
          <p className={s.note}>Open a game and tap <b>How to play</b> next to New game.</p>
        </>)}
      </div>
    </div>
  );
}
