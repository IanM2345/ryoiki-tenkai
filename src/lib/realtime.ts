'use client';
import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Live updates: re-run `reload` whenever any of the given tables change for
 * this signed-in user (an insert, update or delete). Because every table is
 * scoped by RLS to `user_id = auth.uid()`, she only ever hears about her own
 * rows — so a change she makes on her phone reaches the laptop within a second.
 *
 * Supabase must have Realtime enabled for each table (see the migration
 * `..._enable_realtime.sql`). If it isn't, this simply does nothing.
 */
export function useLiveTables(tables: string[], reload: () => void) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const key = tables.join(',');

  useEffect(() => {
    if (typeof window === 'undefined' || !tables.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Collapse a burst of changes into a single reload.
    const ping = () => { clearTimeout(timer); timer = setTimeout(() => reloadRef.current(), 350); };

    const channel = supabase.channel(`live:${key}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, ping);
    }
    // Refresh once on (re)connect too, so anything missed while asleep is caught up.
    channel.subscribe(status => { if (status === 'SUBSCRIBED') reloadRef.current(); });

    const onVisible = () => { if (document.visibilityState === 'visible') reloadRef.current(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
