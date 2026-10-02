-- What new accounts do, for the operator: a record of the first time each
-- account reached a few key steps, and a view of every account built from
-- that and from the data that already exists.
--
-- First-party and server-side: no script in the browser and no cookie. A
-- step is a row being created (a trigger records it), or something the
-- app's server sees (it calls record_step). Only the step's name and when it
-- was first reached are kept, never what anyone wrote, titles, or
-- addresses. The steps are the account's and go with it: the table
-- references auth.users, so delete_account, and deleting the user in the
-- dashboard, delete them.
--
-- Nothing here is readable by a person or an agent. The operator reads it in
-- the SQL editor (docs/OPERATIONS.md); the app's server, with its secret key,
-- reads one day of it for the daily summary email.

---------------------------------------------------------------------------
-- The steps
---------------------------------------------------------------------------

-- In the order a new account usually meets them.
create type private.account_step as enum (
  'signed_up',
  'opened_github_import',
  'imported_repository',
  'imported_files',
  'created_project',
  'created_whiteboard',
  'made_edit',
  'invited_someone',
  'connected_agent',
  'opened_billing',
  'upgraded',
  -- Did something on a later day (UTC) than the one it signed up on.
  'came_back'
);

create table private.account_steps (
  user_id uuid not null references auth.users (id) on delete cascade,
  step private.account_step not null,
  reached_at timestamptz not null default now(),
  primary key (user_id, step)
);
create index account_steps_reached_at_idx on private.account_steps (reached_at);

-- The accounts the operator has been emailed about (one email per sign-up),
-- so that two servers, or two pages loading at once, send it once.
create table private.sign_up_emails (
  user_id uuid primary key references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

revoke all on private.account_steps, private.sign_up_emails from public, anon, authenticated;
grant select on private.account_steps to service_role;

-- Records that an account reached a step, the first time only. Any step
-- reached on a later day than the sign-up also means it came back. An
-- account signed up when it was created. Does
-- nothing for an id that is not an account, so it never turns away the
-- write it is recording.
create function private.reach_step(p_user_id uuid, p_step private.account_step)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.account_steps (user_id, step, reached_at)
  select distinct u.id, s.step, case when s.step = 'signed_up' then coalesce(u.created_at, now()) else now() end
  from auth.users u
  cross join (values (p_step), ('came_back'::private.account_step)) s (step)
  where u.id = p_user_id
    and (s.step = p_step
         or (p_step <> 'signed_up'
             and (u.created_at at time zone 'utc')::date < (now() at time zone 'utc')::date))
  on conflict do nothing;
$$;

revoke execute on function private.reach_step(uuid, private.account_step) from public;

-- Whether this write is an import's: what a repository or file import
-- creates and writes is not someone making a whiteboard or an edit. The
-- importer says so with a request header (IMPORT_HEADER, in
-- lib/sync/server-document.ts), which PostgREST hands to the database with
-- every request. Anyone can send it; all it changes is which of their own
-- steps are recorded.
create function private.writing_an_import()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-subcanvas-import', '') <> '';
$$;

---------------------------------------------------------------------------
-- Steps that are rows being created
---------------------------------------------------------------------------

-- Every auth user gets a profile and a personal workspace, and has signed up.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, lower(new.email), v_name, new.raw_user_meta_data ->> 'avatar_url');

  perform private.create_personal_workspace(new.id, v_name, lower(new.email));
  perform private.reach_step(new.id, 'signed_up');
  return new;
end;
$$;

-- A project made with New project, by a person or an agent. One imported
-- from a repository has a source, and is recorded when the import succeeds.
create function private.reach_created_project()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.source is null then
    perform private.reach_step(new.created_by, 'created_project');
  end if;
  return null;
end;
$$;

create trigger reach_created_project
after insert on public.projects
for each row execute function private.reach_created_project();

