-- Readable addresses. A project lives at /<workspace>/<project>, where
-- <project> is a short name made from its title, and a whiteboard or page
-- inside it at /<workspace>/<project>/<title>-<code>, where <code> is a few
-- characters of the document's id. The title in a document's address is
-- decoration: the code alone finds the document, so renaming or moving it
-- never breaks a link.
--
-- Both are made here, so every way of creating a project or a document (the
-- app, an import, an agent) gets one, and nobody can choose or change them
-- directly. Renaming a project moves its address to the new name, and the
-- old one keeps leading to it.

---------------------------------------------------------------------------
-- Projects: a short name, unique in the workspace
---------------------------------------------------------------------------

-- Lowercase letters, digits and single hyphens, at most p_max long.
create function private.slugify(p_text text, p_max integer)
returns text
language sql immutable set search_path = ''
as $$
  select trim(both '-' from left(
    trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')),
    p_max));
$$;

-- Names a project cannot take: they are the workspace's own pages
-- (/<workspace>/settings, /<workspace>/agents) or kept for them.
create function private.is_reserved_project_slug(p_slug text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_slug in ('settings', 'agents', 'new');
$$;

-- The project's title as an address, numbered when the workspace already
-- has one by that name ("design", "design-2").
create function private.free_project_slug(p_org_id uuid, p_name text, p_project_id uuid)
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  base text := coalesce(nullif(private.slugify(p_name, 60), ''), 'project');
  candidate text := base;
  n integer := 1;
begin
  while private.is_reserved_project_slug(candidate) or exists (
    select 1 from public.projects
    where org_id = p_org_id and slug = candidate and id <> p_project_id
  ) loop
    n := n + 1;
    candidate := private.slugify(base, 60 - length(n::text) - 1) || '-' || n;
  end loop;
  return candidate;
end;
$$;

alter table public.projects add column slug text;

-- Existing projects, public ones first: their links are already shared, so
-- they keep the plain name when a private copy has the same title.
do $$
declare
  row record;
begin
  for row in
    select id, org_id, name from public.projects
    order by (visibility = 'public') desc, created_at, id
  loop
    update public.projects
    set slug = private.free_project_slug(row.org_id, row.name, row.id)
    where id = row.id;
  end loop;
end;
$$;

-- The trigger below always sets it. The default only tells a client, and
-- the types generated for one, that it need not send it.
alter table public.projects
  alter column slug set not null,
  alter column slug set default '',
  add constraint projects_slug_format
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$'),
  add constraint projects_slug_not_a_route
    check (not private.is_reserved_project_slug(slug)),
  add constraint projects_slug_unique unique (org_id, slug);

-- Addresses a project had before it was renamed. A link made then still
-- finds it, unless another project has since taken the name.
create table public.project_previous_slugs (
  org_id uuid not null references public.orgs (id) on delete cascade,
  slug text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (org_id, slug)
);
alter table public.project_previous_slugs enable row level security;
revoke all on public.project_previous_slugs from anon, authenticated;

create function private.set_project_slug()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then
    new.slug := old.slug;
    return new;
  end if;
  new.slug := private.free_project_slug(new.org_id, new.name, new.id);
  if tg_op = 'UPDATE' and new.slug <> old.slug then
    insert into public.project_previous_slugs (org_id, slug, project_id)
    values (old.org_id, old.slug, old.id)
    on conflict (org_id, slug) do update set project_id = excluded.project_id;
  end if;
  return new;
end;
$$;

create trigger set_project_slug
  before insert or update on public.projects
  for each row execute function private.set_project_slug();

---------------------------------------------------------------------------
-- Documents: a short code, unique in the project
---------------------------------------------------------------------------

-- The first 8 hex digits of the id, or more when another document in the
-- project already starts the same way.
create function private.free_document_code(p_project_id uuid, p_document_id uuid)
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  hex text := replace(p_document_id::text, '-', '');
  size integer := 8;
begin
  while exists (
    select 1 from public.documents
    where project_id = p_project_id and code = left(hex, size) and id <> p_document_id
  ) loop
    size := size + 2;
  end loop;
  return left(hex, size);
end;
$$;

alter table public.documents add column code text;

do $$
declare
  row record;
begin
  for row in select id, project_id from public.documents order by created_at, id loop
    update public.documents
    set code = private.free_document_code(row.project_id, row.id)
    where id = row.id;
  end loop;
end;
$$;

alter table public.documents
  alter column code set not null,
  alter column code set default '',
  add constraint documents_code_format check (code ~ '^[0-9a-f]{8,32}$'),
  add constraint documents_code_unique unique (project_id, code);

create function private.set_document_code()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.code := private.free_document_code(new.project_id, new.id);
  return new;
end;
$$;

create trigger set_document_code
  before insert on public.documents
  for each row execute function private.set_document_code();

-- Visitors to a public project build the same addresses.
grant select (slug) on public.projects to anon;
grant select (code) on public.documents to anon;

---------------------------------------------------------------------------
-- Finding a project from its address
---------------------------------------------------------------------------

-- The project at /<workspace>/<project>, for anyone who may open it: its
-- workspace's members, and everyone when it is public. <project> is its
-- short name, a name it had before a rename, or its id in an address from
-- before short names; `slug` is where it lives now. A visitor cannot read
-- workspaces, so this is what lets a public project's address work for
-- them; it tells them nothing about a workspace without one.
create function public.find_project(p_workspace text, p_project text)
returns table (project_id uuid, org_id uuid, slug text, member boolean)
language sql stable security definer set search_path = ''
as $$
  with candidates as (
    select p.id, 1 as rank
    from public.projects p join public.orgs o on o.id = p.org_id
    where o.slug = lower(p_workspace) and p.slug = lower(p_project)
    union all
    select h.project_id, 2
    from public.project_previous_slugs h join public.orgs o on o.id = h.org_id
    where o.slug = lower(p_workspace) and h.slug = lower(p_project)
    union all
    select p.id, 3
    from public.projects p join public.orgs o on o.id = p.org_id
    where o.slug = lower(p_workspace) and p.id::text = lower(p_project)
  )
  select p.id, p.org_id, p.slug, private.has_org_role(p.org_id, 'viewer')
  from candidates c
  join public.projects p on p.id = c.id
  where private.has_org_role(p.org_id, 'viewer')
     or (p.visibility = 'public' and p.taken_down_at is null)
  order by c.rank
  limit 1;
$$;

-- Where a project lives, for an address that names it by id only
-- (/p/<project id>, from before public projects shared the members' address).
create function public.project_address(p_project_id uuid)
returns table (workspace text, project text)
language sql stable security definer set search_path = ''
as $$
  select o.slug, p.slug
  from public.projects p
  join public.orgs o on o.id = p.org_id
  where p.id = p_project_id
    and (
      private.has_org_role(p.org_id, 'viewer')
      or (p.visibility = 'public' and p.taken_down_at is null)
    );
$$;

revoke all on function public.find_project(text, text) from public;
revoke all on function public.project_address(uuid) from public;
grant execute on function public.find_project(text, text) to anon, authenticated;
grant execute on function public.project_address(uuid) to anon, authenticated;
