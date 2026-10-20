-- Home Screen widgets: private keys that let a widget read her open tasks without signing in.
-- Only a SHA-256 hash of each key is stored; the key itself is shown once, on her device.
-- New table only; nothing existing changes. Owner-only, like every other table.
CREATE TABLE IF NOT EXISTS public.widget_keys (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         text        NOT NULL DEFAULT 'Widget',
  key_hash      text        NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE INDEX IF NOT EXISTS widget_keys_user_idx ON public.widget_keys (user_id, created_at DESC);

ALTER TABLE public.widget_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "widget_keys: owner only" ON public.widget_keys;
CREATE POLICY "widget_keys: owner only" ON public.widget_keys
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.widget_keys FROM anon;
GRANT SELECT, INSERT, DELETE ON public.widget_keys TO authenticated;
GRANT ALL ON public.widget_keys TO service_role;
