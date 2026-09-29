# Going live with the redesign

Read this top to bottom once before you start. Nothing here reads, changes or deletes her data.

---

## 1. Test everything on staging first

```powershell
npm install
npx supabase db push          # applies every new migration to STAGING
npm run dev
```

Open http://localhost:3000, log in with your test account and click through:

- [ ] Dashboard: add a task, tick it off
- [ ] Journal: write an entry, mention someone with @, save with Ctrl+S, pin it
- [ ] Library, Places, Souls: add one of each **with a photo**, edit, delete
- [ ] Souls: give someone a profile photo, check it shows on the dashboard
- [ ] Ideas: move an idea across the board. Queue: drag the progress slider
- [ ] Mood: log a feeling. Theme: change preset, Save, reload the page
- [ ] Arcade: finish one game, check the Arcade stats go up
- [ ] Log out, log back in, change password page
- [ ] Repeat a few of these on your phone (use the Vercel preview in step 2)

## 2. Vercel preview (on staging)

```powershell
git checkout -b redesign        # skip if you already made it
git add -A
git commit -m "Redesign"
git push -u origin redesign
```

Vercel builds a **Preview** that talks to staging (you set that up earlier). Test it on your phone.

## 3. Apply the database changes to HER project

These migrations go to her database. Each one only adds things (a permission fix, new columns
with defaults, new tables, realtime switched on). None of them reads, changes or deletes her rows.

| Migration | What it does |
|---|---|
| `20260926220000_security_and_storage` | locks down permissions, creates the private photo bucket |
| `20260927120000_more_game_types` | lets the new Arcade games save results |
| `20260928100000_places_wishlist` | bucket list column on places |
| `20260929100000_enable_realtime` | live sync between her phone and laptop |
| `20260930100000_soul_birthdays` | birthday column on souls |
| `20260930110000_time_capsules` | new table for time capsule letters |

```powershell
# point the CLI at her project
npx supabase link --project-ref cuwqckhhlkvbhzqiktbj

# see what her database thinks has been applied
npx supabase migration list
```

**Important:** her database was built by hand, so it will show `20260729150314` as *not applied*.
That file creates all the tables, which already exist. Mark it as applied so it is **never run** there:

```powershell
npx supabase migration repair --status applied 20260729150314
npx supabase migration list      # now only the six migrations above should be pending
npx supabase db push             # applies them
```

Then point the CLI back at staging so future experiments stay safe:

```powershell
npx supabase link --project-ref pdxozrjepmdjxmxmietz
```

### Optional: leave her surprise letters
Open `supabase/letters_for_her.sql`, put in her email, your name, the letter and the date it should open,
and run it in the Supabase SQL editor of **her** project. It only inserts the letter; the only thing it
looks up is her account id. She'll see a sealed envelope "From you" with a countdown, and can't read it
until the day comes.

## 4. Check Vercel production settings

Vercel → Settings → Environment Variables, **Production** only:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | her project URL (`https://cuwqckhhlkvbhzqiktbj.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | her project anon key |
| `USER_EMAIL` | **her** email |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | optional now. Without it the map uses free CARTO tiles |

`DEV_PASSWORD` is no longer used anywhere and can be deleted.

## 5. Go live

Merge `redesign` into `main` (GitHub pull request, or locally):

```powershell
git checkout main
git merge redesign
git push
```

Vercel builds and deploys production. Open her site and check the login page loads.
She can do the first real login.

**If anything looks wrong:** Vercel → Deployments → pick the previous production deployment → **Instant Rollback**. Her data is unaffected either way.

## 6. Small things to tell her

- Her theme, font and size carry over. Text is a little bigger by default (15px instead of 13px). She can change it on the Theme page.
- People can have profile photos now: tap the circle at the top of the edit form.
- Older photos keep working. They no longer expire after a year.
- Arcade stats start counting from now (old games were never saved).
- **Put it on her phone:** App & backup page → Install on your phone. On iPhone it's Safari → Share → Add to Home Screen.
- **Birthdays:** add one to anyone in Souls; the dashboard counts down and reminds her 3 days before. Turning on
  reminders on App & backup also shows a phone notification when she opens the app.
- **Back up:** App & backup → Download everything. Worth doing every few months.

## 7. Housekeeping on your PC

These are unused leftovers that Claude could not delete remotely. Safe to delete:

- `src/lib/token.ts`
- `src/types/index.ts`
- `folder_structure.txt` (1 MB directory dump)
- `staging_schema.sql` (the migration in `supabase/migrations` replaces it)
