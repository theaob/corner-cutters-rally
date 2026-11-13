-- Corner Cutters' backend (Supabase): the play stats and the Daily Challenge's board.
-- Run it once in the project's SQL editor (it can be run again: it replaces what it made).
-- The game only ever uses the public (anon) key: it can add events and reports (and their screenshots) and call the
-- functions granted to it below, nothing else.
-- Nothing personal is kept: a player is a random id made on the device, and their initials on the board.
-- Builds already on phones keep working against every change here: no table, column, function signature or grant they
-- use is removed or narrowed (what's added is checks that quietly drop abuse, never errors for a normal player).

-- ---------------------------------------------------------------- play stats
create table if not exists public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- the random id the device made for itself
  player uuid not null,
  kind text not null,
  platform text check (platform in ('web', 'android', 'ios')),
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
-- (the iOS app reports as 'ios'; run again on a project made before, which only knew 'web' and 'android')
alter table public.events drop constraint if exists events_platform_check;
alter table public.events add constraint events_platform_check check (platform in ('web', 'android', 'ios'));
create index if not exists events_at on public.events (at);
create index if not exists events_kind on public.events (kind);
-- (the dashboard's totals look events up by kind and day, and by player)
create index if not exists events_kind_at on public.events (kind, at);
create index if not exists events_player_at on public.events (player, at);
alter table public.events enable row level security;
drop policy if exists "the game adds events" on public.events;
create policy "the game adds events" on public.events for insert to anon with check (at > now() - interval '1 minute');
grant insert on public.events to anon;
revoke select, update, delete on public.events from anon;
-- (no reading them with the public key: the totals come from game_stats(), for the dashboard)

-- ---------------------------------------------------------------- guarding the boards
-- The public key is in every build, so anyone can call the submit functions with anything. These are the checks they make
-- before keeping a run: a circuit's quickest believable lap, a cap on how often one address can send, and a ban list.
-- (The boards' tables stay closed to the public key; clean one up in the Table Editor, or ban a player id:
--    insert into banned_players (player) values ('<the player id>') on conflict do nothing;
--  and remove their rows from daily_times and lap_times.)
create table if not exists public.banned_players (player uuid primary key, at timestamptz not null default now());
alter table public.banned_players enable row level security;
revoke all on public.banned_players from anon;

-- Half of each circuit's ideal lap (the racing line's speed all the way round: cutting corners saves
-- a little, never half). A circuit missing here takes no laps: add it with the circuit.
create table if not exists public.lap_floors (circuit text primary key, seconds real not null);
alter table public.lap_floors enable row level security;
revoke all on public.lap_floors from anon;
insert into public.lap_floors (circuit, seconds) values
  ('crescent-park', 16.2), ('southern-lake', 14.8), ('jade-spiral', 15.2), ('silver-heath', 16.3), ('harbour', 13.9),
  ('maple-island', 15.0), ('royal-park', 14.9), ('ardennes', 21.5), ('alpine-ring', 13.2), ('twin-lakes', 12.4),
  ('oasis', 14.1), ('pearl-sands', 14.9), ('baku', 17.1), ('suzuka', 16.1), ('dune-coast', 16.9), ('vegas', 19.5),
  ('glacier-pass', 16.6), ('dust-bowl', 9.8), ('volcano-isle', 12.7)
on conflict (circuit) do update set seconds = excluded.seconds;

-- Where a request came from. The first entry of x-forwarded-for is whatever the sender wrote, so it isn't used first:
-- Cloudflare's own header (cf-connecting-ip), then x-real-ip, then the LAST entry of x-forwarded-for (the one the
-- nearest proxy added). Null when none of them is there (the limits then go by player only).
create or replace function public.request_ip() returns text
language sql stable set search_path = public as $$
  select coalesce(
    nullif(trim(h ->> 'cf-connecting-ip'), ''),
    nullif(trim(h ->> 'x-real-ip'), ''),
    nullif((string_to_array(replace(coalesce(h ->> 'x-forwarded-for', ''), ' ', ''), ','))[cardinality(string_to_array(replace(coalesce(h ->> 'x-forwarded-for', ''), ' ', ''), ','))], '')
  )
  from (select coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json) as h) x;
$$;
revoke all on function public.request_ip() from public, anon, authenticated;

