# Putting the new yourworld live

A step-by-step guide to moving the redesign onto her real site. Most of it is the Supabase part,
because that's the only step that touches her live database.

**Time:** about 45 minutes, most of it waiting for builds.
**Her data:** nothing in this guide reads, changes or deletes any of her rows, and you never sign in as her.
Every database change only *adds* things (new tables, new empty columns, permissions, live sync).

| | Project ref | Used by |
|---|---|---|
| **Her project** (production) | `cuwqckhhlkvbhzqiktbj` | her live site (Vercel **Production**) |
| **Staging** (your test copy) | `pdxozrjepmdjxmxmietz` | local dev and Vercel **Preview** |

---

## Already live? Adding Routes

If the earlier update is already on her site, this is all Routes needs (about 15 minutes):

1. **Mapbox token.** Routes uses the Mapbox token the site already has (`NEXT_PUBLIC_MAPBOX_TOKEN`) for the 3D map,
   road routes with times, search as she types, and best stop order. There's no other account to make.
   - Check it's in Vercel → Settings → Environment Variables for **Production** and **Preview**. If it isn't,
     copy your default public token (starts with `pk.`) from [account.mapbox.com](https://account.mapbox.com) and add it.
   - Optional but sensible: in Mapbox → Tokens, add **URL restrictions** for her site address and
     `http://localhost:3000`, so nobody can reuse the token elsewhere. If you do, Vercel Preview addresses won't show the map
     unless you add them too.
   - Without a token, Routes still works with a flat map, straight lines and estimates.
2. **New package:** run `npm install` once (it adds `mapbox-gl`, the 3D map).
3. **Her database** (only adds three new tables; nothing existing is touched):
   ```powershell
   npx supabase link --project-ref cuwqckhhlkvbhzqiktbj
   npx supabase db push --dry-run     # should list ONLY 20261001100000_routes
   npx supabase db push
   npx supabase link --project-ref pdxozrjepmdjxmxmietz   # back to staging
   ```
   Do the same `db push` on staging first (while linked to staging) and try it there.
4. **Deploy:** commit and push to `main` (or merge your branch). Vercel redeploys by itself.
5. **Check:** `curl.exe -I https://YOUR-SITE/routes` gives 307 (sign-in only).

---

## Already live? Adding Learn and On the Go

Learn needs one database update and nothing else (no new settings, no new packages):
```powershell
npx supabase link --project-ref pdxozrjepmdjxmxmietz      # staging first
npx supabase db push
npm run dev                                               # try http://localhost:3000/learn
npx supabase link --project-ref cuwqckhhlkvbhzqiktbj      # her project
npx supabase db push --dry-run     # should list ONLY 20261004100000_study_map, 20261004120000_review_scores, 20261004140000_study_sessions
npx supabase db push
npx supabase link --project-ref pdxozrjepmdjxmxmietz      # back to staging
```
Then commit and push to deploy. It only adds six new tables and one column; nothing existing is touched.
Until the update is applied, the Learn page says it needs a database update instead of breaking.

### The beta video for the map feature
A new **What's new** video (`public/whats-new/map-beta-*.mp4` and `.jpg`) shows her Routes, Places, Learn
and On the Go as a beta, says what works and what doesn't yet, and asks what would make it better.
It plays by itself once (on whichever device she opens first), after the update above is live. At the end
there's a **Watch the glow-up** button, so the older video stays watchable too. Nothing to set up: the
files ship with the deploy. Soundtrack: "If I Am With You" (Jujutsu Kaisen, piano by Block_pf), so like
the first video it's only served to someone signed in.
Ship this together with Learn and On the Go (or after them), since the video shows both.

---

## Checklist

- [ ] 1. Staging tested, including notifications and the What's new video
- [ ] 2. Push keys and cron secret made
- [ ] 3. Her database updated (dry run first), CLI pointed back at staging
- [ ] 4. Vercel Production settings filled in
- [ ] 5. Merged to `main` and deployed
- [ ] 6. Production checked without signing in
- [ ] 7. She opens it on her iPhone and iPad

---

## 1. Finish testing on staging

```powershell
npm install
npx supabase link --project-ref pdxozrjepmdjxmxmietz
npx supabase db push          # applies every new migration to STAGING
npm run dev
```

Open http://localhost:3000, sign in with your **test** account and click through:

- [ ] Dashboard: add a task, tick it off. The Birthdays card and reminder banner show
- [ ] Journal: write an entry, mention someone with @, save with Ctrl+S, pin it
- [ ] Library, Places, Souls: add one of each **with a photo**, edit, delete
- [ ] Souls: give someone a birthday and a profile photo
- [ ] Places: add a place to the bucket list, then "Mark as visited"
- [ ] Time capsule: write and seal a letter
- [ ] Mood: log a feeling and check the year-in-colour grid
- [ ] Theme: pick Bubblegum and a new font, Save, reload
- [ ] Routes: New route, pick a destination, add two stops, drag one, press Best order, open in Google Maps
- [ ] Routes: Start journey, tick a stop, End journey, check it appears under Past journeys
- [ ] Learn: add a subject and two topics, drag one, link two topics, write notes, add a flashcard, review it
- [ ] On the Go: pick a route and a subject, Start the journey, answer two cards, tap I'm here, Finish
- [ ] Arcade: finish one game (2048, Wordle, Word Search or Bao), check the stats go up
- [ ] The **What's new** video plays by itself once, and again from the menu → What's new
- [ ] App & backup: Download everything, and open the zip
- [ ] Log out, log back in

Then push the branch so Vercel builds a **Preview** on staging, and try it on your phone:

```powershell
git checkout -b redesign        # skip if it already exists
git add -A
git commit -m "Redesign"
git push -u origin redesign
```

On your iPhone, open the Preview URL in Safari → Share → Add to Home Screen, open it from the
Home Screen, then App & backup → **Turn on notifications**. A test notification should arrive.
(Preview never sends the daily reminders, only the test. See step 6 to trigger the daily job by hand.)

---

## 2. Make the push keys (once)

These let the site send notifications. You make them on your own PC, so they never leave your hands.

```powershell
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Then make a cron secret (any long random string):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep all three somewhere safe (a password manager). You'll paste them into Vercel in step 4.
Staging and production can share the same keys.

---

## 3. Update her database (the careful part)

### 3.1 Point the CLI at her project

```powershell
npx supabase link --project-ref cuwqckhhlkvbhzqiktbj
```

It asks for her project's **database password** (Supabase → her project → Project Settings → Database).
If you've lost it you can reset it there. That only changes the database password, not her sign-in password.

### 3.2 Optional: snapshot the structure first (needs Docker)

```powershell
npx supabase db dump --linked -f supabase/her-schema-before.sql
```

This saves only the *structure* (tables, columns, permissions). It contains **none of her data**.
It's a record of how things were, in case you ever need to compare. It's git-ignored, so it won't be committed.

This command runs inside **Docker**. If you see `docker: command not found`, skip this step: it's only a
reference, and every migration below only adds things.

> Her *content* backup is hers to make: after going live she can press **App & backup → Download everything**.

### 3.3 Mark the baseline as already applied

Her database was built by hand, so the CLI doesn't know the tables already exist:

```powershell
npx supabase migration list
```

If `20260729150314` shows as **not applied** (an empty Remote column), mark it as done. That file creates every table
from scratch and must **never** run on her database. If it already has a Remote value, skip this:

```powershell
npx supabase migration repair --status applied 20260729150314
```

### 3.4 Dry run: see exactly what will run

```powershell
npx supabase db push --dry-run
```

It should list only migrations from this table, and none that already have a Remote value in `migration list`.
(For example, if `20260926220000` was pushed in an earlier session, you'll see the other seven.)

| Migration | What it adds |
|---|---|
| `20260926220000_security_and_storage` | locks down permissions; creates the private photo bucket if missing |
| `20260927120000_more_game_types` | lets the new Arcade games save results |
| `20260928100000_places_wishlist` | `wishlist` column on places (existing places stay "been") |
| `20260929100000_enable_realtime` | live sync between her devices |
| `20260930100000_soul_birthdays` | empty `birthday` column on souls |
| `20260930110000_time_capsules` | new table for letters |
| `20260930120000_push_subscriptions` | new table for devices with notifications on |
| `20260930130000_whats_new` | remembers she's watched the What's new video |
| `20261001100000_routes` | new tables for routes, route collections and journeys taken |
| `20261004100000_study_map` | new tables for Learn: subjects and topics, cross-links, flashcards, answers, links |
| `20261004120000_review_scores` | empty `score` column on Learn answers (how close a typed answer was) |
| `20261004140000_study_sessions` | new table for On the Go sessions (what she studied, on which route, how it went) |

(If you're only adding Routes to a site that already has everything else, you'll see just `20261001100000_routes`.)

**Stop if** the list includes `20260729150314`: go back to 3.3.
**Stop if** it lists anything else you don't recognise.

### 3.5 Apply them

```powershell
npx supabase db push
```

Type `y` to confirm. Each migration runs in turn; it takes a few seconds.

### 3.6 Check it worked (structure only, no data)

```powershell
npx supabase migration list        # every row now has a Remote column filled in
```

In Supabase → her project → **SQL Editor**, these return only table and column names, never her content:

```sql
-- the new tables exist, with row level security on
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('time_capsules', 'push_subscriptions', 'routes', 'route_collections', 'route_trips');

-- the new columns exist
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (('souls','birthday'), ('places','wishlist'), ('user_settings','whats_new_seen'));

-- live sync is on for her tables (expect about 20 rows)
select count(*) from pg_publication_tables where pubname = 'supabase_realtime';
```

Also look at **Storage**: the `yourworld` bucket should be there and marked **Private**.

### 3.7 Copy her keys for Vercel

Supabase → her project → **Project Settings → API Keys**. If you see tabs, use **Legacy API keys**:

- **Project URL**: `https://cuwqckhhlkvbhzqiktbj.supabase.co`
- **anon / public** key: probably already in Vercel Production
- **service_role** key (**secret**): new; the daily reminder job needs it

### 3.8 Point the CLI back at staging

So nothing you run later can touch her project by accident:

```powershell
npx supabase link --project-ref pdxozrjepmdjxmxmietz
```

### If a step fails

| You see | What it means | Do this |
|---|---|---|
| `relation "…" already exists` | the baseline tried to run | `migration repair --status applied 20260729150314`, then push again |
| `function public.decrypt_val(text) does not exist` | her database is missing a helper the security step expects | tell me the exact message; nothing was applied, since each migration is all-or-nothing |
| `password authentication failed` | wrong database password | reset it in Project Settings → Database, then `supabase link` again |
| `Remote migration versions not found in local migrations directory` | the CLI history has an entry you don't have | run `npx supabase migration list` and send me the output |

A failed migration rolls itself back completely, so her database is never left half-changed.

---

## 4. Vercel settings for production

Vercel → your project → **Settings → Environment Variables**. Set these for **Production**.
Preview should keep pointing at **staging**, so each variable has two values: tick the right environment for each.

| Variable | Production value | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cuwqckhhlkvbhzqiktbj.supabase.co` | step 3.7 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | her anon key | step 3.7 |
| `SUPABASE_SERVICE_ROLE_KEY` | her **service_role** key | step 3.7. **Never** put it in a `NEXT_PUBLIC_` variable |
| `USER_EMAIL` | **her** email | the only address allowed to sign in |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public Key | step 2 (same in Preview) |
| `VAPID_PRIVATE_KEY` | Private Key | step 2 (same in Preview) |
| `VAPID_SUBJECT` | `mailto:your@email` | your email; push services use it to contact the site owner |
| `CRON_SECRET` | the random string | step 2 (same in Preview) |
| `APP_TIMEZONE` | `Europe/London` | optional; this is the default |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | your Mapbox public token (`pk.`) | the 3D Routes map, road routes, search and best order (same in Preview). Without it: flat maps on free CARTO tiles and straight-line routes |

Delete `DEV_PASSWORD`; nothing uses it any more.

`NEXT_PUBLIC_…` values are baked in when Vercel builds, so if you change one later, **redeploy**.

---

## 5. Go live

```powershell
git checkout main
git merge redesign
git push
```

Vercel builds and deploys Production (about 2 minutes). Then check:

- Vercel → **Deployments**: the newest Production build is green.
- Vercel → **Settings → Cron Jobs**: `/api/cron/daily` is listed, daily at 07:00 UTC
  (8am UK in summer, 7am in winter). On the free plan it can run any time within that hour.

---

## 6. Check production without signing in

Replace `YOUR-SITE` with her domain. None of these show any of her content.

```powershell
curl.exe -I https://YOUR-SITE/login                                   # 200
curl.exe -I https://YOUR-SITE/manifest.webmanifest                    # 200: installable
curl.exe -I https://YOUR-SITE/whats-new/glow-up-portrait.jpg          # 200: the video's poster is there
curl.exe -I https://YOUR-SITE/whats-new/glow-up-portrait.mp4          # 307: the video itself is private (sign-in only)
curl.exe -I https://YOUR-SITE/whats-new/map-beta-portrait.jpg         # 200: the map beta video's poster
curl.exe https://YOUR-SITE/api/cron/daily                             # 401: locked
curl.exe -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-SITE/api/cron/daily
```

The last one runs the reminder job now and replies with counts only, for example
`{"ok":true,"today":"2026-10-01","users":0,"reminders":0,"sent":0,...}`. `users` is 0 until she
turns notifications on. If it says `Missing settings`, the list names which Vercel variables are missing.

---

## 7. Her side

She just opens her site in **Safari** and signs in as usual. The **What's new** video plays by itself
(muted at first, since phones only allow silent autoplay; she taps **Tap for sound**). It shows her
what's new and walks her through the two setup steps, on each device:

1. **Home Screen:** Safari → Share → Add to Home Screen → Add, then open yourworld from the Home Screen.
2. **Reminders:** in the app, App & backup → **Turn on notifications** → **Allow**. A test arrives right away.

It plays by itself only once. She can watch it again any time from the menu → **What's new**.
The soundtrack is "Delirious" from Jujutsu Kaisen, so the video file is only served to someone signed in.
Keep it that way: it's for her to watch, not to post anywhere public.
Notifications need iOS / iPadOS 16.4 or newer, and must be turned on separately on the iPhone and the iPad.

### Optional: leave her surprise letters
Open `supabase/letters_for_her.sql`, fill in her email, your name, the letter and the date it should
open, and run it in the **SQL Editor of her project**. It only inserts the letter; the only thing it looks
up is her account id. She sees a sealed envelope "From you" with a countdown, gets a notification the
morning it unlocks, and can't read it before then.

---

## 8. If something goes wrong

- **The site looks broken:** Vercel → Deployments → the previous Production deployment → **Instant Rollback**.
  The database changes can stay: they only add things, and the old site simply ignores them.
- **No notifications:** check step 6's cron call works; on her device, Settings → Notifications → yourworld
  → Allow is on, and Focus / Do Not Disturb isn't hiding them. Turning notifications off and on again in
  App & backup re-registers the device.
- **The video doesn't autoplay:** that's fine. She can play it from the menu → What's new.

---

## 9. Housekeeping on your PC

Unused leftovers that couldn't be deleted remotely. Safe to delete:

- `src/lib/token.ts`
- `src/types/index.ts`
- `folder_structure.txt` (1 MB directory dump)
- `staging_schema.sql` (the migration in `supabase/migrations` replaces it)
- `src/components/souls/BirthdayNotifier.tsx` (replaced by push notifications)

---

## Sentry (error reports)

Sentry tells you when something breaks on her phone, iPad or laptop, or on the server, with the page and the line of code.
It's **off until you add the DSN**, and it's set up so it never sees her content:
- no session replay (no screen recordings), no user or account details, no cookies, no request bodies, no query strings;
- page and API addresses are sent as bare paths with ids blanked (`/journal/<id>`);
- clicks, typing and console logs are dropped from the trail before an error (they can contain names and labels);
- reports go through the site itself (`/monitoring`), so Sentry sees Vercel's server address, not hers.
The rules live in `src/lib/sentry-privacy.ts`.

1. Sign up at [sentry.io](https://sentry.io) (the free Developer plan is plenty) → **Create project** → platform **Next.js**.
   Skip the wizard it shows; the code is already in place.
2. Copy the project's **DSN** (Project Settings → Client Keys (DSN); it looks like `https://…@o….ingest….sentry.io/…`).
3. Vercel → Settings → Environment Variables, for **Production** and **Preview**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SENTRY_DSN` | the DSN |
   | `SENTRY_AUTH_TOKEN` | optional: Sentry → Settings → Auth Tokens → create one. Makes stack traces readable |
   | `SENTRY_ORG` | optional, with the token: your organisation slug (in the Sentry address bar) |
   | `SENTRY_PROJECT` | optional, with the token: the project slug |

   For local testing, put `NEXT_PUBLIC_SENTRY_DSN=...` in `.env.local` too.
4. In Sentry → Project Settings → **Security & Privacy**, turn on **Prevent storing of IP addresses** (belt and braces).
5. Redeploy, then open `https://YOUR-SITE/dashboard?sentry-test` once while signed in. A test error,
   "Sentry test from yourworld (this is fine)", appears in Sentry within a minute. Resolve it.
6. Optional: Sentry → Alerts → create an alert to email you when a new issue appears.

Errors are tagged `production`, `preview` or `development`, so you can tell her live site from your tests.
