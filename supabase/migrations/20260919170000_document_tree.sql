-- Milestone 3: tree integrity for folders and documents (R1.4, R1.9).

-- A folder cannot be moved inside itself or one of its descendants.
create function private.check_folder_cycle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := new.parent_folder_id;
begin
  if v_id is not null and not exists (
    select 1 from public.folders f where f.id = v_id and f.project_id = new.project_id
  ) then
    raise exception 'The parent folder does not belong to this project.' using errcode = 'P0001';
  end if;

  while v_id is not null loop
    if v_id = new.id then
      raise exception 'A folder cannot be moved inside itself.' using errcode = 'P0001';
    end if;
    select parent_folder_id into v_id from public.folders where id = v_id;
  end loop;
  return new;
end;
$$;

create trigger check_folder_cycle
before insert or update of parent_folder_id, project_id on public.folders
for each row execute function private.check_folder_cycle();

-- Same for documents nested inside documents. References may form cycles;
-- parentage may not.
create function private.check_document_cycle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := new.parent_document_id;
begin
  while v_id is not null loop
    if v_id = new.id then
      raise exception 'A document cannot be moved inside itself.' using errcode = 'P0001';
    end if;
    select parent_document_id into v_id from public.documents where id = v_id;
  end loop;
  return new;
end;
$$;

create trigger check_document_cycle
before insert or update of parent_document_id on public.documents
for each row execute function private.check_document_cycle();

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_updated_at
before update on public.documents
for each row execute function private.touch_updated_at();

-- The ancestors of a document, root first, for the fallback breadcrumb (R2.2).
create function public.document_ancestors(p_document_id uuid)
returns table (id uuid, title text, type public.document_type, deleted_at timestamptz, depth int)
language sql stable set search_path = ''
as $$
  with recursive chain as (
    select d.id, d.title, d.type, d.deleted_at, d.parent_document_id, 0 as depth
    from public.documents d where d.id = p_document_id
    union all
    select p.id, p.title, p.type, p.deleted_at, p.parent_document_id, c.depth + 1
    from public.documents p join chain c on p.id = c.parent_document_id
  )
  select chain.id, chain.title, chain.type, chain.deleted_at, chain.depth
  from chain where chain.depth > 0 order by chain.depth desc;
$$;

revoke execute on function public.document_ancestors(uuid) from public, anon;
grant execute on function public.document_ancestors(uuid) to authenticated;

-- Deletes an empty folder. Documents hard-delete with their folder, so a
-- folder that still holds live content is refused, and trashed documents in
-- it are detached first so they stay restorable (to the project root).
create function public.delete_folder(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from public.folders where id = p_folder_id;
  if v_org_id is null or not private.has_org_role(v_org_id, 'editor') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  if exists (select 1 from public.folders where parent_folder_id = p_folder_id)
     or exists (select 1 from public.documents where folder_id = p_folder_id and deleted_at is null)
  then
    raise exception 'Move or trash everything in this folder first.' using errcode = 'P0001';
  end if;

  update public.documents set folder_id = null where folder_id = p_folder_id;
  delete from public.folders where id = p_folder_id;
end;
$$;

revoke execute on function public.delete_folder(uuid) from public, anon;
grant execute on function public.delete_folder(uuid) to authenticated;
