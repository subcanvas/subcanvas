-- Where a project or a document came from (docs/ROADMAP.md, "Shared
-- foundation"). A project imported from a repository records the repository
-- and the commit it was read at:
--   { "provider": "github", "repository": "owner/name", "ref": "main", "commit": "<sha>" }
-- and each README that became a document records its file:
--   { "provider": "github", "repository": "owner/name", "path": "services/payments/README.md", "commit": "<sha>" }
-- A document with a source is shown read-only. Null, the default, means it
-- was made here.

alter table public.projects add column source jsonb;
alter table public.documents add column source jsonb;

-- Set when the row is created and never updated by a client: authenticated
-- users hold column-level update grants, and neither list includes `source`.
-- Anonymous readers of a public project see it, since it is what the page
-- shows above an imported README.
grant select (source) on public.projects to anon;
grant select (source) on public.documents to anon;

-- An import that fails halfway removes the project it started. Only admins
-- delete projects, and an import is open to editors, so the cleanup goes
-- through this function instead: it deletes a project only when the caller
-- is the person who created it, it came from an import, and it is minutes
-- old. Documents and their updates go with it by cascade.
create function public.discard_import(p_project_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.projects p
  where p.id = p_project_id
    and p.source is not null
    and p.created_by = (select auth.uid())
    and p.created_at > now() - interval '15 minutes'
    and private.has_org_role(p.org_id, 'editor');
$$;

revoke execute on function public.discard_import(uuid) from public, anon;
grant execute on function public.discard_import(uuid) to authenticated;
