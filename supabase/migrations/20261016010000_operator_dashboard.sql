-- The operator's dashboard (/admin): how many accounts there are, how far
-- each got, and what went wrong, from the step record and the error reports
-- the daily summary already reads (account_steps, error_reports). Nothing in
-- it is anyone's content, and nothing comes from request logs.
--
-- Who may see it is the operators table, filled by hand on each server:
--   insert into private.operators (user_id)
--   select id from auth.users where email = '<your sign-in address>';
-- An operator's own account is left out of every count.

create table private.operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

revoke all on private.operators from public, anon, authenticated;

create function private.is_operator(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.operators o where o.user_id = p_user_id);
$$;

revoke execute on function private.is_operator(uuid) from public, anon, authenticated;

-- Everything the page shows, for an operator; null for anyone else, so the
-- page can answer "not found" without saying there is anything here.
create function public.operator_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null or not private.is_operator(auth.uid()) then
    return null;
  end if;

  return (
    with people as (
      select a.*
      from private.account_activity a
      where not exists (select 1 from private.operators o where o.user_id = a.user_id)
    ), steps as (
      select s.step, count(*) as accounts
      from private.account_steps s
      where not exists (select 1 from private.operators o where o.user_id = s.user_id)
      group by s.step
    ), days as (
      select d::date as day
      from generate_series(v_today - 29, v_today, interval '1 day') d
    )
    select jsonb_build_object(
      'totals', jsonb_build_object(
        'accounts', (select count(*) from people),
        'new_this_week', (select count(*) from people where signed_up_at > now() - interval '7 days'),
        'imported', (select count(*) from people where repositories_imported > 0),
        'came_back', (select count(*) from people where came_back),
        'pro', (select count(*) from people where plan = 'Pro')
      ),
      -- In the order a new account usually meets them (the enum's order).
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('step', e.step::text, 'accounts', coalesce(s.accounts, 0))
                         order by e.ordinal)
        from unnest(enum_range(null::private.account_step)) with ordinality as e(step, ordinal)
        left join steps s on s.step = e.step), '[]'),
      'sign_ups_by_day', (
        select jsonb_agg(jsonb_build_object(
                 'day', d.day,
                 'accounts', (select count(*) from people p where (p.signed_up_at at time zone 'utc')::date = d.day))
               order by d.day)
        from days d),
      'accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'email', p.email,
                 'signed_up_at', p.signed_up_at,
                 'signed_up_with', p.signed_up_with,
                 'confirmed', p.confirmed,
                 'projects', p.projects_created,
                 'repositories', p.repositories_imported,
                 'whiteboards', p.whiteboards_created,
                 'pages', p.pages_created,
                 'came_back', p.came_back,
                 'plan', p.plan,
                 'last_active_at', p.last_active_at,
                 'steps', p.steps)
               order by p.signed_up_at desc)
        from (select * from people order by signed_up_at desc limit 50) p), '[]'),
      'errors_this_week', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'source', t.source, 'route', t.route, 'name', t.name, 'message', t.message,
                 'count', t.count, 'first_seen', t.first_seen)
               order by t.count desc, t.first_seen)
        from (select r.source, r.route, r.name, r.message, sum(d.count) as count, r.first_seen
              from private.error_days d
              join private.error_reports r on r.fingerprint = d.fingerprint
              where d.day > v_today - 7
              group by r.fingerprint, r.source, r.route, r.name, r.message, r.first_seen
              order by sum(d.count) desc, r.first_seen
              limit 10) t), '[]')
    )
  );
end;
$$;

revoke execute on function public.operator_dashboard() from public, anon;
grant execute on function public.operator_dashboard() to authenticated;
