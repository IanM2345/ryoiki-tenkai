'use client';
// The "What's new" video: which version is current, whether she has seen it,
// and a way for any button to open it again.
import { getSettings, saveSettings } from './db';

export type WhatsNewVideo = {
  id: string;
  title: string;
  /** When the update came out (YYYY-MM-DD) and a line about what it brought. */
  date: string;
  blurb: string;
  portrait:  { src: string; poster: string };
  landscape: { src: string; poster: string };
};

/**
 * Every update video, newest first. Videos are never replaced: each one stays here
 * (and on the Updates page, /updates) so any of them can be watched again. The newest
 * plays by itself once. Add the next one at the top, with its files in /public/whats-new.
 */
export const WHATS_NEW_VIDEOS: WhatsNewVideo[] = [
  {
    id: '2026-10-mahjong',
    title: 'Mahjong is here',
    date: '2026-10-22',
    blurb: 'Mahjong Solitaire and the full four-player game, plus How to play videos.',
    portrait:  { src: '/whats-new/mahjong-portrait.mp4',  poster: '/whats-new/mahjong-portrait.jpg' },
    landscape: { src: '/whats-new/mahjong-landscape.mp4', poster: '/whats-new/mahjong-landscape.jpg' },
  },
  {
    id: '2026-10-tasks-on-time',
    title: 'Tasks, on time',
    date: '2026-10-20',
    blurb: 'Times and countdowns on tasks, reminders on your phone, a side panel with sticky notes, and Home Screen widgets.',
    portrait:  { src: '/whats-new/tasks-portrait.mp4',  poster: '/whats-new/tasks-portrait.jpg' },
    landscape: { src: '/whats-new/tasks-landscape.mp4', poster: '/whats-new/tasks-landscape.jpg' },
  },
  {
    id: '2026-10-map-beta',
    title: 'Your map idea (beta)',
    date: '2026-10-05',
    blurb: 'Routes on real streets, your places in 3D, a study map in Learn, and revising On the Go.',
    portrait:  { src: '/whats-new/map-beta-portrait.mp4',  poster: '/whats-new/map-beta-portrait.jpg' },
    landscape: { src: '/whats-new/map-beta-landscape.mp4', poster: '/whats-new/map-beta-landscape.jpg' },
  },
  {
    id: '2026-10-glow-up',
    title: 'The glow-up',
    date: '2026-09-30',
    blurb: 'Birthday countdowns, letters to future you, the year in colour, four new games, and how to put yourworld on your phone.',
    portrait:  { src: '/whats-new/glow-up-portrait.mp4',  poster: '/whats-new/glow-up-portrait.jpg' },
    landscape: { src: '/whats-new/glow-up-landscape.mp4', poster: '/whats-new/glow-up-landscape.jpg' },
  },
];

export const WHATS_NEW_VERSION = WHATS_NEW_VIDEOS[0].id;
export const WHATS_NEW_EVENT = 'yw-whats-new';
const LOCAL_KEY = 'yw-whats-new-seen';

/** Open the What's new video from anywhere (sidebar, settings page). */
export function openWhatsNew(id?: string) {
  window.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT, { detail: { withSound: true, id: typeof id === 'string' ? id : undefined } }));
}

function localSeen(): boolean {
  try { return localStorage.getItem(LOCAL_KEY) === WHATS_NEW_VERSION; } catch { return false; }
}

/**
 * Should the video play by itself? Checks her account first (so it plays once in
 * total, not once per device), falling back to this device if the setting isn't there.
 */
export async function shouldAutoplayWhatsNew(): Promise<boolean> {
  if (localSeen()) return false;
  try {
    const s = await getSettings();
    if (!s) return false;
    if (s.first_login_done === false) return false;              // her very first visit shows the welcome card instead
    if ('whats_new_seen' in s) return s.whats_new_seen !== WHATS_NEW_VERSION;
    return true;                                                  // column not added yet: rely on this device
  } catch {
    return false;                                                 // never block the site over a video
  }
}

export async function markWhatsNewSeen() {
  try { localStorage.setItem(LOCAL_KEY, WHATS_NEW_VERSION); } catch { /* ignore */ }
  await saveSettings({ whats_new_seen: WHATS_NEW_VERSION }).catch(() => {});
}
