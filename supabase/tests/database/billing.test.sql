begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Uses its own slugs and ids so it passes against a local database that
-- already holds development data. The limit is lowered to 2 inside this
-- transaction only.

\set org     '''00000000-0000-0000-0000-0000000003a1'''
\set project '''00000000-0000-0000-0000-0000000003b1'''

insert into public.orgs (id, name, slug) values (:org, 'Billing', 'pgtap-billing');
insert into public.projects (id, org_id, name) values (:project, :org, 'P');
-- A fresh deployment has no limit. (The development database may have one
-- set by hand, so this checks the column default rather than the row.)
select is(
  (select column_default from information_schema.columns
   where table_schema = 'private' and table_name = 'config' and column_name = 'free_document_limit'),
  null, 'there is no document limit unless a deployment sets one');

update private.config set free_document_limit = 2;

create function pg_temp.add_doc(p_title text, p_kind public.document_kind default 'standard')
returns uuid language sql as $$
  insert into public.documents (org_id, project_id, type, title, kind)
  values ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000003b1', 'text', p_title, p_kind)
  returning id;
$$;

select lives_ok($$ select pg_temp.add_doc('one') $$, 'the first document is allowed');
select lives_ok($$ select pg_temp.add_doc('two') $$, 'the second document is allowed');
select throws_ok($$ select pg_temp.add_doc('three') $$, 'GN001', null,
  'a free org cannot go over the limit');
select lives_ok($$ select pg_temp.add_doc('a description', 'description') $$,
  'node descriptions do not count');
select lives_ok($$ update public.documents set title = 'one, edited' where title = 'one' $$,
  'existing documents stay editable at the limit');

update public.documents set deleted_at = now() where title = 'two';
select lives_ok($$ select pg_temp.add_doc('three') $$, 'trashing a document frees a slot');
select throws_ok(
  $$ update public.documents set deleted_at = null where title = 'two' $$,
  'GN001', null, 'restoring from the trash cannot go over the limit either');

insert into public.subscriptions (org_id, stripe_customer_id, status) values (:org, 'cus_pgtap', 'active');
select lives_ok($$ select pg_temp.add_doc('four') $$, 'a paid org has no limit');

update public.subscriptions set status = 'canceled' where org_id = :org;
select throws_ok($$ select pg_temp.add_doc('five') $$, 'GN001', null,
  'a lapsed org is limited again, and keeps what it has');

update private.config set free_document_limit = null;
select lives_ok($$ select pg_temp.add_doc('five') $$, 'a deployment can lift the limit');

select * from finish();
rollback;
