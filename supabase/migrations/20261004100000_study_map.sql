-- Learn: a study map of subjects and topics, with notes, flashcards (spaced repetition),
-- links, and cross-links between topics. New tables only; nothing existing is touched.
-- Owner-only, like every other table.

-- ── Subjects and topics (a tree: parent_id null = a subject) ────────────────
CREATE TABLE IF NOT EXISTS public.study_nodes (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id        uuid        REFERENCES public.study_nodes(id) ON DELETE CASCADE,
  title            text        NOT NULL,
  summary          text,
  notes            text,                          -- light markdown
  color            text,                          -- subjects: their colour on the map
  sort_order       integer     NOT NULL DEFAULT 0,
  pos_x            double precision,              -- where she dragged it on the map (null = automatic)
  pos_y            double precision,
  mastery_override smallint    CHECK (mastery_override BETWEEN 0 AND 100),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_nodes_user_idx ON public.study_nodes (user_id, parent_id, sort_order);

-- ── Cross-links between topics (dotted lines on the map) ────────────────────
CREATE TABLE IF NOT EXISTS public.study_links (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_id    uuid        NOT NULL REFERENCES public.study_nodes(id) ON DELETE CASCADE,
  to_id      uuid        NOT NULL REFERENCES public.study_nodes(id) ON DELETE CASCADE,
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_id <> to_id),
  UNIQUE (from_id, to_id)
);

-- ── Flashcards, scheduled with spaced repetition ────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_cards (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id          uuid        NOT NULL REFERENCES public.study_nodes(id) ON DELETE CASCADE,
  front            text        NOT NULL,
  back             text        NOT NULL,
  ease             real        NOT NULL DEFAULT 2.5,
  interval_days    real        NOT NULL DEFAULT 0,
  reps             integer     NOT NULL DEFAULT 0,
  lapses           integer     NOT NULL DEFAULT 0,
  due_at           timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_cards_due_idx ON public.study_cards (user_id, due_at);
CREATE INDEX IF NOT EXISTS study_cards_node_idx ON public.study_cards (node_id);

-- ── Every answer, for progress over time ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_reviews (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id     uuid        REFERENCES public.study_cards(id) ON DELETE SET NULL,
  node_id     uuid        REFERENCES public.study_nodes(id) ON DELETE SET NULL,
  grade       smallint    NOT NULL CHECK (grade BETWEEN 1 AND 4),   -- 1 again, 2 hard, 3 good, 4 easy
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_reviews_user_idx ON public.study_reviews (user_id, reviewed_at DESC);

-- ── Links: lecture videos, articles, playlists ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_resources (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id     uuid        NOT NULL REFERENCES public.study_nodes(id) ON DELETE CASCADE,
  url         text        NOT NULL,
  title       text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_resources_node_idx ON public.study_resources (node_id);

-- ── updated_at on topics (own function, so nothing shared is replaced) ─────
CREATE OR REPLACE FUNCTION public.study_nodes_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS study_nodes_updated_at ON public.study_nodes;
CREATE TRIGGER study_nodes_updated_at BEFORE UPDATE ON public.study_nodes
  FOR EACH ROW EXECUTE FUNCTION public.study_nodes_touch_updated_at();

-- ── Owner-only access, live sync ────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['study_nodes', 'study_links', 'study_cards', 'study_reviews', 'study_resources'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s: owner only" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s: owner only" ON public.%I USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
