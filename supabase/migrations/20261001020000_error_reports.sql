-- Error reports, kept in our own database: no third party and no client
-- library. One row per distinct error, grouped by a fingerprint the app
-- computes (lib/errors/normalize.ts: the error's name, its message with
-- numbers and ids taken out, and the top frames of its stack), counted each
-- time it happens, with a count per day for the daily summary.
--
-- What a row holds is where and what, never who: the route as a pattern
-- (/[org]/[project]/d/[docId], never a real address, id or query string),
-- the message and stack with ids and numbers taken out, and the release. No
-- account id, address, cookie, header, request body or document content.
-- Only the server's secret key and the database owner read or write it.
-- Rows not seen for 30 days are deleted by the daily cron.

create table private.error_reports (
  fingerprint text primary key check (char_length(fingerprint) between 1 and 128),
  source text not null check (source in ('server', 'browser')),
  name text not null check (char_length(name) <= 200),
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 4000),
  route text not null check (char_length(route) <= 200),
  release text check (char_length(release) <= 64),
  count bigint not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index error_reports_last_seen_idx on private.error_reports (last_seen);
create index error_reports_first_seen_idx on private.error_reports (source, first_seen);

-- How often each error happened on each day (UTC), for the daily summary.
create table private.error_days (
  fingerprint text not null references private.error_reports (fingerprint) on delete cascade,
  day date not null,
  count bigint not null default 1,
  primary key (fingerprint, day)
);

revoke all on private.error_reports, private.error_days from public, anon, authenticated;
grant select, delete on private.error_reports, private.error_days to service_role;

-- Counts one occurrence. A known error gets its count and last_seen raised
-- (and the latest release and sample); a new one is added, unless
-- p_daily_new_limit is given and that many new errors from the same source
-- were already added today, which keeps a flood of made-up errors out.
-- Returns 'counted', 'new' or 'refused'.
create function public.record_error(
  p_fingerprint text,
  p_source text,
  p_name text,
  p_message text,
  p_stack text,
  p_route text,
  p_release text default null,
  p_daily_new_limit integer default null
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_outcome text := 'counted';
begin
  update private.error_reports
  set count = count + 1, last_seen = now(),
      release = coalesce(left(p_release, 64), release)
  where fingerprint = p_fingerprint;

  if not found then
    if p_daily_new_limit is not null and (
      select count(*) from private.error_reports r
      where r.source = p_source and r.first_seen >= v_today::timestamp at time zone 'utc'
    ) >= p_daily_new_limit then
      return 'refused';
    end if;

    insert into private.error_reports (fingerprint, source, name, message, stack, route, release)
    values (p_fingerprint, p_source, left(coalesce(p_name, 'Error'), 200), left(coalesce(p_message, ''), 1000),
            left(p_stack, 4000), left(coalesce(p_route, 'unknown'), 200), left(p_release, 64))
    on conflict (fingerprint) do update
      set count = private.error_reports.count + 1, last_seen = now();
    v_outcome := 'new';
  end if;

  insert into private.error_days (fingerprint, day) values (p_fingerprint, v_today)
  on conflict (fingerprint, day) do update set count = private.error_days.count + 1;

  return v_outcome;
end;
$$;

-- Deletes the errors not seen for 30 days, with their days, and the days
-- older than that of errors still seen. Returns how many errors went.
create function public.delete_old_errors()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from private.error_reports where last_seen < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  delete from private.error_days where day < ((now() - interval '30 days') at time zone 'utc')::date;
  return v_deleted;
end;
$$;

-- A UTC day's errors for the daily summary: how many times anything went
-- wrong, how many distinct errors, and the five that happened most, each
-- with whether it was new that day.
create function public.daily_errors(p_day date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'occurrences', coalesce((select sum(d.count) from private.error_days d where d.day = p_day), 0),
    'distinct', (select count(*) from private.error_days d where d.day = p_day),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
               'source', t.source, 'route', t.route, 'name', t.name, 'message', t.message,
               'count', t.count, 'first_seen', t.first_seen,
               'new', (t.first_seen at time zone 'utc')::date = p_day)
             order by t.count desc, t.first_seen)
      from (select r.source, r.route, r.name, r.message, d.count, r.first_seen
            from private.error_days d
            join private.error_reports r on r.fingerprint = d.fingerprint
            where d.day = p_day
            order by d.count desc, r.first_seen
            limit 5) t), '[]')
  );
$$;

revoke execute on function public.record_error(text, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.delete_old_errors() from public, anon, authenticated;
revoke execute on function public.daily_errors(date) from public, anon, authenticated;
grant execute on function public.record_error(text, text, text, text, text, text, text, integer) to service_role;
grant execute on function public.delete_old_errors() to service_role;
grant execute on function public.daily_errors(date) to service_role;
