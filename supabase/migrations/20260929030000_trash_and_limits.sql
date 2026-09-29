-- Deleting means one thing inside a project, the free plan counts what it
-- says, and making a project public follows one rule on every path.
--
-- 1. Folders go to the trash, like documents, and come back the same way.
--    What is inside something in the trash is out of view with it.
-- 2. The private document limit counts only what is in view (R7.1a): not a
--    document in the trash, and not one inside a trashed document or folder.
--    Bringing something back into view counts everything that comes with it.
-- 3. A description taken away from its whiteboard object is a text document
--    like any other.
-- 4. Making a project public needs an admin, when it is created as well as
--    later (R6.6).
-- 5. The two limit messages people can read in the database say
--    "workspace", like the app.

---------------------------------------------------------------------------
-- Folders go to the trash
---------------------------------------------------------------------------

alter table public.folders add column deleted_at timestamptz;
grant update (deleted_at) on public.folders to authenticated;
grant select (deleted_at) on public.folders to anon;

-- Deleting a folder used to be allowed only when it was empty. It now goes
-- to the trash with what it holds, and is deleted for good from there.
drop function public.delete_folder(uuid);

---------------------------------------------------------------------------
-- What is in view
---------------------------------------------------------------------------

-- Whether a folder, and every folder above it, is out of the trash. No
-- folder is the top of the project, which always is.
create function private.folder_is_live(p_folder_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive up as (
    select f.id, f.parent_folder_id, f.deleted_at from public.folders f where f.id = p_folder_id
    union
    select f.id, f.parent_folder_id, f.deleted_at from public.folders f join up on f.id = up.parent_folder_id
  )
  select p_folder_id is null
    or (exists (select 1 from up) and not exists (select 1 from up where up.deleted_at is not null));
$$;

-- Whether a document is in view: out of the trash, and so is everything it
-- is inside, the documents above it and the folder the topmost one is in.
create function private.document_is_live(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive up as (
    select d.id, d.parent_document_id, d.folder_id, d.deleted_at from public.documents d where d.id = p_document_id
    union
    select d.id, d.parent_document_id, d.folder_id, d.deleted_at
    from public.documents d join up on d.id = up.parent_document_id
  )
  select exists (select 1 from up)
    and not exists (select 1 from up where up.deleted_at is not null)
    and private.folder_is_live((select up.folder_id from up where up.parent_document_id is null));
$$;

-- For the app's document page, which shows nothing that is out of view.
-- Answers only about a document the caller can read.
create function public.document_is_live(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_read_document(p_document_id) and private.document_is_live(p_document_id);
$$;

revoke execute on function public.document_is_live(uuid) from public;
grant execute on function public.document_is_live(uuid) to anon, authenticated;

-- A public project shows only what is in view: not a document inside a
-- trashed document or folder, even to someone holding its address.
create or replace function private.document_is_public(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    join public.projects p on p.id = d.project_id
    where d.id = p_document_id
      and p.visibility = 'public' and p.taken_down_at is null
  ) and private.document_is_live(p_document_id);
$$;

drop policy "documents: anyone reads public" on public.documents;
create policy "documents: anyone reads public" on public.documents
  for select to anon, authenticated
  using (deleted_at is null and private.project_is_public(project_id) and private.document_is_live(id));

drop policy "folders: anyone reads public" on public.folders;
create policy "folders: anyone reads public" on public.folders
  for select to anon, authenticated
  using (private.project_is_public(project_id) and private.folder_is_live(id));

---------------------------------------------------------------------------
-- Counting what is in view (R7.1a)
---------------------------------------------------------------------------

-- The standard documents in view in an org's private projects, or, given a
-- project, in that one project whatever its visibility. Walked from the top
-- down, so a document in the trash hides everything inside it.
create function private.live_document_count(p_org_id uuid, p_project_id uuid default null)
returns integer
language sql stable security definer set search_path = ''
as $$
  with recursive projects as (
    select p.id from public.projects p
    where p.org_id = p_org_id
      and (p.id = p_project_id or (p_project_id is null and p.visibility = 'private'))
  ), live_folders as (
    select f.id from public.folders f
    where f.project_id in (select id from projects) and f.parent_folder_id is null and f.deleted_at is null
    union
    select f.id from public.folders f join live_folders l on f.parent_folder_id = l.id
    where f.deleted_at is null
  ), live as (
    select d.id, d.kind from public.documents d
    where d.project_id in (select id from projects)
      and d.deleted_at is null and d.parent_document_id is null
      and (d.folder_id is null or d.folder_id in (select id from live_folders))
    union
    select c.id, c.kind from public.documents c join live on c.parent_document_id = live.id
    where c.deleted_at is null
  )
  select count(*)::integer from live where kind = 'standard';
$$;

create or replace function private.private_document_count(p_org_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select private.live_document_count(p_org_id);
$$;

-- The standard documents inside a document that come into view with it:
-- nested in it, and not in the trash themselves. The document itself is
-- left out; the caller knows what it is about to become.
create function private.nested_document_count(p_document_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  with recursive below as (
    select c.id, c.kind from public.documents c
    where c.parent_document_id = p_document_id and c.deleted_at is null
    union
    select c.id, c.kind from public.documents c join below on c.parent_document_id = below.id
    where c.deleted_at is null
  )
  select count(*)::integer from below where kind = 'standard';
$$;

-- The standard documents that come into view with a folder: in it and in
-- the folders inside it, nested or not, except what is in the trash itself.
create function private.folder_document_count(p_folder_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  with recursive folders as (
    select p_folder_id as id
    union
    select f.id from public.folders f join folders on f.parent_folder_id = folders.id
    where f.deleted_at is null
  ), live as (
    select d.id, d.kind from public.documents d
    where d.folder_id in (select id from folders) and d.deleted_at is null
    union
    select c.id, c.kind from public.documents c join live on c.parent_document_id = live.id
    where c.deleted_at is null
  )
  select count(*)::integer from live where kind = 'standard';
$$;

-- Whether the free plan's document limit applies to a project right now.
create function private.counts_private_documents(p_org_id uuid, p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select free_private_document_limit from private.config) is not null
    and not private.org_is_paid(p_org_id)
    and (select visibility from public.projects where id = p_project_id) = 'private';
$$;

-- Creating a document, or bringing one into view: restoring it, or moving
-- it out of something in the trash. What comes into view with it counts
-- too, so restoring a whiteboard brings back everything nested in it at
-- once or not at all.
create or replace function private.enforce_private_document_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_adding integer;
begin
  if tg_op = 'INSERT' and new.kind <> 'standard' then
    return new;
  end if;
  if not private.counts_private_documents(new.org_id, new.project_id) then
    return new;
  end if;
  -- Out of view after the change: nothing is added.
  if new.deleted_at is not null
     or (new.parent_document_id is not null and not private.document_is_live(new.parent_document_id))
     or not private.folder_is_live(new.folder_id)
  then
    return new;
  end if;

  v_adding := (new.kind = 'standard')::integer;
  if tg_op = 'UPDATE' then
    if old.deleted_at is null
       and (old.parent_document_id is null or private.document_is_live(old.parent_document_id))
       and private.folder_is_live(old.folder_id)
    then
      -- In view before as well: only becoming a standard document counts.
      v_adding := v_adding - (old.kind = 'standard')::integer;
    else
      v_adding := v_adding + private.nested_document_count(new.id);
    end if;
  end if;

  if v_adding > 0 then
    perform private.check_private_document_limit(new.org_id, v_adding);
  end if;
  return new;
end;
$$;

drop trigger enforce_private_document_limit on public.documents;
create trigger enforce_private_document_limit
before insert or update of deleted_at, kind, folder_id, parent_document_id, parent_object_id
on public.documents
for each row execute function private.enforce_private_document_limit();

-- The same for a folder restored from the trash, or moved out of one.
create function private.enforce_private_document_limit_on_folders()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_adding integer;
begin
  if not private.counts_private_documents(new.org_id, new.project_id)
     or new.deleted_at is not null
     or not private.folder_is_live(new.parent_folder_id)
     or (old.deleted_at is null and private.folder_is_live(old.parent_folder_id))
  then
    return new;
  end if;
  v_adding := private.folder_document_count(new.id);
  if v_adding > 0 then
    perform private.check_private_document_limit(new.org_id, v_adding);
  end if;
  return new;
end;
$$;

create trigger enforce_private_document_limit
before update of deleted_at, parent_folder_id on public.folders
for each row execute function private.enforce_private_document_limit_on_folders();

-- Making a public project private brings what is in view in it under the
-- limit. A project with nothing to count is never refused.
create or replace function private.enforce_limit_on_going_private()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_adding integer;
begin
  if old.visibility = 'public' and new.visibility = 'private' then
    v_adding := private.live_document_count(new.org_id, new.id);
    if v_adding > 0 then
      perform private.check_private_document_limit(new.org_id, v_adding);
    end if;
  end if;
  return new;
end;
$$;

---------------------------------------------------------------------------
-- A description taken away from its object
---------------------------------------------------------------------------

-- A description is the notes of one whiteboard object (R4.2), hidden from
-- the tree and free. Taken away from its object (restored after the object
-- was deleted, or moved elsewhere) it would be hidden with nothing to open
-- it from, so it becomes a text document like any other: in the tree, and
-- counted. Named to run before enforce_private_document_limit, which then
-- counts it.
create function private.detach_description()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind = 'description' and new.parent_object_id is null and old.parent_object_id is not null then
    new.kind := 'standard';
  end if;
  return new;
end;
$$;

create trigger detach_description
before update of parent_object_id on public.documents
for each row execute function private.detach_description();

---------------------------------------------------------------------------
-- Restoring from the trash
---------------------------------------------------------------------------

-- Takes a document out of the trash. It goes back where it was when that
-- place is in view; a place in the trash would hide it again, so otherwise
-- it goes to the top of the project. `p_object_gone` says the whiteboard
-- object that held it no longer exists (the caller read the whiteboard): it
-- then stays under that whiteboard as a document of its own. Runs as the
-- caller, so row-level security decides who may.
create function public.restore_document(p_document_id uuid, p_object_gone boolean default false)
returns table (parent_document_id uuid, folder_id uuid)
language sql security invoker set search_path = ''
as $$
  update public.documents d set
    deleted_at = null,
    parent_document_id = case when private.document_is_live(d.parent_document_id) then d.parent_document_id end,
    parent_object_id = case
      when private.document_is_live(d.parent_document_id) and not p_object_gone then d.parent_object_id
    end,
    folder_id = case when private.folder_is_live(d.folder_id) then d.folder_id end
  where d.id = p_document_id and d.deleted_at is not null
  returning d.parent_document_id, d.folder_id;
$$;

-- The same for a folder, with everything inside it.
create function public.restore_folder(p_folder_id uuid)
returns table (parent_folder_id uuid)
language sql security invoker set search_path = ''
as $$
  update public.folders f set
    deleted_at = null,
    parent_folder_id = case when private.folder_is_live(f.parent_folder_id) then f.parent_folder_id end
  where f.id = p_folder_id and f.deleted_at is not null
  returning f.parent_folder_id;
$$;

revoke execute on function public.restore_document(uuid, boolean) from public, anon;
revoke execute on function public.restore_folder(uuid) from public, anon;
grant execute on function public.restore_document(uuid, boolean) to authenticated;
grant execute on function public.restore_folder(uuid) to authenticated;

-- What deleting a folder for good orphans in Storage: the files of every
-- document in it and in the folders inside it, nested or not. Like
-- media_objects, and empty for anyone who is not an editor of its org.
create function public.folder_media_objects(p_folder_id uuid)
returns table (bucket_id text, name text)
language sql stable security definer set search_path = ''
as $$
  with recursive folders as (
    select f.id, f.org_id from public.folders f
    where f.id = p_folder_id and private.has_org_role(f.org_id, 'editor')
    union
    select f.id, f.org_id from public.folders f join folders on f.parent_folder_id = folders.id
  ), doomed as (
    select d.id from public.documents d where d.folder_id in (select id from folders)
    union
    select c.id from public.documents c join doomed on c.parent_document_id = doomed.id
  )
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('media-images', 'media-videos')
    and split_part(o.name, '/', 1) = (select org_id::text from folders where id = p_folder_id)
    and split_part(o.name, '/', 3) in (select id::text from doomed);
$$;

revoke execute on function public.folder_media_objects(uuid) from public, anon;
grant execute on function public.folder_media_objects(uuid) to authenticated;

---------------------------------------------------------------------------
-- Making a project public needs an admin (R6.6)
---------------------------------------------------------------------------

-- On every path: creating a project public (the New project dialog, a
-- GitHub import, an agent) and changing it later. Owners are admins too. The
-- service role (no auth.uid()) is the operator and is not stopped.
create or replace function private.guard_project_visibility()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.has_org_role(new.org_id, 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' and new.visibility = 'public' then
    raise exception 'Only an admin can make a project public.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.visibility is distinct from old.visibility then
    raise exception 'Only an admin can change who can see a project.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_new_project_visibility
before insert on public.projects
for each row execute function private.guard_project_visibility();

---------------------------------------------------------------------------
-- Words people read
---------------------------------------------------------------------------

-- The app shows its own words for the limit (lib/billing/limit.ts), with
-- the number read from this message; SQL users and the dashboard read this.
create or replace function private.check_private_document_limit(p_org_id uuid, p_adding integer)
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
    raise exception 'This would take the workspace past the free limit of % private whiteboards and pages.', v_limit
      using errcode = 'GN001',
            hint = 'An owner can upgrade to Pro. What is in public projects or in the trash does not count.';
  end if;
end;
$$;

-- The same cap as in the migration media_storage_limit, with its messages
-- in the words the app now uses, and a hint that says how space is freed:
-- a removed picture's file goes once its removal can no longer be undone,
-- and a whiteboard's files go when it is deleted from the trash for good.
-- Both messages keep "storage for pictures and videos", which is how the
-- app tells them from any other refusal (src/lib/whiteboard/media.ts).
create or replace function private.enforce_media_storage_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit bigint;
  v_org_id uuid;
  v_new bigint;
  v_old bigint := 0;
  v_before bigint;
begin
  if new.bucket_id not in ('media-images', 'media-videos') then
    return new;
  end if;
  v_org_id := private.media_org(new.name);
  if v_org_id is null then
    return new;
  end if;
  v_limit := private.media_storage_limit(v_org_id);
  if v_limit is null then
    return new;
  end if;

  v_new := private.media_object_bytes(new.metadata);
  -- An update within the org replaces what the row counted before.
  if tg_op = 'UPDATE'
     and old.bucket_id in ('media-images', 'media-videos')
     and private.media_org(old.name) = v_org_id
  then
    v_old := private.media_object_bytes(old.metadata);
    if v_new <= v_old then
      return new; -- it did not grow
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media-storage:' || v_org_id::text, 0));
  -- Everything else the org keeps: the row being updated is still there
  -- with its old size, and is taken out.
  v_before := private.media_bytes(v_org_id) - v_old;

  -- An org already at the cap is refused even a file of unknown size.
  if v_before >= v_limit or v_before + v_new > v_limit then
    if private.org_is_paid(v_org_id)
       or exists (select 1 from private.org_media_storage_limits where org_id = v_org_id)
    then
      raise exception 'This file does not fit in what is left of this workspace''s % of storage for pictures and videos.',
        private.media_size_words(v_limit)
        using errcode = '42501',
              hint = 'Delete pictures and videos you no longer need: their files are freed once you leave the whiteboard. A whiteboard in the trash keeps its files until it is deleted forever.';
    end if;
    raise exception 'The free plan includes % of storage for pictures and videos, and this file does not fit in what is left.',
      private.media_size_words(v_limit)
      using errcode = '42501',
            hint = 'Delete pictures and videos you no longer need: their files are freed once you leave the whiteboard. A whiteboard in the trash keeps its files until it is deleted forever.';
  end if;
  return new;
end;
$$;
