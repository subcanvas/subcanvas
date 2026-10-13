-- Connect GitHub: the GitHub accounts and organizations a workspace has
-- connected through the GitHub App, so its editors can import the private
-- repositories each one granted. Read-only on GitHub's side: the app may
-- read contents and metadata, of the repositories chosen when it was
-- installed, and nothing else (docs/ROADMAP.md, section 3).
--
-- A row says "this workspace may use this installation". Only the app's
-- server makes one, with its secret key, after GitHub has confirmed that
-- the person connecting can see the installation (api/github/callback). A
-- person cannot insert one, or anyone could attach an installation id they
-- guessed. Members see the workspace's connections; admins remove them.
-- Nothing GitHub hands out is stored: the app asks GitHub for a short-lived
-- token for the installation each time it reads.

create table public.github_connections (
  org_id uuid not null references public.orgs (id) on delete cascade,
  installation_id bigint not null check (installation_id > 0),
  -- The GitHub account the app is installed on, as GitHub spells it, and
  -- whether it is a person's or an organization's.
  account_login text not null check (account_login ~ '^[A-Za-z0-9-]{1,39}$'),
  account_type text not null check (account_type in ('User', 'Organization')),
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  primary key (org_id, installation_id)
);
create index github_connections_installation_idx on public.github_connections (installation_id);

alter table public.github_connections enable row level security;

create policy "github_connections: members read" on public.github_connections
  for select to authenticated
  using (private.has_org_role(org_id, 'viewer'));

create policy "github_connections: admins remove" on public.github_connections
  for delete to authenticated
  using (private.has_org_role(org_id, 'admin'));

revoke all on public.github_connections from anon, authenticated;
grant select, delete on public.github_connections to authenticated;
-- The server writes a connection once GitHub has vouched for the person
-- (an upsert: select, insert, update), and nothing else needs more.
grant select, insert, update on public.github_connections to service_role;

-- The step record (migration account_steps): a workspace connected GitHub.
alter type private.account_step add value if not exists 'connected_github' after 'connected_agent';

create or replace function public.record_step(p_step text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;
  if p_step is null or p_step not in
     ('opened_github_import', 'imported_repository', 'imported_files', 'connected_agent', 'opened_billing',
      'import_refused_not_found', 'import_refused_rate_limited', 'import_refused_too_large',
      'import_refused_nothing_to_map', 'import_refused_unavailable', 'import_refused_limit',
      'import_refused_other', 'connected_github')
  then
    raise exception 'Not a step the app records.' using errcode = '22023';
  end if;
  perform private.reach_step((select auth.uid()), p_step::private.account_step);
end;
$$;
