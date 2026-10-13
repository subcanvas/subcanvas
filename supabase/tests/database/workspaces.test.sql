begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Workspaces (one kind: migration one_kind_of_workspace), the one every
-- account starts with, and deleting an account. Uses its own email domain,
-- names, slugs and ids so it passes against a local database that already
-- holds development data.

-- Fixtures -----------------------------------------------------------------

create function pg_temp.make_user(p_id uuid, p_email text, p_name text default null) returns void
language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data)
  values (p_id, p_email, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000',
          case when p_name is null then '{}'::jsonb else jsonb_build_object('full_name', p_name) end);
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

-- The workspace an account started with: the one it made first.
create function pg_temp.first(p_id uuid) returns uuid
language sql as $$
  select id from public.orgs where created_by = p_id order by created_at, id limit 1;
$$;

\set named    '''0a000000-0000-0000-0000-000000000901'''
\set plain    '''0a000000-0000-0000-0000-000000000902'''
\set twin1    '''0a000000-0000-0000-0000-000000000903'''
\set twin2    '''0a000000-0000-0000-0000-000000000904'''
\set reserved '''0a000000-0000-0000-0000-000000000905'''
\set long     '''0a000000-0000-0000-0000-000000000906'''
\set leaver   '''0a000000-0000-0000-0000-000000000907'''
\set partner  '''0a000000-0000-0000-0000-000000000908'''

select pg_temp.make_user(:named, 'named@pgtap-ws.test', 'Zoë Pgtap-Ünïcode');
select pg_temp.make_user(:plain, 'ws-plain@pgtap-ws.test');
select pg_temp.make_user(:twin1, 'twin1@pgtap-ws.test', 'Pgtap Twin');
select pg_temp.make_user(:twin2, 'twin2@pgtap-ws.test', 'Pgtap Twin');
select pg_temp.make_user(:reserved, 'admin@pgtap-ws.test');
select pg_temp.make_user(:long, 'long@pgtap-ws.test', repeat('Pgtap Long Name ', 10));
select pg_temp.make_user(:leaver, 'pgtap-leaver@pgtap-ws.test');
select pg_temp.make_user(:partner, 'pgtap-partner@pgtap-ws.test');

-- Every account starts with one, named after its person -------------------------

select is((select name from public.orgs where id = pg_temp.first(:named)), 'Zoë Pgtap-Ünïcode''s workspace',
  'an account''s first workspace is named after the name from Google or GitHub');
select is((select slug from public.orgs where id = pg_temp.first(:named)), 'zoe-pgtap-unicode',
  'and its address is made from the name, accents and all');
select is((select name from public.orgs where id = pg_temp.first(:plain)), 'ws-plain''s workspace',
  'without a name, it is named after the email before the @');
select is((select slug from public.orgs where id = pg_temp.first(:plain)), 'ws-plain',
  'and so is its address');
select is(
  array[(select slug from public.orgs where id = pg_temp.first(:twin1)),
        (select slug from public.orgs where id = pg_temp.first(:twin2))],
  array['pgtap-twin', 'pgtap-twin-2'],
  'an address that is taken gets a number');
select matches((select slug from public.orgs where id = pg_temp.first(:reserved)), '^admin-[0-9]+$',
  'an address the app reserves gets a number too');
select ok((select char_length(name) <= 80 and char_length(slug) <= 30 and name like '%''s workspace'
           from public.orgs where id = pg_temp.first(:long)),
  'a long name is shortened to fit');
select results_eq(
  format($$ select user_id, role::text from public.org_members where org_id = pg_temp.first(%L) $$, :plain),
  format($$ values (%L::uuid, 'owner') $$, :plain),
  'its person is its owner and, to start with, its only member');

-- It is an ordinary workspace ----------------------------------------------------------

select pg_temp.first(:plain) as plain_ws \gset
select pg_temp.login(:plain);
update public.orgs set name = 'Mine' where id = :'plain_ws';
select is((select name from public.orgs where id = :'plain_ws'), 'Mine', 'its owner can rename it');
select lives_ok(
  format($$ insert into public.org_invites (org_id, email, role, invited_by)
            values (%L, 'friend@pgtap-ws.test', 'editor', %L) $$, :'plain_ws', :plain),
  'and invite people to it');
select pg_temp.login(:named);
select is((select count(*) from public.orgs where id = :'plain_ws'), 0::bigint,
  'nobody else sees it until they join');
