-- An icon in front of a project's or a document's name, everywhere the name
-- is shown: one emoji, or one of the whiteboard's icons in one of its colors
-- (src/lib/item-icon.ts). Null for none, which is every row to begin with.
--
-- Stored as a small JSON object, {"emoji": "🚀"} or {"icon": "rocket",
-- "color": "blue"}. The shape is checked here; that the emoji is one emoji
-- and the icon one the app can draw is checked by the app, which reads
-- anything else as no icon.

create function private.item_icon_shape(p_icon jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_icon is null or (
    jsonb_typeof(p_icon) = 'object'
    and octet_length(p_icon::text) <= 200
    and (
      (p_icon ? 'emoji' and jsonb_typeof(p_icon -> 'emoji') = 'string'
       and not (p_icon ? 'icon') and not (p_icon ? 'color'))
      or
      (p_icon ? 'icon' and jsonb_typeof(p_icon -> 'icon') = 'string'
       and (p_icon ->> 'icon') ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       and not (p_icon ? 'emoji')
       and (not (p_icon ? 'color') or (p_icon ->> 'color') in
            ('default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink')))
    )
  );
$$;

alter table public.projects
  add column icon jsonb check (private.item_icon_shape(icon));
alter table public.documents
  add column icon jsonb check (private.item_icon_shape(icon));

-- Whoever may rename it may change its icon (the same policies decide); a
-- visitor to a public project sees it, as they see the name.
grant update (icon) on public.projects to authenticated;
grant update (icon) on public.documents to authenticated;
grant select (icon) on public.projects to anon;
grant select (icon) on public.documents to anon;

---------------------------------------------------------------------------
-- The trail of documents above one, and what links to one, with icons
---------------------------------------------------------------------------

-- Both return one more column, so both are made again, as they were.
drop function public.document_ancestors(uuid);

create function public.document_ancestors(p_document_id uuid)
returns table (id uuid, title text, type public.document_type, deleted_at timestamptz, depth int, icon jsonb)
language sql stable set search_path = ''
as $$
  with recursive chain as (
    select d.id, d.title, d.type, d.deleted_at, d.parent_document_id, d.icon, 0 as depth
    from public.documents d where d.id = p_document_id
    union all
    select p.id, p.title, p.type, p.deleted_at, p.parent_document_id, p.icon, c.depth + 1
    from public.documents p join chain c on p.id = c.parent_document_id
  )
  select chain.id, chain.title, chain.type, chain.deleted_at, chain.depth, chain.icon
  from chain where chain.depth > 0 order by chain.depth desc;
$$;

revoke execute on function public.document_ancestors(uuid) from public;
grant execute on function public.document_ancestors(uuid) to authenticated, anon;

drop function public.document_references(uuid);

create function public.document_references(p_document_id uuid)
returns table (source_document_id uuid, source_title text, source_type public.document_type, project_id uuid, source_icon jsonb)
language sql stable set search_path = ''
as $$
  select distinct s.id, s.title, s.type, s.project_id, s.icon
  from public.document_links l
  join public.documents s on s.id = l.source_document_id
  where l.target_document_id = p_document_id and s.deleted_at is null and private.document_is_live(s.id)
  order by s.title;
$$;

revoke execute on function public.document_references(uuid) from public;
grant execute on function public.document_references(uuid) to authenticated, anon;
