-- Live sync: let the browser hear about row changes so an edit made on her
-- phone shows up on her laptop within a second, and vice versa.
--
-- This only adds each table to Supabase's realtime publication. It broadcasts
-- changes; it never alters, reads or deletes any data. Row Level Security still
-- applies to realtime, so each person only ever receives their own rows.
-- Safe on staging and on her project. Re-runnable.

-- Supabase ships this publication by default; create it if somehow missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'tasks', 'journal_entries', 'journal_entry_souls', 'places', 'souls',
    'soul_links', 'soul_media', 'library', 'ideas', 'queue', 'ratings',
    'mood_defs', 'mood_logs', 'gallery_images', 'game_sessions', 'user_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
