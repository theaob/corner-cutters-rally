-- Corner Cutters' backend (Supabase): the play stats and the Daily Challenge's board.
-- Run it once in the project's SQL editor (it can be run again: it replaces what it made).
-- The game only ever uses the public (anon) key: it can add events and reports (and their screenshots) and call the
-- functions granted to it below, nothing else.
-- Nothing personal is kept: a player is a random id made on the device, and their initials on the board.

-- ---------------------------------------------------------------- play stats
create table if not exists public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- the random id the device made for itself
  player uuid not null,
  kind text not null,
  platform text check (platform in ('web', 'android')),
  version text check (char_length(version) <= 40),
  circuit text check (char_length(circuit) <= 40),
  mode text check (char_length(mode) <= 20),
  -- km driven (a 'drive' event: since the last one), and a little more about the event
  km real check (km >= 0 and km < 5000),
  -- s in the game (a 'session' event: a stretch of a launch, while the page was showing; data.launch says which)
  seconds real check (seconds >= 0 and seconds <= 86400),
  data jsonb check (pg_column_size(data) <= 2000)
);
-- (run again on a project made before: the columns and kinds added since)
alter table public.events add column if not exists seconds real check (seconds >= 0 and seconds <= 86400);
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('launch', 'race_start', 'race_finish', 'drive', 'share', 'daily_submit', 'session', 'error'));
create index if not exists events_at on public.events (at);
create index if not exists events_kind on public.events (kind);
alter table public.events enable row level security;
drop policy if exists "the game adds events" on public.events;
create policy "the game adds events" on public.events for insert to anon with check (at > now() - interval '1 minute');
grant insert on public.events to anon;
revoke select, update, delete on public.events from anon;
-- (no reading them with the public key: the totals come from game_stats(), for the dashboard)

-- ---------------------------------------------------------------- the Daily Challenge's board
create table if not exists public.daily_times (
  day date not null,
  player uuid not null,
  -- three letters or digits, as on an arcade board
  name text not null check (name ~ '^[A-Z0-9]{3}$'),
  -- checkpoints passed before the clock ran out, and s from the clock starting to the last of them (the tie-break)
  score int not null check (score between 0 and 2000),
  time real not null check (time >= 0 and time < 7200),
  at timestamptz not null default now(),
  primary key (day, player)
);
create index if not exists daily_board on public.daily_times (day, score desc, time asc);
alter table public.daily_times enable row level security;
revoke all on public.daily_times from anon;
-- (no direct access with the public key: only submit_daily() and daily_board())

-- (run again on a project made before: the column added since) the run as driven, for others to chase as a ghost:
-- where the car was, 10 times a second, from the clock starting (src/f1/timeTrial.ts's Ghost)
alter table public.daily_times add column if not exists ghost jsonb check (pg_column_size(ghost) <= 200000);

-- A run of today's (or, round midnight, yesterday's or tomorrow's) challenge: kept if it's the player's best, with its
-- ghost if it came with one. (The one before, without the ghost, gone: a call without one takes the default.)
drop function if exists public.submit_daily(date, uuid, text, int, real);
create or replace function public.submit_daily(p_day date, p_player uuid, p_name text, p_score int, p_time real, p_ghost jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if abs(p_day - (now() at time zone 'utc')::date) > 1 then raise exception 'not a challenge being played'; end if;
  insert into daily_times (day, player, name, score, time, ghost) values (p_day, p_player, upper(p_name), p_score, p_time, p_ghost)
  on conflict (day, player) do update set
    name = excluded.name,
    score = case when (excluded.score, -excluded.time) > (daily_times.score, -daily_times.time) then excluded.score else daily_times.score end,
    time = case when (excluded.score, -excluded.time) > (daily_times.score, -daily_times.time) then excluded.time else daily_times.time end,
    ghost = case when (excluded.score, -excluded.time) > (daily_times.score, -daily_times.time) then excluded.ghost else daily_times.ghost end,
    at = case when (excluded.score, -excluded.time) > (daily_times.score, -daily_times.time) then now() else daily_times.at end;
end;
$$;
revoke all on function public.submit_daily(date, uuid, text, int, real, jsonb) from public;
grant execute on function public.submit_daily(date, uuid, text, int, real, jsonb) to anon;

-- The day's leading run that has a ghost (the best on the board, unless it came without one): its initials, how far,
-- how soon, and the ghost; null before there's one.
create or replace function public.daily_ghost(p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'score', score, 'time', time, 'ghost', ghost)
  from daily_times where day = p_day and ghost is not null order by score desc, time asc limit 1;
$$;
revoke all on function public.daily_ghost(date) from public;
grant execute on function public.daily_ghost(date) to anon;

-- A day's board: the top `p_top`, and the player's own place and run (if they have one), and how many have run it.
create or replace function public.daily_board(p_day date, p_player uuid, p_top int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  with ranked as (
    select player, name, score, time, rank() over (order by score desc, time asc) as place from daily_times where day = p_day
  )
  select jsonb_build_object(
    'entries', (select count(*) from ranked),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('place', place, 'name', name, 'score', score, 'time', time, 'you', player = p_player) order by place, time), '[]')
            from (select * from ranked order by place, time limit least(greatest(p_top, 1), 100)) t),
    'you', (select jsonb_build_object('place', place, 'name', name, 'score', score, 'time', time) from ranked where player = p_player)
  );
