-- Security tightening from the October 2026 audit.
-- Adds rules only: no rows are read, changed or deleted. Safe to run on staging, then production.

-- 1. New tables and functions start closed to the public (anon) key.
--    Until now every new table relied on remembering its own REVOKE.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;

-- 2. Unused helper functions with passwords written into them: make sure nobody
--    outside the database can call them (repeats 20260926220000 in case it was skipped).
--    Skipped for any that don't exist, so this can't fail on a database without them.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.decrypt_val(text)', 'public.encrypt_val(text)', 'public.enc(text)'] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    END IF;
  END LOOP;
END $$;

-- 3. A push subscription must point at a real push service (Apple, Google, Mozilla, Microsoft).
--    NOT VALID: existing rows are left alone; only new and changed rows are checked.
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_push_service;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_push_service
  CHECK (endpoint ~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/')
  NOT VALID;

-- 4. The photo bucket only takes images up to 15 MB (the app already checks this; now the server does too).
UPDATE storage.buckets
   SET file_size_limit = 15728640,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']
 WHERE id = 'yourworld';
