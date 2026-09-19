-- Public projects: anyone with the link can read, nobody outside the org can
-- write (R6.6, R6.7). Reading is granted by RLS to the anon role, so public
-- pages use the same queries as the app, with no privileged server code.

-- Set by the operator to take a project offline (R6.7). It overrides the
-- org's own visibility setting, which members cannot use to undo it.
alter table public.projects add column taken_down_at timestamptz;

create function private.project_is_public(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and visibility = 'public' and taken_down_at is null
  );
$$;

create function private.document_is_public(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    join public.projects p on p.id = d.project_id
    where d.id = p_document_id and d.deleted_at is null
      and p.visibility = 'public' and p.taken_down_at is null
  );
$$;

-- A taken-down project is not readable through a heartbeat either.
create or replace function private.can_read_document(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.document_is_public(p_document_id)
    or exists (
      select 1 from public.documents d
      where d.id = p_document_id and private.has_org_role(d.org_id, 'viewer')
    );
$$;

create policy "projects: anyone reads public" on public.projects
  for select to anon, authenticated using (private.project_is_public(id));
create policy "folders: anyone reads public" on public.folders
  for select to anon, authenticated using (private.project_is_public(project_id));
create policy "documents: anyone reads public" on public.documents
  for select to anon, authenticated
  using (deleted_at is null and private.project_is_public(project_id));
create policy "document_snapshots: anyone reads public" on public.document_snapshots
  for select to anon, authenticated using (private.document_is_public(document_id));
create policy "document_updates: anyone reads public" on public.document_updates
  for select to anon, authenticated using (private.document_is_public(document_id));
create policy "document_links: anyone reads public" on public.document_links
  for select to anon, authenticated using (private.document_is_public(source_document_id));

-- Column grants keep internal fields (who created what, takedown state) out
-- of anonymous reach even on public rows.
grant select (id, org_id, name, visibility) on public.projects to anon;
grant select (id, project_id, parent_folder_id, name, position) on public.folders to anon;
grant select (id, org_id, project_id, type, kind, title, folder_id, parent_document_id,
              parent_object_id, position, deleted_at, updated_at) on public.documents to anon;
grant select on public.document_snapshots to anon;
grant select (id, document_id, update) on public.document_updates to anon;
grant select on public.document_links to anon;
grant usage on schema private to anon;

grant execute on function public.document_ancestors(uuid) to anon;
grant execute on function public.document_references(uuid) to anon;

---------------------------------------------------------------------------
-- Abuse reports
---------------------------------------------------------------------------

create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  reason text not null check (char_length(reason) between 10 and 2000),
  reporter_email text check (reporter_email is null or char_length(reporter_email) <= 320),
  created_at timestamptz not null default now()
);
create index abuse_reports_project_idx on public.abuse_reports (project_id, created_at desc);

-- Read by the operator through the dashboard or SQL. Nobody else.
alter table public.abuse_reports enable row level security;
revoke all on public.abuse_reports from anon, authenticated;

create function public.report_abuse(
  p_project_id uuid, p_document_id uuid, p_reason text, p_reporter_email text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.project_is_public(p_project_id) then
    raise exception 'This project is not public.' using errcode = 'P0001';
  end if;
  -- A crude flood guard. Reports are read by a person, so a handful is enough.
  if (select count(*) from public.abuse_reports
      where project_id = p_project_id and created_at > now() - interval '1 hour') >= 20 then
    return;
  end if;

  insert into public.abuse_reports (project_id, document_id, reason, reporter_email)
  values (p_project_id, p_document_id, trim(p_reason), nullif(trim(p_reporter_email), ''));
end;
$$;

grant execute on function public.report_abuse(uuid, uuid, text, text) to anon, authenticated;

-- Public pages live under /p/<project id>, so "p" cannot be an org's slug.
alter table public.orgs add constraint orgs_slug_not_public_route check (slug <> 'p');
