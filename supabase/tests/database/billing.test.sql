begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Uses its own slugs and ids so it passes against a local database that
-- already holds development data. Limits are set inside this transaction only.

\set org     '''00000000-0000-0000-0000-0000000003a1'''
\set private '''00000000-0000-0000-0000-0000000003b1'''
\set public  '''00000000-0000-0000-0000-0000000003b2'''

select is(
  (select count(*) from information_schema.columns
   where table_schema = 'private' and table_name = 'config'
     and column_name in ('free_private_document_limit', 'free_editor_limit')
     and column_default is not null),
  0::bigint, 'there are no limits unless a deployment sets them');

insert into auth.users (id, email, aud, role, instance_id)
select ('e3000000-0000-0000-0000-00000000000' || n)::uuid, 'billing-' || n || '@pgtap.test',
       'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 5) n;

insert into public.orgs (id, name, slug) values (:org, 'Billing', 'pgtap-billing');
insert into public.projects (id, org_id, name, visibility) values
  (:private, :org, 'Private', 'private'), (:public, :org, 'Public', 'public');
insert into public.org_members (org_id, user_id, role) values
  (:org, 'e3000000-0000-0000-0000-000000000001', 'owner'),
  (:org, 'e3000000-0000-0000-0000-000000000002', 'editor');
update private.config set free_private_document_limit = 2, free_editor_limit = 3;

create function pg_temp.add_doc(p_project uuid, p_title text, p_kind public.document_kind default 'standard')
returns uuid language sql as $$
  insert into public.documents (org_id, project_id, type, title, kind)
  values ('00000000-0000-0000-0000-0000000003a1', p_project, 'text', p_title, p_kind)
  returning id;
$$;

-- Private documents ---------------------------------------------------------------

select lives_ok($$ select pg_temp.add_doc('00000000-0000-0000-0000-0000000003b1', 'one') $$, 'a private document is allowed');
select lives_ok($$ select pg_temp.add_doc('00000000-0000-0000-0000-0000000003b1', 'two') $$, 'up to the limit');
select throws_ok($$ select pg_temp.add_doc('00000000-0000-0000-0000-0000000003b1', 'three') $$, 'GN001', null,
  'a free org cannot go over the private document limit');
select lives_ok($$ select pg_temp.add_doc('00000000-0000-0000-0000-0000000003b1', 'a description', 'description') $$,
  'node descriptions do not count');
select lives_ok(
  $$ select pg_temp.add_doc('00000000-0000-0000-0000-0000000003b2', 'public ' || n) from generate_series(1, 5) n $$,
  'public documents are unlimited');
select lives_ok($$ update public.documents set title = 'one, edited' where title = 'one' $$,
  'existing documents stay editable at the limit');

update public.documents set deleted_at = now() where title = 'two';
select lives_ok($$ select pg_temp.add_doc('00000000-0000-0000-0000-0000000003b1', 'three') $$, 'trashing a document frees a slot');
select throws_ok($$ update public.documents set deleted_at = null where title = 'two' $$, 'GN001', null,
  'restoring from the trash cannot go over the limit');
select throws_ok(
  $$ update public.projects set visibility = 'private' where id = '00000000-0000-0000-0000-0000000003b2' $$,
  'GN001', null, 'a public project cannot go private past the limit');
select lives_ok(
  $$ update public.projects set visibility = 'public' where id = '00000000-0000-0000-0000-0000000003b1' $$,
  'a private project can always go public');

-- Editors ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.org_members (org_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000003a1', 'e3000000-0000-0000-0000-000000000003', 'admin') $$,
  'a third editor is allowed');
select throws_ok(
  $$ insert into public.org_members (org_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000003a1', 'e3000000-0000-0000-0000-000000000004', 'editor') $$,
  'GN002', null, 'a fourth editor is not');
select lives_ok(
  $$ insert into public.org_members (org_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000003a1', 'e3000000-0000-0000-0000-000000000004', 'viewer') $$,
  'viewers are unlimited');
select throws_ok(
  $$ update public.org_members set role = 'editor' where user_id = 'e3000000-0000-0000-0000-000000000004' $$,
  'GN002', null, 'promoting a viewer counts as adding an editor');

-- Paid, then lapsed --------------------------------------------------------------------

insert into public.subscriptions (org_id, stripe_customer_id, status) values (:org, 'cus_pgtap', 'active');
select lives_ok(
  $$ update public.org_members set role = 'editor' where user_id = 'e3000000-0000-0000-0000-000000000004';
     insert into public.org_members (org_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000003a1', 'e3000000-0000-0000-0000-000000000005', 'editor') $$,
  'a paid org has no editor limit');

update public.subscriptions set status = 'canceled' where org_id = :org;
select is((select locked from public.org_usage(:org)), null::boolean,
  'usage is hidden from people outside the org');

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end; $$;

select pg_temp.as_user('e3000000-0000-0000-0000-000000000002');
select is((select locked from public.org_usage(:org)), false,
  'a lapsed org over the editor limit is not locked during the grace period');

select set_config('role', 'postgres', true);
update public.subscriptions set lapsed_at = now() - interval '15 days' where org_id = :org;

select pg_temp.as_user('e3000000-0000-0000-0000-000000000002');
update public.documents set title = 'locked out' where title = 'one, edited';
select is((select count(*) from public.documents where title = 'locked out'), 0::bigint,
  'after the grace period an editor is read-only');

select pg_temp.as_user('e3000000-0000-0000-0000-000000000001');
update public.documents set title = 'owner can' where title = 'one, edited';
select is((select count(*) from public.documents where title = 'owner can'), 1::bigint,
  'an owner can still write, to fix the situation');

select * from finish();
rollback;
