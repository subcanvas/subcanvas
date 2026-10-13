begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- The icon in front of a project's or a document's name (migration
-- item_icons): its shape, who may change it, and who sees it. Uses its own
-- email domain and slugs so it passes against a local database that already
-- holds development data.

create function pg_temp.make_user(p_id uuid, p_email text) returns void
language sql as $$
  insert into auth.users (id, email, aud, role, instance_id)
  values (p_id, p_email, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
$$;

create function pg_temp.login(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.logout() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

\set editor  '''e0000000-0000-0000-0000-0000000007e1'''
\set viewer  '''e0000000-0000-0000-0000-0000000007e2'''
\set org     '''00000000-0000-0000-0000-0000000007a1'''
\set project '''00000000-0000-0000-0000-0000000007b1'''
\set parent  '''00000000-0000-0000-0000-0000000007d1'''
\set child   '''00000000-0000-0000-0000-0000000007d2'''

select pg_temp.make_user(:editor, 'editor@icons.pgtap.test');
select pg_temp.make_user(:viewer, 'viewer@icons.pgtap.test');
insert into public.orgs (id, name, slug) values (:org, 'Icons', 'pgtap-icons');
insert into public.org_members (org_id, user_id, role) values (:org, :editor, 'editor'), (:org, :viewer, 'viewer');
insert into public.projects (id, org_id, name, visibility) values (:project, :org, 'Icons', 'public');
insert into public.documents (id, org_id, project_id, type, title) values (:parent, :org, :project, 'whiteboard', 'Parent');
insert into public.documents (id, org_id, project_id, type, title, parent_document_id)
values (:child, :org, :project, 'text', 'Child', :parent);

-- Its shape ----------------------------------------------------------------------------

select lives_ok($$ update public.projects set icon = '{"emoji": "🚀"}' where id = '00000000-0000-0000-0000-0000000007b1' $$,
  'an emoji is an icon');
select lives_ok($$ update public.documents set icon = '{"icon": "database", "color": "green"}'
                   where id = '00000000-0000-0000-0000-0000000007d1' $$,
  'and so is an icon in a color');
select throws_ok($$ update public.projects set icon = '{"emoji": "🚀", "icon": "rocket"}'
                    where id = '00000000-0000-0000-0000-0000000007b1' $$,
  '23514', null, 'not both at once');
select throws_ok($$ update public.projects set icon = '{"icon": "rocket", "color": "chartreuse"}'
                    where id = '00000000-0000-0000-0000-0000000007b1' $$,
  '23514', null, 'nor a color that is not one of the nine');
select throws_ok($$ update public.projects set icon = '"🚀"' where id = '00000000-0000-0000-0000-0000000007b1' $$,
  '23514', null, 'nor anything but an object');

-- Who changes it -----------------------------------------------------------------------

select pg_temp.login(:editor);
update public.documents set icon = '{"emoji": "🧪"}' where id = :child;
select pg_temp.logout();
select is((select icon ->> 'emoji' from public.documents where id = :child), '🧪', 'an editor changes it');

select pg_temp.login(:viewer);
update public.documents set icon = '{"emoji": "💥"}' where id = :child;
update public.projects set icon = null where id = :project;
select pg_temp.logout();
select ok((select icon ->> 'emoji' = '🧪' from public.documents where id = :child)
            and (select icon is not null from public.projects where id = :project),
  'a viewer cannot');

-- Who sees it --------------------------------------------------------------------------

set local role anon;
select is((select icon ->> 'emoji' from public.projects where id = :project), '🚀',
  'a visitor to a public project sees its icon');
select is((select icon ->> 'emoji' from public.documents where id = :child), '🧪', 'and its documents''');
select is((select icon ->> 'icon' from public.document_ancestors(:child)), 'database',
  'the trail above a document carries the icons');
reset role;

insert into public.document_links (org_id, source_document_id, source_object_id, target_document_id) values (:org, :child, 'block-1', :parent);
select pg_temp.login(:viewer);
select is((select source_icon ->> 'emoji' from public.document_references(:parent)), '🧪',
  'and so does what links to one');
select pg_temp.logout();

select * from finish();
rollback;
