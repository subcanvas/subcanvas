begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Uses its own slugs and ids so it passes against a local database that
-- already holds development data.

\set org     '''00000000-0000-0000-0000-0000000002a1'''
\set other   '''00000000-0000-0000-0000-0000000002a2'''
\set project '''00000000-0000-0000-0000-0000000002b1'''
\set foreign '''00000000-0000-0000-0000-0000000002b2'''
\set board   '''00000000-0000-0000-0000-0000000002d1'''
\set note    '''00000000-0000-0000-0000-0000000002d2'''
\set secret  '''00000000-0000-0000-0000-0000000002d3'''

insert into auth.users (id, email, aud, role, instance_id) values
  ('e2000000-0000-0000-0000-000000000001', 'links-editor@pgtap.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('f2000000-0000-0000-0000-000000000002', 'links-viewer@pgtap.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

insert into public.orgs (id, name, slug) values (:org, 'Links', 'pgtap-links'), (:other, 'Other', 'pgtap-links-other');
insert into public.org_members (org_id, user_id, role) values
  (:org, 'e2000000-0000-0000-0000-000000000001', 'editor'),
  (:org, 'f2000000-0000-0000-0000-000000000002', 'viewer');
insert into public.projects (id, org_id, name) values (:project, :org, 'P'), (:foreign, :other, 'F');
insert into public.documents (id, org_id, project_id, type, title) values
  (:board, :org, :project, 'whiteboard', 'Board'),
  (:note, :org, :project, 'text', 'Note'),
  (:secret, :other, :foreign, 'text', 'Secret');

create function pg_temp.login(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

select pg_temp.login('e2000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into public.document_links (org_id, source_document_id, source_object_id, target_document_id)
     values ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000002d1', 'node-1',
             '00000000-0000-0000-0000-0000000002d2') $$,
  'an editor can record a link');

select throws_ok(
  $$ insert into public.document_links (org_id, source_document_id, source_object_id, target_document_id)
     values ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000002d1', 'node-2',
             '00000000-0000-0000-0000-0000000002d3') $$,
  'P0001', 'Both documents must belong to this org.',
  'a link cannot point into another org');

select throws_ok(
  $$ insert into public.document_links (org_id, source_document_id, source_object_id, target_document_id)
     values ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000002d1', 'node-3',
             '00000000-0000-0000-0000-0000000002d1') $$,
  'P0001', 'A document cannot link to itself.', 'a document cannot link to itself');

select results_eq(
  $$ select source_title from public.document_references('00000000-0000-0000-0000-0000000002d2') $$,
  $$ values ('Board') $$,
  'references list the linking document');

select pg_temp.login('f2000000-0000-0000-0000-000000000002');
select is((select count(*) from public.document_links where org_id = :org), 1::bigint,
  'a viewer can read links');
select throws_ok(
  $$ insert into public.document_links (org_id, source_document_id, source_object_id, target_document_id)
     values ('00000000-0000-0000-0000-0000000002a1', '00000000-0000-0000-0000-0000000002d1', 'node-4',
             '00000000-0000-0000-0000-0000000002d2') $$,
  '42501', null, 'a viewer cannot record a link');

-- A trashed source no longer counts as a reference; a deleted target takes its links along.
select set_config('role', 'postgres', true);
update public.documents set deleted_at = now() where id = :board;
select is((select count(*) from public.document_references(:note)), 0::bigint,
  'a trashed source is not listed as a reference');
delete from public.documents where id = :note;
select is((select count(*) from public.document_links where org_id = :org), 0::bigint,
  'deleting a document removes the links to it');

select * from finish();
rollback;
