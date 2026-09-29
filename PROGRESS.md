# Ryoiki Tenkai – revamp progress log

## Session 1 (26 Sep 2026, 20:00–20:15)
**Done**
- Copied the project into Claude's workspace, set a git baseline, and confirmed `next build` passes.
- Audited every page, the DB layer, the Supabase schema and the auth flow (findings below).
- Fixed four clear-cut bugs:
  - Logout (sidebar and auto-logout) now calls `supabase.auth.signOut()`, so the session really ends.
  - Removed stray debug code in `api/auth/check` that logged the email and token on server start.
  - `api/auth/check` accepts the 30-day refresh cookie, like the middleware. Before, you were force-logged-out after 7 days.
  - Removed the middleware's per-request cookie logging. The auto-logout monitor no longer runs on `/reset-password`.

**Key findings still to fix**
- Games: chess AI corrupts the board (hard/medium), the battleship AI never targets, tic-tac-toe double-scores and lets you move twice, Kadi/Matatu jokers stall the game, sudoku can mark correct answers wrong, and no game saves results.
- Images are stored as 1-year signed URLs, so every photo breaks after a year. They also get lost if a save fails.
- Dates use UTC instead of local time, so "today" and overdue are wrong around midnight.
- Themes only partly apply, and some CSS variables and animation classes are undefined.
- Security: the DB functions `decrypt_val`, `encrypt_val` and `seed_mood_defs` are callable with the public key. The storage bucket isn't in the migrations. The dev login is broken.
- Lots of duplicated code: the soul-link picker, image upload, page loading and task rows.

**Next**
- Dev environment guide.
- Design direction.
- Shared components refactor.
- Page-by-page redesign and bug fixes.
- Playwright screenshots and checks.

## Session 2 (26 Sep 2026, 22:46–23:01)
**Done**
- Fixed the baseline migration so `supabase db push` works on a fresh project (removed 3 auto-generated lines).
- **Login fix:** logging in with correct details no longer bounces back to the login page.
  - Cause: the sidebar also rendered on /login and prefetched /dashboard before you were logged in. Next.js cached that "redirect to /login" answer and reused it after you logged in.
  - Now the sidebar doesn't render on auth pages, and login/logout do a full page load.
- Login keeps where you were going: `/login?next=/journal` returns you to /journal after login.
- Removed the broken dev-password bypass and all auth console logging.
- Added a site icon (fixes the favicon 404).
- New migration `20260926220000_security_and_storage.sql`:
  - The `decrypt_val`, `encrypt_val`, `enc` and `seed_mood_defs` functions can no longer be called from the API.
  - `dev_config` can no longer be reached from the API.
  - Logged-out visitors can't read any table.
  - Creates the private `yourworld` photo bucket with per-user folder rules.
  - It's safe to apply to production later: it doesn't read or change any data.
- Reviewed OmniRoute (an AI model gateway, not applicable to this site) and transitions.dev (will use its modal, dropdown, number and error-shake transitions).

**Next:** design tokens and shared components; then page-by-page redesign and fixes, starting with the dashboard, sidebar, tasks and journal.

## Session 3 (26 Sep 2026, 23:00–23:16)
**Done: design foundation (identity kept: dark, orange and purple, playful)**
- **New colour system** in `globals.css`. Only 4 theme colours are set (background, accent, secondary, text); every other shade is derived from them. Every theme now reaches every page.
  - Added spacing, type, radius and shadow tokens.
  - Added motion tokens (Emil Kowalski curves, UI motion under 300ms).
  - Added a light-theme mode, a visible keyboard focus ring and reduced-motion support.
