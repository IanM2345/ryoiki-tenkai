'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function applyThemeFromStorage() {
  try {
    const raw = localStorage.getItem('yw-theme');
    if (!raw) return;
    const t = JSON.parse(raw);
    const r = document.documentElement.style;
    if (t.bg)        { r.setProperty('--bg',   t.bg); r.setProperty('--surf', t.bg); }
    if (t.bg)          r.setProperty('--card',  t.bg === '#0d0a0f' ? '#1a1025' : `${t.bg}cc`);
    if (t.accent)    { r.setProperty('--or',    t.accent); r.setProperty('--or-l', t.accent); }
    if (t.secondary)   r.setProperty('--pu-l',  t.secondary);
    if (t.text)        r.setProperty('--tx',    t.text);
    if (t.font)        r.setProperty('--font',  t.font);
    if (t.fontSize)    document.documentElement.style.fontSize = `${t.fontSize}px`;
  } catch {}
}

export default function SessionRestore() {
  useEffect(() => {
    applyThemeFromStorage();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        console.log('[auth] Session active:', data.session.user.email);
      } else {
        console.warn('[auth] No session found');
      }
    });
  }, []);
  return null;
}