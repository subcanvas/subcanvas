begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- What is out of view is in the trash everywhere (migration out_of_view):
-- links, the documents a project shows, and where things may be put. Uses
-- its own slugs and ids so it passes against a local database that already
-- holds development data.

\set org     '''00000000-0000-0000-0000-000000000aa1'''
\set project '''00000000-0000-0000-0000-000000000ab1'''
\set plans   '''00000000-0000-0000-0000-000000000af1'''
\set inner   '''00000000-0000-0000-0000-000000000af2'''
\set top     '''00000000-0000-0000-0000-000000000ad1'''
\set road    '''00000000-0000-0000-0000-000000000ad2'''
\set notes   '''00000000-0000-0000-0000-000000000ad3'''
\set deep    '''00000000-0000-0000-0000-000000000ad4'''
\set board   '''00000000-0000-0000-0000-000000000ad5'''
\set box     '''00000000-0000-0000-0000-000000000ad6'''
\set editor  '''ea000000-0000-0000-0000-000000000001'''

insert into auth.users (id, email, aud, role, instance_id) values
  (:editor, 'view-editor@pgtap.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.orgs (id, name, slug) values (:org, 'In view', 'pgtap-in-view');
insert into public.org_members (org_id, user_id, role) values (:org, :editor, 'editor');
insert into public.projects (id, org_id, name, visibility) values (:project, :org, 'Project', 'private');

-- top, and a folder plans > inner holding road > deep and notes; a
-- whiteboard with a box's description.
insert into public.folders (id, org_id, project_id, parent_folder_id, name) values
  (:plans, :org, :project, null, 'Plans'), (:inner, :org, :project, :plans, 'Inner');
insert into public.documents (id, org_id, project_id, type, title, folder_id, parent_document_id) values
  (:top, :org, :project, 'text', 'Overview', null, null),
  (:road, :org, :project, 'text', 'Roadmap', :plans, null),
  (:deep, :org, :project, 'whiteboard', 'Deep', null, :road),
  (:notes, :org, :project, 'text', 'Notes', :inner, null),
  (:board, :org, :project, 'whiteboard', 'Board', null, null);
insert into public.documents (id, org_id, project_id, type, kind, title, parent_document_id, parent_object_id)
values (:box, :org, :project, 'text', 'description', 'A box', :board, 'node-1');

-- Overview links to Roadmap and to Deep; Notes (inside Plans) links to
-- Overview and to Roadmap.
insert into public.document_links (org_id, source_document_id, source_object_id, target_document_id) values
  (:org, :top, 'block-1', :road), (:org, :top, 'block-2', :deep),
  (:org, :notes, 'block-1', :top), (:org, :notes, 'block-2', :road);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"ea000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- In view ------------------------------------------------------------------------------------

select is((select count(*)::integer from public.documents_in_view(:project)), 6,
  'every document is in view while nothing is in the trash, descriptions included');
select is((select document_count from public.document_count((select p from public.projects p where p.id = :project))), 5,
  'the count leaves descriptions out');

-- Before the folder goes: what links into it from outside.
select results_eq(
  $$ select source_title from public.folder_references('00000000-0000-0000-0000-000000000af1') $$,
  $$ values ('Overview') $$,
  'a folder lists what links to anything inside it, however deep, from outside it');
select is((select count(*)::integer from public.document_references(:top)), 1, 'Notes links to Overview');

update public.folders set deleted_at = now() where id = :plans;

select is(
  (select array_agg(title order by title) from public.documents_in_view(:project)),
  array['A box', 'Board', 'Overview'],
  'a trashed folder takes everything in it out of view, however deep');
select is((select document_count from public.document_count((select p from public.projects p where p.id = :project))), 2,
  'and out of the count');
select is((select count(*)::integer from public.document_references(:top)), 0,
  'a document inside a trashed folder is not listed as linking to anything');
select results_eq(
  $$ select source_title from public.document_references('00000000-0000-0000-0000-000000000ad2') $$,
  $$ values ('Overview') $$,
  'what links to a document out of view is still listed, for the warning before deleting it forever');

update public.documents set deleted_at = now() where id = :board;
select is((select array_agg(title) from public.documents_in_view(:project)), array['Overview'],
  'a trashed document takes what is nested in it out of view');
update public.documents set deleted_at = null where id = :board;

-- Nothing goes inside something out of view -----------------------------------------------

select throws_ok(
  $$ insert into public.documents (org_id, project_id, type, folder_id)
     values ('00000000-0000-0000-0000-000000000aa1', '00000000-0000-0000-0000-000000000ab1', 'text',
             '00000000-0000-0000-0000-000000000af2') $$,
  'P0001', 'That folder is in the trash, or inside a folder that is. Restore it first, or choose another place.',
  'a document cannot be created in a folder inside a trashed one');
select throws_ok(
  $$ insert into public.documents (org_id, project_id, type, parent_document_id)
     values ('00000000-0000-0000-0000-000000000aa1', '00000000-0000-0000-0000-000000000ab1', 'text',
             '00000000-0000-0000-0000-000000000ad2') $$,
  'P0001', 'That document is in the trash, or inside something that is. Restore it first, or choose another place.',
  'or nested under a document in a trashed folder');
select throws_ok(
  $$ insert into public.folders (org_id, project_id, parent_folder_id, name)
     values ('00000000-0000-0000-0000-000000000aa1', '00000000-0000-0000-0000-000000000ab1',
             '00000000-0000-0000-0000-000000000af1', 'New') $$,
  'P0001', null, 'a folder cannot be created in a trashed folder');
select throws_ok(
  $$ update public.documents set folder_id = '00000000-0000-0000-0000-000000000af1'
     where id = '00000000-0000-0000-0000-000000000ad1' $$,
  'P0001', null, 'a document cannot be moved into a trashed folder');
select throws_ok(
  $$ update public.documents set parent_document_id = '00000000-0000-0000-0000-000000000ad4'
     where id = '00000000-0000-0000-0000-000000000ad1' $$,
  'P0001', null, 'or under a document out of view');
select lives_ok(
  $$ update public.documents set title = 'Roadmap, renamed' where id = '00000000-0000-0000-0000-000000000ad2' $$,
  'what is out of view can still be changed where it is');
select lives_ok(
  $$ update public.documents set folder_id = null where id = '00000000-0000-0000-0000-000000000ad3' $$,
  'and moved out into view');
select lives_ok(
  $$ update public.folders set deleted_at = null where id = '00000000-0000-0000-0000-000000000af1' $$,
  'a trashed folder can be restored');

-- Many at once, parents first, as an import writes them.
select lives_ok(
  $$ insert into public.documents (id, org_id, project_id, type, title, folder_id, parent_document_id) values
       ('00000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000aa1',
        '00000000-0000-0000-0000-000000000ab1', 'text', 'Parent', '00000000-0000-0000-0000-000000000af2', null),
       ('00000000-0000-0000-0000-000000000ae2', '00000000-0000-0000-0000-000000000aa1',
        '00000000-0000-0000-0000-000000000ab1', 'text', 'Child', null, '00000000-0000-0000-0000-000000000ae1') $$,
  'a parent and what it holds can be created together once the folder is back');

-- The detached description ------------------------------------------------------------------

update public.documents set parent_object_id = null where id = :box;
select is(
  (select kind::text || ' ' || parent_document_id::text from public.documents where id = :box),
  'standard 00000000-0000-0000-0000-000000000ad5',
  'a description let go of by its object stays under the whiteboard as a page');

reset role;
update public.folders set deleted_at = now() where id = :plans;
select lives_ok(
  $$ insert into public.documents (org_id, project_id, type, folder_id)
     values ('00000000-0000-0000-0000-000000000aa1', '00000000-0000-0000-0000-000000000ab1', 'text',
             '00000000-0000-0000-0000-000000000af1') $$,
  'the operator (no signed-in person) is not stopped');

select * from finish();
rollback;
