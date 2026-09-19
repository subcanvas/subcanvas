-- Milestone 8: the free-tier document limit and subscription state (R7).

-- One row of deployment-wide settings. There is no document limit unless a
-- deployment sets one, so a self-hosted server works with no billing setup.
-- A deployment that sells subscriptions turns the free tier on with:
--   update private.config set free_document_limit = 25;
create table private.config (
  singleton boolean primary key default true check (singleton),
  free_document_limit integer check (free_document_limit is null or free_document_limit >= 0)
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
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "subscriptions: members read" on public.subscriptions
  for select to authenticated using (private.has_org_role(org_id, 'viewer'));
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- Paid while Stripe says so. "past_due" stays paid: Stripe is still retrying
-- the card, and cutting a team off mid-retry punishes an expired card.
create function private.org_is_paid(p_org_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions
    where org_id = p_org_id and status in ('active', 'trialing', 'past_due')
  );
$$;

-- Documents that count toward the limit: standard and not in the trash.
-- Node descriptions are free (R7.1a).
create function private.counted_documents(p_org_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.documents
  where org_id = p_org_id and kind = 'standard' and deleted_at is null;
$$;

-- Blocks a free org from going over the limit, whether by creating a
-- document or by restoring one from the trash. Existing documents stay
-- editable (R7.5), and nothing is ever deleted (R7.6).
create function private.enforce_document_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit integer;
begin
  if new.kind <> 'standard' or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null and old.kind = 'standard' then
    return new; -- already counted
  end if;

  select free_document_limit into v_limit from private.config;
  if v_limit is null or private.org_is_paid(new.org_id) then
    return new;
  end if;

  if private.counted_documents(new.org_id) >= v_limit then
    raise exception 'This org has reached the free limit of % documents.', v_limit
      using errcode = 'GN001', hint = 'Upgrade to create more.';
  end if;
  return new;
end;
$$;

create trigger enforce_document_limit
before insert or update of deleted_at, kind on public.documents
for each row execute function private.enforce_document_limit();

-- Seats that are billed: everyone except viewers (R7.2a).
create function private.billed_seats(p_org_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.org_members
  where org_id = p_org_id and role <> 'viewer';
$$;

-- What the app shows about an org's plan.
create function public.org_usage(p_org_id uuid)
returns table (documents integer, document_limit integer, paid boolean, billed_seats integer)
language sql stable security definer set search_path = ''
as $$
  select
    private.counted_documents(p_org_id),
    (select free_document_limit from private.config),
    private.org_is_paid(p_org_id),
    private.billed_seats(p_org_id)
  where private.has_org_role(p_org_id, 'viewer');
$$;

revoke execute on function public.org_usage(uuid) from public, anon;
grant execute on function public.org_usage(uuid) to authenticated;
