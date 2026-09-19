begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Uses its own slugs and ids so it passes against a local database that
-- already holds development data.

\set org     '''00000000-0000-0000-0000-0000000004a1'''
\set open    '''00000000-0000-0000-0000-0000000004b1'''
\set closed  '''00000000-0000-0000-0000-0000000004b2'''
\set opendoc '''00000000-0000-0000-0000-0000000004d1'''
\set shutdoc '''00000000-0000-0000-0000-0000000004d2'''

insert into public.orgs (id, name, slug) values (:org, 'Public', 'pgtap-public');
insert into public.projects (id, org_id, name, visibility) values
  (:open, :org, 'Open', 'public'), (:closed, :org, 'Closed', 'private');
insert into public.documents (id, org_id, project_id, type, title) values
  (:opendoc, :org, :open, 'text', 'Readable'), (:shutdoc, :org, :closed, 'text', 'Secret');
insert into public.documents (org_id, project_id, type, title, deleted_at)
  values (:org, :open, 'text', 'Trashed', now());
insert into public.document_updates (document_id, update) values (:opendoc, '\x0000'), (:shutdoc, '\x0000');

set local role anon;

select is((select array_agg(name) from public.projects where org_id = :org), array['Open'],
  'anyone can see a public project, and only that');
select is((select array_agg(title) from public.documents where org_id = :org), array['Readable'],
  'anyone can read its documents, but not trashed or private ones');
select is((select count(*) from public.document_updates where document_id = :opendoc), 1::bigint,
  'anyone can read a public document''s content');
select is((select count(*) from public.document_updates where document_id = :shutdoc), 0::bigint,
  'nobody outside the org can read a private document''s content');
select throws_ok($$ select created_by from public.documents $$, '42501', null,
  'internal columns are not exposed to anonymous readers');
select throws_ok(
  $$ insert into public.document_updates (document_id, update)
     values ('00000000-0000-0000-0000-0000000004d1', '\x01') $$,
  '42501', null, 'anonymous readers cannot write');
select throws_ok($$ update public.documents set title = 'defaced' $$, '42501', null,
  'anonymous readers cannot edit');
select is(public.viewer_heartbeat(:opendoc, gen_random_uuid()), 1,
  'an anonymous viewer of a public document is counted');
select is(public.viewer_heartbeat(:shutdoc, gen_random_uuid()), 0,
  'a heartbeat on a private document is ignored');

select lives_ok(
  $$ select public.report_abuse('00000000-0000-0000-0000-0000000004b1', null, 'This page is a phishing form.') $$,
  'anyone can report a public project');
select throws_ok($$ select * from public.abuse_reports $$, '42501', null,
  'reports are not readable by the public');

-- Takedown ----------------------------------------------------------------------------
reset role;
update public.projects set taken_down_at = now() where id = :open;
set local role anon;
select is((select count(*) from public.documents where org_id = :org), 0::bigint,
  'a project taken down by the operator is no longer public');

select * from finish();
rollback;
