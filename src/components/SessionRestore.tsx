'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SessionRestore() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        console.log('email:', data.session.user.email);
        console.log('token:', data.session.access_token?.slice(0,30));
        console.log('[auth] Session active:', data.session.user.email);
      } else {
        console.warn('[auth] No session found');
      }
    });
  }, []);
  return null;
}

