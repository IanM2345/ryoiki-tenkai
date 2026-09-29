-- Time capsule letters: write now, open on a chosen date.
-- New table only; nothing existing is touched. Owner-only, like every other table.
CREATE TABLE IF NOT EXISTS public.time_capsules (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_name   text,                                  -- null = she wrote it to herself
  title       text        NOT NULL DEFAULT 'A letter',
  body        text        NOT NULL,
  open_on     date        NOT NULL,
  opened_at   timestamptz,                           -- set the first time she opens it
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_capsules_user_open_idx ON public.time_capsules (user_id, open_on);

ALTER TABLE public.time_capsules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_capsules: owner only" ON public.time_capsules;
CREATE POLICY "time_capsules: owner only" ON public.time_capsules
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.time_capsules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_capsules TO authenticated;
GRANT ALL ON public.time_capsules TO service_role;

-- Live sync, like the other tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'time_capsules') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.time_capsules;
  END IF;
END $$;
