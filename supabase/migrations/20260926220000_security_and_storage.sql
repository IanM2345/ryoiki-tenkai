-- ─────────────────────────────────────────────────────────────
-- Security hardening + photo storage bucket
-- Safe to run on both staging and production (idempotent,
-- no data is read, changed or deleted).
-- ─────────────────────────────────────────────────────────────

-- 1. Internal helper functions must not be callable with the public
--    (anon) key or by logged-in users via the API.
--    decrypt_val/encrypt_val/enc are unused by the app; they stay in
--    place (reversible) but nobody outside the database can call them.
REVOKE ALL ON FUNCTION public.decrypt_val(text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.encrypt_val(text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enc(text)           FROM PUBLIC, anon, authenticated;
-- seed_mood_defs is only called by the signup trigger (runs as owner).
REVOKE ALL ON FUNCTION public.seed_mood_defs(uuid) FROM PUBLIC, anon, authenticated;
-- Trigger functions never need direct API access.
REVOKE ALL ON FUNCTION public.handle_new_user()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()   FROM PUBLIC, anon, authenticated;

-- 2. dev_config is server-only.
REVOKE ALL ON public.dev_config FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.dev_config_id_seq FROM anon, authenticated;

-- 3. Nothing should be readable while logged out.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 4. Private photo bucket used by the app (lib/upload.ts).
INSERT INTO storage.buckets (id, name, public)
VALUES ('yourworld', 'yourworld', false)
ON CONFLICT (id) DO NOTHING;

-- Each user can only touch files inside their own "<user id>/..." folder.
DROP POLICY IF EXISTS "yourworld: owner read"   ON storage.objects;
DROP POLICY IF EXISTS "yourworld: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "yourworld: owner update" ON storage.objects;
DROP POLICY IF EXISTS "yourworld: owner delete" ON storage.objects;

CREATE POLICY "yourworld: owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'yourworld' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "yourworld: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'yourworld' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "yourworld: owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'yourworld' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "yourworld: owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'yourworld' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
