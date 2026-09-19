begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Uses its own slugs and ids so it passes against a local database that
-- already holds development data.

\set org      '''00000000-0000-0000-0000-0000000005a1'''
\set imported '''00000000-0000-0000-0000-0000000005b1'''
\set drawn    '''00000000-0000-0000-0000-0000000005b2'''
\set stale    '''00000000-0000-0000-0000-0000000005b3'''
\set readme   '''00000000-0000-0000-0000-0000000005d1'''

insert into auth.users (id, email, aud, role, instance_id)
select ('e5000000-0000-0000-0000-00000000000' || n)::uuid, 'source-' || n || '@pgtap.test',
       'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;

insert into public.orgs (id, name, slug) values (:org, 'Source', 'pgtap-source');
insert into public.org_members (org_id, user_id, role) values
  (:org, 'e5000000-0000-0000-0000-000000000001', 'editor'),
  (:org, 'e5000000-0000-0000-0000-000000000002', 'editor'),
  (:org, 'e5000000-0000-0000-0000-000000000003', 'viewer');

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end; $$;

-- Recording a source -------------------------------------------------------------

select pg_temp.as_user('e5000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into public.projects (id, org_id, name, visibility, created_by, source) values
       ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005a1', 'shop', 'public',
        'e5000000-0000-0000-0000-000000000001',
        '{"provider": "github", "repository": "acme/shop", "ref": "main", "commit": "abc"}'),
       ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000005a1', 'Drawn by hand', 'private',
        'e5000000-0000-0000-0000-000000000001', null) $$,
  'an editor can create a project that records where it came from');
select lives_ok(
  $$ insert into public.documents (id, org_id, project_id, type, title, source) values
       ('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000005a1',
        '00000000-0000-0000-0000-0000000005b1', 'text', 'README',
        '{"provider": "github", "repository": "acme/shop", "path": "README.md", "commit": "abc"}') $$,
  'and a document that does');
select is((select source ->> 'path' from public.documents where id = :readme), 'README.md',
  'members read a document''s source');
select throws_ok(
  $$ update public.documents set source = null where id = '00000000-0000-0000-0000-0000000005d1' $$,
  '42501', null, 'a source cannot be changed afterwards, so an imported README stays marked as one');
select throws_ok(
  $$ update public.projects set source = null where id = '00000000-0000-0000-0000-0000000005b1' $$,
  '42501', null, 'nor can a project''s');

set local role anon;
select is((select source ->> 'repository' from public.documents where id = :readme), 'acme/shop',
  'anonymous readers of a public project see where a document came from');

-- Discarding a failed import --------------------------------------------------------

select pg_temp.as_user('e5000000-0000-0000-0000-000000000002');
select public.discard_import(:imported);
select is((select count(*) from public.projects where id = :imported), 1::bigint,
  'an editor cannot discard someone else''s import');

select pg_temp.as_user('e5000000-0000-0000-0000-000000000001');
select public.discard_import(:drawn);
select is((select count(*) from public.projects where id = :drawn), 1::bigint,
  'a project that was not imported cannot be discarded');

select set_config('role', 'postgres', true);
insert into public.projects (id, org_id, name, created_by, created_at, source) values
  (:stale, :org, 'Imported last week', 'e5000000-0000-0000-0000-000000000001', now() - interval '7 days',
   '{"provider": "github", "repository": "acme/old", "ref": "main", "commit": "abc"}');
select pg_temp.as_user('e5000000-0000-0000-0000-000000000001');
select public.discard_import(:stale);
select is((select count(*) from public.projects where id = :stale), 1::bigint,
  'an import that has been around for a while cannot be discarded');

select public.discard_import(:imported);
select is((select count(*) from public.projects where id = :imported), 0::bigint,
  'the editor who started an import can discard it');
select is((select count(*) from public.documents where id = :readme), 0::bigint,
  'and its documents go with it');

select * from finish();
rollback;