$$;
revoke all on function public.daily_board(date, uuid, int) from public;
grant execute on function public.daily_board(date, uuid, int) to anon;

-- ---------------------------------------------------------------- the Time Trial boards
-- Each player's best Time Trial lap on each circuit, in each weather, by their initials (as the Daily Challenge's).
create table if not exists public.lap_times (
  circuit text not null check (char_length(circuit) <= 40),
  weather text not null check (weather in ('dry', 'damp', 'wet')),
  player uuid not null,
  name text not null check (name ~ '^[A-Z0-9]{3}$'),
  time real not null check (time > 5 and time < 1200),
  version text check (char_length(version) <= 40),
  at timestamptz not null default now(),
  primary key (circuit, weather, player)
);
create index if not exists lap_board on public.lap_times (circuit, weather, time asc);
alter table public.lap_times enable row level security;
revoke all on public.lap_times from anon;
-- (no direct access with the public key: only submit_lap() and lap_board())

-- A lap: kept if it's the player's best there (their initials as they are now, either way).
create or replace function public.submit_lap(p_circuit text, p_weather text, p_player uuid, p_name text, p_time real, p_version text default null) returns void
language sql security definer set search_path = public as $$
  insert into lap_times (circuit, weather, player, name, time, version) values (p_circuit, p_weather, p_player, upper(p_name), p_time, p_version)
  on conflict (circuit, weather, player) do update set
    name = excluded.name,
    time = least(lap_times.time, excluded.time),
    version = case when excluded.time < lap_times.time then excluded.version else lap_times.version end,
    at = case when excluded.time < lap_times.time then now() else lap_times.at end;
$$;
revoke all on function public.submit_lap(text, text, uuid, text, real, text) from public;
grant execute on function public.submit_lap(text, text, uuid, text, real, text) to anon;

-- A circuit's board in a weather: the top `p_top`, the player's own place and lap (if they have one), and how many.
create or replace function public.lap_board(p_circuit text, p_weather text, p_player uuid, p_top int default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  with ranked as (
    select player, name, time, rank() over (order by time asc) as place from lap_times where circuit = p_circuit and weather = p_weather
  )
  select jsonb_build_object(
    'entries', (select count(*) from ranked),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('place', place, 'name', name, 'time', time, 'you', player = p_player) order by place, time), '[]')
            from (select * from ranked order by place, time limit least(greatest(p_top, 1), 100)) t),
    'you', (select jsonb_build_object('place', place, 'name', name, 'time', time) from ranked where player = p_player)
  );
$$;
revoke all on function public.lap_board(text, text, uuid, int) from public;
grant execute on function public.lap_board(text, text, uuid, int) to anon;

-- ---------------------------------------------------------------- reports
-- REPORT in the game (the pause screen, the menu's settings): what happened, in the player's words, and where; the
-- screenshot they drew on is in the 'reports' storage bucket, at `image` (by the day it was made). Read them in the
-- Table Editor (reports) and Storage (reports): the public key can only add them, never read them.
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  player uuid not null,
  platform text check (platform in ('web', 'android')),
  version text check (char_length(version) <= 40),
  circuit text check (char_length(circuit) <= 40),
  mode text check (char_length(mode) <= 20),
  -- the screen's size (390x844)
  screen text check (char_length(screen) <= 20),
  text text check (char_length(text) <= 1000),
  -- the screenshot's path in the 'reports' bucket (2026-10-04/<id>.jpg), if it went
  image text check (char_length(image) <= 120)
);
-- (run again on a project made before: the columns added since) the screenshot as it's shown on the dashboard's
-- reports, smaller (960 px at most, a JPEG as a data URL): the bucket's own copy can't be read with the public key
alter table public.reports add column if not exists picture text check (char_length(picture) <= 1500000);
create index if not exists reports_at on public.reports (at);
alter table public.reports enable row level security;
drop policy if exists "the game adds reports" on public.reports;
create policy "the game adds reports" on public.reports for insert to anon with check (at > now() - interval '1 minute');
grant insert on public.reports to anon;
revoke select, update, delete on public.reports from anon;

