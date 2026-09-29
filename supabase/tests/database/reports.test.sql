begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Abuse reports and takedowns, as far as the database goes: a stored report
-- has an id for the app to email the operator about, the flood guard stores
-- nothing and so emails nothing, and a project's own members can see that
-- it was taken down but cannot undo it. Uses its own ids so it passes
-- against a local database that already holds development data.

\set alice '''a2000000-0000-0000-0000-000000000001'''
\set org   '''00000000-0000-0000-0000-000000000ea1'''
\set proj  '''00000000-0000-0000-0000-000000000eb1'''

insert into auth.users (id, email, aud, role, instance_id)
values (:alice, 'alice@reports.pgtap.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.orgs (id, name, slug) values (:org, 'Reports', 'pgtap-reports');
insert into public.org_members (org_id, user_id, role) values (:org, :alice, 'owner');
insert into public.projects (id, org_id, name, visibility) values (:proj, :org, 'Open', 'public');

set local role anon;
select isnt(public.report_abuse(:proj, null, 'This page is a phishing form.', 'someone@example.test'), null,
  'a stored report returns its id');

reset role;
insert into public.abuse_reports (project_id, reason)
select :proj, 'Filler report number ' || n from generate_series(1, 19) n;

set local role anon;
select is(public.report_abuse(:proj, null, 'One report too many for an hour.'), null,
  'past the flood guard nothing is stored, and nothing is returned');
reset role;
select is((select count(*) from public.abuse_reports where project_id = :proj), 20::bigint,
  'the one past the guard was not stored');

-- Takedown ---------------------------------------------------------------------

update public.projects set taken_down_at = now() where id = :proj;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :alice, 'email', 'alice@reports.pgtap.test', 'role', 'authenticated')::text, true);
select isnt((select taken_down_at from public.projects where id = :proj), null,
  'members see that their project was taken down');
select throws_ok(
  $$ update public.projects set taken_down_at = null where id = '00000000-0000-0000-0000-000000000eb1' $$,
  '42501', null, 'and cannot undo it');
select is((select visibility from public.projects where id = :proj), 'public'::public.project_visibility,
  'its own visibility setting is unchanged');

select * from finish();
rollback;
