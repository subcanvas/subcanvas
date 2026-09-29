begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- The trash, what it hides, and what the free plan counts because of it
-- (migration trash_and_limits). Uses its own slugs and ids so it passes
-- against a local database that already holds development data. Limits are
-- set inside this transaction only.

\set org     '''00000000-0000-0000-0000-0000000009a1'''
\set project '''00000000-0000-0000-0000-0000000009b1'''
\set open    '''00000000-0000-0000-0000-0000000009b2'''
\set outer   '''00000000-0000-0000-0000-0000000009f1'''
\set inner   '''00000000-0000-0000-0000-0000000009f2'''
\set board   '''00000000-0000-0000-0000-0000000009d1'''
\set child   '''00000000-0000-0000-0000-0000000009d2'''
\set grand   '''00000000-0000-0000-0000-0000000009d3'''
\set filed   '''00000000-0000-0000-0000-0000000009d4'''
\set deep    '''00000000-0000-0000-0000-0000000009d5'''
\set notes   '''00000000-0000-0000-0000-0000000009d6'''
\set shown   '''00000000-0000-0000-0000-0000000009d7'''
\set hidden  '''00000000-0000-0000-0000-0000000009d8'''
\set owner   '''e9000000-0000-0000-0000-000000000001'''
\set editor  '''e9000000-0000-0000-0000-000000000002'''

insert into auth.users (id, email, aud, role, instance_id) values
  (:owner, 'trash-owner@pgtap.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  (:editor, 'trash-editor@pgtap.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.orgs (id, name, slug) values (:org, 'Trash', 'pgtap-trash');
insert into public.org_members (org_id, user_id, role) values (:org, :owner, 'owner'), (:org, :editor, 'editor');
insert into public.projects (id, org_id, name, visibility) values
  (:project, :org, 'Private', 'private'), (:open, :org, 'Public', 'public');

-- board > child > grand, and a folder outer > inner holding filed > deep.
insert into public.folders (id, org_id, project_id, parent_folder_id, name) values
  (:outer, :org, :project, null, 'outer'), (:inner, :org, :project, :outer, 'inner');
insert into public.documents (id, org_id, project_id, type, title, folder_id, parent_document_id) values
  (:board, :org, :project, 'whiteboard', 'board', null, null),
  (:child, :org, :project, 'whiteboard', 'child', null, :board),
  (:grand, :org, :project, 'text', 'grand', null, :child),
  (:filed, :org, :project, 'text', 'filed', :inner, null),
  (:deep, :org, :project, 'text', 'deep', null, :filed);
-- The notes of an object on the board: free, and not in the tree.
insert into public.documents (id, org_id, project_id, type, kind, title, parent_document_id, parent_object_id)
values (:notes, :org, :project, 'text', 'description', 'A box', :board, 'node-1');

create function pg_temp.count() returns integer language sql
as $$ select private.private_document_count('00000000-0000-0000-0000-0000000009a1') $$;

-- Counting (R7.1a) -------------------------------------------------------------------

select is(pg_temp.count(), 5, 'five standard documents in view are counted; the description is not');

update public.documents set deleted_at = now() where id = :child;
select is(pg_temp.count(), 3, 'a trashed document and everything nested in it stop counting');
select is(private.document_is_live(:grand), false, 'a document inside a trashed one is out of view');

update public.folders set deleted_at = now() where id = :outer;
select is(pg_temp.count(), 1, 'a trashed folder takes everything in it out of the count, however deep');
select is(private.document_is_live(:deep), false, 'a document nested under one in a trashed folder is out of view');
select is(private.folder_is_live(:inner), false, 'a folder inside a trashed folder is out of view');

-- The limit, for what comes back ---------------------------------------------------------

update private.config set free_private_document_limit = 1, free_editor_limit = null;

select throws_ok(
  $$ update public.documents set deleted_at = null where id = '00000000-0000-0000-0000-0000000009d2' $$,
  'GN001', null, 'restoring a document brings back what is nested in it, and all of it must fit');
select throws_ok(
  $$ update public.folders set deleted_at = null where id = '00000000-0000-0000-0000-0000000009f1' $$,
  'GN001', null, 'restoring a folder brings back everything in it, and all of it must fit');
select throws_ok(
  $$ update public.documents set parent_document_id = '00000000-0000-0000-0000-0000000009d1'
     where id = '00000000-0000-0000-0000-0000000009d3' $$,
  'GN001', null, 'moving a document out of a trashed one brings it into view, and it counts');
select lives_ok(
  $$ update public.documents set title = 'grand, renamed' where id = '00000000-0000-0000-0000-0000000009d3' $$,
  'what is out of view can still be changed');
select lives_ok(
  $$ insert into public.documents (org_id, project_id, type, parent_document_id)
     values ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009b1', 'text',
             '00000000-0000-0000-0000-0000000009d2') $$,
  'a document created inside a trashed one is out of view and does not count');

