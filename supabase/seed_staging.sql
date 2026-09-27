-- ════════════════════════════════════════════════════════════════
--  STAGING ONLY: fill the site with made-up sample data
--
--  How to use:
--   1. Supabase dashboard → open the STAGING project (ryoiki-tenkai-staging)
--   2. SQL Editor → New query → paste this whole file
--   3. Change the email on the line marked  <<< YOUR TEST EMAIL
--   4. Run
--
--  Safety: it only writes rows for the account with that email.
--  Her project has no account with your email, so if this is ever run
--  there by mistake it stops with an error and changes nothing.
--  Games are left empty on purpose. To remove the sample data again,
--  run the CLEAN UP block at the very bottom.
-- ════════════════════════════════════════════════════════════════

DO $seed$
DECLARE
  test_email text := 'you@example.com';   -- <<< YOUR TEST EMAIL
  uid uuid;
  s_amara uuid; s_leo uuid; s_mum uuid; s_joe uuid; s_zawadi uuid; s_theo uuid;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid;
  l1 uuid; l2 uuid; l3 uuid;
  p1 uuid; p2 uuid; p3 uuid;
  i1 uuid; q1 uuid; r1 uuid;
  m record;
  d int;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(test_email);
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No account with email % in this project. Nothing was changed. (Is this the staging project, and did you set your test email?)', test_email;
  END IF;

  -- ── Souls ─────────────────────────────────────────────────
  INSERT INTO souls (user_id, name, emoji, color, role, since, description, notes, tags) VALUES
    (uid, 'Amara',       '🌻', '#f59e0b', 'Best friend', '2019', 'Knows me better than I know myself. Terrible at texting back, perfect at showing up.', E'Birthday: 14 March\nLoves sunflowers and oat lattes\nAllergic to cats', ARRAY['bestie','uni'])
    RETURNING id INTO s_amara;
  INSERT INTO souls (user_id, name, emoji, color, role, since, description, notes, tags) VALUES
    (uid, 'Leo', '🎸', '#a855f7', 'Brother', 'forever', 'Plays guitar far too loudly at 2am.', 'Owes me a concert ticket', ARRAY['family'])
    RETURNING id INTO s_leo;
  INSERT INTO souls (user_id, name, emoji, color, role, since, description, notes, tags) VALUES
    (uid, 'Mum', '💐', '#ec4899', 'Family', 'forever', 'The best cook in the world, no contest.', 'Favourite flowers: peonies', ARRAY['family'])
    RETURNING id INTO s_mum;
  INSERT INTO souls (user_id, name, emoji, color, role, since, description, tags) VALUES
    (uid, 'Grandpa Joe', '🎵', '#22d3ee', 'Family', 'forever', 'Tells the best stories and still plays the fiddle.', ARRAY['family'])
    RETURNING id INTO s_joe;
  INSERT INTO souls (user_id, name, emoji, color, role, since, description, tags) VALUES
    (uid, 'Zawadi', '🦋', '#4ade80', 'Friend', '2021', 'Met at the pottery class. Always up for an adventure.', ARRAY['pottery'])
    RETURNING id INTO s_zawadi;
  INSERT INTO souls (user_id, name, emoji, color, role, since, description, tags) VALUES
    (uid, 'Theo', '🌙', '#818cf8', 'Work friend', '2024', 'Lunch walks and terrible puns.', ARRAY['work'])
    RETURNING id INTO s_theo;

  INSERT INTO soul_media (user_id, soul_id, kind, title, meta) VALUES
    (uid, s_amara, 'music', 'Motion Sickness', 'Phoebe Bridgers'),
    (uid, s_amara, 'show',  'Fleabag', 'Series'),
    (uid, s_amara, 'other', 'The pier at sunset', 'place'),
    (uid, s_leo,   'music', 'Heroes', 'David Bowie'),
    (uid, s_leo,   'film',  'Interstellar', 'Film'),
    (uid, s_mum,   'show',  'The Great British Bake Off', 'Series'),
    (uid, s_joe,   'music', 'The Parting Glass', 'Traditional');

  -- ── Journal ───────────────────────────────────────────────
  INSERT INTO journal_entries (user_id, title, body, mood, pinned, tags, entry_date, entry_time) VALUES
    (uid, 'Sunday at the lake', E'Walked the whole lake with @Amara and we talked for hours. The water was so still it looked like glass.\n\nI want more days like this.', '😌', true, ARRAY['calm','friends'], current_date, '18:20')
    RETURNING id INTO j1;
  INSERT INTO journal_entries (user_id, title, body, mood, pinned, tags, entry_date, entry_time) VALUES
    (uid, 'New recipe night', 'Tried the lemon pasta from that video. @Leo had three bowls, so I think it worked.', '😊', false, ARRAY['cooking'], current_date - 1, '20:05')
    RETURNING id INTO j2;
  INSERT INTO journal_entries (user_id, title, body, mood, pinned, tags, entry_date, entry_time) VALUES
    (uid, 'Rainy thoughts', 'One of those grey days. Made tea, read a bit, called @Mum. Felt better after.', '🌧', false, ARRAY[]::text[], current_date - 5, '09:10')
    RETURNING id INTO j3;
  INSERT INTO journal_entries (user_id, title, body, mood, pinned, tags, entry_date, entry_time) VALUES
    (uid, 'Got the job!', 'I still cannot believe it. Celebrated with @Zawadi and @Theo at the little ramen bar.', '🔥', true, ARRAY['work','big day'], current_date - 12, '21:40')
    RETURNING id INTO j4;
  INSERT INTO journal_entries (user_id, title, body, mood, tags, entry_date, entry_time) VALUES
    (uid, 'Pottery class', 'My bowl came out wonky but I love it anyway.', '✨', ARRAY['pottery'], current_date - 20, '17:30'),
    (uid, 'Long week', 'Tired, but proud of how much I got done.', '💫', ARRAY[]::text[], current_date - 34, '22:15'),
    (uid, 'Sunflower field', 'Found a field full of sunflowers on the drive home. Stopped for twenty minutes just to look.', '🌟', ARRAY['nature'], current_date - 48, '16:00');

  INSERT INTO journal_entry_souls (journal_entry_id, soul_id) VALUES
    (j1, s_amara), (j2, s_leo), (j3, s_mum), (j4, s_zawadi), (j4, s_theo);

  -- ── Tasks ─────────────────────────────────────────────────
  INSERT INTO tasks (user_id, text, priority, due_date, done, done_at, created_date) VALUES
    (uid, 'Water the plants on the balcony', 'low',    current_date,      false, NULL, current_date - 2),
    (uid, 'Reply to the landlord about the lease', 'high', current_date - 2, false, NULL, current_date - 6),
    (uid, 'Book dentist appointment', 'medium',        current_date,      false, NULL, current_date - 3),
    (uid, 'Finish reading chapter 7', 'medium',        current_date + 3,  false, NULL, current_date - 1),
    (uid, 'Buy film for the camera', 'low',            current_date + 1,  false, NULL, current_date),
    (uid, 'Plan Amara''s birthday surprise', 'high',   current_date + 10, false, NULL, current_date - 4),
    (uid, 'Call grandma', 'high',                      current_date,      true,  current_date, current_date - 1),
    (uid, 'Return library books', 'medium',            current_date - 3,  true,  current_date - 3, current_date - 8);

  -- ── Library ───────────────────────────────────────────────
  INSERT INTO library (user_id, type, title, meta, url, rating, notes, tags) VALUES
    (uid, 'media', 'Spirited Away', 'Film by Hayao Miyazaki', NULL, 5, 'Watch every autumn.', ARRAY['ghibli'])
    RETURNING id INTO l1;
  INSERT INTO library (user_id, type, title, meta, url, rating, notes, tags) VALUES
    (uid, 'link', 'How to make a sourdough starter', 'Recipe', 'https://www.bbcgoodfood.com', 4, NULL, ARRAY['baking'])
    RETURNING id INTO l2;
  INSERT INTO library (user_id, type, title, meta, url, rating, notes, tags) VALUES
    (uid, 'note', 'Gift ideas for Leo', 'Birthday in March', NULL, 0, 'Vinyl, a good notebook, concert tickets', ARRAY['gifts'])
    RETURNING id INTO l3;
  INSERT INTO library (user_id, type, title, meta, url, rating, notes, tags) VALUES
    (uid, 'place', 'The little bookshop on Elm St', 'Cafe inside', NULL, 5, 'Best hot chocolate', ARRAY['cosy','books']),
    (uid, 'idea', 'Learn to make pottery mugs', NULL, NULL, 0, 'Ask Zawadi about the wheel class', ARRAY['pottery']),
    (uid, 'media', 'The Secret History', 'Book by Donna Tartt', NULL, 4, NULL, ARRAY['books']),
    (uid, 'link', 'Night sky map', 'Stargazing', 'https://stellarium-web.org', 4, 'For the camping trip', ARRAY[]::text[]);

  -- ── Places (real coordinates so they show on the map) ─────
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags) VALUES
    (uid, 'Riverside Coffee', 'Southbank, London', 51.506900, -0.116400, current_date - 9, 4, 5, 'Best flat white, window seat in the morning', ARRAY['coffee','cosy'])
    RETURNING id INTO p1;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags) VALUES
    (uid, 'Cliff walk at Howth', 'Howth, Dublin', 53.378500, -6.057100, current_date - 55, 1, 4, 'Windy but worth it', ARRAY['nature'])
    RETURNING id INTO p2;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags) VALUES
    (uid, 'Diani Beach', 'Diani, Kenya', -4.279700, 39.594700, current_date - 120, 1, 5, 'Warmest water ever. Monkeys stole our snacks.', ARRAY['beach','holiday'])
    RETURNING id INTO p3;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags) VALUES
    (uid, 'Kew Gardens', 'Richmond, London', 51.478700, -0.295600, current_date - 30, 2, 5, 'The glasshouses in the rain', ARRAY['nature']),
    (uid, 'That tiny ramen bar', NULL, NULL, NULL, current_date - 12, 2, 4, 'Where we celebrated the new job', ARRAY['food']),
    (uid, 'Nairobi National Park', 'Nairobi, Kenya', -1.373300, 36.858900, current_date - 118, 1, 5, 'Giraffes with the city skyline behind them', ARRAY['holiday']);

  -- ── Ideas ─────────────────────────────────────────────────
  INSERT INTO ideas (user_id, title, body, status, priority, tags) VALUES
    (uid, 'Surprise picnic for Amara', 'Her favourite spot by the river', 'doing', 'high', ARRAY['friends'])
    RETURNING id INTO i1;
  INSERT INTO ideas (user_id, title, body, status, priority, tags) VALUES
    (uid, 'Start a tiny herb garden', 'Basil, mint and rosemary on the kitchen sill', 'planning', 'medium', ARRAY['home']),
    (uid, 'Learn film photography', '', 'thinking', 'low', ARRAY[]::text[]),
    (uid, 'Write a short story', 'Something about a lighthouse keeper', 'thinking', 'high', ARRAY['writing']),
    (uid, 'Repaint the bedroom wall', 'Soft sage green', 'done', 'medium', ARRAY['home']),
    (uid, 'Weekend in the Lake District', 'Autumn colours', 'planning', 'medium', ARRAY['travel']);

  -- ── Queue ─────────────────────────────────────────────────
  INSERT INTO queue (user_id, tab, title, meta, status, pct, color, added_date, notes) VALUES
    (uid, 'watch',   'Past Lives', 'Film, Leo recommended it', 'progress', 40, '#7a4a8a', current_date - 6, NULL)
    RETURNING id INTO q1;
  INSERT INTO queue (user_id, tab, title, meta, status, pct, color, added_date, notes) VALUES
    (uid, 'watch',   'Studio Ghibli marathon', 'Weekend plan', 'todo', 0, '#4a7a7a', current_date - 2, 'Start with Kiki'),
    (uid, 'watch',   'The Bear, season 3', 'Series', 'done', 100, '#8a4a4a', current_date - 40, NULL),
    (uid, 'listen',  'Blonde', 'Frank Ocean', 'progress', 70, '#8a6a4a', current_date - 10, NULL),
    (uid, 'listen',  'The Rest Is History', 'Podcast', 'todo', 0, '#4a6d8a', current_date - 3, NULL),
    (uid, 'read',    'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 'progress', 25, '#6a4a8a', current_date - 14, NULL),
    (uid, 'read',    'Klara and the Sun', 'Kazuo Ishiguro', 'todo', 0, '#5a6a8a', current_date - 1, NULL),
    (uid, 'explore', 'Learn to ice skate', 'Winter', 'todo', 0, '#4a8a6a', current_date - 5, NULL);

  -- ── Ratings ───────────────────────────────────────────────
  INSERT INTO ratings (user_id, title, category, rating, notes) VALUES
    (uid, 'Spirited Away', 'Film', 5, 'Perfect every time')
    RETURNING id INTO r1;
  INSERT INTO ratings (user_id, title, category, rating, notes) VALUES
    (uid, 'Dune part two', 'Film', 4, NULL),
    (uid, 'The Secret History', 'Book', 4, 'Dark and gripping'),
    (uid, 'Blonde', 'Music', 5, NULL),
    (uid, 'Riverside Coffee', 'Place', 4, 'Great flat white'),
    (uid, 'Fleabag', 'Series', 5, NULL),
    (uid, 'Why we sleep', 'Article', 3, 'Interesting but long'),
    (uid, 'Northern lights trip', 'Experience', 5, 'Once in a lifetime');

  -- ── Links between people and things ───────────────────────
  INSERT INTO soul_links (user_id, soul_id, table_name, item_id, item_title, item_meta) VALUES
    (uid, s_amara,  'places',  p1, 'Riverside Coffee', 'Southbank, London'),
    (uid, s_amara,  'ideas',   i1, 'Surprise picnic for Amara', 'Her favourite spot by the river'),
    (uid, s_leo,    'library', l3, 'Gift ideas for Leo', 'Birthday in March'),
    (uid, s_leo,    'queue',   q1, 'Past Lives', 'Film, Leo recommended it'),
    (uid, s_zawadi, 'places',  p3, 'Diani Beach', 'Diani, Kenya'),
    (uid, s_mum,    'ratings', r1, 'Spirited Away', 'Film');

  -- ── Moods (uses the moods made at sign-up; adds them if missing) ──
  IF NOT EXISTS (SELECT 1 FROM mood_defs WHERE user_id = uid) THEN
    INSERT INTO mood_defs (user_id, name, color, sort_order) VALUES
      (uid, 'happy', '#f59e0b', 0), (uid, 'calm', '#3b82f6', 1), (uid, 'energised', '#ef4444', 2),
      (uid, 'loved', '#ec4899', 3), (uid, 'anxious', '#8b5cf6', 4), (uid, 'sad', '#6b7280', 5),
      (uid, 'tired', '#78716c', 6), (uid, 'frustrated', '#f97316', 7);
  END IF;

  -- 2 or 3 logs a day for the last 3 weeks, with a few notes
  FOR d IN 0..20 LOOP
    FOR m IN
      SELECT id, name, color FROM mood_defs WHERE user_id = uid ORDER BY random() LIMIT (2 + (d % 2))
    LOOP
      INSERT INTO mood_logs (user_id, mood_def_id, feeling_name, feeling_color, intensity, note, log_date, log_time)
      VALUES (
        uid, m.id, m.name, m.color, 1 + floor(random() * 5)::int,
        CASE WHEN random() < 0.3 THEN (ARRAY['Coffee with Amara','Long walk','Good sleep','Busy day at work','Called Mum','Rainy afternoon'])[1 + floor(random() * 6)::int] END,
        current_date - d,
        to_char(time '08:00' + (floor(random() * 14) || ' hours')::interval + (floor(random() * 60) || ' minutes')::interval, 'HH24:MI')
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Sample data added for %', test_email;
END
$seed$;


-- ════════════════════════════════════════════════════════════════
--  CLEAN UP: remove ALL data for your test account (not games)
--  Select just this block, change the email, and run it.
-- ════════════════════════════════════════════════════════════════
/*
DO $clean$
DECLARE
  test_email text := 'you@example.com';   -- <<< YOUR TEST EMAIL
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(test_email);
  IF uid IS NULL THEN RAISE EXCEPTION 'No account with email %. Nothing was changed.', test_email; END IF;
  DELETE FROM journal_entry_souls WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE user_id = uid);
  DELETE FROM soul_links      WHERE user_id = uid;
  DELETE FROM soul_media      WHERE user_id = uid;
  DELETE FROM journal_entries WHERE user_id = uid;
  DELETE FROM tasks           WHERE user_id = uid;
  DELETE FROM library         WHERE user_id = uid;
  DELETE FROM places          WHERE user_id = uid;
  DELETE FROM ideas           WHERE user_id = uid;
  DELETE FROM queue           WHERE user_id = uid;
  DELETE FROM ratings         WHERE user_id = uid;
  DELETE FROM mood_logs       WHERE user_id = uid;
  DELETE FROM souls           WHERE user_id = uid;
  RAISE NOTICE 'Sample data removed for %', test_email;
END
$clean$;
*/
