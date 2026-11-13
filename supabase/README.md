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

## Keeping the backend safe

The public key is in every build, so everything the game may do, anyone may do. What guards it (all in `schema.sql`, and
none of it changes how builds already on phones talk to the project):

- **Signed-in users get nothing.** Supabase grants new tables and functions to the `authenticated` role as well as
  `anon`; `schema.sql` takes that back, so nobody who signs up with the public key can call `set_reports_code` and read
  the reports. Also turn **Authentication → Sign In / Providers → "Allow new users to sign up"** off in the project:
  the game never signs anyone in.
- **Caps on what the game adds directly.** `events` 600 an hour per player and 3,000 per address, `reports` 10 and 40,
  report screenshots 40 per address. Past a cap the row is quietly dropped (the game is told it went).
- **Where a request came from** is Cloudflare's `cf-connecting-ip`, else `x-real-ip`, else the last `x-forwarded-for`
  entry, never the first (the sender writes that one). To see what was recorded: `select ip, count(*) from submit_log group by 1;`
- **Guessing the reports code**: ten wrong codes from one address in 15 minutes lock it out for the rest of the 15
  (`code_attempts`). The dashboard says so.
- **The totals** (`game_stats()`, `retention_stats()`) keep their last answer for 3 and 30 minutes, so the dashboard can't
  load the database however often it's called. They're recomputed by the first call after that.
- **A report's picture** is kept only if it's a JPEG data URL (the dashboard shows nothing else).
- **`schema_version()`** is the schema's version; the dashboard (`src/stats/schemaVersion.ts`) says when the project is
  behind. Raise both with any change the game or the dashboard depends on.

## Cheating on the boards

The public key is in every build, so anyone can call `submit_lap` and `submit_daily` with whatever they like. They check before keeping a run:

- A lap quicker than half the circuit's ideal lap (`lap_floors`), or on a circuit not listed there, is dropped. **Add a row to `lap_floors` with every new circuit**, or its laps are dropped.
- A Daily run has to take at least 3 s per checkpoint.
- A player id can send 60 runs an hour, and one IP address 120 (the address as above); more raises `too many submissions`.
- A player in `banned_players` is ignored.

To clean up a cheat: delete its row in `lap_times` or `daily_times` in the Table Editor, and add the player id to `banned_players`. This stops the obvious fakes, not a careful one who posts a believable time. A ghost check on the server would be the next step.

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

Each carries the game's logbook too (`src/engine/logbook.ts`), as much as the event's 2,000 bytes hold: the device
(`device`: the phone's model, Android and WebView versions, graphics chip, memory, cores, screen and the race's quality
level) and the last notes of what led up to it (`crumbs`: screens opened, the race's session and phase, buttons
pressed, the controls lap's steps, pausing, the app hidden and shown, the console's warnings and errors), each with the
seconds since launch. Two problems that throw nothing are sent as errors the same way: **Freeze** (a frame more than
2 s late with the game in sight, not while a screen's being built behind the curtain: `Freeze: 2-5 s without a frame`,
`5-10`, `over 10`) and **WebGL context lost** (the phone took the graphics away from a race). Find them in the
`events` table's `data`.

A report carries the logbook as well, in the `reports` table's `log` column: the device and the last 60 notes, as they
were when REPORT was pressed. A project made before the column was added takes the reports without it until
`schema.sql` is run again.

**On the dashboard**, ERRORS (under REPORTS) has how many there are, all time and today, and, opened with the reports
code, the last 30 days' errors, the same one together: how often, for how many players, first and last seen, on which
platforms, versions and screens, and the latest stack. (`errors_list` in `schema.sql`.)

## Seeing the stats

**The dashboard** (`stats.html`, `src/stats/main.ts`) shows them, live:
- the totals: players (all time, today, last 7 days), launches, races finished and started (and per player), km driven, time per visit (the median, and the mean), hours played, players who came back another day, results shared, and today's Daily Challenge players;
- who players pick: the most and least picked team (ties named together, the never-picked ones at 0), and every team by sessions started;
- players, launches and time played per day over the last 30 days (time in minutes, or in hours once a day's had three or more);
- players by platform, and finished sessions by mode and by circuit;
- each circuit: the times it's been played (sessions started), the races finished, the km driven and the minutes on it, and each of those by mode (every circuit listed, the unplayed ones faint);
- retention: how many players were back 1, 7 and 30 days after the day they first played, overall and for each of the last 14 days' newcomers (`retention_stats()` in `schema.sql`; run it again to add it). It only counts the events already sent, so nothing new is collected;
- today's Daily Challenge board.

It refreshes every minute. `.github/workflows/stats.yml` publishes it to GitHub Pages, at https://theaob.github.io/corner-cutters-rally/. To switch it on, once: **Settings → Pages → Build and deployment → Source: GitHub Actions**, then **Actions → stats → Run workflow**. After that it redeploys itself when the dashboard changes. It reads with the same public key as the game, and shows only totals (no player's events). `npm run stats` runs it locally (with `.env.local` as above).

In the SQL Editor:
`select public.game_stats();` gives the totals (players all time, today and over 7 days, launches,
races started and finished, km driven, shares, Daily Challenge players today, players by platform, finished races by
mode and circuit, players per day over the last 30 days, and each circuit's plays, finishes, km and minutes, by mode: `circuits`; the minutes come from the time on the circuit each `drive` event carries in `data.seconds`). The raw events are in the `events` table.