- Converted 319 hard-coded colours across all stylesheets to theme variables. Text on accent-coloured buttons now picks black or white automatically for readability.
- **New `src/lib/theme.ts`** is the single source for presets, fonts, sizes and applying a theme. The head script (no colour flash), the Theme page and app start-up all use it.
- **Theme sync:** the saved theme now syncs from the database on every app load. Before, it only synced if you opened the Theme page on that device.
- **Comic font:** now bundled (Comic Neue via `@fontsource/comic-neue`), so it looks the same on iPhone and Android, where Comic Sans doesn't exist.
- **Font sizes:** the scale is now 13–19px with a 15px default; the old default was 13px. Old saved sizes map to the nearest new size.
- **Pinch-zoom:** no longer blocked on mobile (accessibility).
- **Undefined names fixed:** the `animate-fade-up`/`animate-fade-in` classes and the `--text`/`--border`/`--accent` variables are now defined.

**Action for you:** run `npm install` once (new font package).

**Next:** shared components (buttons, inputs, modal, cards, empty states, toasts) with transitions.dev motion. Then the sidebar and dashboard redesign.

## Session 4 (26 Sep 2026, 23:14–23:32)
**Done**
- **Icons:** added Lucide icons (`lucide-react`) and replaced the symbol/emoji icons in the sidebar and all shared components. `components/ui/icons.tsx` maps the old symbols (✐ ◎ ★ …) to real icons, so pages can convert gradually.
- **Shared components rebuilt** in `components/ui/index.tsx`, with the same names and props so every page picked up the changes without edits:
  - Readable sizes; there's no more 8–9px text.
  - Real buttons and switches for keyboard and screen readers.
  - Modals close with Esc, move focus inside, lock page scroll, and open as a bottom sheet on phones.
  - Toast pops in (transitions.dev style); the star rating shows a hover preview and clicking the same star again clears it.
  - Search bar, tabs and fields got clearer focus styles.
- **Sidebar redesign:**
  - Lucide icons with an accent bar on the active page.
  - Smooth drawer curve.
  - Collapsed rail on tablets; the floating menu button no longer covers it.
  - Phone drawer with full labels.
- **Text:** removed every em/en dash from on-screen text across 17 pages and rewrote those lines as natural sentences.

**Action for you:** `npm install` (new package: lucide-react), then restart `npm run dev`.

**Next:** page-by-page redesign, starting with the dashboard, tasks and journal: convert each page's remaining symbols to icons and fix its logic bugs.

## Session 5 (26 Sep 2026, 23:23–23:35)
**Done**
- **Shared helpers:**
  - `lib/dates.ts` uses local dates. The old UTC dates made "today" and "overdue" wrong around midnight.
  - `lib/tasks.ts` holds priorities, sorting and the overdue/today/upcoming checks.
  - `components/tasks/TaskRow` is one task row used by both pages. It has an animated check, strike-through when done, and icon edit/delete buttons that show on hover (always visible on touch).
- **Tasks page redesign:**
  - A composer card: "What needs doing?", priority buttons, due date and Add.
  - New **Upcoming** tab. Today now really means due today; before, it also showed future tasks.
  - Tasks are sorted by due date and priority.
  - Every edit, delete and "clear finished" rolls back if the database refuses it.
  - "Clear finished" now asks for confirmation.
  - Loading placeholders while tasks load.
- **Dashboard redesign:**
  - Greeting with a sun or moon icon and a live clock.
  - Stat cards with icons.
  - One "Today" card: quick add, overdue at the top, then due today, then a "finished today" count.
  - Recent journal with the mood and "Today"/"Yesterday" dates.
  - A library pick with a shuffle button, and a souls avatar row.
  - If one section fails to load, the rest still show.
- **Preview harness:** Playwright with fake data (`/tmp` only, never touches a database) to screenshot pages with content.

**Next:** journal list and editor, then library, ideas and queue.

