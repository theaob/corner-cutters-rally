# The backend (Supabase)

The game talks to one Supabase project for two things, and plays on fine without it (offline, or before it's set up):

- **Play stats**: anonymous events (the game launched, a race started or finished, km driven, a result shared, an
  error nothing caught), so you can see how many players there are, what they play and what goes wrong on their devices. A player is a random id made on the device; STATS in the
  settings turns it off.
- **The Daily Challenge's board**: each day's best runs, by three initials, top 100 and your own place; the leading run's ghost, for everyone to chase.
- **The Time Trial boards**: everyone's best lap on each circuit in each weather (`lap_times`), by the same initials.
- **Reports**: REPORT on the pause screen (or in the top right corner of any menu screen) takes a screenshot of the game, lets
  the player draw on it and say what happened, and sends it: the words to the `reports` table, the picture to the
  private `reports` storage bucket.

## Setting it up (once)

1. Make a free project at [supabase.com](https://supabase.com) (any name and region).
2. In its **SQL Editor**, paste all of [`schema.sql`](schema.sql) and run it.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
4. In GitHub, **Settings → Secrets and variables → Actions → Variables**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   with those two values. (The anon key is meant to be public: it can only add events and call the board's functions.)
5. Push (or re-run the itch.io and android workflows): the builds pick them up.

For a local build, put them in `.env.local` as `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_ANON_KEY=…`.

## Updating it

When `schema.sql` changes, paste all of it into the SQL Editor again and run it. It's safe to run over the project as it is: it keeps every event and run, and adds what's new. For example, the time in the game, and the team and driver picks on the dashboard, need the `seconds` column and the `session` kind, added after the first version.

## Reading the reports

**On the dashboard** (the REPORTS section at the bottom), newest first, 20 at a time: each one's screenshot (tap it
for full size), what the player wrote, when, the circuit and mode (or which menu screen), web or android, the version and the
screen's size. They're private: the dashboard asks for your reports code, which you set once in the **SQL Editor**:

```sql
select public.set_reports_code('a long code only you know');
```

(Run it again to change it.) Only its hash is kept, and the public key can't set or change it. A browser that's opened
them remembers the code till you press LOCK.

**In Supabase** too: each report is a row in **Table Editor → reports** (its `picture` the dashboard's smaller copy of
the screenshot), and the full-size screenshot is in **Storage → reports**, in a folder for each day (UTC), at the path
in `image`. The game can only add reports and pictures, never read them.

## Reading the errors

An error nothing caught in the game (thrown, or a promise refused with nobody waiting on it: `src/f1/crashes.ts`) is
sent as an `error` event: its message, where it was thrown (file:line:col), its stack, and the screen it happened on
(the menu's screens, or a race with its circuit and mode). Each one once a launch and at most 10 a launch; none from a
browser extension; nothing with STATS off. They're sent in a batch of their own, so a project whose schema is older
refuses only them, not the play stats with them: run `schema.sql` again to take them.

**On the dashboard**, ERRORS (under REPORTS) has how many there are, all time and today, and, opened with the reports
code, the last 30 days' errors, the same one together: how often, for how many players, first and last seen, on which
platforms, versions and screens, and the latest stack. (`errors_list` in `schema.sql`.)

## Seeing the stats

**The dashboard** (`stats.html`, `src/stats/main.ts`) shows them, live:
- the totals: players (all time, today, last 7 days), launches, races finished and started (and per player), km driven, time per visit (the median, and the mean), hours played, players who came back another day, results shared, and today's Daily Challenge players;
- who players pick: the most and least picked team and driver (ties named together, the never-picked ones at 0), and every team and driver by sessions started;
- players, launches and time played per day over the last 30 days (time in minutes, or in hours once a day's had three or more);
- players by platform, and finished sessions by mode and by circuit;
- each circuit: the times it's been played (sessions started), the races finished, the km driven and the minutes on it, and each of those by mode (every circuit listed, the unplayed ones faint);
- today's Daily Challenge board.

It refreshes every minute. `.github/workflows/stats.yml` publishes it to GitHub Pages, at https://theaob.github.io/corner-cutters/. To switch it on, once: **Settings → Pages → Build and deployment → Source: GitHub Actions**, then **Actions → stats → Run workflow**. After that it redeploys itself when the dashboard changes. It reads with the same public key as the game, and shows only totals (no player's events). `npm run stats` runs it locally (with `.env.local` as above).

In the SQL Editor:
`select public.game_stats();` gives the totals (players all time, today and over 7 days, launches,
races started and finished, km driven, shares, Daily Challenge players today, players by platform, finished races by
mode and circuit, players per day over the last 30 days, and each circuit's plays, finishes, km and minutes, by mode: `circuits`; the minutes come from the time on the circuit each `drive` event carries in `data.seconds`). The raw events are in the `events` table.
