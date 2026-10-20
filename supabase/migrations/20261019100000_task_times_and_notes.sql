-- Tasks get an optional time and reminders; sticky notes for the side panel.
-- Only adds: three empty columns on tasks and one new table. Nothing existing changes.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_time       time;                         -- her local time; null = any time that day
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS remind_before  integer[] NOT NULL DEFAULT '{}'; -- minutes before the due time to send a push (0 = at the time)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reminders_sent integer[] NOT NULL DEFAULT '{}'; -- which of those have gone out (so each sends once)

CREATE TABLE IF NOT EXISTS public.sticky_notes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text        NOT NULL DEFAULT '',
  color       text        NOT NULL DEFAULT 'yellow',
  pinned      boolean     NOT NULL DEFAULT false,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sticky_notes_user_idx ON public.sticky_notes (user_id, pinned DESC, sort_order, created_at DESC);

CREATE OR REPLACE FUNCTION public.sticky_notes_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sticky_notes_updated_at ON public.sticky_notes;
CREATE TRIGGER sticky_notes_updated_at BEFORE UPDATE ON public.sticky_notes
  FOR EACH ROW EXECUTE FUNCTION public.sticky_notes_touch_updated_at();

ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sticky_notes: owner only" ON public.sticky_notes;
CREATE POLICY "sticky_notes: owner only" ON public.sticky_notes
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.sticky_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sticky_notes TO authenticated;
GRANT ALL ON public.sticky_notes TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sticky_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sticky_notes;
  END IF;
END $$;
