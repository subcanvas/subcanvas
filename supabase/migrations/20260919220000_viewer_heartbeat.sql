-- How many people are watching a document without editing it.
--
-- Viewers do not hold a Realtime connection: they re-read the document every
-- few seconds, and that same request records a heartbeat here. The count is a
-- little stale by design. A Realtime presence per viewer would make a popular
-- public page expensive, since every join is announced to everyone else.

-- Unlogged: losing this table in a crash loses nothing that matters.
create unlogged table public.document_viewers (
  document_id uuid not null references public.documents (id) on delete cascade,
  session_id uuid not null,
  last_seen timestamptz not null default now(),
  primary key (document_id, session_id)
);

alter table public.document_viewers enable row level security;
revoke all on public.document_viewers from anon, authenticated;

-- Members can read a document. So can anyone, when its project is public.
create function private.can_read_document(p_document_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    join public.projects p on p.id = d.project_id
    where d.id = p_document_id
      and (p.visibility = 'public' or private.has_org_role(d.org_id, 'viewer'))
  );
$$;

create function private.live_viewer_count(p_document_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.document_viewers
  where document_id = p_document_id and last_seen > now() - interval '45 seconds';
$$;

-- Called by a viewer on every refresh. Returns how many are watching.
create function public.viewer_heartbeat(p_document_id uuid, p_session_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_read_document(p_document_id) then
    return 0;
  end if;

  insert into public.document_viewers (document_id, session_id)
  values (p_document_id, p_session_id)
  on conflict (document_id, session_id) do update set last_seen = now();

  delete from public.document_viewers
  where document_id = p_document_id and last_seen < now() - interval '5 minutes';

  return private.live_viewer_count(p_document_id);
end;
$$;

-- Called by editors, who are counted through Realtime presence instead.
create function public.viewer_count(p_document_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case when private.can_read_document(p_document_id)
    then private.live_viewer_count(p_document_id) else 0 end;
$$;

grant execute on function public.viewer_heartbeat(uuid, uuid) to anon, authenticated;
grant execute on function public.viewer_count(uuid) to anon, authenticated;