## Session 6 (26 Sep 2026, 23:30–23:45)
**Done: journal**
- **`lib/journal.tsx`:** one list of moods, plus @mention highlighting that uses her real souls and their colours. It works with names that have spaces. Before, mention colours came from hard-coded sample names (Sofia, Mum…).
- **Journal list:**
  - Pinned entries get their own section, then the rest are grouped by month.
  - Cards show "Today, 18:20"-style times, the mood, a 3-line preview with highlighted mentions, and tags.
  - Pin and delete are icon buttons.
  - Mood filters only show moods she has actually used.
  - Search also looks at tags.
  - Month grouping now uses local dates.
- **Writing page:**
  - Distraction-free layout with a sticky top bar.
  - Honest status: Unsaved changes, Saving, Saved. It was a fake timer before.
  - Ctrl/Cmd+S saves.
  - Leaving with unsaved changes asks "Save and leave" or "Discard". Closing the tab warns too.
  - Editing keeps the entry's original time; before, every edit overwrote it.
  - New entries stay open after the first save.
  - @mention picker: arrow keys, Enter or Tab to pick, Esc to close; linked souls show as removable chips.
  - Word count, and the text box grows as you write.

**Next:** library, ideas, queue (shared soul-link field and image handling).

## Session 7 (26 Sep 2026, 23:35–23:48)
**Done**
- **Photos no longer expire.** New uploads save the file's storage location, not a 1-year signed link.
  - Photos are shown through `StoredImage`, which makes a fresh short-lived link on demand.
  - Old rows that hold 1-year links are read automatically, so her existing photos will keep working after the year is up.
  - Photos on a page load in one batch.
  - Uploads check the file type and size (15 MB max).
- **Safer photo saving:** the new photo uploads first, and the old one is deleted only after the database save succeeds. If the save fails, the new upload is removed. Before, the old photo was deleted first, so a failed save lost it.
- **Soul links:**
  - `setSoulLinks` only adds or removes what changed. Before, it deleted everything and re-inserted, so a failure wiped all links.
  - Link titles stay in sync with the item.
  - New `deleteSoulLinksForItem`, so deleting an item no longer leaves stale links on soul profiles.
- Added `image_url` to the Library, Place and Soul database types, so no more type casts.
- **Shared components:**
  - `SoulLinkField`: chips for linked people, plus "Link someone" to open the picker.
  - `ImagePicker` redesign: icon, drag highlight, clean remove button.
- **Library redesign:**
  - Cards show a type badge with an icon, photo, stars, notes preview and tags.
  - A link on a card opens in a new tab and shows the site name.
  - Tabs only appear for types she has used. Sorting: Newest, Top rated, A to Z.
  - The add/edit window has an icon type picker and stays open while saving.
  - Deleting an item also removes its photo and soul links.
- Every other page that shows photos (places, souls, gallery, dashboard) now uses `StoredImage`.

**Next:** Ideas and Queue (same pattern), then Places and Souls.

## Session 8 (26 Sep 2026, 23:41–23:55)
**Done**
- **Ideas becomes a board:** four columns (Thinking, Planning, Doing, Done), swipeable sideways on phones.
  - Each card shows priority, title, notes preview, tags and date.
  - A "Move to next stage" button replaces the hidden click-the-badge trick. Done ideas can be reopened.
  - A + button on each column adds an idea straight into that stage.
  - The add/edit window has icon pickers for stage and priority, plus the "Connected people" field.
  - Search appears once there are more than 3 ideas.
  - Deleting an idea removes its soul links.
- **Queue redesign:** Watch, Listen, Read and Explore tabs, each row with a coloured icon tile.
  - The progress slider saves once when you let go. Before, it saved at every 5% step, and the saves could arrive out of order.
  - Start, Finish and Again buttons replace the cryptic badge cycling.
  - Dragging the slider to 100% marks the item finished.
  - The `notes` column (it was in the database but unused) is now editable and shown.
  - Delete asks for confirmation, and items in progress are listed first.
  - The page opens on the tab with the most unfinished items.
  - The database types now match the table: `notes` can be empty, and `due_date` is included.

