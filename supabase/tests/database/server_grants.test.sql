begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- The app's server, holding the secret key, acts as service_role (migration
-- server_grants). Row-level security does not apply to it, so what it may
-- touch is exactly the grants, and they must be explicit: a local stack and
-- a preview branch grant this role nothing by default.

\set org '''00000000-0000-0000-0000-0000000009a1'''
insert into public.orgs (id, name, slug) values (:org, 'Server grants', 'pgtap-server-grants');

select set_config('role', 'service_role', true);

select lives_ok(
  format($$ insert into public.subscriptions (org_id, stripe_customer_id) values (%L, 'cus_pgtap') $$, :org),
  'the server records the Stripe customer it created for an org');

select lives_ok(
  format($$ update public.subscriptions set status = 'active', seats = 2 where org_id = %L $$, :org),
  'the server keeps the subscription in step with Stripe''s webhooks');

select results_eq(
  format($$ select status, seats from public.subscriptions where org_id = %L $$, :org),
  $$ values ('active'::text, 2) $$,
  'and reads it back');

select lives_ok(
  format($$ select count(*) from public.org_members where org_id = %L and role <> 'viewer' $$, :org),
  'the server counts editors to know how many seats to charge');

select throws_ok(
  $$ insert into public.orgs (name, slug) values ('Not the server''s job', 'pgtap-server-grants-2') $$,
  '42501', null,
  'but it has been given nothing it does not use: orgs are made by people');

select * from finish();
rollback;
