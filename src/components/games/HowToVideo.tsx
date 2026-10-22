'use client';
// The "Watch how to play" button and its video window, shown in the header of a game.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PlayCircle, X } from 'lucide-react';
import { TUTORIALS, tutorialSrc } from '@/lib/tutorials';
import w from '../whatsNew.module.css';
import s from './GameShell.module.css';

export default function HowToVideo({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [portrait, setPortrait] = useState(true);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const info = TUTORIALS[slug];

  const close = useCallback(() => { video.current?.pause(); setOpen(false); }, []);
  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    video.current?.play().catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!info) return null;
  const { src, poster } = tutorialSrc(slug, portrait);
  const mins = info.seconds >= 60 ? `${Math.floor(info.seconds / 60)} min ${info.seconds % 60 ? `${info.seconds % 60} s` : ''}`.trim() : `${info.seconds} s`;
  return (
    <>
      <button type="button" className={s.howTo} onClick={() => { setPortrait(window.innerHeight >= window.innerWidth); setFailed(false); setOpen(true); }}>
        <PlayCircle size={16} strokeWidth={2.25} /> How to play <span>{mins}</span>
      </button>
      {open && (
        <div className={w.overlay} role="dialog" aria-modal="true" aria-label={`How to play ${info.title}`} onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className={`${w.frame} ${portrait ? w.portrait : w.landscape}`}>
            {failed
              ? <p className={s.howToFail}>This video didn&apos;t load. Check your connection and try again.</p>
              : <video ref={video} className={w.video} src={src} poster={poster} controls playsInline preload="auto" onError={() => setFailed(true)} />}
            <button ref={closeBtn} type="button" className={w.close} onClick={close} aria-label="Close"><X size={20} /></button>
          </div>
        </div>
      )}
    </>
  );
}
