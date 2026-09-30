-- What is out of view is in the trash, everywhere.
--
-- The migration trash_and_limits made a document inside a trashed folder or
-- document out of view (private.document_is_live), and the document pages
-- and the free plan's count follow it. This applies the same rule to what
-- else reads the tree:
--
-- 1. "Linked from" and the warning before trashing (R1.7, R1.8) list only
--    documents in view, and a folder can be asked for what links into it.
-- 2. One question for the app: which documents of a project are in view,
--    and how many.
-- 3. Nothing is put inside something that is out of view: it would be in no
--    tree, in no trash list, counted nowhere, and deleted with the folder
--    without anyone seeing it go.

---------------------------------------------------------------------------
-- What links to a document or a folder
---------------------------------------------------------------------------

-- Everywhere a document appears other than its home, for "Linked from"
-- (R1.7) and the warning before trashing it (R1.8). Only documents in view
-- are listed: not one in the trash, nor one inside something in the trash.
create or replace function public.document_references(p_document_id uuid)
returns table (source_document_id uuid, source_title text, source_type public.document_type, project_id uuid)
language sql stable set search_path = ''
as $$
  select distinct s.id, s.title, s.type, s.project_id
  from public.document_links l
  join public.documents s on s.id = l.source_document_id
  where l.target_document_id = p_document_id and s.deleted_at is null and private.document_is_live(s.id)
  order by s.title;
$$;

-- The same for everything in view inside a folder, before the folder goes
-- to the trash: the documents in view outside it that link to one inside.
-- What links from inside the folder goes to the trash with it and is left
-- out.
create function public.folder_references(p_folder_id uuid)
returns table (source_document_id uuid, source_title text, source_type public.document_type, project_id uuid)
language sql stable set search_path = ''
as $$
  with recursive folders as (
    select f.id from public.folders f where f.id = p_folder_id and f.deleted_at is null
    union
    select f.id from public.folders f join folders on f.parent_folder_id = folders.id
    where f.deleted_at is null
  ), inside as (
    select d.id from public.documents d
    where d.folder_id in (select id from folders) and d.deleted_at is null
    union
    select c.id from public.documents c join inside on c.parent_document_id = inside.id
    where c.deleted_at is null
  )
  select distinct s.id, s.title, s.type, s.project_id
  from public.document_links l
  join public.documents s on s.id = l.source_document_id
  where l.target_document_id in (select id from inside)
    and s.id not in (select id from inside)
    and s.deleted_at is null and private.document_is_live(s.id)
  order by s.title;
$$;

revoke execute on function public.folder_references(uuid) from public, anon;
grant execute on function public.folder_references(uuid) to authenticated;

---------------------------------------------------------------------------
-- Which documents of a project are in view
---------------------------------------------------------------------------

-- The documents in view in a project, descriptions included, walked from
-- the top down as private.live_document_count does, so something in the
-- trash hides everything inside it. Runs as the caller: row-level security
-- decides what they get. The app filters and orders what this returns as it
-- would the table (the pickers that link an existing document). For members:
-- a public reader's rows are already only what is in view.
create function public.documents_in_view(p_project_id uuid)
returns setof public.documents
language sql stable set search_path = ''
as $$
  with recursive live_folders as (
    select f.id from public.folders f
    where f.project_id = p_project_id and f.parent_folder_id is null and f.deleted_at is null
    union
    select f.id from public.folders f join live_folders l on f.parent_folder_id = l.id
    where f.deleted_at is null
  ), live as (
    select d.id from public.documents d
    where d.project_id = p_project_id and d.deleted_at is null and d.parent_document_id is null
      and (d.folder_id is null or d.folder_id in (select id from live_folders))
    union
    select c.id from public.documents c join live on c.parent_document_id = live.id
    where c.deleted_at is null
  )
  select d.* from public.documents d where d.id in (select id from live);
$$;

-- How many whiteboards and pages a project shows: its documents in view,
-- descriptions aside. Takes the project's row, so a list of projects reads
-- it like a column (`document_count`).
create function public.document_count(p_project public.projects)
returns integer
language sql stable set search_path = ''
as $$
  select count(*)::integer from public.documents_in_view(p_project.id) d where d.kind = 'standard';
$$;

revoke execute on function public.documents_in_view(uuid) from public, anon;
revoke execute on function public.document_count(public.projects) from public, anon;
grant execute on function public.documents_in_view(uuid) to authenticated;
grant execute on function public.document_count(public.projects) to authenticated;

---------------------------------------------------------------------------
-- Nothing goes inside something that is out of view
---------------------------------------------------------------------------

-- Creating a document or folder in a place that is in the trash, or inside
-- something that is, or moving one there, is refused. People never see
-- such a place in the tree; an agent, or a page left open while someone
-- else trashed the folder, is told why. Only a change of place is checked:
-- what already is out of view can still be edited, trashed and restored.
-- Checked for the people and agents the API serves; the operator (the
-- service role, or SQL) is not stopped. Runs as the caller to know which.
create function private.check_home_in_view()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_table_name = 'folders' then
    if new.parent_folder_id is not null
       and (tg_op = 'INSERT' or new.parent_folder_id is distinct from old.parent_folder_id)
       and not private.folder_is_live(new.parent_folder_id)
    then
      raise exception 'That folder is in the trash, or inside a folder that is. Restore it first, or choose another place.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.folder_id is not null
     and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id)
     and not private.folder_is_live(new.folder_id)
  then
    raise exception 'That folder is in the trash, or inside a folder that is. Restore it first, or choose another place.'
      using errcode = 'P0001';
  end if;
  if new.parent_document_id is not null
     and (tg_op = 'INSERT' or new.parent_document_id is distinct from old.parent_document_id)
     and not private.document_is_live(new.parent_document_id)
  then
    raise exception 'That document is in the trash, or inside something that is. Restore it first, or choose another place.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_home_in_view
before insert or update of folder_id, parent_document_id on public.documents
for each row execute function private.check_home_in_view();

create trigger check_home_in_view
before insert or update of parent_folder_id on public.folders
for each row execute function private.check_home_in_view();
