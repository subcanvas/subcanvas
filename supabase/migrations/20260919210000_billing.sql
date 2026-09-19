-- Milestone 8: plans (R7).
--
-- Free: unlimited documents in public projects, a capped number of documents
-- in private projects, and a capped number of editors. Paid: no caps.
-- Viewers are always free. Nothing is ever deleted or published because of
-- billing.

create type public.project_visibility as enum ('private', 'public');

alter table public.projects
  add column visibility public.project_visibility not null default 'private';
grant update (visibility) on public.projects to authenticated;

-- Only admins change who can see a project. Editors keep renaming it.
create function private.guard_project_visibility()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.visibility is distinct from old.visibility
     and (select auth.uid()) is not null
     and not private.has_org_role(new.org_id, 'admin')
  then
    raise exception 'Only an admin can change who can see a project.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_project_visibility
before update of visibility on public.projects
for each row execute function private.guard_project_visibility();

-- One row of deployment-wide settings. Both limits are off unless a
-- deployment sets them, so a self-hosted server works with no billing setup.
-- A deployment that sells subscriptions turns the free tier on with:
--   update private.config
--   set free_private_document_limit = 100, free_editor_limit = 3;
create table private.config (
  singleton boolean primary key default true check (singleton),
  free_private_document_limit integer check (free_private_document_limit >= 0),
  free_editor_limit integer check (free_editor_limit >= 1),
  -- How long a lapsed org that is over the editor limit stays writable.
  lapse_grace interval not null default interval '14 days'
);
insert into private.config default values;

