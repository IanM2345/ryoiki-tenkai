-- ─────────────────────────────────────────────────────────────
-- Leave her a surprise time capsule letter.
--
-- Run this in the Supabase SQL editor of HER project (after the
-- 20260930110000_time_capsules migration has been applied).
--
-- It only INSERTS new letters. It reads nothing of hers except her
-- account id, looked up from her email, so you still never see her data.
--
-- On her Time capsule page the letter shows as "From <your name>",
-- sealed, with a countdown. She can't read it (or delete it) until the
-- open_on date. Then it glows and she opens it like an envelope.
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.time_capsules (user_id, from_name, title, body, open_on)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'HER-EMAIL@example.com'),
  'Ian',                                  -- who it's from (shown on the envelope)
  'Happy birthday',                       -- title (hidden until it opens)
  'Write your letter here.

New lines are kept exactly as you type them.',
  '2027-03-12'                            -- the day it unlocks (YYYY-MM-DD)
);

-- More than one? Copy the block above, or add more rows:
--
-- INSERT INTO public.time_capsules (user_id, from_name, title, body, open_on)
-- SELECT id, 'Ian', 'One year of yourworld', 'Your letter…', DATE '2027-09-30'
-- FROM auth.users WHERE email = 'HER-EMAIL@example.com';
--
-- Check what you've scheduled (titles and dates only):
-- SELECT from_name, title, open_on, opened_at IS NOT NULL AS opened
-- FROM public.time_capsules WHERE from_name IS NOT NULL ORDER BY open_on;