-- A whiteboard of the project's own (not a description), unless an import
-- drew it. Once per statement: an import inserts dozens of rows at once.
create function private.reach_created_whiteboard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.writing_an_import() then
    perform private.reach_step(d.created_by, 'created_whiteboard')
    from (select distinct created_by from inserted
          where type = 'whiteboard' and kind = 'standard' and created_by is not null) d;
  end if;
  return null;
end;
$$;

create trigger reach_created_whiteboard
after insert on public.documents
referencing new table as inserted
for each statement execute function private.reach_created_whiteboard();

-- A change to a document, in the editor or by the person's agent. What an
-- import writes into the documents it creates is not an edit.
create function private.reach_made_edit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.writing_an_import() then
    perform private.reach_step(u.created_by, 'made_edit')
    from (select distinct created_by from inserted where created_by is not null) u;
  end if;
  return null;
end;
$$;

create trigger reach_made_edit
after insert on public.document_updates
referencing new table as inserted
for each statement execute function private.reach_made_edit();

-- An invite, made or renewed.
create function private.reach_invited_someone()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.reach_step(new.invited_by, 'invited_someone');
  return null;
end;
$$;

create trigger reach_invited_someone
after insert or update of invited_by on public.org_invites
for each row execute function private.reach_invited_someone();

-- A workspace's subscription starts being paid. Its owners are the ones
-- who can pay (R6.3), so it is their step.
create function private.reach_upgraded()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.is_paid_status(new.status)
     and (tg_op = 'INSERT' or not private.is_paid_status(old.status))
  then
    perform private.reach_step(m.user_id, 'upgraded')
    from public.org_members m
    where m.org_id = new.org_id and m.role = 'owner';
  end if;
  return null;
end;
$$;

create trigger reach_upgraded
after insert or update of status on public.subscriptions
for each row execute function private.reach_upgraded();

---------------------------------------------------------------------------
-- Steps the app's server sees
---------------------------------------------------------------------------

