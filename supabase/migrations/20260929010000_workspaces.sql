-- Personal and team workspaces, and deleting an account.
--
-- A workspace is an org: the tables, the policies and the URLs keep that
-- name, and people read "workspace" everywhere. Every account gets a
-- personal workspace the moment it is created. It belongs to exactly one
-- person: nobody else joins it, nobody is invited to it, it cannot be left,
-- and it is deleted only with its account. Team workspaces are what orgs
-- were: members, roles, invites, billing.
--
-- Deleting an account deletes the personal workspace and every team
-- workspace nobody else is in, with everything in them, and the account.
-- Team workspaces other people are still in keep what the person made there.

-- The personal workspace's address is made from the person's name, and a
-- name is often written with accents: José García's is /jose-garcia.
create extension if not exists unaccent with schema extensions;

---------------------------------------------------------------------------
-- Which workspace is someone's personal one
---------------------------------------------------------------------------

-- Null for a team workspace. Unique, so a person has one personal
-- workspace, and it goes when their profile does.
alter table public.orgs
  add column personal_owner uuid unique references public.profiles (id) on delete cascade;

-- An address made from a name: lowercase letters, digits and single hyphens,
-- at most 30 characters, so a numeric suffix still fits under the 40 an
-- address may have. Empty when the name has nothing to make one from.
create function private.workspace_slug(p_name text)
returns text
language sql stable set search_path = ''
as $$
  select rtrim(left(trim(both '-' from regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_name, ''))),
    '[^a-z0-9]+', '-', 'g')), 30), '-');
$$;