select pg_temp.logout();
select lives_ok(
  format($$ insert into public.org_members (org_id, user_id, role) values (%L, %L, 'viewer') $$, :'plain_ws', :named),
  'someone can join it, as an invite accepted does');
select pg_temp.login(:named);
select is((select count(*) from public.orgs where id = :'plain_ws'), 1::bigint, 'and then sees it');
select pg_temp.login(:plain);
select throws_ok(
  format($$ delete from public.org_members where org_id = %L and user_id = %L $$, :'plain_ws', :plain),
  'P0001', 'A workspace must have at least one owner.',
  'its only owner cannot leave it, as with any workspace');
select lives_ok(format($$ delete from public.orgs where id = %L $$, :'plain_ws'), 'but can delete it');
select pg_temp.logout();
select ok(not exists (select 1 from public.org_members where user_id = :plain)
            and exists (select 1 from public.profiles where id = :plain),
  'which leaves them in no workspace, with their account as it was');

-- Deleting an account --------------------------------------------------------------------

\set solo          '''0a000000-0000-0000-0000-0000000009a1'''
\set shared        '''0a000000-0000-0000-0000-0000000009a2'''
\set solo_project  '''0a000000-0000-0000-0000-0000000009b1'''
\set shared_proj   '''0a000000-0000-0000-0000-0000000009b2'''
\set own_project   '''0a000000-0000-0000-0000-0000000009b3'''
\set solo_doc      '''0a000000-0000-0000-0000-0000000009d1'''
\set shared_doc    '''0a000000-0000-0000-0000-0000000009d2'''
\set own_doc       '''0a000000-0000-0000-0000-0000000009d3'''

select pg_temp.first(:leaver) as own \gset

-- Another workspace of their own, and one they share with a partner.
insert into public.orgs (id, name, slug, created_by) values
  (:solo, 'Pgtap Solo', 'pgtap-ws-solo', :leaver),
  (:shared, 'Pgtap Shared', 'pgtap-ws-shared', :leaver);
insert into public.org_members (org_id, user_id, role) values
  (:solo, :leaver, 'owner'), (:shared, :leaver, 'owner'), (:shared, :partner, 'editor');
insert into public.projects (id, org_id, name, created_by) values
  (:solo_project, :solo, 'Solo project', :leaver),
  (:shared_proj, :shared, 'Shared project', :leaver),
  (:own_project, :'own', 'Own project', :leaver);
insert into public.documents (id, org_id, project_id, type, title, created_by) values
  (:solo_doc, :solo, :solo_project, 'whiteboard', 'Solo board', :leaver),
  (:shared_doc, :shared, :shared_proj, 'whiteboard', 'Shared board', :leaver),
  (:own_doc, :'own', :own_project, 'whiteboard', 'Own board', :leaver);
insert into public.document_updates (document_id, update, created_by) values (:shared_doc, '\x00', :leaver);
insert into public.org_invites (org_id, email, role, invited_by) values
  (:shared, 'someone@pgtap-ws.test', 'viewer', :leaver);
insert into auth.audit_log_entries (id, payload)
values (gen_random_uuid(), json_build_object('action', 'login', 'actor_id', :leaver, 'actor_username', 'pgtap-leaver@pgtap-ws.test'));
insert into storage.objects (bucket_id, name) values
  ('media-images', :'own' || '/' || :own_project || '/' || :own_doc || '/0a000000-0000-0000-0000-00000000f001.png'),
  ('media-videos', :solo || '/' || :solo_project || '/' || :solo_doc || '/0a000000-0000-0000-0000-00000000f002.mp4'),
  ('media-images', :shared || '/' || :shared_proj || '/' || :shared_doc || '/0a000000-0000-0000-0000-00000000f003.png');

select pg_temp.login(:leaver);
select set_eq(
  $$ select org_name, outcome from public.account_deletion_plan() $$,
  $$ values ('pgtap-leaver''s workspace', 'delete'), ('Pgtap Shared', 'only_owner'), ('Pgtap Solo', 'delete') $$,
  'Profile can say what deleting the account would do to each workspace');
select throws_ok(
  format($$ select * from public.delete_account(%L) $$, :leaver),
  '42501', null, 'a person cannot call the deletion themselves: the server does, after checking');
select pg_temp.logout();
set local role anon;
select throws_ok($$ select * from public.account_deletion_plan() $$, '42501', null, 'anon cannot ask');
reset role;

select throws_ok(
  format($$ select * from public.delete_account(%L) $$, :leaver),
  'P0001',
  'You are the only owner of Pgtap Shared, which has other members. Make one of them an owner in its Members settings, or delete the workspace.',
  'the only owner of a workspace with other members is refused, by name');