**Next:** Places (map), Souls (list and profile), then Ratings, Mood, Search, Stats, Gallery, Theme, Login and the Games.

## Session 9 (26 Sep 2026, 23:45–23:58)
**Done**
- **Places:**
  - List of cards (photo or pin icon, stars, visit date, number of visits, notes, tags), with a List/Map switch.
  - Each card has "Visited again", "Directions" (only when the place is on the map), edit and delete.
  - Map:
    - Uses free CARTO tiles when no Mapbox token is set. Before, the map was blank without a token.
    - Tiles are dark or light to match the theme.
    - Zooms to fit every pin; pins are theme-coloured and grow when selected.
    - A detail panel shows below the map, and places without an address are listed with a hint.
  - The address is only looked up again when it changes. If it can't be found, the save tells you it won't be on the map.
  - Directions use Apple Maps on Apple devices (a link that works on Mac too) and Google Maps elsewhere.
  - Photos use the safe replace from session 7, and deleting a place also removes its photo and soul links.
  - Moved `directionsUrl` to `lib/geocode.ts`. Importing it from `MapView` pulled the map library into server rendering and broke the build; caught while building before delivery.
- **Souls:**
  - New shared `components/souls/SoulForm.tsx`, one form for the list and profile pages:
    - A live preview card, then emoji and colour pickers, role, since, about, private notes, tags and photo.
    - Saves the photo safely and can remove the person.
  - New `SoulAvatar`: their photo if they have one, otherwise their emoji on their colour.
  - List page: centred cards sorted by name with a glow in each person's colour, an edit button, and an "Add someone" card. Search appears once there are more than 6 people.

**Next:** soul profile page, then Ratings, Mood, Search, Stats, Gallery, Theme, Login and the Games.

## Session 10 (26–27 Sep 2026, 23:52–00:08)
**Done**
- **Profile photos are the main way to show people.**
  - In the add/edit form, the avatar at the top is the photo picker: tap to add or change a photo, with "Remove photo, use emoji" underneath. The emoji is labelled as the fallback.
  - Photos now appear everywhere a person does: Souls cards, the profile page, the dashboard, the "Connected people" picker and chips, and the journal @mention menu and chips (new `SoulAvatar` usage).
- **Soul profile page rebuilt:**
  - Header with a large photo or emoji avatar, glowing in their colour, plus name, role, since, about, tags and Edit (the shared `SoulForm`).
  - Tabs:
    - **Journal:** a timeline of entries that mention them.
    - **Favourites:** music, films and shows, places, each with an inline add form.
    - **Connected:** linked library, places, ratings, queue and ideas, grouped.
    - **Notes.**
  - Journal mentions come from the real `journal_entry_souls` links plus older entries with @Name in the text. Before, it was text-only and also matched titles loosely.
  - New `getJournalEntryIdsForSoul()` in `db.ts`.
  - Removing someone also deletes their photo.

**Next:** Ratings, Mood, Search, Stats, Gallery, Theme, Login and Reset password, then the Games.

## Session 11 (27 Sep 2026, 00:00–00:18)
Seven pages redesigned: three helpers worked in parallel under one set of conventions, then everything was reviewed, built and screenshotted.
- **Ratings:**
  - All 7 categories, including the missing Experience tab, each with an icon.
  - An average card for every category (only 5 showed before).
  - Group-by-stars view, plus Newest and A to Z sorts.
  - Delete is always visible and asks first. Soul links are cleaned up on delete.
- **Search:**
  - Debounced as you type, results grouped by section with highlighted matches.
  - Links go to the exact journal entry or soul.
  - "/" focuses the search box, Enter opens the top result, Esc clears.
  - Before typing, a card per section shows what's searchable.
- **Stats:**
  - A "This month" row.
  - Tiles with icons and accessible bar charts.
  - Mood colours come from her real moods; before they were hard-coded.
