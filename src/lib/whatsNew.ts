'use client';
// The "What's new" video: which version is current, whether she has seen it,
// and a way for any button to open it again.
import { getSettings, saveSettings } from './db';

/** Bump this (and the files in /public/whats-new) for the next update video. */
export const WHATS_NEW_VERSION = '2026-10-glow-up';
export const WHATS_NEW_EVENT = 'yw-whats-new';
const LOCAL_KEY = 'yw-whats-new-seen';

export const WHATS_NEW_VIDEO = {
  portrait:  { src: '/whats-new/glow-up-portrait.mp4',  poster: '/whats-new/glow-up-portrait.jpg' },
  landscape: { src: '/whats-new/glow-up-landscape.mp4', poster: '/whats-new/glow-up-landscape.jpg' },
};

/** Open the What's new video from anywhere (sidebar, settings page). */
export function openWhatsNew() {
  window.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT, { detail: { withSound: true } }));
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
