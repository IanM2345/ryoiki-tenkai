-- "What's new" video: remember which version she has already watched, so it
-- plays by itself only once (on whichever device she opens first).
-- One nullable column; no existing data is touched.
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS whats_new_seen text;