-- Called by the server, as the signed-in person, for steps that are not a
-- row of their own: opening a dialog or a page, an import that succeeded,
-- letting an agent in. A person could call it for themselves; it records
-- only their own steps, and only these.
create function public.record_step(p_step text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;
  if p_step is null or p_step not in
     ('opened_github_import', 'imported_repository', 'imported_files', 'connected_agent', 'opened_billing')
  then
    raise exception 'Not a step the app records.' using errcode = '22023';
  end if;
  perform private.reach_step((select auth.uid()), p_step::private.account_step);
end;
$$;

-- Called when a signed-in person opens a workspace. Records that they came
-- back, on a later day than they signed up. In an account's first day it
-- also answers whether the operator is still to be told about the sign-up,
-- and claims that email, so it is sent once whoever asks first.
create function public.record_visit()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_signed_up_at timestamptz;
  v_claimed integer := 0;
begin
  select created_at into v_signed_up_at from auth.users where id = v_uid;
  if not found then
    return false;
  end if;

  if (v_signed_up_at at time zone 'utc')::date < (now() at time zone 'utc')::date then
    insert into private.account_steps (user_id, step) values (v_uid, 'came_back')
    on conflict do nothing;
  end if;

  if v_signed_up_at > now() - interval '1 day' then
    insert into private.sign_up_emails (user_id) values (v_uid) on conflict do nothing;
    get diagnostics v_claimed = row_count;
  end if;
  return v_claimed > 0;
end;
$$;

revoke execute on function public.record_step(text) from public, anon;
revoke execute on function public.record_visit() from public, anon;
grant execute on function public.record_step(text) to authenticated;
grant execute on function public.record_visit() to authenticated;

---------------------------------------------------------------------------
-- Accounts as they were before this migration
---------------------------------------------------------------------------

-- What the rows already say exactly. The other steps start from now.
insert into private.account_steps (user_id, step, reached_at)
select id, 'signed_up', created_at from auth.users
on conflict do nothing;

insert into private.account_steps (user_id, step, reached_at)
select p.created_by,
       case when p.source is null then 'created_project' else 'imported_repository' end::private.account_step,
       min(p.created_at)
from public.projects p
where p.created_by is not null and (p.source is null or p.source ->> 'provider' = 'github')
group by p.created_by, p.source is null
on conflict do nothing;

---------------------------------------------------------------------------
-- One row per account, for the operator
---------------------------------------------------------------------------

-- Built from what already exists, plus the steps. Read in the SQL editor:
--   select * from private.account_activity order by signed_up_at desc;
-- Owned by the database owner, so it reads auth's tables; granted to nobody
-- but the server's secret key.
create view private.account_activity as
with steps as (
  select s.user_id,
         array_agg(s.step::text order by s.reached_at, s.step) as steps,
         jsonb_object_agg(s.step, s.reached_at) as step_times
  from private.account_steps s
  group by s.user_id
), made_teams as (
  select o.created_by as user_id, count(*) as created
  from public.orgs o
  where o.personal_owner is null and o.created_by is not null
  group by o.created_by
), joined_teams as (
  select m.user_id, count(*) as joined
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  where o.personal_owner is null and o.created_by is distinct from m.user_id
  group by m.user_id
), projects as (
  select p.created_by as user_id,
         count(*) as created,
         count(*) filter (where p.source ->> 'provider' = 'github') as from_github
  from public.projects p
  where p.created_by is not null
  group by p.created_by
), documents as (
  select d.created_by as user_id,
         count(*) filter (where d.type = 'whiteboard') as whiteboards,
         count(*) filter (where d.type = 'text') as pages
  from public.documents d
  where d.created_by is not null and d.kind = 'standard'
  group by d.created_by
), invites as (
  select i.invited_by as user_id, count(*) as open
  from public.org_invites i
  where i.invited_by is not null
  group by i.invited_by
), pro as (
  select distinct m.user_id
  from public.org_members m
  join public.subscriptions s on s.org_id = m.org_id
  where m.role = 'owner' and private.is_paid_status(s.status)
), edits as (
  select e.created_by as user_id, max(e.created_at) as last_edit_at
  from public.document_updates e
  where e.created_by is not null
  group by e.created_by
), sessions as (
  select x.user_id, max(greatest(x.updated_at, x.refreshed_at at time zone 'utc')) as last_active_at
  from auth.sessions x
  group by x.user_id
)
select
  u.id as user_id,
  u.email::text as email,
  u.created_at as signed_up_at,
  -- email, google or github: how the account was first signed in to.
  coalesce(u.raw_app_meta_data ->> 'provider', 'email') as signed_up_with,
  u.email_confirmed_at is not null as confirmed,
  personal.slug as personal_workspace,
  coalesce(made_teams.created, 0) as team_workspaces_created,
  coalesce(joined_teams.joined, 0) as team_workspaces_joined,
  coalesce(projects.created, 0) as projects_created,
  coalesce(projects.from_github, 0) as repositories_imported,
  -- Imported files leave no mark on what they create, only the step.
  coalesce('imported_files' = any (steps.steps), false) as imported_files,
  coalesce(documents.whiteboards, 0) as whiteboards_created,
  coalesce(documents.pages, 0) as pages_created,
  -- Invites that are still open. An accepted invite is deleted, so the step
  -- invited_someone says whether they ever sent one.
  coalesce(invites.open, 0) as invites_open,
  case when pro.user_id is null then 'Free' else 'Pro' end as plan,
  u.last_sign_in_at,
  -- The last time a session of theirs was used, in the app or by an agent.
  greatest(u.last_sign_in_at, sessions.last_active_at) as last_active_at,
  -- The latest of their edits still in the log. A document's log is
  -- compacted into a snapshot every couple of hundred edits, so this can be
  -- earlier than their real last edit, or empty.
  edits.last_edit_at,
  coalesce(
    'came_back' = any (steps.steps)
    or (u.last_sign_in_at at time zone 'utc')::date > (u.created_at at time zone 'utc')::date
    or (sessions.last_active_at at time zone 'utc')::date > (u.created_at at time zone 'utc')::date
    or (edits.last_edit_at at time zone 'utc')::date > (u.created_at at time zone 'utc')::date,
    false) as came_back,
  coalesce(steps.steps, '{}') as steps,
  coalesce(steps.step_times, '{}') as step_times
from auth.users u
left join public.orgs personal on personal.personal_owner = u.id
left join steps on steps.user_id = u.id
left join made_teams on made_teams.user_id = u.id
left join joined_teams on joined_teams.user_id = u.id
left join projects on projects.user_id = u.id
left join documents on documents.user_id = u.id
left join invites on invites.user_id = u.id
left join pro on pro.user_id = u.id
left join edits on edits.user_id = u.id
left join sessions on sessions.user_id = u.id;

revoke all on private.account_activity from public, anon, authenticated;
grant select on private.account_activity to service_role;

---------------------------------------------------------------------------
-- One day of it, for the daily summary email
---------------------------------------------------------------------------

-- A UTC day: the accounts that signed up during it, with every step each
-- has reached so far; the accounts that signed up earlier and were active
-- during it (signed in, used a session, edited, or reached a step), with the
-- steps they reached that day; how many accounts reached each step for the
-- first time that day; and how many accounts there were at its end. Only
-- the server's secret key may call it (api/cron/daily-summary).
create function public.daily_activity(p_day date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with bounds as (
    select (p_day::timestamp at time zone 'utc') as starts,
           ((p_day + 1)::timestamp at time zone 'utc') as ends
  ), seen as (
    select s.user_id from private.account_steps s, bounds b
    where s.reached_at >= b.starts and s.reached_at < b.ends
    union
    select u.id from auth.users u, bounds b
    where u.last_sign_in_at >= b.starts and u.last_sign_in_at < b.ends
    union
    select x.user_id from auth.sessions x, bounds b
    where greatest(x.updated_at, x.refreshed_at at time zone 'utc') >= b.starts
      and greatest(x.updated_at, x.refreshed_at at time zone 'utc') < b.ends
    union
    select e.created_by from public.document_updates e, bounds b
    where e.created_by is not null and e.created_at >= b.starts and e.created_at < b.ends
  ), accounts as (
    select a.user_id, a.email, a.signed_up_at, a.signed_up_with, a.signed_up_at >= b.starts as new
    from private.account_activity a, bounds b
    where (a.signed_up_at >= b.starts and a.signed_up_at < b.ends)
       or (a.signed_up_at < b.starts and a.user_id in (select user_id from seen))
  ), steps as (
    select s.user_id,
           jsonb_agg(jsonb_build_object('step', s.step, 'at', s.reached_at) order by s.reached_at, s.step) as every,
           jsonb_agg(jsonb_build_object('step', s.step, 'at', s.reached_at) order by s.reached_at, s.step)
             filter (where s.reached_at >= b.starts and s.reached_at < b.ends) as that_day
    from private.account_steps s, bounds b
    where s.user_id in (select user_id from accounts)
    group by s.user_id
  )
  select jsonb_build_object(
    'day', p_day,
    'accounts', (select count(*) from auth.users u, bounds b where u.created_at < b.ends),
    'new', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', a.email, 'signed_up_at', a.signed_up_at, 'signed_up_with', a.signed_up_with,
               'steps', coalesce(s.every, '[]'))
             order by a.signed_up_at)
      from accounts a left join steps s on s.user_id = a.user_id
      where a.new), '[]'),
    'returning', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', a.email, 'signed_up_at', a.signed_up_at, 'signed_up_with', a.signed_up_with,
               'steps', coalesce(s.that_day, '[]'))
             order by a.signed_up_at)
      from accounts a left join steps s on s.user_id = a.user_id
      where not a.new), '[]'),
    'steps', coalesce((
      select jsonb_object_agg(x.step, x.accounts)
      from (select s.step, count(*) as accounts
            from private.account_steps s, bounds b
            where s.reached_at >= b.starts and s.reached_at < b.ends
            group by s.step) x), '{}')
  );
$$;

revoke execute on function public.daily_activity(date) from public, anon, authenticated;
grant execute on function public.daily_activity(date) to service_role;
