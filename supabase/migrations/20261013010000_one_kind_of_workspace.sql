-- One kind of workspace.
--
-- Personal and team workspaces were two kinds that behaved almost the same:
-- a personal one could not have anyone invited to it, be left, or be
-- deleted except with its account. Now there is one kind. Every account
-- still gets a first workspace when it is created, named after the person,
-- and it is an ordinary workspace: they can invite people to it (a second
-- editor needs a paid plan, as anywhere: private.enforce_editor_limit),
-- rename it, leave it if someone else owns it, or delete it. Someone left
-- with no workspace is asked to make one (app: auth/home, /onboarding).
--
-- Deleting an account deletes every workspace nobody else is in, and leaves
-- the others, as it did for team workspaces.
--
-- Nothing in a workspace changes. orgs.personal_owner goes: with nothing
-- behaving differently because of it, it would only keep the old split in
-- the schema.

---------------------------------------------------------------------------
-- The rules that only applied to a personal workspace
---------------------------------------------------------------------------

drop trigger guard_personal_workspace_members on public.org_members;
drop function private.guard_personal_workspace_members();

drop trigger guard_personal_workspace on public.orgs;
drop function private.guard_personal_workspace();

drop trigger delete_personal_workspace on public.profiles;
drop function private.delete_personal_workspace();

-- A person who goes takes every workspace nobody else is in with them, and
-- first. Left to the foreign keys, their membership would go and the
-- workspace stay, empty and nobody's; and what they made in it would have
-- its created_by cleared in the same pass, in an order Postgres does not
-- promise. Deleted here, before the profile row, everything in it is gone
-- before anything else is touched. Covers every way a profile goes:
-- delete_account (which has already deleted them, and refused if one had a
-- running subscription), and deleting the user in the dashboard.
create function private.delete_lone_workspaces()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.orgs o
  where exists (select 1 from public.org_members m where m.org_id = o.id and m.user_id = old.id)
    and not exists (select 1 from public.org_members m where m.org_id = o.id and m.user_id <> old.id);
  return old;
end;
$$;

create trigger delete_lone_workspaces
before delete on public.profiles
for each row execute function private.delete_lone_workspaces();

drop trigger refuse_personal_workspace_invites on public.org_invites;
drop function private.refuse_personal_workspace_invites();

-- Every workspace always has at least one owner. Skipped when the workspace
-- itself is being deleted: the cascade removes every member, and the
-- workspace's row is gone by the time it reaches them.
create or replace function private.protect_last_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.orgs where id = old.org_id)
     and not exists (
       select 1 from public.org_members
       where org_id = old.org_id and role = 'owner' and user_id <> old.user_id
     )
  then
    raise exception 'A workspace must have at least one owner.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

---------------------------------------------------------------------------
-- An account's first workspace
---------------------------------------------------------------------------