- **Gallery:**
  - Masonry polaroid board.
  - Upload several photos at once with progress, or drag and drop them onto the page.
  - The lightbox is a proper dialog: Esc, arrow keys, swipe, and a "3 of 12" counter.
  - Photos from other sections show a badge linking back and can't be deleted from here.
  - Load errors are reported instead of swallowed.
- **Mood Bubble:**
  - The canvas is sharp on high-resolution screens and resizes with the sidebar.
  - Animation stops when you leave the page, pauses in hidden tabs and respects reduced motion.
  - Safe colour maths, and tooltips work on touch.
  - Starter moods can no longer be added twice.
  - Logging panel with an intensity slider, and history grouped by day.
- **Theme:**
  - Preset cards show real previews.
  - Colour swatches with hex fields and a contrast check.
  - Save/Reset bar for unsaved changes. Leaving without saving reverts the preview and warns on tab close.
  - Only saved locally after the database save succeeds.
- **Login:**
  - Now centred properly (the hidden sidebar used to push it right).
  - Show/hide password, and a gentle shake on a wrong password (transitions.dev).
  - Friendlier messages, and it keeps where you were going.
- **Change password:**
  - Asks for the current password first.
  - Strength meter and a "Back to your world" link. Before there was no way back, because the sidebar is hidden on this page.
  - Clear success state.
- **Global:** the `no-sidebar` body class for auth pages, the shared `t-shake` animation, and no double focus rings.

**Next:** Games (logic bugs in chess, battleship, tic-tac-toe, kadi, matatu, sudoku; saving wins), the Arcade page, then a final pass (mobile check, remove leftover legacy code like `lib/token.ts` and `types/index.ts`) and deployment steps.

## Session 12 (27 Sep 2026, 00:50–01:05)
**Note:** the game rewrites below were found in the workspace, made between 00:18 and 00:23 by a run of this session that was never reported or saved. Nothing had been written to your PC. Before shipping I reviewed the fixes and played every game in a browser (no errors), then fixed the two problems I found.

**Done: games**
- **Shared pieces:**
  - `lib/games.ts`: `recordResult()` saves every finished game (it never breaks the game if saving fails), and `getGameStats()` returns totals, per-game records and the current streak.
  - `lib/cards.ts` and `components/games/PlayingCard` are shared by Kadi and Matatu.
  - `components/games/GameShell` gives every game the same header, difficulty switch, score and "How to play" section.
- **Arcade:** total wins, win streak, games played and win rate, plus each game's win/loss/draw record, all from real saved results. Before, it always showed 0 because nothing was ever saved. Removed an invented "Coming soon" section.
- **Chess:**
  - The computer undoes its trial moves properly. The broken `move('--')` trick corrupted the board it was thinking about.
  - The move history is kept, so threefold repetition works.
  - No duplicate `<script>`.
  - **Engine now bundled** (`chess.js@0.10.3` from npm) instead of downloaded from an outside website when the page opens, so chess can't fail to load.
  - Fixed squashed board ranks.
- **Battleship:**
  - Medium and hard now hunt around their hits. Before, the AI never switched into targeting mode.
  - Ship placement with rotate and shuffle, and an accuracy stat.
- **Tic-tac-toe:** you can't move while the computer is thinking. Scores no longer double. "Impossible" is saved as hard.
- **Sudoku:** every puzzle has exactly one solution, so a correct board can't be marked wrong.
- **Kadi and Matatu:** jokers no longer freeze the game. Question cards are answered by suit, and skips and penalties follow the rules.
  - Matatu: cutting with the 7 of the cut suit is correct, and penalties don't stack.
- `npm install` needed (new package: chess.js).

