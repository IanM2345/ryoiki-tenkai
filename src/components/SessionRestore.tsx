'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SessionRestore() {
  useEffect(() => {
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