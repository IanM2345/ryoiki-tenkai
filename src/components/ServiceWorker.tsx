'use client';
import { useEffect } from 'react';

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
declare global {
  interface Window { __ywInstall?: InstallPromptEvent | null }
}

/**
 * Registers /sw.js in production so the site can be installed on her phone, and
 * keeps hold of the browser's install prompt (it fires once, often before she
 * reaches the App & backup page) so the Install button there can use it.
 */
export default function ServiceWorker() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__ywInstall = e as InstallPromptEvent;
      window.dispatchEvent(new Event('yw-install-ready'));
    };
    const onInstalled = () => { window.__ywInstall = null; window.dispatchEvent(new Event('yw-install-ready')); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}
