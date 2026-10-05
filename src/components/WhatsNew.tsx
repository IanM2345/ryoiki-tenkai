'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { X, Volume2, RotateCcw, Check, Pause, Play, Film } from 'lucide-react';
import s from './whatsNew.module.css';
import { ensureSession } from '@/lib/supabase';
import {
  WHATS_NEW_EVENT, WHATS_NEW_VIDEOS, shouldAutoplayWhatsNew, markWhatsNewSeen,
} from '@/lib/whatsNew';

const AUTH_PAGES = ['/login', '/reset-password'];

/**
 * The "What's new" video. Plays by itself the first time she opens the site after
 * an update (muted, because phones only allow silent autoplay, with a big
 * "Tap for sound" button), and can be replayed from the menu or App & backup.
 */
export default function WhatsNew() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [portrait, setPortrait] = useState(true);
  const [videoId, setVideoId] = useState(WHATS_NEW_VIDEOS[0].id);
  const video = useRef<HTMLVideoElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const start = useCallback((withSound: boolean, isAuto: boolean, id?: string) => {
    setVideoId(WHATS_NEW_VIDEOS.some(x => x.id === id) ? id! : WHATS_NEW_VIDEOS[0].id);
    setPortrait(window.innerHeight >= window.innerWidth);
    setAuto(isAuto); setEnded(false); setPaused(false); setProgress(0); setMuted(!withSound); setOpen(true);
  }, []);

  // First visit after an update: play by itself.
  useEffect(() => {
    if (AUTH_PAGES.some(p => pathname?.startsWith(p))) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!(await ensureSession()) || cancelled) return;
      if (await shouldAutoplayWhatsNew() && !cancelled) start(false, true);
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
    // Only on first load of the app, not on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replays from the menu / settings.
  useEffect(() => {
    const onOpen = (e: Event) => { const d = (e as CustomEvent).detail; start(!!d?.withSound, false, d?.id); };
    window.addEventListener(WHATS_NEW_EVENT, onOpen);
    return () => window.removeEventListener(WHATS_NEW_EVENT, onOpen);
  }, [start]);

  // Start playback once the element is on screen.
  useEffect(() => {
    if (!open || !video.current) return;
    const v = video.current;
    v.muted = muted;
    v.currentTime = 0;
    v.play().catch(() => {
      // Sound wasn't allowed: fall back to silent playback with the "Tap for sound" button.
      v.muted = true; setMuted(true); v.play().catch(() => setPaused(true));
    });
    closeBtn.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, portrait, videoId]);

  const close = useCallback(() => {
    video.current?.pause();
    setOpen(false);
    if (auto) markWhatsNewSeen();
  }, [auto]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onHide = () => { if (document.hidden) video.current?.pause(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onHide); };
  }, [open, close]);

  if (!open) return null;
  const current = WHATS_NEW_VIDEOS.find(x => x.id === videoId) ?? WHATS_NEW_VIDEOS[0];
  const others = WHATS_NEW_VIDEOS.filter(x => x.id !== current.id);
  const v = portrait ? current.portrait : current.landscape;
  const watchOther = (id: string) => {
    // Finishing the new video counts as seen before switching to an older one.
    if (auto) { markWhatsNewSeen(); setAuto(false); }
    setVideoId(id); setEnded(false); setPaused(false); setProgress(0);
  };

  const soundOn = () => {
    const el = video.current; if (!el) return;
    el.muted = false; setMuted(false);
    el.currentTime = 0; setEnded(false); el.play().catch(() => {});
  };
  const replay = () => {
    const el = video.current; if (!el) return;
    el.currentTime = 0; setEnded(false); el.play().catch(() => {});
  };
  const togglePause = () => {
    const el = video.current; if (!el || ended) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label={`What's new in yourworld: ${current.title}`}>
      <div className={`${s.frame} ${portrait ? s.portrait : s.landscape}`}>
        <video
          key={current.id}
          ref={video}
          className={s.video}
          src={v.src}
          poster={v.poster}
          playsInline
          muted={muted}
          preload="auto"
          onClick={togglePause}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onEnded={() => { setEnded(true); if (auto) markWhatsNewSeen(); }}
          onTimeUpdate={e => { const el = e.currentTarget; if (el.duration) setProgress(el.currentTime / el.duration); }}
        />

        <button ref={closeBtn} type="button" className={s.close} onClick={close} aria-label="Close">
          <X size={20} strokeWidth={2.25} />
        </button>

        {muted && !ended && (
          <button type="button" className={s.sound} onClick={soundOn}>
            <Volume2 size={18} strokeWidth={2.25} /> Tap for sound
          </button>
        )}

        {paused && !ended && (
          <button type="button" className={s.center} onClick={togglePause} aria-label="Play">
            <Play size={30} strokeWidth={2.25} />
          </button>
        )}

        {ended && (
          <div className={s.endCard}>
            <button type="button" className={s.primary} onClick={replay}><RotateCcw size={17} strokeWidth={2.25} /> Watch again</button>
            {others.map(o => (
              <button key={o.id} type="button" className={s.ghost} onClick={() => watchOther(o.id)}><Film size={17} strokeWidth={2.25} /> Watch {o.title.charAt(0).toLowerCase() + o.title.slice(1)}</button>
            ))}
            <button type="button" className={s.ghost} onClick={close}><Check size={17} strokeWidth={2.25} /> Done</button>
          </div>
        )}

        <div className={s.progress} aria-hidden><span style={{ width: `${progress * 100}%` }} /></div>
        {!paused && !ended && <span className={s.hint} aria-hidden><Pause size={12} /> tap to pause</span>}
      </div>
    </div>
  );
}
