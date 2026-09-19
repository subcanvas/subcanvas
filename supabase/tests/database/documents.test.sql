begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

\set editor   '''e0000000-0000-0000-0000-000000000001'''
\set viewer   '''f0000000-0000-0000-0000-000000000002'''
\set outsider '''a1000000-0000-0000-0000-000000000003'''
\set org      '''00000000-0000-0000-0000-0000000000a1'''
\set project  '''00000000-0000-0000-0000-0000000000b1'''
\set doc      '''00000000-0000-0000-0000-0000000000d1'''

select pg_temp.make_user(:editor,   'editor@pgtap.test');
select pg_temp.make_user(:viewer,   'viewer@pgtap.test');
select pg_temp.make_user(:outsider, 'outsider@pgtap.test');

insert into public.orgs (id, name, slug) values (:org, 'Docs', 'pgtap-docs');
insert into public.org_members (org_id, user_id, role) values
  (:org, :editor, 'editor'), (:org, :viewer, 'viewer');
insert into public.projects (id, org_id, name) values (:project, :org, 'P');

-- Documents ---------------------------------------------------------------------

select pg_temp.login(:editor, 'editor@pgtap.test');
select lives_ok(
  $$ insert into public.documents (id, org_id, project_id, type)
     values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-0000000000b1', 'text') $$,
  'an editor can create a document');
select lives_ok(
  $$ insert into public.document_updates (document_id, update)
     values ('00000000-0000-0000-0000-0000000000d1', '\x0102') $$,
  'an editor can append an update');
select throws_ok(
  $$ update public.document_updates set update = '\x00' $$,
  '42501', null, 'updates are append-only');
select throws_ok(
  $$ insert into public.document_snapshots (document_id, state)
     values ('00000000-0000-0000-0000-0000000000d1', '\x00') $$,
  '42501', null, 'snapshots cannot be written directly');

select pg_temp.login(:viewer, 'viewer@pgtap.test');
select is((select count(*) from public.document_updates where document_id = :doc), 1::bigint,
  'a viewer can read updates');
select throws_ok(
  $$ insert into public.document_updates (document_id, update)
     values ('00000000-0000-0000-0000-0000000000d1', '\x03') $$,
  '42501', null, 'a viewer cannot append an update');
select throws_ok(
  $$ select public.compact_document('00000000-0000-0000-0000-0000000000d1', '\x00', 999) $$,
  '42501', null, 'a viewer cannot compact');
select throws_ok(
  $$ insert into public.documents (org_id, project_id, type)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'text') $$,
  '42501', null, 'a viewer cannot create a document');

select pg_temp.login(:outsider, 'outsider@pgtap.test');
select is((select count(*) from public.documents where id = :doc), 0::bigint,
  'an outsider cannot see the document');
select is((select count(*) from public.document_updates where document_id = :doc), 0::bigint,
  'an outsider cannot read updates');

-- Compaction ------------------------------------------------------------------------

select pg_temp.login(:editor, 'editor@pgtap.test');
select lives_ok(
  $$ select public.compact_document('00000000-0000-0000-0000-0000000000d1', '\xaabb',
       (select max(id) from public.document_updates)) $$,
  'an editor can compact');
select is(
  (select count(*) from public.document_updates where document_id = :doc)::int
    + (select count(*) from public.document_snapshots where document_id = :doc and state = '\xaabb')::int * 10,
  10, 'compaction replaces the covered updates with one snapshot');

-- Realtime channel authorization ---------------------------------------------------

select set_config('realtime.topic', 'doc:00000000-0000-0000-0000-0000000000d1', true);

select lives_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private)
     values ('doc:00000000-0000-0000-0000-0000000000d1', 'broadcast', '{}', 'update', true) $$,
  'an editor can broadcast on the document channel');

select pg_temp.login(:viewer, 'viewer@pgtap.test');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private)
     values ('doc:00000000-0000-0000-0000-0000000000d1', 'broadcast', '{}', 'update', true) $$,
  '42501', null, 'a viewer cannot broadcast on the document channel');

select pg_temp.login(:outsider, 'outsider@pgtap.test');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private)
     values ('doc:00000000-0000-0000-0000-0000000000d1', 'presence', '{}', 'track', true) $$,
  '42501', null, 'an outsider cannot publish anything on the document channel');

select * from finish();
rollback;