-- Creates a person's personal workspace, named after them: their name from
-- Google or GitHub, else the part of their email before the @. The address
-- is made the same way, with a number added when it is taken or is one the
-- app reserves (orgs.slug's checks decide which, so a route reserved later
-- is respected too). Returns the one they already have, if any.
create function private.create_personal_workspace(p_user_id uuid, p_name text, p_email text)
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
  select id into v_org_id from public.orgs where personal_owner = p_user_id;
  if found then
    return v_org_id;
  end if;

  -- 68 characters of name and "'s workspace" make the 80 a name may have.
  v_name := case when v_base is null then 'Personal workspace'
                 else rtrim(left(v_base, 68)) || '''s workspace' end;
  v_slug_base := coalesce(
    nullif(private.workspace_slug(v_base), ''),
    nullif(private.workspace_slug(split_part(p_email, '@', 1)), ''),
    'workspace');
  v_slug := v_slug_base;

  loop
    begin
      insert into public.orgs (name, slug, created_by, personal_owner)
      values (v_name, v_slug, p_user_id, p_user_id)
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

-- Every auth user gets a profile and a personal workspace.
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
  return new;
end;
$$;

-- Everyone who signed up before personal workspaces gets one too, oldest
-- account first, so the earlier sign-up keeps the plainer address.
do $$
declare
  v_profile record;
begin
  for v_profile in
    select p.id, p.display_name, p.email from public.profiles p
    where not exists (select 1 from public.orgs o where o.personal_owner = p.id)
    order by p.created_at, p.id
  loop
    perform private.create_personal_workspace(v_profile.id, v_profile.display_name, v_profile.email);
  end loop;
end;
$$;

---------------------------------------------------------------------------
-- A personal workspace is its owner's alone
---------------------------------------------------------------------------

-- Nobody else is added to it, its owner stays its owner, and its owner
-- cannot leave it. Removing the owner is allowed only on the way out: when
-- the workspace itself is being deleted (it is gone by the time the cascade
-- reaches this row) or the owner's profile is.
create function private.guard_personal_workspace_members()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select personal_owner into v_owner from public.orgs where id = coalesce(new.org_id, old.org_id);
  if v_owner is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if exists (select 1 from public.profiles where id = old.user_id) then
      raise exception 'A personal workspace cannot be left. It is deleted with your account.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.user_id <> v_owner or new.org_id <> old.org_id then
    raise exception 'A personal workspace is yours alone. Create a team workspace to work with others.'
      using errcode = 'P0001';
  end if;
  if new.role <> 'owner' then
    raise exception 'You are always the owner of your personal workspace.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_personal_workspace_members
before insert or update or delete on public.org_members
for each row execute function private.guard_personal_workspace_members();

-- It can be renamed, but it stays personal, stays its owner's, and is
-- deleted only with its owner's profile (delete_personal_workspace, below):
-- not by its owner, and not by the operator either.
create function private.guard_personal_workspace()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.personal_owner is distinct from old.personal_owner then
      raise exception 'Whose personal workspace it is cannot change.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if old.personal_owner is not null
     and current_setting('subcanvas.deleting_profile', true) is distinct from old.personal_owner::text
     and exists (select 1 from public.profiles where id = old.personal_owner)
  then
    raise exception 'A personal workspace is deleted only with its account.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger guard_personal_workspace
before update or delete on public.orgs
for each row execute function private.guard_personal_workspace();

-- A profile takes its personal workspace with it, and first. Left to the
-- foreign key's cascade, the workspace would go in the same pass as the
-- profile's other foreign keys are cleared (projects.created_by and the
-- like are set null), and in an order Postgres does not promise: a project
-- of the workspace could be updated after the workspace was gone, and the
-- whole deletion refused. Deleted here, before the profile row, everything
-- in it is gone before anything else is touched. Covers every way a profile
-- goes: delete_account, and deleting the user in the dashboard.
create function private.delete_personal_workspace()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('subcanvas.deleting_profile', old.id::text, true);
  delete from public.orgs where personal_owner = old.id;
  perform set_config('subcanvas.deleting_profile', '', true);
  return old;
end;
$$;

create trigger delete_personal_workspace
before delete on public.profiles
for each row execute function private.delete_personal_workspace();

-- Nobody is invited to a personal workspace. A trigger of its own, so that
-- it stands apart from org_invites' policies and functions.
create function private.refuse_personal_workspace_invites()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.orgs where id = new.org_id and personal_owner is not null) then
    raise exception 'A personal workspace is yours alone. Create a team workspace to invite people.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refuse_personal_workspace_invites
before insert or update of org_id on public.org_invites
for each row execute function private.refuse_personal_workspace_invites();

---------------------------------------------------------------------------
-- The words people read: a workspace, not an org
---------------------------------------------------------------------------

-- A team workspace always has at least one owner. Skipped when the
-- workspace itself is being deleted (the cascade removes every member), and
-- for a personal workspace, which guard_personal_workspace_members looks
-- after.
create or replace function private.protect_last_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.orgs where id = old.org_id and personal_owner is null)
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

create or replace function private.protect_subscribed_org()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and exists (
       select 1 from public.subscriptions
       where org_id = old.id and private.is_paid_status(status) and not cancel_at_period_end
     )
  then
    raise exception 'Cancel the subscription before deleting this workspace.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create or replace function private.check_document_home()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.projects p where p.id = new.project_id and p.org_id = new.org_id
  ) then
    raise exception 'The project does not belong to this workspace.' using errcode = 'P0001';
  end if;

  if new.folder_id is not null and not exists (
    select 1 from public.folders f where f.id = new.folder_id and f.project_id = new.project_id
  ) then
    raise exception 'The folder does not belong to this project.' using errcode = 'P0001';
  end if;

  if new.parent_document_id is not null and not exists (
    select 1 from public.documents d
    where d.id = new.parent_document_id and d.project_id = new.project_id
  ) then
    raise exception 'The parent document does not belong to this project.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function private.check_folder_home()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.projects p where p.id = new.project_id and p.org_id = new.org_id
  ) then
    raise exception 'The project does not belong to this workspace.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.check_document_link()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.source_document_id = new.target_document_id then
    raise exception 'A document cannot link to itself.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.documents d
      where d.id in (new.source_document_id, new.target_document_id)
        and d.org_id = new.org_id) <> 2
  then
    raise exception 'Both documents must belong to this workspace.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

---------------------------------------------------------------------------
-- Deleting an account
---------------------------------------------------------------------------

-- What deleting a person's account does to each workspace they are in:
--   delete      their personal workspace, and a team workspace nobody else
--               is in, go with everything in them;
--   leave       they leave a team workspace that has other people in it,
--               and what they made there stays: it is those people's too;
--   only_owner  refused: they are the only owner of a team workspace that
--               has other members, who would be left without one;
--   subscribed  refused: a workspace that would be deleted has a running
--               subscription, which would go on charging a card for a
--               workspace that is gone (as private.protect_subscribed_org).
-- The personal workspace comes first, then the others by name.
create function private.account_deletion_plan(p_user_id uuid)
returns table (org_id uuid, org_name text, org_slug text, personal boolean, outcome text)
language sql stable security definer set search_path = ''
as $$
  select o.id, o.name, o.slug, o.personal_owner is not null,
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
  order by o.personal_owner is null, o.name, o.id;
$$;

-- The same, for the person signed in, so Profile can say what will happen
-- before anything does.
create function public.account_deletion_plan()
returns table (org_id uuid, org_name text, org_slug text, personal boolean, outcome text)
language sql stable security definer set search_path = ''
as $$
  select * from private.account_deletion_plan((select auth.uid()));
$$;

revoke execute on function public.account_deletion_plan() from public, anon;
grant execute on function public.account_deletion_plan() to authenticated;

-- Deletes an account, in one transaction: the team workspaces nobody else
-- is in, then the auth user, whose cascade takes the profile, the personal
-- workspace, and every membership. Where the person made something in a
-- workspace that stays, the row stays and no longer says who made it.
-- Refused, with nothing changed, when the plan above says so.
--
-- Returns the pictures and videos of the deleted workspaces, which Storage
-- does not delete with the rows: the caller removes them through the
-- Storage API. Called by the app's server with its secret key, once it has
-- checked who is asking, and by the operator from SQL. Never by a person or
-- an agent directly: a token that leaked would be enough to delete them.
create function public.delete_account(p_user_id uuid)
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

  delete from public.orgs o where o.id = any (v_doomed) and o.personal_owner is null;
  delete from auth.users u where u.id = p_user_id;
  -- Auth's record of their sign-ins, which names them by email and is kept
  -- apart from the user, so nothing cascades to it.
  delete from auth.audit_log_entries a where a.payload ->> 'actor_id' = p_user_id::text;
end;
$$;

revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