-- the screenshots: a private bucket (JPEGs, 3 MB at most), the game can only add to
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];
drop policy if exists "the game adds report screenshots" on storage.objects;
create policy "the game adds report screenshots" on storage.objects for insert to anon with check (bucket_id = 'reports');

-- The dashboard's REPORTS: read with a code of your own (its hash kept here, the code never), set once in the SQL
-- Editor:  select public.set_reports_code('a long code only you know');  (again to change it)
create table if not exists public.dashboard_codes (
  name text primary key,
  hash text not null
);
alter table public.dashboard_codes enable row level security;
revoke all on public.dashboard_codes from anon;
create or replace function public.set_reports_code(p_code text) returns void
language sql security definer set search_path = public as $$
  insert into dashboard_codes (name, hash) values ('reports', encode(sha256(convert_to(p_code, 'UTF8')), 'hex'))
  on conflict (name) do update set hash = excluded.hash;
$$;
-- (the SQL Editor only: never the public key)
revoke all on function public.set_reports_code(text) from public, anon;

-- The reports, newest first, `p_limit` at a time (before report `p_before`, for the next page): only with the code
-- (ok false, and why, without it: none set yet, or the wrong one).
create or replace function public.reports_list(p_code text, p_before bigint default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  want text := (select hash from dashboard_codes where name = 'reports');
  n int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if want is null then return jsonb_build_object('ok', false, 'why', 'no code set'); end if;
  if encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') <> want then return jsonb_build_object('ok', false, 'why', 'wrong code'); end if;
  return jsonb_build_object(
    'ok', true,
    'total', (select count(*) from reports),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', at, 'platform', platform, 'version', version, 'circuit', circuit,
      'mode', mode, 'screen', screen, 'text', text, 'image', image, 'picture', picture) order by id desc), '[]')
      from (select * from reports where p_before is null or id < p_before order by id desc limit n) r)
  );
end;
$$;
revoke all on function public.reports_list(text, bigint, int) from public;
grant execute on function public.reports_list(text, bigint, int) to anon;

