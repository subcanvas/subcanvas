begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Uses its own email domain and slugs so it passes against a local database
-- that already holds development data.

create function pg_temp.make_user(p_id uuid, p_email text) returns void
language sql as $$
  insert into auth.users (id, email, aud, role, instance_id)
  values (p_id, p_email, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
$$;

create function pg_temp.login(p_id uuid, p_email text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'email', p_email, 'role', 'authenticated')::text, true);
end;
$$;

create function pg_temp.logout() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

\set member   '''e0000000-0000-0000-0000-0000000005e1'''
\set outsider '''a1000000-0000-0000-0000-0000000005e2'''
\set org      '''00000000-0000-0000-0000-0000000005a1'''
\set open     '''00000000-0000-0000-0000-0000000005b1'''
\set shut     '''00000000-0000-0000-0000-0000000005b2'''

select pg_temp.make_user(:member,   'member@addresses.pgtap.test');
select pg_temp.make_user(:outsider, 'outsider@addresses.pgtap.test');
insert into public.orgs (id, name, slug) values (:org, 'Addresses', 'pgtap-addresses');
insert into public.org_members (org_id, user_id, role) values (:org, :member, 'editor');

-- A project's address ------------------------------------------------------------------
insert into public.projects (id, org_id, name, visibility) values
  (:open, :org, 'System Design: v2!', 'public'),
  (:shut, :org, 'System design v2', 'private');
insert into public.projects (org_id, name, slug) values (:org, 'Settings', 'chosen-by-client');
insert into public.projects (org_id, name) values (:org, '設計');

select is((select slug from public.projects where id = :open), 'system-design-v2',
  'a project''s address is its title in lowercase letters, digits and hyphens');
select is((select slug from public.projects where id = :shut), 'system-design-v2-2',
  'a second project with the same name is numbered');
select is((select slug from public.projects where org_id = :org and name = 'Settings'), 'settings-2',
  'a name the workspace''s own pages use is numbered, and a client cannot choose the address');
select is((select slug from public.projects where org_id = :org and name = '設計'), 'project',
  'a title with nothing usable in an address still gets one');

select pg_temp.login(:member, 'member@addresses.pgtap.test');
select throws_ok($$ update public.projects set slug = 'mine' where id = '00000000-0000-0000-0000-0000000005b1' $$,
  '42501', null, 'a project''s address cannot be changed');
update public.projects set visibility = 'public' where id = :open;
select is((select slug from public.projects where id = :open), 'system-design-v2',
  'changing anything but the name keeps a project''s address');
update public.projects set name = 'Renamed' where id = :open;
select is((select slug from public.projects where id = :open), 'renamed',
  'renaming a project moves its address to the new name');
select is((select project_id from public.find_project('pgtap-addresses', 'system-design-v2')), :open::uuid,
  'and its old address still finds it');

-- A document's code ---------------------------------------------------------------------
insert into public.documents (id, org_id, project_id, type, title) values
  ('c28c38dd-0000-4000-8000-000000000001', :org, :open, 'whiteboard', 'Dispatch'),
  ('c28c38dd-0000-4000-8000-000000000002', :org, :open, 'whiteboard', 'Dispatch');
select is((select code from public.documents where id = 'c28c38dd-0000-4000-8000-000000000001'), 'c28c38dd',
  'a document''s code is the start of its id');
select is((select code from public.documents where id = 'c28c38dd-0000-4000-8000-000000000002'), 'c28c38dd00',
  'a document whose id starts like another''s gets a longer code');
select throws_ok($$ update public.documents set code = 'abcdef12'
                    where id = 'c28c38dd-0000-4000-8000-000000000001' $$,
  '42501', null, 'a document''s code cannot be changed');

-- Finding a project by its address ---------------------------------------------------------
select is((select project_id from public.find_project('pgtap-addresses', 'system-design-v2-2')), :shut::uuid,
  'a member finds a private project by its address');
select is((select project_id from public.find_project('PGTAP-Addresses', :shut)), :shut::uuid,
  'and by its id, from an address made before short names');

select pg_temp.login(:outsider, 'outsider@addresses.pgtap.test');
select is((select count(*) from public.find_project('pgtap-addresses', 'system-design-v2-2')), 0::bigint,
  'someone outside the workspace does not find a private project');
select is((select member from public.find_project('pgtap-addresses', 'renamed')), false,
  'they find a public one, as a visitor');
select throws_ok($$ select * from public.project_previous_slugs $$, '42501', null,
  'old addresses are not readable directly');

select pg_temp.logout();
set local role anon;
select is((select workspace || '/' || project from public.project_address(:open)), 'pgtap-addresses/renamed',
  'anyone can turn a public project''s id into its address');
select is((select count(*) from public.project_address(:shut)), 0::bigint,
  'but not a private one''s');

reset role;
update public.projects set taken_down_at = now() where id = :open;
set local role anon;
select is((select count(*) from public.find_project('pgtap-addresses', 'renamed')), 0::bigint,
  'a project taken down by the operator has no public address');

-- A new project may take a name another project gave up ------------------------------------
reset role;
insert into public.projects (org_id, name) values (:org, 'System design v2');
select pg_temp.login(:member, 'member@addresses.pgtap.test');
select is((select p.name from public.find_project('pgtap-addresses', 'system-design-v2') f
           join public.projects p on p.id = f.project_id), 'System design v2',
  'and then the name leads to the new project');

select * from finish();
rollback;
