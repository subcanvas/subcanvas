-- Milestone 6: references between documents (R1.5 - R1.8).
--
-- A document's home (its one parent) is recorded on the document itself.
-- This table records the other direction of nesting: places that link to a
-- document that lives somewhere else. It is an index of what the content
-- says, rebuilt by clients from the whiteboard or text document, so that
-- "Referenced by" and delete warnings are plain queries.

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  source_document_id uuid not null references public.documents (id) on delete cascade,
  -- The node, edge, or group in a whiteboard, or the block in a text document.
  source_object_id text not null,
  target_document_id uuid not null references public.documents (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_document_id, source_object_id, target_document_id),
  check (source_document_id <> target_document_id)
);
create index document_links_target_idx on public.document_links (target_document_id);

-- Both ends must be in the link's org.
create function private.check_document_link()
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
    raise exception 'Both documents must belong to this org.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_document_link
before insert or update on public.document_links
for each row execute function private.check_document_link();

alter table public.document_links enable row level security;

create policy "document_links: members read" on public.document_links
  for select to authenticated using (private.has_org_role(org_id, 'viewer'));
create policy "document_links: editors create" on public.document_links
  for insert to authenticated with check (private.has_org_role(org_id, 'editor'));
create policy "document_links: editors delete" on public.document_links
  for delete to authenticated using (private.has_org_role(org_id, 'editor'));

revoke all on public.document_links from anon, authenticated;
grant select, delete on public.document_links to authenticated;
grant insert (org_id, source_document_id, source_object_id, target_document_id)
  on public.document_links to authenticated;

-- Everywhere a document appears other than its home, for "Referenced by"
-- (R1.7) and the warning before deleting it (R1.8). Sources in the trash
-- are left out.
create function public.document_references(p_document_id uuid)
returns table (source_document_id uuid, source_title text, source_type public.document_type, project_id uuid)
language sql stable set search_path = ''
as $$
  select distinct s.id, s.title, s.type, s.project_id
  from public.document_links l
  join public.documents s on s.id = l.source_document_id
  where l.target_document_id = p_document_id and s.deleted_at is null
  order by s.title;
$$;

revoke execute on function public.document_references(uuid) from public, anon;
grant execute on function public.document_references(uuid) to authenticated;