update private.config set free_private_document_limit = 4;
select lives_ok(
  $$ update public.documents set deleted_at = null where id = '00000000-0000-0000-0000-0000000009d2' $$,
  'a restore that fits is allowed');
select is(pg_temp.count(), 4, 'and what was nested in it counts again');

-- Going private counts only what is in view.
insert into public.folders (id, org_id, project_id, name, deleted_at)
values ('00000000-0000-0000-0000-0000000009f3', :org, :open, 'gone', now());
insert into public.documents (org_id, project_id, type, folder_id)
select :org, :open, 'text', '00000000-0000-0000-0000-0000000009f3' from generate_series(1, 3);
select lives_ok(
  $$ update public.projects set visibility = 'private' where id = '00000000-0000-0000-0000-0000000009b2' $$,
  'a public project whose documents are all in the trash can go private at the limit');
update public.projects set visibility = 'public' where id = :open;

-- A description taken away from its object ------------------------------------------------

select throws_ok(
  $$ update public.documents set parent_object_id = null where id = '00000000-0000-0000-0000-0000000009d6' $$,
  'GN001', null, 'a description taken from its object becomes a document, and must fit');
update private.config set free_private_document_limit = null;
update public.documents set parent_object_id = null where id = :notes;
select is((select kind::text from public.documents where id = :notes), 'standard',
  'it becomes a standard document, shown in the tree');

-- Restoring, as an editor --------------------------------------------------------------------

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"e9000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

update public.documents set deleted_at = now() where id = :board;
update public.documents set deleted_at = now() where id = :child;
select results_eq(
  $$ select parent_document_id, folder_id from public.restore_document('00000000-0000-0000-0000-0000000009d2') $$,
  $$ values (null::uuid, null::uuid) $$,
  'a document whose parent is still in the trash is restored to the top of the project');
select is(private.document_is_live(:child), true, 'and is in view there');

select results_eq(
  $$ select parent_document_id from public.restore_document('00000000-0000-0000-0000-0000000009d1') $$,
  $$ values (null::uuid) $$, 'a document at the top comes back where it was');

-- A description whose object is gone.
insert into public.documents (id, org_id, project_id, type, kind, title, parent_document_id, parent_object_id, deleted_at)
values ('00000000-0000-0000-0000-0000000009d9', :org, :project, 'text', 'description', 'Old box', :board, 'node-2', now());
select results_eq(
  $$ select parent_document_id from public.restore_document('00000000-0000-0000-0000-0000000009d9', true) $$,
  $$ values ('00000000-0000-0000-0000-0000000009d1'::uuid) $$,
  'notes whose object is gone stay under their whiteboard');
select is(
  (select kind::text || ' ' || coalesce(parent_object_id, 'none') from public.documents
   where id = '00000000-0000-0000-0000-0000000009d9'),
  'standard none', 'as a text document of their own');

select is((select count(*)::integer from public.restore_document(:board)), 0,
  'restoring what is not in the trash changes nothing');

-- A document filed in a trashed folder comes back to the top.
update public.documents set deleted_at = now() where id = :filed;
select results_eq(
  $$ select folder_id from public.restore_document('00000000-0000-0000-0000-0000000009d4') $$,
  $$ values (null::uuid) $$, 'a document whose folder is in the trash is restored to the top');

update public.folders set deleted_at = now() where id = :inner;
select results_eq(
  $$ select parent_folder_id from public.restore_folder('00000000-0000-0000-0000-0000000009f2') $$,
  $$ values (null::uuid) $$, 'a folder whose parent is still in the trash is restored to the top');
