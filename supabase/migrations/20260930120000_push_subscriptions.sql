-- Push notifications: one row per device she turns notifications on for.
-- New table only; nothing existing is touched. Owner-only, like every other table.
-- The daily reminder job reads it with the service role key on the server.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL UNIQUE,     -- the device's push address (from Apple, Google or Mozilla)
  p256dh      text        NOT NULL,            -- device's public key (messages are encrypted to it)
  auth        text        NOT NULL,
  device      text,                            -- e.g. "iPhone", "iPad", for the settings list
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_ok_at  timestamptz                      -- last time a push was accepted
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions: owner only" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: owner only" ON public.push_subscriptions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
