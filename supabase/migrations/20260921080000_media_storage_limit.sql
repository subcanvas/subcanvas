-- A cap on how much an org can keep in pictures and videos, across both
-- media buckets, so a free server cannot be used as unlimited file hosting.
--
-- Like the plan limits (billing migration), the cap is data, not schema: it
-- is off unless a deployment sets it, so a self-hosted server stores as much
-- as its Storage allows. A deployment turns it on with, for example, 1 GB:
--   update private.config set media_storage_limit_bytes = 1073741824;
-- It applies to every org, paid or not: a subscription pays for editors, and
-- the cap is what keeps one org from filling the project's Storage.

alter table private.config
  add column media_storage_limit_bytes bigint check (media_storage_limit_bytes >= 0);

-- The size of one object: what Storage measured once it has the file, or,
-- before that, the length the uploader declared. Unknown counts as nothing.
create function private.media_object_bytes(p_metadata jsonb)
returns bigint
language sql immutable set search_path = ''
as $$
  select case
    when jsonb_typeof(p_metadata -> 'size') = 'number' then (p_metadata ->> 'size')::numeric::bigint
    when jsonb_typeof(p_metadata -> 'contentLength') = 'number' then (p_metadata ->> 'contentLength')::numeric::bigint
    else 0
  end;
$$;

-- The bytes an org keeps in the two media buckets. Storage records a file's
-- size in `metadata.size` when the file has arrived. Read through the index
-- on (bucket_id, name collate "C"): an org's files are the names between
-- "<org>/" and "<org>0", '0' being the character after '/'.
create function private.media_bytes(p_org_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(private.media_object_bytes(o.metadata)), 0)::bigint
  from storage.objects o
  where o.bucket_id in ('media-images', 'media-videos')
    and o.name collate "C" >= p_org_id::text || '/'
    and o.name collate "C" < p_org_id::text || '0';
$$;

-- Where the cap is enforced, and why here.
--
-- Row-level security cannot do it alone. An upload reaches the database
-- twice (supabase/storage, src/storage/uploader.ts):
--
--   1. Before any bytes are stored, Storage tests the insert as the person
--      uploading, inside a transaction it rolls back. This is where the
--      policies run. The row's metadata then holds only what the request
--      declared: the Content-Length, which the client chooses, and which is
--      missing altogether for a chunked or resumable upload.
--   2. After the file is stored, Storage inserts the row for real as its own
--      superuser, with `metadata.size` as measured from the stored file.
--      Policies do not run for that role; triggers do.
--
-- So a trigger on storage.objects, which runs both times, is what holds:
--
--   - At step 1 it refuses an upload whose declared length would not fit,
--     or any upload at all once the org is at the cap, before the bytes are
--     sent. A client that under-declares gets past this, and only this.
--   - At step 2 it refuses a file whose measured size does not fit. Storage
--     then deletes the stored bytes and answers the upload with an error,
--     so nothing counts that was not measured.
--   - A copy (a picture pasted from another whiteboard) inserts a row that
--     already carries the original's size, and is counted the same way.
--   - An update that grows a row's size or moves it into another org is
--     counted too, should a version of Storage ever fill the size in later.
--
-- Several uploads at once are taken one at a time per org (an advisory
-- lock held to the end of each insert's transaction), so two files cannot
-- each fit alone and together go over.
--
-- The error is 42501 with a message of our own: Storage turns that code
-- into a 403 and passes the message through, where a code of our own (like
-- the plan limits' GN001) would reach the browser only as a bare 500. The
-- upload code in the app recognises the message (src/lib/whiteboard/media.ts).
create function private.enforce_media_storage_limit()
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
  select media_storage_limit_bytes into v_limit from private.config;
  v_org_id := private.media_org(new.name);
  if v_limit is null or v_org_id is null then
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
    raise exception 'This org has used its storage for pictures and videos (% of % bytes).', v_before, v_limit
      using errcode = '42501',
            hint = 'Delete whiteboards with pictures or videos you no longer need, then empty them from the trash.';
  end if;
  return new;
end;
$$;

create trigger enforce_media_storage_limit
before insert or update of bucket_id, name, metadata on storage.objects
for each row execute function private.enforce_media_storage_limit();

-- What the settings page shows: the bytes the org keeps and the cap, which is
-- null when there is none. Any member may see it.
create function public.org_media_usage(p_org_id uuid)
returns table (used_bytes bigint, limit_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select private.media_bytes(p_org_id), c.media_storage_limit_bytes
  from private.config c
  where private.has_org_role(p_org_id, 'viewer');
$$;

revoke execute on function public.org_media_usage(uuid) from public, anon;
grant execute on function public.org_media_usage(uuid) to authenticated;
