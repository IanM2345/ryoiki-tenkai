-- Drawings and handwriting (Apple Pencil): sketchbook drawings, and handwritten
-- pages attached to anything else (a journal entry, a study topic, a flashcard...).
-- New table only; nothing existing is touched. Owner-only, like every other table.
CREATE TABLE IF NOT EXISTS public.drawings (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           text        NOT NULL DEFAULT 'sketch' CHECK (kind IN ('sketch', 'note')),
  title          text        NOT NULL DEFAULT '',
  doc            jsonb       NOT NULL DEFAULT '{"v":1,"w":1600,"h":1200,"bg":"blank","strokes":[]}'::jsonb,
  thumb          text,                                -- small preview image (data URL)
  attached_type  text,                                -- e.g. 'journal', 'study_node', 'card_front'
  attached_id    uuid,
  favourite      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((attached_type IS NULL) = (attached_id IS NULL))
);
CREATE INDEX IF NOT EXISTS drawings_user_idx ON public.drawings (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS drawings_attached_idx ON public.drawings (user_id, attached_type, attached_id);

CREATE OR REPLACE FUNCTION public.drawings_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS drawings_updated_at ON public.drawings;
CREATE TRIGGER drawings_updated_at BEFORE UPDATE ON public.drawings
  FOR EACH ROW EXECUTE FUNCTION public.drawings_touch_updated_at();

ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drawings: owner only" ON public.drawings;
CREATE POLICY "drawings: owner only" ON public.drawings
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.drawings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawings TO authenticated;
GRANT ALL ON public.drawings TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'drawings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drawings;
  END IF;
END $$;