## Session 13 (27 Sep 2026, 09:43–10:00): final pass
- Checked all 26 pages at phone width (390px) with test data: no page scrolls sideways and there are no runtime errors.
- Fixed a hydration error when opening a new journal entry (the date was rendered differently on the server and in the browser).
- Kadi and Matatu: "Diamonds Or 7" now reads "Diamonds or any 7".
- **Cleanup:**
  - Removed 148 lines of dead code from `db.ts` and `supabase.ts`: old sign-in helpers, the dev password check, the old game session functions (replaced by `lib/games.ts`), and unused soul link and gallery helpers.
  - Deleted `lib/token.ts` and `types/index.ts` here. They're unused; delete them on your PC too.
- Lint: 0 errors, 0 warnings. Types: clean. Production build: passes.
- Added **DEPLOY.md** with step-by-step go-live instructions, including the one critical step: mark the baseline migration as applied on her database so it never re-runs.

## Session 14 (27 Sep 2026): two low-cost features
- **Daily journal prompt.** On a blank entry, a gentle question appears (for example "What made you smile today?"). "Start with this" drops it into the entry, and the shuffle button offers another. 18 prompts, in `lib/journal`. No database change.
- **Connect Four** added to the Arcade. Easy, Medium and Hard (the computer looks further ahead as the level rises, and always takes a win or blocks yours). Drop animation and a highlighted winning line. Results are saved, so it counts on the Arcade stats.
- **One small migration** `20260927120000_more_game_types.sql` widens the allowed game list so Connect Four (and future games) can save results. Safe on staging and on her project; it only widens a rule.

**Action:** on staging, `npx supabase db push` (applies the new migration), then `npm install` is not needed (no new packages).

## Session 15 (27 Sep 2026): Memory match
- **Memory** added to the Arcade. Flip cards to find pairs, and the cards are made from her own photos (Gallery, Souls, Places and Library). If there aren't enough photos, it fills the rest with colourful tiles, so it always works, even with no photos yet.
- Easy (6 pairs), Medium (8), Hard (12). Tracks moves, a timer and the best moves per level. Finishing records a win on the Arcade stats.
- No database change (reuses `getAllImages` and the game type added last session).

## Session 16 (28 Sep 2026): Bucket list
- **Places now holds dreams, not just memories.** Each place can be somewhere she's *been* or somewhere she *wants to go*.
- The Places list has two tabs: **Been** and **Want to go**, with counts. The subtitle reads "X visited, Y on the list".
- Wishlist places show a purple "Want to go" badge, a purple card border, and a **Mark as visited** button. One tap moves it to Been, stamps today's date and shows "You made it to <place>!".
- The add/edit form has a **"Somewhere I want to go"** toggle. When it's on, the date and times-visited fields are hidden, the rating reads "How keen are you?", and the notes and companions prompts change to future tense.
- On the **map**, wishlist places get purple pins (been places stay orange), with a small legend in the corner and an "On your bucket list" line in the popup.
- **One small migration** `20260928100000_places_wishlist.sql` adds a single `wishlist` column (default false) to the places table. Safe on staging and on her project; it adds a column with a default and touches no existing rows. Her existing places all stay as "been".

**Action:** on staging, `npx supabase db push` (applies the new migration). No `npm install` needed (no new packages).

## Session 17 (29 Sep 2026): calendar, toggle, pink theme, fonts
- **Proper date picker.** The native browser date popup is gone. A custom `DatePicker` (in `components/ui`) opens a themed month calendar — orange/purple, Comic font, rounded — with prev/next month, a "Today" ring on today's date, a filled gradient on the chosen day, dimmed out-of-month and disabled days, and a "Today"/"Clear" footer. It replaces every date field: Journal, Tasks (both the inline "Due" and the edit form) and Places. `FInput type="date"` now renders it automatically, so any future date field gets it for free.
- **Nicer toggle switch.** Bigger, with an inset track shadow, a soft gradient thumb with a highlight, and when on, an orange→purple gradient with a subtle glow (rgba throughout). Also a focus ring for keyboard users.
- **New theme: Bubblegum.** A pink-forward preset (pink accent, violet secondary, deep plum background). Sits alongside the existing presets on the Theme page.
- **Four new fonts** on the Theme page: **Handwriting** (Caveat), **Rounded** (Fredoka), **Modern** (Space Grotesk) and **Storybook** (Lora) — joining Comic, Georgia, Mono and System. Loaded from Google Fonts, so they show once the page has internet (they fall back gracefully offline).
- No database change. No new npm packages (fonts come from Google Fonts over the web).

