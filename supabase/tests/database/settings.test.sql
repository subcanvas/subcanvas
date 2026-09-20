begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Uses its own email domain and slugs so it passes against a local database
-- that already holds development data.

-- Fixtures -----------------------------------------------------------------

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

\set owner  '''5e000000-0000-0000-0000-000000000001'''
\set viewer '''5e000000-0000-0000-0000-000000000002'''
\set org    '''5e000000-0000-0000-0000-0000000000a1'''
\set paid   '''5e000000-0000-0000-0000-0000000000a2'''
\set ending '''5e000000-0000-0000-0000-0000000000a3'''

-- The owner signed up with a password, the viewer by magic link.
insert into auth.users (id, email, aud, role, instance_id, encrypted_password) values
  (:owner, 'owner@settings.pgtap.test', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', 'not-a-real-hash'),
  (:viewer, 'viewer@settings.pgtap.test', 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '');

insert into public.orgs (id, name, slug) values
  (:org, 'Settings', 'pgtap-settings'),
  (:paid, 'Paid', 'pgtap-settings-paid'),
  (:ending, 'Ending', 'pgtap-settings-ending');
insert into public.org_members (org_id, user_id, role) values
  (:org, :owner, 'owner'), (:org, :viewer, 'viewer'),
  (:paid, :owner, 'owner'), (:ending, :owner, 'owner');
insert into public.projects (org_id, name) values (:org, 'Goes with the org');
insert into public.subscriptions (org_id, stripe_customer_id, status, cancel_at_period_end) values
  (:paid, 'cus_pgtap_settings_paid', 'active', false),
  (:ending, 'cus_pgtap_settings_ending', 'active', true);

-- Sign-in methods ------------------------------------------------------------

select pg_temp.login(:owner, 'owner@settings.pgtap.test');
select is(public.has_password(), true, 'an account with a password says so');
select pg_temp.login(:viewer, 'viewer@settings.pgtap.test');
select is(public.has_password(), false, 'an account made by magic link has no password');
select pg_temp.logout();
set local role anon;
select throws_ok($$ select public.has_password() $$, '42501', null, 'anon cannot ask');
select pg_temp.logout();

-- Profile ----------------------------------------------------------------------

select pg_temp.login(:viewer, 'viewer@settings.pgtap.test');
select lives_ok(
  $$ update public.profiles set display_name = 'Vera', avatar_url = 'https://example.com/vera.png'
     where id = '5e000000-0000-0000-0000-000000000002' $$,
  'a person sets their own name and picture');
select lives_ok(
  $$ update public.profiles set display_name = null, avatar_url = null
     where id = '5e000000-0000-0000-0000-000000000002' $$,
  'and clears them');
select throws_ok(
  $$ update public.profiles set avatar_url = 'http://example.com/vera.png'
     where id = '5e000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a picture must be https');
select throws_ok(
  $$ update public.profiles set avatar_url = 'javascript:alert(1)'
     where id = '5e000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a picture cannot be a script');
select throws_ok(
  $$ update public.profiles set display_name = '   '
     where id = '5e000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a name cannot be blank');
select throws_ok(
  $$ update public.profiles set display_name = repeat('x', 81)
     where id = '5e000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a name cannot be longer than 80 characters');
update public.profiles set display_name = 'Not you' where id = :owner;
select is((select display_name from public.profiles where id = :owner), null,
  'nobody edits another person''s profile');

-- Org: rename, leave, delete ---------------------------------------------------

update public.orgs set name = 'Renamed by a viewer' where id = :org;
select is((select name from public.orgs where id = :org), 'Settings', 'a viewer cannot rename the org');
delete from public.orgs where id = :org;
select is((select count(*) from public.orgs where id = :org), 1::bigint, 'a viewer cannot delete the org');
select lives_ok(
  $$ delete from public.org_members where user_id = '5e000000-0000-0000-0000-000000000002' $$,
  'a viewer can leave');

select pg_temp.login(:owner, 'owner@settings.pgtap.test');
select throws_ok(
  $$ delete from public.orgs where id = '5e000000-0000-0000-0000-0000000000a2' $$,
  'P0001', 'Cancel the subscription before deleting this org.',
  'an org with a running subscription cannot be deleted');
select lives_ok(
  $$ delete from public.orgs where id = '5e000000-0000-0000-0000-0000000000a3' $$,
  'an org whose subscription is already ending can');
select lives_ok(
  $$ delete from public.orgs where id = '5e000000-0000-0000-0000-0000000000a1' $$,
  'an owner deletes an org with no subscription');
select pg_temp.logout();
select is((select count(*) from public.projects where name = 'Goes with the org'), 0::bigint,
  'and its projects go with it');

select * from finish();
rollback;
