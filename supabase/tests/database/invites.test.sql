begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Invites that work every time: renewing an open or expired invite, and
-- inviting someone again after they were removed or left. Also who sees
-- whose picture. Uses its own email domain and slugs so it passes against
-- a local database that already holds development data.

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

\set alice '''a1000000-0000-0000-0000-000000000001'''
\set bob   '''b1000000-0000-0000-0000-000000000002'''
\set carol '''c1000000-0000-0000-0000-000000000003'''

select pg_temp.make_user(:alice, 'alice@invites.pgtap.test');
select pg_temp.make_user(:bob,   'bob@invites.pgtap.test');
select pg_temp.make_user(:carol, 'carol@invites.pgtap.test');

select pg_temp.login(:alice, 'alice@invites.pgtap.test');
select public.create_org('Invites', 'pgtap-invites');
create temporary table org on commit drop as select id from public.orgs where slug = 'pgtap-invites';

-- Inviting ------------------------------------------------------------------

create temporary table inv1 on commit drop as
  select * from public.create_invite((select id from org), ' Carol@Invites.PGTAP.test ', 'editor');
grant select on inv1 to anon;
select is((select renewed from inv1), false, 'a new address gets a new invite');
select is((select may_email from inv1), true, 'and it may be emailed');
select is(
  (select email || ' ' || role from public.org_invites where id = (select id from inv1)),
  'carol@invites.pgtap.test editor', 'the address is stored trimmed and in lower case');

select pg_temp.login(:bob, 'bob@invites.pgtap.test');
select throws_ok(
  $$ select public.create_invite((select id from org), 'eve@invites.pgtap.test', 'viewer') $$,
  '42501', 'Only admins can invite people.', 'someone outside the org cannot invite');
select is((select count(*) from public.get_invite(gen_random_uuid())), 0::bigint,
  'an unknown token shows nothing');

-- Renewing ------------------------------------------------------------------

select pg_temp.login(:alice, 'alice@invites.pgtap.test');
create temporary table inv2 on commit drop as
  select * from public.create_invite((select id from org), 'carol@invites.pgtap.test', 'viewer');
select is((select renewed from inv2), true, 'inviting the same address again renews its invite');
select is((select token from inv2), (select token from inv1), 'and keeps its link');
select is((select count(*) from public.org_invites where org_id = (select id from org)), 1::bigint,
  'there is still one invite for the address');
select is((select role from public.org_invites where id = (select id from inv1)),
  'viewer'::public.org_role, 'with the role asked for last');

-- Time passes.
select pg_temp.logout();
update public.org_invites set expires_at = now() - interval '1 day' where id = (select id from inv1);

set local role anon;
select is(
  (select org_name || ' ' || email || ' ' || (expires_at < now())::text || ' ' || inviter
   from public.get_invite((select token from inv1))),
  'Invites carol@invites.pgtap.test true alice@invites.pgtap.test',
  'an expired invite still shows what it was for, that it expired, and who sent it');

select pg_temp.login(:carol, 'carol@invites.pgtap.test');
select throws_ok(
  $$ select public.accept_invite((select token from inv1)) $$,
  'P0001', 'This invite is invalid or has expired.', 'an expired invite cannot be accepted');

select pg_temp.login(:alice, 'alice@invites.pgtap.test');
select lives_ok(
  $$ select public.create_invite((select id from org), 'carol@invites.pgtap.test', 'editor') $$,
  'an expired invite can be sent again');
select ok((select expires_at > now() + interval '6 days' from public.org_invites where id = (select id from inv1)),
  'and runs for another 7 days');

-- Accepting ------------------------------------------------------------------

select pg_temp.login(:carol, 'carol@invites.pgtap.test');
select lives_ok($$ select public.accept_invite((select token from inv1)) $$, 'the renewed invite works');
select is(
  (select role from public.org_members where org_id = (select id from org) and user_id = :carol),
  'editor'::public.org_role, 'with the role it was renewed with');

select pg_temp.logout();
select is((select count(*) from public.org_invites where org_id = (select id from org)), 0::bigint,
  'an accepted invite is gone');

select pg_temp.login(:alice, 'alice@invites.pgtap.test');
select throws_ok(
  $$ select public.create_invite((select id from org), 'carol@invites.pgtap.test', 'viewer') $$,
  'P0001', 'That person is already a member.', 'a member cannot be invited');

select pg_temp.login(:carol, 'carol@invites.pgtap.test');
select throws_ok(
  $$ select public.create_invite((select id from org), 'eve@invites.pgtap.test', 'viewer') $$,
  '42501', 'Only admins can invite people.', 'an editor cannot invite');

-- Pictures ---------------------------------------------------------------------

select pg_temp.logout();
update public.profiles set avatar_url = 'https://example.test/alice.png' where id = :alice;

select pg_temp.login(:carol, 'carol@invites.pgtap.test');
select is((select avatar_url from public.profiles where id = :alice), 'https://example.test/alice.png',
  'members see each other''s pictures');
select pg_temp.login(:bob, 'bob@invites.pgtap.test');
select is((select count(*) from public.profiles where id = :alice), 0::bigint,
  'people who share no org do not');

-- Removed, then invited again ---------------------------------------------------

select pg_temp.login(:alice, 'alice@invites.pgtap.test');
delete from public.org_members where org_id = (select id from org) and user_id = :carol;
create temporary table inv3 on commit drop as
  select * from public.create_invite((select id from org), 'carol@invites.pgtap.test', 'viewer');
select is((select renewed from inv3), false, 'someone removed can be invited again');
select isnt((select token from inv3), (select token from inv1), 'with a new link');

select pg_temp.login(:carol, 'carol@invites.pgtap.test');
select lives_ok($$ select public.accept_invite((select token from inv3)) $$, 'and join again');

-- Left, then invited again ---------------------------------------------------------

delete from public.org_members where org_id = (select id from org) and user_id = :carol;
select pg_temp.login(:alice, 'alice@invites.pgtap.test');
create temporary table inv4 on commit drop as
  select * from public.create_invite((select id from org), 'carol@invites.pgtap.test', 'editor');
select pg_temp.login(:carol, 'carol@invites.pgtap.test');
select lives_ok($$ select public.accept_invite((select token from inv4)) $$,
  'someone who left can be invited again and join');

-- How many may be emailed ----------------------------------------------------------

select pg_temp.logout();
delete from private.invite_emails where inviter = :alice;
insert into private.invite_emails (inviter) select :alice::uuid from generate_series(1, 49);

select pg_temp.login(:alice, 'alice@invites.pgtap.test');
select is(
  (select may_email from public.create_invite((select id from org), 'one@invites.pgtap.test', 'viewer')),
  true, 'the fiftieth invite of the day may be emailed');
select is(
  (select may_email from public.create_invite((select id from org), 'two@invites.pgtap.test', 'viewer')),
  false, 'the fifty-first may not');
select is(
  (select count(*) from public.org_invites where email = 'two@invites.pgtap.test'), 1::bigint,
  'but it is still made, for its link to be copied');

select pg_temp.logout();
update private.invite_emails set sent_at = now() - interval '25 hours' where inviter = :alice;
select pg_temp.login(:alice, 'alice@invites.pgtap.test');
select is(
  (select may_email from public.create_invite((select id from org), 'three@invites.pgtap.test', 'viewer')),
  true, 'a day later invites may be emailed again');

select pg_temp.logout();
set local role authenticated;
select throws_ok($$ select * from private.invite_emails $$, '42501', null,
  'nobody reads the count directly');

select * from finish();
rollback;
