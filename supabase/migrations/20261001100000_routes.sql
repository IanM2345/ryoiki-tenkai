-- Routes: plan journeys with a start, an end and stops in between,
-- group them into collections, and keep a history of journeys taken.
-- New tables only; nothing existing is touched. Owner-only, like every other table.

-- ── Collections ("Dublin day trips", "Study walks") ──────────────────────────
CREATE TABLE IF NOT EXISTS public.route_collections (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  color       text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Routes ───────────────────────────────────────────────────────────────────
-- stops: ordered JSON list, first = From, last = To.
--   { id, name, address, lat, lng, here?, place_id?, note?, link? }
--   here = true means "my location", filled in from the device when the route is used.
-- geometry: the road line from the routing service, cached so the map draws without asking again.
-- legs: distance (m) and duration (s) for each step between stops.
-- journey: the journey in progress, so it resumes on another device or after a reload.
CREATE TABLE IF NOT EXISTS public.routes (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text        NOT NULL DEFAULT 'New route',
  notes          text,
  mode           text        NOT NULL DEFAULT 'walk' CHECK (mode IN ('walk', 'cycle', 'drive', 'transit')),
  stops          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  geometry       jsonb,
  legs           jsonb,
  distance_m     double precision,
  duration_s     double precision,
  collection_id  uuid        REFERENCES public.route_collections(id) ON DELETE SET NULL,
  tags           text[]      NOT NULL DEFAULT '{}',
  favourite      boolean     NOT NULL DEFAULT false,
  archived       boolean     NOT NULL DEFAULT false,
  journey        jsonb,
  last_done_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routes_user_idx ON public.routes (user_id, updated_at DESC);

-- ── Journeys taken ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.route_trips (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id        uuid        REFERENCES public.routes(id) ON DELETE SET NULL,
  route_name      text        NOT NULL,
  mode            text,
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz NOT NULL DEFAULT now(),
  active_seconds  integer     NOT NULL DEFAULT 0,
  distance_m      double precision,
  stops_total     integer     NOT NULL DEFAULT 0,
  stops_visited   integer     NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_trips_user_idx ON public.route_trips (user_id, ended_at DESC);

-- ── updated_at on routes (own function, so nothing shared is replaced) ─────
CREATE OR REPLACE FUNCTION public.routes_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS routes_updated_at ON public.routes;
CREATE TRIGGER routes_updated_at BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.routes_touch_updated_at();

-- ── Owner-only access ────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['route_collections', 'routes', 'route_trips'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s: owner only" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s: owner only" ON public.%I USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    -- Live sync between her phone and laptop, like the other tables.
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

