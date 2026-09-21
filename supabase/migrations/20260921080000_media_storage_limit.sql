-- A cap on how much an org can keep in pictures and videos, across both
-- media buckets, so a free server cannot be used as unlimited file hosting.
--
-- Like the other plan limits (billing migration), the caps are data, not
-- schema: both are off unless a deployment sets them, so a self-hosted
-- server stores as much as its Storage allows. Which one applies is decided
-- by private.org_is_paid, as for the other limits. A deployment that sells
-- subscriptions sets, for example, 1 GB free and 50 GB paid:
--   update private.config
--   set free_media_storage_limit_bytes = 1073741824,
--       paid_media_storage_limit_bytes = 53687091200;
-- Unlike the other limits, a paid org can have a cap too: a subscription
-- pays for editors, and without one a paid org could still fill the
-- project's Storage.

alter table private.config
  add column free_media_storage_limit_bytes bigint check (free_media_storage_limit_bytes >= 0),
  add column paid_media_storage_limit_bytes bigint check (paid_media_storage_limit_bytes >= 0);

-- The cap that applies to an org under its current plan, or null for none.
create function private.media_storage_limit(p_org_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select case when private.org_is_paid(p_org_id)
    then c.paid_media_storage_limit_bytes
    else c.free_media_storage_limit_bytes
  end
  from private.config c;
$$;

-- A size in words for a message: whole gigabytes or megabytes when it is
-- one (the caps usually are), otherwise Postgres's own rendering. Same units
-- as the app (1 GB = 1024^3 bytes).
create function private.media_size_words(p_bytes bigint)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_bytes >= 1073741824 and p_bytes % 1073741824 = 0 then (p_bytes / 1073741824) || ' GB'
    when p_bytes >= 1048576 and p_bytes % 1048576 = 0 then (p_bytes / 1048576) || ' MB'
    else pg_size_pretty(p_bytes)
  end;
$$;

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
-- the plan limits' GN001) would reach the browser only as a bare 500. Both
-- messages contain "storage for pictures and videos", which is how the app
-- tells them from any other refusal (src/lib/whiteboard/media.ts), and are
-- shown to the person uploading as they are.
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
    if private.org_is_paid(v_org_id) then
      raise exception 'This file does not fit in what is left of this org''s % of storage for pictures and videos.',
        private.media_size_words(v_limit)
        using errcode = '42501',
              hint = 'Delete whiteboards with pictures or videos you no longer need, then empty them from the trash.';
    end if;
    raise exception 'The free plan includes % of storage for pictures and videos, and this file does not fit in what is left. Upgrading raises it.',
      private.media_size_words(v_limit)
      using errcode = '42501',
            hint = 'Upgrade, or delete whiteboards with pictures or videos you no longer need and empty them from the trash.';
  end if;
  return new;
end;
$$;

create trigger enforce_media_storage_limit
before insert or update of bucket_id, name, metadata on storage.objects
for each row execute function private.enforce_media_storage_limit();

-- What the settings page shows: the bytes the org keeps and the cap its plan
-- gives it, which is null when there is none. Any member may see it.
create function public.org_media_usage(p_org_id uuid)
returns table (used_bytes bigint, limit_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select private.media_bytes(p_org_id), private.media_storage_limit(p_org_id)
  where private.has_org_role(p_org_id, 'viewer');
$$;

revoke execute on function public.org_media_usage(uuid) from public, anon;
grant execute on function public.org_media_usage(uuid) to authenticated;
