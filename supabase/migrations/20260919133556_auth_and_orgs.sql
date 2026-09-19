-- Milestone 1: profiles, orgs, members, roles, invites (R6.1 - R6.5).

-- Helper functions live here so they are not exposed through the API.
create schema if not exists private;
grant usage on schema private to authenticated;

-- Declared lowest to highest so roles compare with >= and <.
create type public.org_role as enum ('viewer', 'editor', 'admin', 'owner');

---------------------------------------------------------------------------
-- Tables
---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_id_idx on public.org_members (user_id);

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.org_role not null default 'editor' check (role <> 'owner'),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  unique (org_id, email)
);

---------------------------------------------------------------------------
-- Helpers. Security definer so policies on org_members can ask about
-- org_members without recursing into themselves.
---------------------------------------------------------------------------

create function private.org_role(p_org_id uuid)
returns public.org_role
language sql stable security definer set search_path = ''
as $$
  select role from public.org_members
  where org_id = p_org_id and user_id = (select auth.uid());
$$;

create function private.has_org_role(p_org_id uuid, p_min public.org_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.org_role(p_org_id) >= p_min, false);
$$;

create function private.shares_org_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members mine
    join public.org_members theirs using (org_id)
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

---------------------------------------------------------------------------
-- Triggers
---------------------------------------------------------------------------

-- Every auth user gets a profile.
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- An org always has at least one owner. Skipped when the org itself is
-- being deleted (the cascade removes every member).
create function private.protect_last_owner()
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
    raise exception 'An org must have at least one owner.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger protect_last_owner
before update or delete on public.org_members
for each row execute function private.protect_last_owner();

---------------------------------------------------------------------------
-- RPCs
---------------------------------------------------------------------------

-- Creates an org and makes the caller its owner.
create function public.create_org(p_name text, p_slug text)
returns public.orgs
language plpgsql security definer set search_path = ''
as $$
declare
  v_org public.orgs;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  insert into public.orgs (name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), (select auth.uid()))
  returning * into v_org;

  insert into public.org_members (org_id, user_id, role)
  values (v_org.id, (select auth.uid()), 'owner');

  return v_org;
end;
$$;

-- What an invite link shows before it is accepted. Callable by anyone
-- holding the token; returns nothing for unknown, expired, or used tokens.
create function public.get_invite(p_token uuid)
returns table (org_name text, org_slug text, email text, role public.org_role)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.slug, i.email, i.role
  from public.org_invites i
  join public.orgs o on o.id = i.org_id
  where i.token = p_token and i.accepted_at is null and i.expires_at > now();
$$;

-- Accepts an invite. The caller's email must match the invited email.
create function public.accept_invite(p_token uuid)
returns public.orgs
language plpgsql security definer set search_path = ''
as $$
declare
  v_invite public.org_invites;
  v_org public.orgs;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select * into v_invite
  from public.org_invites
  where token = p_token and accepted_at is null and expires_at > now()
  for update;

  if not found then
    raise exception 'This invite is invalid or has expired.' using errcode = 'P0001';
  end if;

  if v_invite.email <> lower((select auth.jwt()) ->> 'email') then
    raise exception 'This invite was sent to a different email address.' using errcode = 'P0001';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_invite.org_id, (select auth.uid()), v_invite.role)
  on conflict (org_id, user_id) do nothing;

  update public.org_invites set accepted_at = now() where id = v_invite.id;

  select * into v_org from public.orgs where id = v_invite.org_id;
  return v_org;
end;
$$;

---------------------------------------------------------------------------
-- Row-level security
---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;

-- profiles: see yourself and people you share an org with; edit yourself.
create policy "profiles: read self and org peers" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id));

create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- orgs: members read, admins rename, owners delete. Created via create_org().
create policy "orgs: members read" on public.orgs
  for select to authenticated
  using (private.has_org_role(id, 'viewer'));

create policy "orgs: admins update" on public.orgs
  for update to authenticated
  using (private.has_org_role(id, 'admin'))
  with check (private.has_org_role(id, 'admin'));

create policy "orgs: owners delete" on public.orgs
  for delete to authenticated
  using (private.has_org_role(id, 'owner'));

-- org_members: members see each other. Rows are added only through
-- create_org() and accept_invite().
create policy "org_members: members read" on public.org_members
  for select to authenticated
  using (private.has_org_role(org_id, 'viewer'));

-- Admins manage anyone below owner and cannot hand out owner.
-- Owners manage everyone. Nobody changes their own role.
create policy "org_members: admins change roles" on public.org_members
  for update to authenticated
  using (
    user_id <> (select auth.uid())
    and private.has_org_role(org_id, 'admin')
    and (role < 'owner' or private.has_org_role(org_id, 'owner'))
  )
  with check (
    role < 'owner' or private.has_org_role(org_id, 'owner')
  );

-- Admins remove anyone below owner, owners remove anyone, anyone can leave.
create policy "org_members: admins remove, anyone leaves" on public.org_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (
      private.has_org_role(org_id, 'admin')
      and (role < 'owner' or private.has_org_role(org_id, 'owner'))
    )
  );

-- org_invites: admins only.
create policy "org_invites: admins read" on public.org_invites
  for select to authenticated
  using (private.has_org_role(org_id, 'admin'));

create policy "org_invites: admins create" on public.org_invites
  for insert to authenticated
  with check (
    private.has_org_role(org_id, 'admin')
    and invited_by = (select auth.uid())
  );

create policy "org_invites: admins revoke" on public.org_invites
  for delete to authenticated
  using (private.has_org_role(org_id, 'admin'));

---------------------------------------------------------------------------
-- Grants. RLS decides which rows; grants decide which operations exist.
---------------------------------------------------------------------------

revoke all on public.profiles, public.orgs, public.org_members, public.org_invites
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select, delete on public.orgs to authenticated;
grant update (name, slug) on public.orgs to authenticated;

grant select, delete on public.org_members to authenticated;
grant update (role) on public.org_members to authenticated;

grant select, delete on public.org_invites to authenticated;
grant insert (org_id, email, role, invited_by) on public.org_invites to authenticated;

revoke execute on function public.create_org(text, text) from public, anon;
revoke execute on function public.accept_invite(uuid) from public, anon;
grant execute on function public.create_org(text, text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.get_invite(uuid) to anon, authenticated;