-- Creates the workspace an account starts with, named after the person:
-- their name from Google or GitHub, else the part of their email before the
-- @. The address is made the same way (private.workspace_slug), with a
-- number added when it is taken or is one the app reserves (orgs.slug's
-- checks decide which, so a route reserved later is respected too).
create function private.create_first_workspace(p_user_id uuid, p_name text, p_email text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id uuid;
  v_base text := coalesce(nullif(trim(p_name), ''), nullif(trim(split_part(p_email, '@', 1)), ''));
  v_name text;
  v_slug_base text;
  v_slug text;
  v_attempt integer := 1;
  v_next integer;
begin
  -- 68 characters of name and "'s workspace" make the 80 a name may have.
  v_name := case when v_base is null then 'My workspace'
                 else rtrim(left(v_base, 68)) || '''s workspace' end;
  v_slug_base := coalesce(
    nullif(private.workspace_slug(v_base), ''),
    nullif(private.workspace_slug(split_part(p_email, '@', 1)), ''),
    'workspace');
  v_slug := v_slug_base;

  loop
    begin
      insert into public.orgs (name, slug, created_by)
      values (v_name, v_slug, p_user_id)
      returning id into v_org_id;
      exit;
    exception when unique_violation or check_violation then
      if v_attempt >= 20 then
        raise;
      end if;
      -- The next number after the highest one already taken.
      select coalesce(max((regexp_match(slug, '^' || v_slug_base || '-([0-9]{1,6})$'))[1]::integer), 1) + 1
      into v_next
      from public.orgs
      where slug like v_slug_base || '-%';
      v_slug := v_slug_base || '-' || greatest(v_next, v_attempt + 1);
      v_attempt := v_attempt + 1;
    end;
  end loop;

  insert into public.org_members (org_id, user_id, role) values (v_org_id, p_user_id, 'owner');
  return v_org_id;
end;
$$;

revoke execute on function private.create_first_workspace(uuid, text, text) from public;

-- Every auth user gets a profile and a first workspace, and has signed up.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, lower(new.email), v_name, new.raw_user_meta_data ->> 'avatar_url');

  perform private.create_first_workspace(new.id, v_name, lower(new.email));
  perform private.reach_step(new.id, 'signed_up');
  return new;
end;
$$;

drop function private.create_personal_workspace(uuid, text, text);

---------------------------------------------------------------------------
-- Deleting an account
---------------------------------------------------------------------------

-- What deleting a person's account does to each workspace they are in:
--   delete      a workspace nobody else is in goes, with everything in it;
--   leave       they leave a workspace that has other people in it, and
--               what they made there stays: it is those people's too;
--   only_owner  refused: they are the only owner of a workspace that has
--               other members, who would be left without one;
--   subscribed  refused: a workspace that would be deleted has a running
--               subscription, which would go on charging a card for a
--               workspace that is gone (as private.protect_subscribed_org).
-- By name. The shape changes (no `personal`), so both are made again.
drop function public.account_deletion_plan();
drop function private.account_deletion_plan(uuid);

create function private.account_deletion_plan(p_user_id uuid)
returns table (org_id uuid, org_name text, org_slug text, outcome text)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.slug,
    case
      when others.members = 0 and exists (
        select 1 from public.subscriptions s
        where s.org_id = o.id and private.is_paid_status(s.status) and not s.cancel_at_period_end
      ) then 'subscribed'
      when others.members = 0 then 'delete'
      when m.role = 'owner' and others.owners = 0 then 'only_owner'
      else 'leave'
    end
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  cross join lateral (
    select count(*) filter (where x.user_id <> p_user_id) as members,
           count(*) filter (where x.user_id <> p_user_id and x.role = 'owner') as owners
    from public.org_members x
    where x.org_id = o.id
  ) others
  where m.user_id = p_user_id
  order by o.name, o.id;
$$;

revoke execute on function private.account_deletion_plan(uuid) from public;

-- The same, for the person signed in, so Profile can say what will happen
-- before anything does.
create function public.account_deletion_plan()
returns table (org_id uuid, org_name text, org_slug text, outcome text)
language sql stable security definer set search_path = ''
as $$
  select * from private.account_deletion_plan((select auth.uid()));
$$;

revoke execute on function public.account_deletion_plan() from public, anon;
grant execute on function public.account_deletion_plan() to authenticated;

-- Deletes an account, in one transaction: the workspaces nobody else is in,
-- then the auth user, whose cascade takes the profile and every membership.
-- Where the person made something in a workspace that stays, the row stays
-- and no longer says who made it. Refused, with nothing changed, when the
-- plan above says so.
--
-- Returns the pictures and videos of the deleted workspaces, which Storage
-- does not delete with the rows: the caller removes them through the
-- Storage API. Called by the app's server with its secret key, once it has
-- checked who is asking, and by the operator from SQL. Never by a person or
-- an agent directly: a token that leaked would be enough to delete them.
create or replace function public.delete_account(p_user_id uuid)
returns table (bucket_id text, name text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_blocker record;
  v_doomed uuid[];
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'There is no such account.' using errcode = 'P0002';
  end if;

  -- Nobody joins one of these workspaces while this runs: joining takes a
  -- lock on the workspace's row that this one holds until the end.
  perform 1 from public.orgs o
  where o.id in (select m.org_id from public.org_members m where m.user_id = p_user_id)
  for update;

  select p.org_name, p.outcome into v_blocker
  from private.account_deletion_plan(p_user_id) p
  where p.outcome in ('only_owner', 'subscribed')
  limit 1;
  if found then
    if v_blocker.outcome = 'only_owner' then
      raise exception 'You are the only owner of %, which has other members. Make one of them an owner in its Members settings, or delete the workspace.',
        v_blocker.org_name using errcode = 'P0001';
    end if;
    raise exception '% has a subscription. Cancel it in its Billing settings, then delete your account.',
      v_blocker.org_name using errcode = 'P0001';
  end if;

  select coalesce(array_agg(p.org_id), '{}') into v_doomed
  from private.account_deletion_plan(p_user_id) p
  where p.outcome = 'delete';

  return query
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id in ('media-images', 'media-videos')
      and private.media_org(o.name) = any (v_doomed);

  delete from public.orgs o where o.id = any (v_doomed);
  delete from auth.users u where u.id = p_user_id;
  -- Auth's record of their sign-ins, which names them by email and is kept
  -- apart from the user, so nothing cascades to it.
  delete from auth.audit_log_entries a where a.payload ->> 'actor_id' = p_user_id::text;
end;
$$;

revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

---------------------------------------------------------------------------
-- The operator's view of accounts (migration account_steps)
---------------------------------------------------------------------------

-- personal_workspace becomes first_workspace, the one they joined first
-- (for most, the one made when they signed up), and the team counts become
-- the workspaces they made and the ones they joined that someone else made.
drop view private.account_activity;

create view private.account_activity as
with steps as (
  select s.user_id,
         array_agg(s.step::text order by s.reached_at, s.step) as steps,
         jsonb_object_agg(s.step, s.reached_at) as step_times
  from private.account_steps s
  group by s.user_id
), first_workspace as (
  select distinct on (m.user_id) m.user_id, o.slug
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  order by m.user_id, m.created_at, o.created_at
), made as (
  select o.created_by as user_id, count(*) as created
  from public.orgs o
  where o.created_by is not null
  group by o.created_by
), joined as (
  select m.user_id, count(*) as joined
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  where o.created_by is distinct from m.user_id
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
  first_workspace.slug as first_workspace,
  coalesce(made.created, 0) as workspaces_created,
  coalesce(joined.joined, 0) as workspaces_joined,
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
left join first_workspace on first_workspace.user_id = u.id
left join steps on steps.user_id = u.id
left join made on made.user_id = u.id
left join joined on joined.user_id = u.id
left join projects on projects.user_id = u.id
left join documents on documents.user_id = u.id
left join invites on invites.user_id = u.id
left join pro on pro.user_id = u.id
left join edits on edits.user_id = u.id
left join sessions on sessions.user_id = u.id;

revoke all on private.account_activity from public, anon, authenticated;
grant select on private.account_activity to service_role;

---------------------------------------------------------------------------
-- The column
---------------------------------------------------------------------------

alter table public.orgs drop column personal_owner;