-- Who sent what, when: for the limit below (a day's worth is kept).
create table if not exists public.submit_log (at timestamptz not null default now(), player uuid not null, ip text);
create index if not exists submit_log_at on public.submit_log (at);
create index if not exists submit_log_player_at on public.submit_log (player, at);
create index if not exists submit_log_ip_at on public.submit_log (ip, at);
alter table public.submit_log enable row level security;
revoke all on public.submit_log from anon;

-- Raises when this player (or the address it came from) has sent too much lately, and says whether to keep the run
-- (false for a banned player: they're told nothing, and it goes nowhere).
create or replace function public.submit_allowed(p_player uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := request_ip();
begin
  if exists (select 1 from banned_players where player = p_player) then return false; end if;
  if random() < 0.02 then delete from submit_log where at < now() - interval '1 day'; end if;
  if (select count(*) from submit_log where player = p_player and at > now() - interval '1 hour') >= 60
     or (v_ip is not null and (select count(*) from submit_log where ip = v_ip and at > now() - interval '1 hour') >= 120) then
    raise exception 'too many submissions';
  end if;
  insert into submit_log (player, ip) values (p_player, v_ip);
  return true;
end;
$$;
revoke all on function public.submit_allowed(uuid) from public, anon, authenticated;

-- The same for what the game adds straight to events and reports, and to the reports' screenshots: a cap an hour per
-- player and per address. Over it a row is quietly dropped (the game is told it went, as with a banned player), so a
-- script can't fill the database and a normal player never notices.
create table if not exists public.insert_log (at timestamptz not null default now(), what text not null, player uuid, ip text);
create index if not exists insert_log_player on public.insert_log (what, player, at);
create index if not exists insert_log_ip on public.insert_log (what, ip, at);
create index if not exists insert_log_at on public.insert_log (at);
alter table public.insert_log enable row level security;
revoke all on public.insert_log from anon;

create or replace function public.insert_allowed(p_what text, p_player uuid, p_per_player int, p_per_ip int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ip text := request_ip();
begin
  if p_player is not null and exists (select 1 from banned_players where player = p_player) then return false; end if;
  if random() < 0.02 then delete from insert_log where at < now() - interval '1 day'; end if;
  if p_player is not null and (select count(*) from insert_log where what = p_what and player = p_player and at > now() - interval '1 hour') >= p_per_player then return false; end if;
  if v_ip is not null and (select count(*) from insert_log where what = p_what and ip = v_ip and at > now() - interval '1 hour') >= p_per_ip then return false; end if;
  insert into insert_log (what, player, ip) values (p_what, p_player, v_ip);
  return true;
end;
$$;
revoke all on function public.insert_allowed(text, uuid, int, int) from public, anon, authenticated;

-- (events: 600 an hour a player, 3,000 an address, which a phone sharing a carrier address with many others stays under)
create or replace function public.events_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if insert_allowed('event', new.player, 600, 3000) then return new; end if;
  return null;
end;
$$;
revoke all on function public.events_guard() from public, anon, authenticated;
drop trigger if exists events_guard on public.events;
create trigger events_guard before insert on public.events for each row execute function public.events_guard();

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
  -- a checkpoint is a third of a lap (racing.ts SECTORS): no run passes them faster than the quickest circuit's lap floor allows
  if p_score < 1 or p_time < p_score * 3 then return; end if;
  if not submit_allowed(p_player) then return; end if;
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
-- Each set of initials is on it once, with its best run (the same person on two devices, or after a reinstall, has
-- two player ids); `you` is whoever's initials those are, so your own place is the one you see.
create or replace function public.daily_board(p_day date, p_player uuid, p_top int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (name) name, score, time, bool_or(player = p_player) over (partition by name) as mine
    from daily_times where day = p_day order by name, score desc, time asc
  ), ranked as (
    select name, score, time, mine, rank() over (order by score desc, time asc) as place from best
  )
  select jsonb_build_object(
    'entries', (select count(*) from ranked),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('place', place, 'name', name, 'score', score, 'time', time, 'you', mine) order by place, time), '[]')
            from (select * from ranked order by place, time limit least(greatest(p_top, 1), 100)) t),
    'you', (select jsonb_build_object('place', place, 'name', name, 'score', score, 'time', time) from ranked where mine)
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
language plpgsql security definer set search_path = public as $$
begin
  -- a lap no one could drive (or on a circuit that isn't one) is dropped, as if it were kept: the game has nothing to retry
  if not exists (select 1 from lap_floors where circuit = p_circuit and p_time >= seconds) then return; end if;
  if not submit_allowed(p_player) then return; end if;
  insert into lap_times (circuit, weather, player, name, time, version) values (p_circuit, p_weather, p_player, upper(p_name), p_time, p_version)
  on conflict (circuit, weather, player) do update set
    name = excluded.name,
    time = least(lap_times.time, excluded.time),
    version = case when excluded.time < lap_times.time then excluded.version else lap_times.version end,
    at = case when excluded.time < lap_times.time then now() else lap_times.at end;
end;
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
  platform text check (platform in ('web', 'android', 'ios')),
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
-- what led up to the report (the game's logbook, engine/logbook.ts): the device (model, Android and WebView versions,
-- graphics chip, memory, screen, quality level) and the last notes (screens opened, the race's phases, buttons
-- pressed, the app hidden and shown, warnings, errors, freezes)
alter table public.reports add column if not exists log jsonb check (pg_column_size(log) <= 20000);
alter table public.reports drop constraint if exists reports_platform_check;
alter table public.reports add constraint reports_platform_check check (platform in ('web', 'android', 'ios'));
create index if not exists reports_at on public.reports (at);
alter table public.reports enable row level security;
drop policy if exists "the game adds reports" on public.reports;
create policy "the game adds reports" on public.reports for insert to anon with check (at > now() - interval '1 minute');
grant insert on public.reports to anon;
revoke select, update, delete on public.reports from anon;

-- (reports: 10 an hour a player, 40 an address; and the dashboard only ever shows a JPEG as the picture, so any other
-- kind of picture is let go while the report itself is kept)
create or replace function public.reports_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not insert_allowed('report', new.player, 10, 40) then return null; end if;
  if new.picture is not null and new.picture not like 'data:image/jpeg;base64,%' then new.picture := null; end if;
  return new;
end;
$$;
revoke all on function public.reports_guard() from public, anon, authenticated;
drop trigger if exists reports_guard on public.reports;
create trigger reports_guard before insert on public.reports for each row execute function public.reports_guard();

-- the screenshots: a private bucket (JPEGs, 3 MB at most), the game can only add to
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];
-- (40 an hour an address; the policy asks this function, as the storage table can't take a trigger from here)
create or replace function public.report_shot_allowed() returns boolean
language sql security definer set search_path = public as $$
  select insert_allowed('shot', null, 0, 40);
$$;
revoke all on function public.report_shot_allowed() from public, authenticated;
grant execute on function public.report_shot_allowed() to anon;
drop policy if exists "the game adds report screenshots" on storage.objects;
create policy "the game adds report screenshots" on storage.objects for insert to anon
  with check (bucket_id = 'reports' and public.report_shot_allowed());

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
-- (the SQL Editor only: never the public key, and never a signed-in user: Supabase grants new functions to the
-- `authenticated` role too, so anyone who could sign up could otherwise set the code and read every report)
revoke all on function public.set_reports_code(text) from public, anon, authenticated;

-- Guesses at the reports' code: each wrong one is kept (with the address it came from) for a day, and ten in 15 minutes
-- lock that address out for the rest of the 15 minutes. Gives null when the code is right, or why not.
create table if not exists public.code_attempts (at timestamptz not null default now(), ip text not null);
create index if not exists code_attempts_ip on public.code_attempts (ip, at);
alter table public.code_attempts enable row level security;
revoke all on public.code_attempts from anon;
create or replace function public.reports_code_check(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  want text := (select hash from dashboard_codes where name = 'reports');
  v_ip text := coalesce(request_ip(), 'unknown');
begin
  if random() < 0.02 then delete from code_attempts where at < now() - interval '1 day'; end if;
  if (select count(*) from code_attempts where ip = v_ip and at > now() - interval '15 minutes') >= 10 then return 'too many attempts'; end if;
  if want is null then return 'no code set'; end if;
  if encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex') <> want then
    insert into code_attempts (ip) values (v_ip);
    return 'wrong code';
  end if;
  return null;
end;
$$;
revoke all on function public.reports_code_check(text) from public, anon, authenticated;

-- The reports, newest first, `p_limit` at a time (before report `p_before`, for the next page): only with the code
-- (ok false, and why, without it: none set yet, or the wrong one).
create or replace function public.reports_list(p_code text, p_before bigint default null, p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bad text := reports_code_check(p_code);
  n int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if bad is not null then return jsonb_build_object('ok', false, 'why', bad); end if;
  return jsonb_build_object(
    'ok', true,
    'total', (select count(*) from reports),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', at, 'platform', platform, 'version', version, 'circuit', circuit,
      'mode', mode, 'screen', screen, 'text', text, 'image', image, 'picture', picture, 'log', log) order by id desc), '[]')
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
language plpgsql security definer set search_path = public as $$
declare
  bad text := reports_code_check(p_code);
begin
  if bad is not null then return jsonb_build_object('ok', false, 'why', bad); end if;
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

-- The dashboard's CLEAR: errors let go, one of them (its message and where, as errors_list groups them) or every one
-- (p_all), at any age; only with the reports' code. Gives back how many went.
create or replace function public.errors_clear(p_code text, p_message text default null, p_where text default null, p_all boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bad text := reports_code_check(p_code);
  n int;
begin
  if bad is not null then return jsonb_build_object('ok', false, 'why', bad); end if;
  delete from events where kind = 'error'
    and (coalesce(p_all, false) or (data->>'message' is not distinct from p_message and data->>'where' is not distinct from p_where));
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'cleared', n);
end;
$$;
revoke all on function public.errors_clear(text, text, text, boolean) from public;
grant execute on function public.errors_clear(text, text, text, boolean) to anon;

-- The dashboard's DELETE: a report let go (p_id), or every one (p_id null); only with the reports' code. (A picture
-- uploaded to Storage stays there: Supabase lets its files go only from Storage itself.)
create or replace function public.reports_delete(p_code text, p_id bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bad text := reports_code_check(p_code);
  n int;
begin
  if bad is not null then return jsonb_build_object('ok', false, 'why', bad); end if;
  delete from reports where p_id is null or id = p_id;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'cleared', n);
end;
$$;
revoke all on function public.reports_delete(text, bigint) from public;
grant execute on function public.reports_delete(text, bigint) to anon;

-- ---------------------------------------------------------------- the stats, for the dashboard
-- The totals: players, launches, races, km driven, all time, today and over the last 7 days, and by circuit and mode;
-- and each circuit's plays, km and minutes, by mode.
create or replace function public.game_stats_compute() returns jsonb
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
revoke all on function public.game_stats_compute() from public, anon, authenticated;

-- The totals are public and cost about 30 scans of events, so what the dashboard calls keeps the last answer for 3
-- minutes (retention_stats(): 30) and hands that out; one caller at a time works out a new one. (Same name, arguments
-- and answer as before.)
create table if not exists public.stats_cache (name text primary key, at timestamptz not null default now(), value jsonb not null);
alter table public.stats_cache enable row level security;
revoke all on public.stats_cache from anon;

create or replace function public.game_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.stats_cache;
  v jsonb;
begin
  select * into c from stats_cache where name = 'game_stats';
  if found and c.at > now() - interval '3 minutes' then return c.value; end if;
  if found and not pg_try_advisory_xact_lock(hashtext('game_stats')) then return c.value; end if;
  v := game_stats_compute();
  insert into stats_cache (name, value) values ('game_stats', v)
  on conflict (name) do update set value = excluded.value, at = now();
  return v;
end;
$$;
revoke all on function public.game_stats() from public;
grant execute on function public.game_stats() to anon;

-- Retention: players grouped by the (UTC) day their random id first appeared, and how many of each group were back
-- exactly 1, 7 and 30 days later (any event counts as being active: a launch is the first). Only counts, from the
-- events already sent; nothing new is collected. The last 60 cohorts.
create or replace function public.retention_stats_compute() returns jsonb
language sql stable security definer set search_path = public as $$
  with seen as (select distinct player, (at at time zone 'utc')::date as d from events),
  firsts as (select player, min(d) as f from seen group by player),
  cohorts as (
    select f.f as day, count(*) as size,
      count(*) filter (where exists (select 1 from seen s where s.player = f.player and s.d = f.f + 1)) as d1,
      count(*) filter (where exists (select 1 from seen s where s.player = f.player and s.d = f.f + 7)) as d7,
      count(*) filter (where exists (select 1 from seen s where s.player = f.player and s.d = f.f + 30)) as d30
    from firsts f where f.f > (now() at time zone 'utc')::date - 60 group by f.f
  )
  select jsonb_build_object(
    'today', (now() at time zone 'utc')::date,
    'cohorts', coalesce(jsonb_agg(jsonb_build_object('day', day, 'size', size, 'd1', d1, 'd7', d7, 'd30', d30) order by day), '[]')
  ) from cohorts;
$$;
revoke all on function public.retention_stats_compute() from public, anon, authenticated;
create or replace function public.retention_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.stats_cache;
  v jsonb;
begin
  select * into c from stats_cache where name = 'retention_stats';
  if found and c.at > now() - interval '30 minutes' then return c.value; end if;
  if found and not pg_try_advisory_xact_lock(hashtext('retention_stats')) then return c.value; end if;
  v := retention_stats_compute();
  insert into stats_cache (name, value) values ('retention_stats', v)
  on conflict (name) do update set value = excluded.value, at = now();
  return v;
end;
$$;
revoke all on function public.retention_stats() from public;
grant execute on function public.retention_stats() to anon;

-- ---------------------------------------------------------------- keeping the schema and the game in step
-- The schema is applied by hand, so the dashboard asks which one it's talking to and says when it's behind
-- (src/stats/schemaVersion.ts has the number it expects; tests/schema.test.ts keeps the two equal). Raise it with every
-- change that something in the game or the dashboard depends on.
--   1: the first (no schema_version function at all)   2: the guards, the reports' guess limit, the cached totals
create or replace function public.schema_version() returns int
language sql immutable as $$ select 2 $$;
revoke all on function public.schema_version() from public;
grant execute on function public.schema_version() to anon;

-- ---------------------------------------------------------------- signed-in users get nothing
-- The game never signs anyone in (and Authentication's sign-ups should be off in the project), but Supabase grants new
-- tables and functions to `authenticated` as well as `anon`; take that back, here and for whatever is added later.
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;
revoke all on all functions in schema public from authenticated;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on functions from authenticated;