select ok(
  exists (select 1 from auth.users where id = :leaver) and exists (select 1 from public.orgs where id = :solo),
  'and nothing was deleted');

update public.org_members set role = 'owner' where org_id = :shared and user_id = :partner;
insert into public.subscriptions (org_id, stripe_customer_id, status) values (:solo, 'cus_pgtap_ws_solo', 'active');
select throws_ok(
  format($$ select * from public.delete_account(%L) $$, :leaver),
  'P0001', 'Pgtap Solo has a subscription. Cancel it in its Billing settings, then delete your account.',
  'a workspace it would delete with a running subscription is refused, by name');
select ok(exists (select 1 from auth.users where id = :leaver), 'and nothing was deleted');

-- A subscription already set to end charges nothing more.
update public.subscriptions set cancel_at_period_end = true where org_id = :solo;
select results_eq(
  format($$ select bucket_id, name from public.delete_account(%L) order by name $$, :leaver),
  format($$ values ('media-images', %L), ('media-videos', %L) order by 2 $$,
    :'own' || '/' || :own_project || '/' || :own_doc || '/0a000000-0000-0000-0000-00000000f001.png',
    :solo || '/' || :solo_project || '/' || :solo_doc || '/0a000000-0000-0000-0000-00000000f002.mp4'),
  'the account is deleted, returning the files of the workspaces that went with it');

select is((select count(*) from auth.users where id = :leaver), 0::bigint, 'the account is gone');
select is((select count(*) from auth.audit_log_entries where payload ->> 'actor_id' = :leaver), 0::bigint,
  'and Auth''s record of its sign-ins');
select is((select count(*) from public.profiles where id = :leaver), 0::bigint, 'and its profile');
select is((select count(*) from public.orgs where id in (:'own', :solo)), 0::bigint,
  'the workspaces nobody else was in are gone');
select is(
  (select count(*) from public.documents where id in (:own_doc, :solo_doc))
    + (select count(*) from public.projects where id in (:own_project, :solo_project)),
  0::bigint, 'with everything in them');
select is((select count(*) from public.subscriptions where org_id = :solo), 0::bigint,
  'the ended subscription with its workspace');
select results_eq(
  format($$ select user_id, role::text from public.org_members where org_id = %L $$, :shared),
  format($$ values (%L::uuid, 'owner') $$, :partner),
  'the shared workspace stays, with its other member');
select ok(
  (select created_by is null from public.projects where id = :shared_proj)
    and (select created_by is null from public.documents where id = :shared_doc)
    and (select created_by is null from public.document_updates where document_id = :shared_doc)
    and (select invited_by is null from public.org_invites where org_id = :shared),
  'what they made there stays with it, no longer saying who made it');

-- Nothing that points at a person can stop their account from going. A
-- reference that neither cascades nor clears would make every deletion fail.
select is(
  (select array_agg(conrelid::regclass::text || '.' || conname order by conname)
   from pg_constraint
   where contype = 'f'
     and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
     and confdeltype not in ('c', 'n')),
  null,
  'every reference to a person cascades or clears when they are deleted');

-- The operator deleting a user in the dashboard deletes the workspaces
-- nobody else was in with them (delete_lone_workspaces), with what they made
-- in them: a project and a whiteboard whose created_by would otherwise be
-- cleared in the same pass that deletes them.
\set gone '''0a000000-0000-0000-0000-000000000909'''
select pg_temp.make_user(:gone, 'pgtap-gone@pgtap-ws.test');
select pg_temp.first(:gone) as gone_ws \gset
insert into public.projects (id, org_id, name, created_by)
values ('0a000000-0000-0000-0000-000000000a01', :'gone_ws', 'Theirs', :gone);
insert into public.documents (id, org_id, project_id, type, title, created_by)
values ('0a000000-0000-0000-0000-000000000a02', :'gone_ws',
        '0a000000-0000-0000-0000-000000000a01', 'whiteboard', 'Board', :gone);
select lives_ok(format($$ delete from auth.users where id = %L $$, :gone),
  'a user can be deleted from the dashboard');
select is((select count(*) from public.projects where id = '0a000000-0000-0000-0000-000000000a01'), 0::bigint,
  'and what they made in a workspace nobody else was in goes too');
select is((select count(*) from public.orgs where id = :'gone_ws'), 0::bigint,
  'and so does the workspace');

select * from finish();
rollback;
