begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Fixtures -----------------------------------------------------------------

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

\set alice '''a0000000-0000-0000-0000-000000000001'''
\set bob   '''b0000000-0000-0000-0000-000000000002'''
\set carol '''c0000000-0000-0000-0000-000000000003'''
\set dave  '''d0000000-0000-0000-0000-000000000004'''

select pg_temp.make_user(:alice, 'alice@example.com');
select pg_temp.make_user(:bob,   'bob@example.com');
select pg_temp.make_user(:carol, 'carol@example.com');
select pg_temp.make_user(:dave,  'dave@example.com');

select is((select count(*) from public.profiles), 4::bigint,
  'every auth user gets a profile');

-- Org creation and isolation -------------------------------------------------

select pg_temp.login(:alice, 'alice@example.com');
select lives_ok($$ select public.create_org('Acme', 'acme') $$, 'alice creates an org');
select is((select role from public.org_members where user_id = :alice), 'owner'::public.org_role,
  'the creator is the owner');

select pg_temp.login(:bob, 'bob@example.com');
select lives_ok($$ select public.create_org('Bobco', 'bobco') $$, 'bob creates an org');
select is((select array_agg(slug) from public.orgs), array['bobco'],
  'bob sees only his own org');
select is((select count(*) from public.org_members), 1::bigint,
  'bob sees only his own membership');
select is((select count(*) from public.profiles), 1::bigint,
  'bob cannot see profiles of people outside his orgs');
select throws_ok(
  $$ insert into public.org_members (org_id, user_id, role)
     select id, 'b0000000-0000-0000-0000-000000000002', 'owner' from public.orgs $$,
  '42501', null, 'members cannot be inserted directly');

-- Invites ----------------------------------------------------------------------

select pg_temp.logout();
insert into public.org_invites (org_id, email, role, invited_by, token) values
  ((select id from public.orgs where slug = 'acme'), 'carol@example.com', 'viewer', :alice,
   'cccccccc-0000-0000-0000-000000000000'),
  ((select id from public.orgs where slug = 'acme'), 'dave@example.com', 'admin', :alice,
   'dddddddd-0000-0000-0000-000000000000');

select pg_temp.login(:bob, 'bob@example.com');
select throws_ok(
  $$ select public.accept_invite('cccccccc-0000-0000-0000-000000000000') $$,
  'P0001', 'This invite was sent to a different email address.',
  'an invite cannot be accepted from another email');

select pg_temp.login(:carol, 'carol@example.com');
select lives_ok($$ select public.accept_invite('cccccccc-0000-0000-0000-000000000000') $$,
  'carol accepts her invite');
select is((select array_agg(slug) from public.orgs), array['acme'], 'carol now sees the org');
select throws_ok(
  $$ select public.accept_invite('cccccccc-0000-0000-0000-000000000000') $$,
  'P0001', 'This invite is invalid or has expired.', 'an invite works once');

-- Viewer is read-only ------------------------------------------------------------

update public.orgs set name = 'Hacked' where slug = 'acme';
select is((select name from public.orgs where slug = 'acme'), 'Acme', 'a viewer cannot rename the org');
select throws_ok(
  $$ insert into public.org_invites (org_id, email, role, invited_by)
     select id, 'eve@example.com', 'editor', 'c0000000-0000-0000-0000-000000000003' from public.orgs $$,
  '42501', null, 'a viewer cannot invite');
select is((select count(*) from public.org_invites), 0::bigint, 'a viewer cannot read invites');
update public.org_members set role = 'admin' where user_id = :carol;
select is((select role from public.org_members where user_id = :carol), 'viewer'::public.org_role,
  'a viewer cannot promote themselves');

-- Admin limits ---------------------------------------------------------------------

select pg_temp.login(:dave, 'dave@example.com');
select public.accept_invite('dddddddd-0000-0000-0000-000000000000');
select lives_ok(
  $$ update public.org_members set role = 'editor' where user_id = 'c0000000-0000-0000-0000-000000000003' $$,
  'an admin can change a lower role');
select throws_ok(
  $$ update public.org_members set role = 'owner' where user_id = 'c0000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'an admin cannot grant owner');
delete from public.org_members where user_id = :alice;
select pg_temp.logout();
select is((select count(*) from public.org_members where user_id = :alice), 1::bigint,
  'an admin cannot remove an owner');

-- Last owner ------------------------------------------------------------------------

select pg_temp.login(:alice, 'alice@example.com');
select throws_ok(
  $$ delete from public.org_members where user_id = 'a0000000-0000-0000-0000-000000000001' $$,
  'P0001', 'An org must have at least one owner.', 'the last owner cannot leave');
select lives_ok($$ delete from public.orgs where slug = 'acme' $$, 'an owner can delete the org');

-- Anonymous ---------------------------------------------------------------------------

select pg_temp.logout();
set local role anon;
select throws_ok($$ select * from public.orgs $$, '42501', null, 'anon cannot read orgs');

select * from finish();
rollback;