-- Written only by the Stripe webhook, through the service role.
create table public.subscriptions (
  org_id uuid primary key references public.orgs (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  seats integer not null default 0,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- When the org last stopped being paid. Null while paid or never paid.
  lapsed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "subscriptions: members read" on public.subscriptions
  for select to authenticated using (private.has_org_role(org_id, 'viewer'));
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- Paid while Stripe says so. "past_due" stays paid: Stripe is still retrying
-- the card, and cutting a team off mid-retry punishes an expired card.
create function private.is_paid_status(p_status text)
returns boolean language sql immutable
as $$ select p_status in ('active', 'trialing', 'past_due'); $$;

create function private.org_is_paid(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions
    where org_id = p_org_id and private.is_paid_status(status)
  );
$$;

-- Stamps the moment a subscription stops being paid, whoever writes the row.
create function private.track_lapse()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if private.is_paid_status(new.status) then
    new.lapsed_at := null;
  elsif tg_op = 'UPDATE' and private.is_paid_status(old.status) then
    new.lapsed_at := now();
  end if;
  return new;
end;
$$;

create trigger track_lapse
before insert or update of status on public.subscriptions
for each row execute function private.track_lapse();

-- Editors are everyone except viewers (R7.2a). They are the billed seats.
create function private.editor_count(p_org_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.org_members
  where org_id = p_org_id and role <> 'viewer';
$$;

-- Documents that count toward the free tier: standard, not in the trash,
-- and in a private project. Node descriptions are free (R7.1a).
create function private.private_document_count(p_org_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.documents d
  join public.projects p on p.id = d.project_id
  where d.org_id = p_org_id and d.kind = 'standard' and d.deleted_at is null
    and p.visibility = 'private';
$$;

---------------------------------------------------------------------------
-- The private document limit
---------------------------------------------------------------------------

create function private.check_private_document_limit(p_org_id uuid, p_adding integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit integer;
begin
  select free_private_document_limit into v_limit from private.config;
  if v_limit is null or private.org_is_paid(p_org_id) then
    return;
  end if;
  if private.private_document_count(p_org_id) + p_adding > v_limit then
    raise exception 'This org has reached the free limit of % private documents.', v_limit
      using errcode = 'GN001', hint = 'Upgrade, or make the project public.';
  end if;
end;
$$;

-- Creating a document, or restoring one from the trash, in a private project.
create function private.enforce_private_document_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind <> 'standard' or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null and old.kind = 'standard' then
    return new; -- already counted
  end if;
  if (select visibility from public.projects where id = new.project_id) = 'private' then
    perform private.check_private_document_limit(new.org_id, 1);
  end if;
  return new;
end;
$$;

create trigger enforce_private_document_limit
before insert or update of deleted_at, kind on public.documents
for each row execute function private.enforce_private_document_limit();

-- Making a public project private brings all of its documents under the limit.
create function private.enforce_limit_on_going_private()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.visibility = 'public' and new.visibility = 'private' then
    perform private.check_private_document_limit(
      new.org_id,
      (select count(*)::integer from public.documents
       where project_id = new.id and kind = 'standard' and deleted_at is null));
  end if;
  return new;
end;
$$;

create trigger enforce_limit_on_going_private
before update of visibility on public.projects
for each row execute function private.enforce_limit_on_going_private();

---------------------------------------------------------------------------
-- The editor limit
---------------------------------------------------------------------------

create function private.enforce_editor_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit integer;
begin
  if new.role = 'viewer' or (tg_op = 'UPDATE' and old.role <> 'viewer') then
    return new; -- not a new editor
  end if;

  select free_editor_limit into v_limit from private.config;
  if v_limit is null or private.org_is_paid(new.org_id) then
    return new;
  end if;

  if private.editor_count(new.org_id) >= v_limit then
    raise exception 'The free plan includes % editors. Viewers are unlimited.', v_limit
      using errcode = 'GN002', hint = 'Upgrade, or add this person as a viewer.';
  end if;
  return new;
end;
$$;

create trigger enforce_editor_limit
before insert or update of role on public.org_members
for each row execute function private.enforce_editor_limit();

-- An org that stopped paying while over the editor limit gets a grace
-- period, then becomes read-only for everyone but its owners, who can pay
-- or move editors to viewers. Without this, one paid month would buy
-- unlimited editors forever.
create function private.org_is_locked(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select s.lapsed_at + c.lapse_grace < now()
      and c.free_editor_limit is not null
      and private.editor_count(p_org_id) > c.free_editor_limit
    from public.subscriptions s, private.config c
    where s.org_id = p_org_id and not private.is_paid_status(s.status)
  ), false);
$$;

-- Every write policy asks for at least 'editor', so this one change makes a
-- locked org read-only for non-owners across the whole schema, including the
-- Realtime channel policies.
create or replace function private.has_org_role(p_org_id uuid, p_min public.org_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    case
      when p_min = 'viewer' or private.org_role(p_org_id) = 'owner'
        then private.org_role(p_org_id) >= p_min
      else private.org_role(p_org_id) >= p_min and not private.org_is_locked(p_org_id)
    end,
    false);
$$;

---------------------------------------------------------------------------
-- What the app shows about an org's plan
---------------------------------------------------------------------------

create function public.org_usage(p_org_id uuid)
returns table (
  paid boolean,
  locked boolean,
  private_documents integer,
  private_document_limit integer,
  editors integer,
  editor_limit integer,
  grace_ends_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    private.org_is_paid(p_org_id),
    private.org_is_locked(p_org_id),
    private.private_document_count(p_org_id),
    c.free_private_document_limit,
    private.editor_count(p_org_id),
    c.free_editor_limit,
    -- Set while a lapsed org over the editor limit is still in its grace period.
    (select s.lapsed_at + c.lapse_grace from public.subscriptions s
     where s.org_id = p_org_id and not private.is_paid_status(s.status)
       and c.free_editor_limit is not null
       and private.editor_count(p_org_id) > c.free_editor_limit)
  from private.config c
  where private.has_org_role(p_org_id, 'viewer');
$$;

revoke execute on function public.org_usage(uuid) from public, anon;
grant execute on function public.org_usage(uuid) to authenticated;