select results_eq(
  $$ select parent_folder_id from public.restore_folder('00000000-0000-0000-0000-0000000009f1') $$,
  $$ values (null::uuid) $$, 'a folder at the top comes back where it was');

select is(public.document_is_live(:grand), true, 'the app asks whether a document is in view');

-- What deleting a folder for good orphans in Storage -----------------------------------------

reset role;
insert into public.folders (id, org_id, project_id, parent_folder_id, name)
values ('00000000-0000-0000-0000-0000000009f5', :org, :project, :inner, 'innermost');
insert into public.documents (id, org_id, project_id, type, folder_id, parent_document_id) values
  ('00000000-0000-0000-0000-0000000009da', :org, :project, 'whiteboard', '00000000-0000-0000-0000-0000000009f5', null),
  ('00000000-0000-0000-0000-0000000009db', :org, :project, 'whiteboard', null, '00000000-0000-0000-0000-0000000009da');
insert into storage.objects (bucket_id, name) values
  ('media-images', '00000000-0000-0000-0000-0000000009a1/00000000-0000-0000-0000-0000000009b1/00000000-0000-0000-0000-0000000009da/00000000-0000-0000-0000-0000000009e1.png'),
  ('media-videos', '00000000-0000-0000-0000-0000000009a1/00000000-0000-0000-0000-0000000009b1/00000000-0000-0000-0000-0000000009db/00000000-0000-0000-0000-0000000009e2.mp4'),
  ('media-images', '00000000-0000-0000-0000-0000000009a1/00000000-0000-0000-0000-0000000009b1/00000000-0000-0000-0000-0000000009d1/00000000-0000-0000-0000-0000000009e3.png');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"e9000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select array_agg(split_part(name, '/', 4) order by name) from public.folder_media_objects(:inner)),
  array['00000000-0000-0000-0000-0000000009e1.png', '00000000-0000-0000-0000-0000000009e2.mp4'],
  'deleting a folder for good takes the files of every document in it, however deep, and no others');
reset role;

-- Public readers see only what is in view ------------------------------------------------------

reset role;
insert into public.folders (id, org_id, project_id, name, deleted_at)
values ('00000000-0000-0000-0000-0000000009f4', :org, :open, 'trashed', now());
insert into public.documents (id, org_id, project_id, type, title, folder_id) values
  (:shown, :org, :open, 'text', 'shown', null),
  (:hidden, :org, :open, 'text', 'hidden', '00000000-0000-0000-0000-0000000009f4');
insert into public.document_updates (document_id, update) values (:shown, '\x0000'), (:hidden, '\x0000');
set local role anon;
select is((select array_agg(title) from public.documents where id in (:shown, :hidden)), array['shown'],
  'a public reader cannot see a document in a trashed folder');
select is((select count(*) from public.document_updates where document_id = :hidden), 0::bigint,
  'or read its content, even with its address');
select is((select count(*) from public.folders where project_id = :open), 0::bigint,
  'a trashed folder is not public');
reset role;

-- Making a project public needs an admin ---------------------------------------------------------

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"e9000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.projects (org_id, name, visibility)
     values ('00000000-0000-0000-0000-0000000009a1', 'Editor public', 'public') $$,
  '42501', 'Only an admin can make a project public.', 'an editor cannot create a public project');
select lives_ok(
  $$ insert into public.projects (org_id, name, visibility)
     values ('00000000-0000-0000-0000-0000000009a1', 'Editor private', 'private') $$,
  'an editor can create a private one');
select throws_ok(
  $$ update public.projects set visibility = 'public' where name = 'Editor private' $$,
  '42501', 'Only an admin can change who can see a project.', 'or make one public later');

select set_config('request.jwt.claims', '{"sub":"e9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.projects (org_id, name, visibility)
     values ('00000000-0000-0000-0000-0000000009a1', 'Owner public', 'public') $$,
  'an owner can create a public project');
select lives_ok(
  $$ update public.projects set visibility = 'public' where name = 'Editor private' $$,
  'and make one public later');

select * from finish();
rollback;