-- The dashboard's ERRORS: the errors nothing caught in the game over the last 30 days (src/f1/crashes.ts), the same
-- one (its message, and where it was thrown) together: how often, for how many players, first and last seen, on which
-- versions, platforms and screens, and a stack; the most recent first. Only with the reports' code (as reports_list).
create or replace function public.errors_list(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  want text := (select hash from dashboard_codes where name = 'reports');
begin
  if want is null then return jsonb_build_object('ok', false, 'why', 'no code set'); end if;
  if encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') <> want then return jsonb_build_object('ok', false, 'why', 'wrong code'); end if;
  return jsonb_build_object(
    'ok', true,
    'errors', (select coalesce(jsonb_agg(e order by e->>'last' desc), '[]') from (
      select jsonb_build_object(
        'message', data->>'message', 'where', data->>'where', 'kind', min(data->>'kind'),
        'count', count(*), 'players', count(distinct player), 'first', min(at), 'last', max(at),
        'versions', jsonb_agg(distinct version), 'platforms', jsonb_agg(distinct platform), 'screens', jsonb_agg(distinct data->>'screen'),
        'stack', (array_agg(data->>'stack' order by at desc))[1]
      ) e
      from events where kind = 'error' and at > now() - interval '30 days'
      group by data->>'message', data->>'where'
      order by max(at) desc limit 50
    ) x)
  );
end;
$$;
revoke all on function public.errors_list(text) from public;
grant execute on function public.errors_list(text) to anon;

-- ---------------------------------------------------------------- the stats, for the dashboard
-- The totals: players, launches, races, km driven, all time, today and over the last 7 days, and by circuit and mode;
-- and each circuit's plays, km and minutes, by mode.
create or replace function public.game_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players', (select count(distinct player) from events),
    'players_today', (select count(distinct player) from events where at > date_trunc('day', now())),
    'players_7d', (select count(distinct player) from events where at > now() - interval '7 days'),
    'launches', (select count(*) from events where kind = 'launch'),
    'launches_today', (select count(*) from events where kind = 'launch' and at > date_trunc('day', now())),
    'races_started', (select count(*) from events where kind = 'race_start'),
    'races_finished', (select count(*) from events where kind = 'race_finish'),
    'km', (select coalesce(round(sum(km)::numeric, 1), 0) from events where kind = 'drive'),
    'shares', (select count(*) from events where kind = 'share'),
    'reports', (select count(*) from reports),
    'reports_today', (select count(*) from reports where at > date_trunc('day', now())),
    -- errors nothing caught in the game (their messages: errors_list, behind the dashboard's code)
    'errors', (select count(*) from events where kind = 'error'),
    'errors_today', (select count(*) from events where kind = 'error' and at > date_trunc('day', now())),
    -- time in the game: each launch's stretches summed, the median and the mean of them, and all of it
    'median_session_secs', (select coalesce(round(percentile_cont(0.5) within group (order by t)::numeric), 0) from
      (select sum(seconds) t from events where kind = 'session' group by player, data->>'launch') s),
    'mean_session_secs', (select coalesce(round(avg(t)::numeric), 0) from (select sum(seconds) t from events where kind = 'session' group by player, data->>'launch') s),
    'hours_played', (select coalesce(round((sum(seconds) / 3600)::numeric, 1), 0) from events where kind = 'session'),
    -- players who came back on another day, and races started per player
    'returning_players', (select count(*) from (select player from events group by player having count(distinct (at at time zone 'utc')::date) > 1) r),
    'races_per_player', (select coalesce(round(avg(n)::numeric, 1), 0) from (select count(*) n from events where kind = 'race_start' group by player) r),
    -- the team and driver picked for each session started
    'by_team', (select coalesce(jsonb_object_agg(t, n), '{}') from (select data->>'team' t, count(*) n from events where kind = 'race_start' and data ? 'team' group by 1) x),
    'by_driver', (select coalesce(jsonb_object_agg(d, n), '{}') from (select data->>'driver' d, count(*) n from events where kind = 'race_start' and data ? 'driver' group by 1) x),
    'daily_players_today', (select count(*) from daily_times where day = (now() at time zone 'utc')::date),
    -- the Time Trial boards: laps on them, and the drivers with one
    'board_laps', (select count(*) from lap_times),
    'board_drivers', (select count(distinct player) from lap_times),
    'by_platform', (select coalesce(jsonb_object_agg(platform, n), '{}') from (select platform, count(distinct player) n from events where platform is not null group by platform) p),
    'by_mode', (select coalesce(jsonb_object_agg(mode, n), '{}') from (select mode, count(*) n from events where kind = 'race_finish' and mode is not null group by mode) m),
    'by_circuit', (select coalesce(jsonb_object_agg(circuit, n), '{}') from (select circuit, count(*) n from events where kind = 'race_finish' and circuit is not null group by circuit) c),
    'daily_players', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'players', n) order by d), '[]') from
      (select (at at time zone 'utc')::date d, count(distinct player) n from events where at > now() - interval '30 days' group by 1) x),
    -- and the launches, and the time in the game (s), on each of the last 30 days
    'daily_launches', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'launches', n) order by d), '[]') from
      (select (at at time zone 'utc')::date d, count(*) n from events where kind = 'launch' and at > now() - interval '30 days' group by 1) x),
    'daily_seconds', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'seconds', n) order by d), '[]') from
      (select (at at time zone 'utc')::date d, round(sum(seconds)) n from events where kind = 'session' and at > now() - interval '30 days' group by 1) x),
    -- each circuit: the sessions started on it, the races finished, the km driven and the minutes on it (a 'drive'
    -- event's data.seconds), all of it and by mode; the most played first
    'circuits', (select coalesce(jsonb_agg(jsonb_build_object('circuit', circuit, 'plays', plays, 'finishes', finishes, 'km', km, 'minutes', minutes, 'modes', modes)
      order by plays desc, minutes desc, circuit), '[]') from (
        select circuit, sum(plays) plays, sum(finishes) finishes, round(sum(km)::numeric, 1) km, round(sum(secs)::numeric / 60, 1) minutes,
          jsonb_object_agg(mode, jsonb_build_object('plays', plays, 'finishes', finishes, 'km', round(km::numeric, 1), 'minutes', round(secs::numeric / 60, 1))) modes
        from (
          select circuit, coalesce(mode, '?') mode,
            count(*) filter (where kind = 'race_start') plays,
            count(*) filter (where kind = 'race_finish') finishes,
            coalesce(sum(km) filter (where kind = 'drive'), 0) km,
            coalesce(sum(case when jsonb_typeof(data->'seconds') = 'number' then (data->>'seconds')::real end) filter (where kind = 'drive'), 0) secs
          from events where circuit is not null and kind in ('race_start', 'race_finish', 'drive') group by 1, 2
        ) by_mode group by circuit
      ) c)
  );
$$;
revoke all on function public.game_stats() from public;
grant execute on function public.game_stats() to anon;
