begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Uses its own slugs and ids so it passes against a local database that
-- already holds development data. Runs as postgres: this file tests the
-- integrity triggers, not RLS.

\set org     '''00000000-0000-0000-0000-0000000001a1'''
\set project '''00000000-0000-0000-0000-0000000001b1'''
\set other   '''00000000-0000-0000-0000-0000000001b2'''
\set f1      '''00000000-0000-0000-0000-0000000001f1'''
\set f2      '''00000000-0000-0000-0000-0000000001f2'''
\set d1      '''00000000-0000-0000-0000-0000000001d1'''
\set d2      '''00000000-0000-0000-0000-0000000001d2'''
\set d3      '''00000000-0000-0000-0000-0000000001d3'''

insert into public.orgs (id, name, slug) values (:org, 'Tree', 'pgtap-tree');
insert into public.projects (id, org_id, name) values (:project, :org, 'P'), (:other, :org, 'Other');
insert into public.folders (id, org_id, project_id, parent_folder_id, name) values
  (:f1, :org, :project, null, 'outer'),
  (:f2, :org, :project, :f1, 'inner');
insert into public.documents (id, org_id, project_id, type, parent_document_id) values
  (:d1, :org, :project, 'text', null),
  (:d2, :org, :project, 'whiteboard', :d1),
  (:d3, :org, :project, 'text', :d2);

select throws_ok(
  $$ update public.folders set parent_folder_id = '00000000-0000-0000-0000-0000000001f2'
     where id = '00000000-0000-0000-0000-0000000001f1' $$,
  'P0001', 'A folder cannot be moved inside itself.',
  'a folder cannot move into its own descendant');

select throws_ok(
  $$ update public.documents set parent_document_id = '00000000-0000-0000-0000-0000000001d3'
     where id = '00000000-0000-0000-0000-0000000001d1' $$,
  'P0001', 'A document cannot be moved inside itself.',
  'a document cannot move into its own descendant');

select throws_ok(
  $$ update public.documents set folder_id = '00000000-0000-0000-0000-0000000001f1'
     where id = '00000000-0000-0000-0000-0000000001d2' $$,
  '23514', null, 'a document cannot have a folder and a parent document at once');

select throws_ok(
  $$ insert into public.documents (org_id, project_id, type, folder_id)
     values ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000001b2',
             'text', '00000000-0000-0000-0000-0000000001f1') $$,
  'P0001', 'The folder does not belong to this project.',
  'a document cannot live in another project''s folder');

select results_eq(
  $$ select id from public.document_ancestors('00000000-0000-0000-0000-0000000001d3') $$,
  $$ values ('00000000-0000-0000-0000-0000000001d1'::uuid), ('00000000-0000-0000-0000-0000000001d2'::uuid) $$,
  'ancestors are listed root first');

-- delete_folder checks the caller's role, so it needs a signed-in editor.
insert into auth.users (id, email, aud, role, instance_id) values
  ('e1000000-0000-0000-0000-000000000001', 'tree-editor@pgtap.test', 'authenticated',
   'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.org_members (org_id, user_id, role)
  values (:org, 'e1000000-0000-0000-0000-000000000001', 'editor');
update public.documents set parent_document_id = null, folder_id = :f2 where id = :d3;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.delete_folder('00000000-0000-0000-0000-0000000001f2') $$,
  'P0001', 'Move or trash everything in this folder first.',
  'a folder holding a live document cannot be deleted');

update public.documents set deleted_at = now() where id = :d3;
select lives_ok(
  $$ select public.delete_folder('00000000-0000-0000-0000-0000000001f2') $$,
  'a folder holding only trashed documents can be deleted');
select is(
  (select folder_id is null and deleted_at is not null from public.documents where id = :d3),
  true, 'the trashed document survives, detached, and can still be restored');

select * from finish();
rollback;