## Session 18 (29 Sep 2026): detect location + live sync
- **"Use my location"** on the Places form. One tap asks the browser for her current position, names the spot (reverse-geocoded from OpenStreetMap) and drops the pin — no typing. It falls back gracefully if she blocks location or it can't find her, and the coordinates come straight from the device so they're exact.
- **Live sync across devices.** If she adds or changes something on her phone, the same page open on her laptop updates within about a second — and the other way round. It's powered by Supabase Realtime and wired into every data page (Dashboard, Tasks, Journal, Places, Souls, Library, Ideas, Queue, Ratings, Mood). Pages also refresh when the tab is brought back into focus, so nothing is stale after the laptop wakes.
- **One migration** `20260929100000_enable_realtime.sql` turns on Realtime broadcasting for the tables. It only adds them to Supabase's realtime publication — it broadcasts changes and never reads, changes or deletes any data. Row Level Security still applies, so each person only ever receives their own rows. Safe on staging and on her project, and re-runnable.

**Action:** on staging, `npx supabase db push` (applies the realtime migration). No `npm install` needed. Realtime is on by default for Supabase projects; if a table ever doesn't sync, check Database → Replication in the Supabase dashboard.

## Session 19 (29 Sep 2026): 2048
- **2048** added to the Arcade. Slide the tiles with arrow keys, WASD, or a swipe on her phone; matching numbers merge and double. Reach the 2048 tile to win, then "Keep going" to chase a higher score.
- Signature sliding-tile feel (tiles glide and pop), a warm colour ramp that climbs into the site's orange and purple at the top end, and a "Game over / Nice run" overlay.
- Score and a personal **Best** (kept on the device) show in the scoreboard. A win or a game-over is saved to the Arcade stats.
- No database change (the `g2048` game type was already allowed) and no new packages.

## Session 20 (29 Sep 2026): Daily Wordle
- **Daily Wordle** added to the Arcade. Six tries at one five-letter word, the same word for the whole day, resetting at midnight. Tiles flip to reveal: green (right letter, right place), yellow (right letter, wrong place), grey (not in the word), and the on-screen keyboard colours in to match.
- Type with the keyboard or tap the on-screen keys (works on her phone). Guesses are checked against a built-in dictionary of ~4,300 common words, with a gentle "Not in word list" nudge and a shake for a bad guess.
- Today's progress is saved on the device, so she can close the tab and come back to the same puzzle; the day's result (win or out of guesses) records once to the Arcade stats.
- New file `lib/words5.ts` holds the word lists (800 answers, generated from common-word frequencies). No database change and no new packages.

## Session 21 (29 Sep 2026): Word Search
- **Word Search** added to the Arcade. A themed grid of letters (Animals, Kitchen, Nature, Happy, Travel) with the hidden words listed beside it. Press on the first letter and drag to the last to trace a word; found words light up green and get struck off the list.
- Works with mouse or finger (drag across the grid). Words can run across, down, diagonally, and forwards or backwards depending on the level.
- Three levels: Easy (10x10, 7 words, straight lines only), Medium (12x12, 9 words, diagonals + reverse), Hard (14x14, 11 words). Each "New game" reshuffles the theme and layout. Finishing records a win on the Arcade stats.
- No database change (the `wordsearch` type was already allowed) and no new packages.

### The Arcade now has 11 games
Tic Tac Toe, Sudoku, Chess, Battleship, Kadi, Matatu, Connect Four, Memory, 2048, Daily Wordle, and Word Search — plus stats across all of them.

