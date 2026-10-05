-- On the Go: study sessions, optionally tied to a route she walked at the same time.
-- New table only; nothing existing is touched. Owner-only, like every other table.
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id        uuid        REFERENCES public.routes(id) ON DELETE SET NULL,
  route_name      text,
  node_ids        uuid[]      NOT NULL DEFAULT '{}',   -- the subjects/topics she studied
  topic_names     text[]      NOT NULL DEFAULT '{}',   -- kept for history if topics are deleted
  mode            text        NOT NULL DEFAULT 'cards' CHECK (mode IN ('cards', 'typing', 'listen')),
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz NOT NULL DEFAULT now(),
  active_seconds  integer     NOT NULL DEFAULT 0,
  cards_reviewed  integer     NOT NULL DEFAULT 0,      -- answered (recall)
  cards_right     integer     NOT NULL DEFAULT 0,
  cards_heard     integer     NOT NULL DEFAULT 0,      -- listened to (exposure, not graded)
  stops_total     integer     NOT NULL DEFAULT 0,
  stops_visited   integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_sessions_user_idx ON public.study_sessions (user_id, ended_at DESC);

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "study_sessions: owner only" ON public.study_sessions;
CREATE POLICY "study_sessions: owner only" ON public.study_sessions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.study_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'study_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_sessions;
  END IF;
END $$;
