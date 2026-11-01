-- Wardrobe: her avatar, photos of her real clothes ("My closet") and saved outfits.
-- New tables only; nothing existing is touched. Owner-only, like every other table.

-- Her avatar look (skin, hair, body shape...). One row per person.
CREATE TABLE IF NOT EXISTS public.avatars (
  user_id     uuid        DEFAULT auth.uid() PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  look        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A real piece of clothing: a cut-out photo in the private bucket ("<user>/closet/...").
CREATE TABLE IF NOT EXISTS public.closet_items (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT '',
  category    text        NOT NULL DEFAULT 'top'
              CHECK (category IN ('top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'accessory')),
  image_path  text        NOT NULL,
  color       text,                               -- main colour, e.g. '#c2410c' (for sorting)
  tags        text[]      NOT NULL DEFAULT '{}',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS closet_items_user_idx ON public.closet_items (user_id, category, created_at DESC);

-- A saved look: the layers on the avatar (built-in pieces and closet photos with their placement).
CREATE TABLE IF NOT EXISTS public.outfits (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT '',
  layers      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tags        text[]      NOT NULL DEFAULT '{}',
  favourite   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outfits_user_idx ON public.outfits (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.wardrobe_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS avatars_updated_at ON public.avatars;
CREATE TRIGGER avatars_updated_at BEFORE UPDATE ON public.avatars FOR EACH ROW EXECUTE FUNCTION public.wardrobe_touch_updated_at();
DROP TRIGGER IF EXISTS closet_items_updated_at ON public.closet_items;
CREATE TRIGGER closet_items_updated_at BEFORE UPDATE ON public.closet_items FOR EACH ROW EXECUTE FUNCTION public.wardrobe_touch_updated_at();
DROP TRIGGER IF EXISTS outfits_updated_at ON public.outfits;
CREATE TRIGGER outfits_updated_at BEFORE UPDATE ON public.outfits FOR EACH ROW EXECUTE FUNCTION public.wardrobe_touch_updated_at();
REVOKE ALL ON FUNCTION public.wardrobe_touch_updated_at() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.avatars      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfits      ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "avatars: owner only" ON public.avatars;
CREATE POLICY "avatars: owner only" ON public.avatars USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "closet_items: owner only" ON public.closet_items;
CREATE POLICY "closet_items: owner only" ON public.closet_items USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "outfits: owner only" ON public.outfits;
CREATE POLICY "outfits: owner only" ON public.outfits USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.avatars, public.closet_items, public.outfits FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.avatars, public.closet_items, public.outfits TO authenticated;
GRANT ALL ON public.avatars, public.closet_items, public.outfits TO service_role;

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['avatars', 'closet_items', 'outfits'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
