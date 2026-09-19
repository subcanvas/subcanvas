-- Milestone 2: projects, folders, documents, and Yjs persistence
-- (R1.1 - R1.4, R5.1 - R5.5). Tree UI, references, and limits come later.

create type public.document_type as enum ('whiteboard', 'text');
create type public.document_kind as enum ('standard', 'description');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index projects_org_id_idx on public.projects (org_id);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_folder_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index folders_project_id_idx on public.folders (project_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  type public.document_type not null,
  kind public.document_kind not null default 'standard',
  title text not null default 'Untitled' check (char_length(title) <= 200),
  -- Exactly one home (R1.4): a folder, another document, or neither,
  -- which means the project root.
  folder_id uuid references public.folders (id) on delete cascade,
  parent_document_id uuid references public.documents (id) on delete cascade,
  -- The node, edge, group, or block inside the parent that holds this document.
  parent_object_id text,
  position double precision not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (folder_id is null or parent_document_id is null),
  check (parent_object_id is null or parent_document_id is not null),
  check (id <> parent_document_id)
);
create index documents_project_id_idx on public.documents (project_id);
create index documents_folder_id_idx on public.documents (folder_id);
create index documents_parent_document_id_idx on public.documents (parent_document_id);

-- Yjs state: a compacted snapshot plus the updates written since.
create table public.document_snapshots (
  document_id uuid primary key references public.documents (id) on delete cascade,
  state bytea not null,
  updated_at timestamptz not null default now()
);

create table public.document_updates (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  update bytea not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index document_updates_document_id_idx on public.document_updates (document_id, id);

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------

create function private.has_document_role(p_document_id uuid, p_min public.org_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select private.has_org_role(d.org_id, p_min)
     from public.documents d where d.id = p_document_id),
    false);
$$;

-- Children must live in the same org and project as their container.
create function private.check_document_home()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.projects p where p.id = new.project_id and p.org_id = new.org_id
  ) then
    raise exception 'The project does not belong to this org.' using errcode = 'P0001';
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

create trigger check_document_home
before insert or update of org_id, project_id, folder_id, parent_document_id
on public.documents
for each row execute function private.check_document_home();

create function private.check_folder_home()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.projects p where p.id = new.project_id and p.org_id = new.org_id
  ) then
    raise exception 'The project does not belong to this org.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_folder_home
before insert or update of org_id, project_id on public.folders
for each row execute function private.check_folder_home();

---------------------------------------------------------------------------
-- Compaction: replace the snapshot and drop the updates it covers, atomically.
-- The caller must have applied every update up to p_up_to_id before encoding
-- p_state. Yjs updates are idempotent, so overlap is harmless.
---------------------------------------------------------------------------

create function public.compact_document(p_document_id uuid, p_state bytea, p_up_to_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_document_role(p_document_id, 'editor') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  insert into public.document_snapshots (document_id, state)
  values (p_document_id, p_state)
  on conflict (document_id) do update set state = excluded.state, updated_at = now();

  delete from public.document_updates
  where document_id = p_document_id and id <= p_up_to_id;
end;
$$;

---------------------------------------------------------------------------
-- Row-level security: viewers read, editors write, admins delete projects.
---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_snapshots enable row level security;
alter table public.document_updates enable row level security;

create policy "projects: members read" on public.projects
  for select to authenticated using (private.has_org_role(org_id, 'viewer'));
create policy "projects: editors create" on public.projects
  for insert to authenticated with check (private.has_org_role(org_id, 'editor'));
create policy "projects: editors update" on public.projects
  for update to authenticated
  using (private.has_org_role(org_id, 'editor'))
  with check (private.has_org_role(org_id, 'editor'));
create policy "projects: admins delete" on public.projects
  for delete to authenticated using (private.has_org_role(org_id, 'admin'));

create policy "folders: members read" on public.folders
  for select to authenticated using (private.has_org_role(org_id, 'viewer'));
create policy "folders: editors write" on public.folders
  for all to authenticated
  using (private.has_org_role(org_id, 'editor'))
  with check (private.has_org_role(org_id, 'editor'));

create policy "documents: members read" on public.documents
  for select to authenticated using (private.has_org_role(org_id, 'viewer'));
create policy "documents: editors write" on public.documents
  for all to authenticated
  using (private.has_org_role(org_id, 'editor'))
  with check (private.has_org_role(org_id, 'editor'));

create policy "document_snapshots: members read" on public.document_snapshots
  for select to authenticated using (private.has_document_role(document_id, 'viewer'));

create policy "document_updates: members read" on public.document_updates
  for select to authenticated using (private.has_document_role(document_id, 'viewer'));
create policy "document_updates: editors append" on public.document_updates
  for insert to authenticated
  with check (private.has_document_role(document_id, 'editor'));

revoke all on public.projects, public.folders, public.documents,
  public.document_snapshots, public.document_updates from anon, authenticated;

grant select, insert, delete on public.projects, public.folders, public.documents to authenticated;
grant update (name) on public.projects to authenticated;
grant update (name, parent_folder_id, position) on public.folders to authenticated;
grant update (title, folder_id, parent_document_id, parent_object_id, position, deleted_at)
  on public.documents to authenticated;

-- Snapshots are written only through compact_document(). Updates are append-only.
grant select on public.document_snapshots to authenticated;
grant select on public.document_updates to authenticated;
grant insert (document_id, update) on public.document_updates to authenticated;

revoke execute on function public.compact_document(uuid, bytea, bigint) from public, anon;
grant execute on function public.compact_document(uuid, bytea, bigint) to authenticated;

---------------------------------------------------------------------------
-- Realtime authorization (R5.5). Each document syncs on the private channel
-- "doc:<document id>". Members receive; only editors broadcast; any member
-- may publish presence.
---------------------------------------------------------------------------

create function private.topic_document_id()
returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  v_topic text := realtime.topic();
begin
  if v_topic like 'doc:%' then
    return substring(v_topic from 5)::uuid;
  end if;
  return null;
exception when invalid_text_representation then
  return null;
end;
$$;

create policy "doc channels: members receive" on realtime.messages
  for select to authenticated
  using (private.has_document_role(private.topic_document_id(), 'viewer'));

create policy "doc channels: editors broadcast, members publish presence" on realtime.messages
  for insert to authenticated
  with check (
    (extension = 'broadcast' and private.has_document_role(private.topic_document_id(), 'editor'))
    or (extension = 'presence' and private.has_document_role(private.topic_document_id(), 'viewer'))
  );
