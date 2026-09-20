-- Pictures and videos on a whiteboard. The files live in Supabase Storage,
-- in private buckets, and who may read or write one is decided by the
-- document it sits on: the same rules as the whiteboard itself.
--
-- An object's name is <org id>/<project id>/<document id>/<file id>.<ext>.
-- The document decides access; the org and the project are in the name so
-- that everything an org or a project holds can be found by prefix.

-- Two buckets, because a bucket has one size limit and the two kinds need
-- different ones. Storage enforces both the size and the declared type, so
-- no client can get past them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('media-images', 'media-images', false, 10485760,
   array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']),
  ('media-videos', 'media-videos', false, 104857600,
   array['video/mp4', 'video/webm', 'video/quicktime']);

-- The document a media object belongs to, or null when the name is not one
-- this app would write: the wrong shape, an extension the bucket does not
-- take, or an org and project that are not the document's own.
create function private.media_document(p_bucket_id text, p_name text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_extensions text;
  v_document_id uuid;
begin
  v_extensions := case p_bucket_id
    when 'media-images' then 'png|jpg|webp|gif|avif'
    when 'media-videos' then 'mp4|webm|mov'
  end;
  -- Checked before anything is cast: a cast that fails would abort the query.
  if v_extensions is null
     or p_name !~ format('^%1$s/%1$s/%1$s/%1$s\.(%2$s)$', v_uuid, v_extensions) then
    return null;
  end if;

  select d.id into v_document_id
  from public.documents d
  where d.id = split_part(p_name, '/', 3)::uuid
    and d.org_id = split_part(p_name, '/', 1)::uuid
    and d.project_id = split_part(p_name, '/', 2)::uuid;
  return v_document_id;
end;
$$;

-- Whoever can read the whiteboard can see what is on it: members of the
-- org, and anyone at all while the project is public (R6.6).
create policy "media: readers of the document read" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id in ('media-images', 'media-videos')
    and private.can_read_document(private.media_document(bucket_id, name))
  );

create policy "media: editors upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('media-images', 'media-videos')
    and private.has_document_role(private.media_document(bucket_id, name), 'editor')
  );

-- The org a media object is filed under, or null for a name that does not
-- start with an id. Checked before the cast, which would otherwise abort the
-- query on a malformed name.
create function private.media_org(p_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  if p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then
    return split_part(p_name, '/', 1)::uuid;
  end if;
  return null;
end;
$$;

-- Decided by the org in the name, not by the document: files are removed
-- when their document is deleted for good, and by then it cannot be asked.
-- Nothing can be uploaded under an org's prefix except by its own editors.
create policy "media: editors delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('media-images', 'media-videos')
    and coalesce(private.has_org_role(private.media_org(name), 'editor'), false)
  );

-- Postgres deletes only rows the asker can also see, and a file whose
-- document is gone is seen by nobody under the first policy. An org's
-- editors could read all of these while the documents existed.
create policy "media: editors see what they may delete" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('media-images', 'media-videos')
    and coalesce(private.has_org_role(private.media_org(name), 'editor'), false)
  );

-- There is no update policy: a stored file never changes. A copy is a read
-- and an upload, which the policies above already cover.

-- What an org's editors are about to orphan: the files of a document and of
-- every document inside it, or of the whole org. Deleting a document row
-- cascades to its children, but Storage is not part of that, so the app asks
-- for this list first and removes the files through the Storage API.
create function public.media_objects(p_org_id uuid, p_document_id uuid default null)
returns table (bucket_id text, name text)
language sql stable security definer set search_path = ''
as $$
  with recursive doomed as (
    select d.id from public.documents d where d.id = p_document_id and d.org_id = p_org_id
    union
    select child.id from public.documents child join doomed on child.parent_document_id = doomed.id
  )
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('media-images', 'media-videos')
    and private.has_org_role(p_org_id, 'editor')
    and split_part(o.name, '/', 1) = p_org_id::text
    and (p_document_id is null or split_part(o.name, '/', 3) in (select id::text from doomed));
$$;

revoke execute on function public.media_objects(uuid, uuid) from public, anon;
grant execute on function public.media_objects(uuid, uuid) to authenticated;