## Session 22 (30 Sep 2026): Bao
- **Bao** added to the Arcade: the Swahili sowing game, sitting alongside Kadi and Matatu. This is the learner's version (*Bao la Kujifunza*): four rows of eight pits, two seeds in each, and each player owns the two rows on their side.
- Tap a pit with two or more seeds, then choose **Clockwise** or **Anticlockwise**. Seeds are sown one per pit with a step-by-step animation. Landing in an occupied pit keeps the sowing going (relay), and landing in an occupied front-row pit captures the computer's seeds opposite, which are then sown into her front row from the nearer end.
- She wins when the computer's front row is empty or it has no pit with two or more seeds. The scoreboard shows seeds on each side plus wins and losses this session, and every result records to the Arcade stats.
- Three levels. Easy plays loosely (good for learning), Medium always takes the best capture it can see, and Hard plans a few turns ahead. Tested headlessly: across 2,000 random games no seeds were ever lost and every game ended, and each level clearly beats the one below it (Medium beats Easy 94%, Hard beats Medium 78%). The computer never thinks for more than about 50 ms.
- The rules engine lives in `games/bao/engine.ts`, separate from the board UI. No database change (the `bao` type was already allowed) and no new packages.

### The Arcade now has 12 games
Tic Tac Toe, Sudoku, Chess, Battleship, Kadi, Matatu, Connect Four, Memory, 2048, Daily Wordle, Word Search, and Bao.

## Session 23 (30 Sep 2026): birthdays, time capsule, year in colour, install on phone, backup
- **Birthdays for Souls.** Each person's form has a Birthday field (day, month, optional year). The dashboard has a Birthdays card counting down to the next few ("In 2 days · turning 30"), and a reminder banner appears 3 days before (dismissible for the day). Souls cards and profiles show the birthday too. With reminders turned on, a phone or computer notification also appears when she opens the site. It only works when she opens yourworld; a notification with the site closed would need a push server. No year = no age shown. 29 February birthdays are celebrated on 28 February in other years.
- **Time capsule** (new sidebar page). Write a letter, pick when it opens (quick picks: a month, 6 months, a year, New Year's Day, 5 years, or any date) and seal it. Sealed letters show as envelopes with a countdown and progress bar; on the day, the envelope glows, she taps "Open it", the flap lifts and the letter unfolds on lined paper. Opened letters stay readable.
  - **Letters from you:** `supabase/letters_for_her.sql` inserts a sealed letter "From Ian" into her account. It only inserts; the only thing it looks up is her account id. She can't read or delete it until the date.
- **Your year in colour** on the Mood page: one square per day, 12 months by 31 days, coloured by that day's strongest feeling. Tap a square to see the day's feelings; the legend counts days per feeling; switch between years.
- **Install on her phone.** Web app manifest, proper app icons (including Android's full-bleed icon and the iPhone home-screen icon), full-screen standalone mode, and a small service worker (installability, a friendly offline screen, notification taps). It never caches her data. The new **App & backup** page shows an Install button where the browser supports it, and step-by-step instructions on iPhone (Safari → Share → Add to Home Screen) and Android.
- **Back up everything** (App & backup page). One button downloads `yourworld-backup-<date>.zip` with `journal.html` (her journal as a readable book, plus opened letters), `backup.json` (every row of every table) and a `photos/` folder with every uploaded photo (optional). Built entirely in the browser with a small built-in zip writer; nothing is sent anywhere. Verified: the zip opens cleanly and every file's checksum passes.
- **Two migrations:** `20260930100000_soul_birthdays.sql` (one nullable column) and `20260930110000_time_capsules.sql` (new owner-only table, with live sync). Both are safe on her project. `seed_staging.sql` now adds birthdays and sample letters on staging. DEPLOY.md lists all six migrations for her project.

**Action:** on staging, `npx supabase db push`. No `npm install` needed.
