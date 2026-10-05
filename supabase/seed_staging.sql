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
--  Re-runnable: with start_fresh = true (the default) it first clears
--  everything your TEST account has (not games), then adds a fresh set.
--  Games are left empty on purpose. To only remove the sample data,
--  run the CLEAN UP block at the very bottom.
--
--  Needs every migration applied to staging first (npx supabase db push).
-- ════════════════════════════════════════════════════════════════

DO $seed$
DECLARE
  test_email text := 'you@example.com';   -- <<< YOUR TEST EMAIL
  start_fresh boolean := true;            -- clear the test account's old data first
  uid uuid;
  pl_trinity uuid; pl_bread uuid; pl_iveagh uuid; pl_green uuid; pl_home uuid;
  col_day uuid; col_study uuid; rt1 uuid;
  n_psy uuid; n_mem uuid; n_wm uuid; n_ltm uuid; n_dev uuid; n_res uuid;
  n_stat uuid; n_prob uuid; n_reg uuid; n_hyp uuid; n_span uuid; n_verbs uuid; n_food uuid;
  c record;
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

  IF start_fresh THEN
    DELETE FROM study_sessions    WHERE user_id = uid;
    DELETE FROM study_sessions    WHERE user_id = uid;
  DELETE FROM study_reviews     WHERE user_id = uid;
    DELETE FROM study_nodes       WHERE user_id = uid;   -- cards, links and topic links go with it
    DELETE FROM route_trips       WHERE user_id = uid;
    DELETE FROM routes            WHERE user_id = uid;
    DELETE FROM route_collections WHERE user_id = uid;
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
    DELETE FROM time_capsules   WHERE user_id = uid;
    DELETE FROM souls           WHERE user_id = uid;
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

  -- Birthdays (needs the 20260930100000 migration). One is only days away so the reminder shows.
  UPDATE souls SET birthday = (make_date(1996, extract(month from current_date + 2)::int, extract(day from current_date + 2)::int))
    WHERE id = s_amara;
  UPDATE souls SET birthday = DATE '1904-11-14' WHERE id = s_leo;       -- year unknown
  UPDATE souls SET birthday = DATE '1968-12-24' WHERE id = s_mum;

  -- Time capsule letters (needs the 20260930110000 migration): one ready, one sealed, one from someone else.
  INSERT INTO time_capsules (user_id, from_name, title, body, open_on, created_at) VALUES
    (uid, NULL, 'Summer promises', E'I hope you kept swimming every Sunday.\nAnd that the plants survived.', current_date, now() - interval '90 days'),
    (uid, NULL, 'Dear me, one year on', 'Hello from a year ago.', current_date + 365, now() - interval '5 days'),
    (uid, 'Ian', 'A little surprise', 'This one is sealed until it opens.', current_date + 45, now() - interval '10 days');

  -- ── Dublin places (for Routes): visited ones and bucket-list ones ──
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags, wishlist) VALUES
    (uid, 'Trinity College Library', 'College Green, Dublin 2', 53.343900, -6.256700, current_date - 20, 6, 5, 'The Long Room. Study spot by the window.', ARRAY['study','dublin'], false) RETURNING id INTO pl_trinity;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags, wishlist) VALUES
    (uid, 'Bread 41', 'Pearse St, Dublin 2', 53.344800, -6.247000, current_date - 4, 9, 5, 'Cardamom buns. Go before 10.', ARRAY['coffee','dublin'], false) RETURNING id INTO pl_bread;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags, wishlist) VALUES
    (uid, 'Iveagh Gardens', 'Clonmel St, Dublin 2', 53.335200, -6.262000, NULL, 1, 4, 'The secret garden behind Harcourt St', ARRAY['nature','dublin'], true) RETURNING id INTO pl_iveagh;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags, wishlist) VALUES
    (uid, 'St Stephen''s Green', 'Dublin 2', 53.338200, -6.259100, current_date - 7, 12, 4, 'Ducks, benches, lunch in the sun', ARRAY['nature','dublin'], false) RETURNING id INTO pl_green;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags, wishlist) VALUES
    (uid, 'Home', 'Rathmines, Dublin 6', 53.322500, -6.265000, current_date, 100, 5, NULL, ARRAY['dublin'], false) RETURNING id INTO pl_home;
  INSERT INTO places (user_id, name, address, lat, lng, visit_date, visits, rating, notes, tags, wishlist) VALUES
    (uid, 'Hokkaido in winter', 'Sapporo, Japan', 43.061800, 141.354400, NULL, 1, 5, 'Snow festival in February', ARRAY['travel'], true),
    (uid, 'Lisbon', 'Lisbon, Portugal', 38.722300, -9.139300, NULL, 1, 4, 'Pastéis de nata and the yellow trams', ARRAY['travel'], true),
    (uid, 'Glendalough', 'Wicklow, Ireland', 53.010700, -6.329700, current_date - 70, 1, 5, 'The upper lake walk', ARRAY['nature'], false);

  -- ── Routes (needs the 20261001100000 migration). Lines are planned when you open them. ──
  INSERT INTO route_collections (user_id, name, sort_order) VALUES (uid, 'Dublin day trips', 0) RETURNING id INTO col_day;
  INSERT INTO route_collections (user_id, name, sort_order) VALUES (uid, 'Study walks', 1) RETURNING id INTO col_study;

  INSERT INTO routes (user_id, name, notes, mode, stops, collection_id, tags, favourite, last_done_at) VALUES
    (uid, 'Library to home', 'The walk after a long study day', 'walk',
     jsonb_build_array(
       jsonb_build_object('id','a1','name','Trinity College Library','address','College Green, Dublin 2','lat',53.3439,'lng',-6.2567,'place_id',pl_trinity),
       jsonb_build_object('id','a2','name','St Stephen''s Green','lat',53.3382,'lng',-6.2591,'place_id',pl_green,'note','Sit by the pond for 10 minutes'),
       jsonb_build_object('id','a3','name','Home','address','Rathmines, Dublin 6','lat',53.3225,'lng',-6.2650,'place_id',pl_home)),
     col_study, ARRAY['study','evening'], true, now() - interval '1 day')
    RETURNING id INTO rt1;
  INSERT INTO routes (user_id, name, notes, mode, stops, collection_id, tags, favourite) VALUES
    (uid, 'Saturday in town', 'Coffee, gardens, then the library', 'walk',
     jsonb_build_array(
       jsonb_build_object('id','b1','name','Your location','lat',NULL,'lng',NULL,'here',true),
       jsonb_build_object('id','b2','name','Bread 41','address','Pearse St, Dublin 2','lat',53.3448,'lng',-6.2470,'place_id',pl_bread,'note','Cardamom bun before they run out'),
       jsonb_build_object('id','b3','name','Iveagh Gardens','lat',53.3352,'lng',-6.2620,'place_id',pl_iveagh),
       jsonb_build_object('id','b4','name','Trinity College Library','lat',53.3439,'lng',-6.2567,'place_id',pl_trinity,'link','https://www.tcd.ie/visitors/book-of-kells/')),
     col_day, ARRAY['weekend'], false),
    (uid, 'Cycle to Howth', NULL, 'cycle',
     jsonb_build_array(
       jsonb_build_object('id','c1','name','Home','lat',53.3225,'lng',-6.2650,'place_id',pl_home),
       jsonb_build_object('id','c2','name','Clontarf promenade','lat',53.3606,'lng',-6.2085),
       jsonb_build_object('id','c3','name','Howth harbour','lat',53.3891,'lng',-6.0653,'note','Fish and chips at the pier')),
     col_day, ARRAY['cycling'], false),
    (uid, 'Old commute', NULL, 'transit',
     jsonb_build_array(
       jsonb_build_object('id','d1','name','Home','lat',53.3225,'lng',-6.2650),
       jsonb_build_object('id','d2','name','Grafton Street','lat',53.3419,'lng',-6.2600)),
     NULL, ARRAY[]::text[], false);
  UPDATE routes SET archived = true WHERE user_id = uid AND name = 'Old commute';

  INSERT INTO route_trips (user_id, route_id, route_name, mode, started_at, ended_at, active_seconds, distance_m, stops_total, stops_visited, notes) VALUES
    (uid, rt1, 'Library to home', 'walk', now() - interval '1 day 40 minutes', now() - interval '1 day', 2280, 2600, 2, 2, 'Rain started halfway. Worth it.'),
    (uid, rt1, 'Library to home', 'walk', now() - interval '6 days 35 minutes', now() - interval '6 days', 2050, 2600, 2, 2, NULL);

  -- ── Learn: study map (needs the 20261004100000 migration) ──
  INSERT INTO study_nodes (user_id, title, summary, color, sort_order) VALUES
    (uid, 'Psychology', 'Year 2 modules', '#a855f7', 0) RETURNING id INTO n_psy;
  INSERT INTO study_nodes (user_id, title, summary, color, sort_order) VALUES
    (uid, 'Statistics', 'For the research methods exam', '#22d3ee', 1) RETURNING id INTO n_stat;
  INSERT INTO study_nodes (user_id, title, summary, color, sort_order) VALUES
    (uid, 'Spanish', 'B1 by summer', '#f472b6', 2) RETURNING id INTO n_span;

  INSERT INTO study_nodes (user_id, parent_id, title, summary, notes, sort_order) VALUES
    (uid, n_psy, 'Memory', 'How we store, keep and lose information',
     E'## Key ideas\n- **Short-term memory** holds about 7 items, for around 20 seconds\n- Long-term memory is *organised by meaning*\n- Sleep helps move memories into long-term storage\n\n## To do\n- [x] Read chapter 4\n- [ ] Make cards for chapter 5\n- [ ] Past paper question 3\n\n> Forgetting follows a curve: steep at first, then it levels off.\n\nLecture slides: [Week 4](https://example.com/psych/week4)', 0)
    RETURNING id INTO n_mem;
  INSERT INTO study_nodes (user_id, parent_id, title, summary, sort_order) VALUES
    (uid, n_mem, 'Working memory', 'Baddeley and Hitch''s model', 0) RETURNING id INTO n_wm;
  INSERT INTO study_nodes (user_id, parent_id, title, sort_order) VALUES
    (uid, n_mem, 'Long-term memory', 1) RETURNING id INTO n_ltm;
  INSERT INTO study_nodes (user_id, parent_id, title, summary, sort_order) VALUES
    (uid, n_psy, 'Development', 'Piaget, Vygotsky, attachment', 1) RETURNING id INTO n_dev;
  INSERT INTO study_nodes (user_id, parent_id, title, sort_order, mastery_override) VALUES
    (uid, n_psy, 'Research methods', 2, 75) RETURNING id INTO n_res;
  INSERT INTO study_nodes (user_id, parent_id, title, sort_order) VALUES
    (uid, n_psy, 'Social psychology', 3);
  INSERT INTO study_nodes (user_id, parent_id, title, summary, sort_order) VALUES
    (uid, n_stat, 'Probability', 'The rules of chance', 0) RETURNING id INTO n_prob;
  INSERT INTO study_nodes (user_id, parent_id, title, sort_order) VALUES
    (uid, n_stat, 'Regression', 1) RETURNING id INTO n_reg;
  INSERT INTO study_nodes (user_id, parent_id, title, notes, sort_order) VALUES
    (uid, n_stat, 'Hypothesis tests', E'1. State H0 and H1\n2. Pick the test\n3. Find the p-value\n4. Compare with 0.05', 2) RETURNING id INTO n_hyp;
  INSERT INTO study_nodes (user_id, parent_id, title, sort_order) VALUES
    (uid, n_span, 'Irregular verbs', 0) RETURNING id INTO n_verbs;
  INSERT INTO study_nodes (user_id, parent_id, title, sort_order) VALUES
    (uid, n_span, 'Food and ordering', 1) RETURNING id INTO n_food;

  INSERT INTO study_links (user_id, from_id, to_id) VALUES
    (uid, n_res, n_hyp), (uid, n_mem, n_dev);

  -- Cards: some learnt well, some due now, some brand new
  INSERT INTO study_cards (user_id, node_id, front, back, ease, interval_days, reps, due_at, last_reviewed_at) VALUES
    (uid, n_mem, 'How many items can short-term memory hold?', 'About 7, give or take 2 (Miller, 1956)', 2.6, 24, 4, now() + interval '18 days', now() - interval '6 days'),
    (uid, n_mem, 'Who drew the forgetting curve?', 'Hermann Ebbinghaus', 2.5, 3, 2, now() - interval '1 day', now() - interval '4 days'),
    (uid, n_mem, 'What is chunking?', 'Grouping items into bigger units so more fit in short-term memory', 2.5, 0, 0, now(), NULL),
    (uid, n_wm,  'Name the four parts of working memory', 'Central executive, phonological loop, visuospatial sketchpad, episodic buffer', 2.5, 0, 0, now(), NULL),
    (uid, n_wm,  'What does the phonological loop hold?', 'Sounds and words, rehearsed like an inner voice', 2.36, 1, 1, now() - interval '2 hours', now() - interval '1 day'),
    (uid, n_ltm, 'Episodic vs semantic memory?', 'Episodic: personal events. Semantic: facts and meanings.', 2.5, 8, 3, now() + interval '5 days', now() - interval '3 days'),
    (uid, n_dev, 'Piaget''s four stages?', 'Sensorimotor, preoperational, concrete operational, formal operational', 2.3, 2, 2, now() - interval '3 hours', now() - interval '2 days'),
    (uid, n_prob, 'P(A and B) for independent events?', 'P(A) × P(B)', 2.5, 6, 3, now() + interval '2 days', now() - interval '4 days'),
    (uid, n_prob, 'P(A or B) for events that can''t happen together?', 'P(A) + P(B)', 2.5, 0, 0, now(), NULL),
    (uid, n_hyp, 'What does p < 0.05 mean?', 'If H0 were true, a result this extreme would happen less than 5% of the time', 2.2, 1, 1, now() - interval '1 day', now() - interval '2 days'),
    (uid, n_reg, 'What does R² tell you?', 'How much of the variation the model explains (0 to 1)', 2.5, 0, 0, now(), NULL),
    (uid, n_verbs, 'tener (yo)', 'tengo', 2.7, 30, 5, now() + interval '25 days', now() - interval '5 days'),
    (uid, n_verbs, 'ir (nosotros, past)', 'fuimos', 2.5, 4, 2, now() - interval '1 day', now() - interval '5 days'),
    (uid, n_verbs, 'hacer (él, past)', 'hizo', 2.5, 0, 0, now(), NULL),
    (uid, n_food, 'How do you ask for the bill?', '¿La cuenta, por favor?', 2.5, 12, 3, now() + interval '9 days', now() - interval '3 days');

  -- Six weeks of past answers (some typed, with a match score)
  FOR c IN SELECT id, node_id FROM study_cards WHERE user_id = uid AND reps > 0 LOOP
    FOR d IN 1..(1 + floor(random() * 3))::int LOOP
      INSERT INTO study_reviews (user_id, card_id, node_id, grade, score, reviewed_at)
      VALUES (uid, c.id, c.node_id, (ARRAY[1,2,3,3,3,4])[1 + floor(random() * 6)::int],
              CASE WHEN random() < 0.5 THEN 35 + floor(random() * 66)::int END,   -- about half typed
              now() - (floor(random() * 40) || ' days')::interval);
    END LOOP;
  END LOOP;

  INSERT INTO study_resources (user_id, node_id, url, title, sort_order) VALUES
    (uid, n_mem, 'https://www.youtube.com/watch?v=bSycdIx-C48', 'Crash Course: How we make memories', 0),
    (uid, n_mem, 'https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6', 'Lo-fi for revision', 1),
    (uid, n_hyp, 'https://www.khanacademy.org/math/statistics-probability/significance-tests-one-sample', 'Khan Academy: significance tests', 0),
    (uid, n_span, 'https://www.spanishdict.com', 'SpanishDict', 0);

  -- ── On the Go history (needs the 20261004140000 migration) ──
  INSERT INTO study_sessions (user_id, route_id, route_name, node_ids, topic_names, mode, started_at, ended_at, active_seconds, cards_reviewed, cards_right, cards_heard, stops_total, stops_visited) VALUES
    (uid, rt1, 'Library to home', ARRAY[n_psy], ARRAY['Psychology'], 'cards', now() - interval '1 day 40 minutes', now() - interval '1 day', 2280, 24, 19, 0, 2, 2),
    (uid, NULL, NULL, ARRAY[n_span], ARRAY['Spanish'], 'typing', now() - interval '3 days 15 minutes', now() - interval '3 days', 840, 12, 9, 0, 0, 0),
    (uid, rt1, 'Library to home', ARRAY[n_mem, n_stat], ARRAY['Memory', 'Statistics'], 'listen', now() - interval '6 days 35 minutes', now() - interval '6 days', 2050, 0, 0, 31, 2, 2);

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
  DELETE FROM study_reviews     WHERE user_id = uid;
  DELETE FROM study_nodes       WHERE user_id = uid;
  DELETE FROM route_trips       WHERE user_id = uid;
  DELETE FROM routes            WHERE user_id = uid;
  DELETE FROM route_collections WHERE user_id = uid;
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
  DELETE FROM time_capsules   WHERE user_id = uid;
  DELETE FROM souls           WHERE user_id = uid;
  RAISE NOTICE 'Sample data removed for %', test_email;
END
$clean$;
*/
