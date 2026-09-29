-- Bucket list: a place can be somewhere she wants to go, not just somewhere she has been.
-- Safe on staging and on her project: adds one column with a default, touches no existing data.
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS wishlist boolean NOT NULL DEFAULT false;
