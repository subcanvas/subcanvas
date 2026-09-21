begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- The caps on an org's pictures and videos (migration media_storage_limit):
-- one for free orgs, one for paid orgs.
-- Uses its own email domain, slugs and ids so it passes against a local
-- database that already holds development data, and changes private.config
-- only inside this transaction.
--
-- Storage inserts a row twice per upload: first as the uploader, with only
-- the declared length (metadata.contentLength), in a transaction it rolls
-- back; then as its own superuser with the measured size (metadata.size).
-- Both are imitated here: the first as the logged-in editor, the second as
-- postgres, which like Storage's role is not subject to the policies.

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

-- The name of file <n> on the whiteboard of org a or b.
create function pg_temp.file(p_org text, p_n integer, p_extension text default 'png') returns text
language sql as $$
  select case p_org
    when 'a' then '00000000-0000-0000-0000-0000000008a1/00000000-0000-0000-0000-0000000008b1/00000000-0000-0000-0000-0000000008d1/'
    when 'c' then '00000000-0000-0000-0000-0000000008a3/00000000-0000-0000-0000-0000000008b3/00000000-0000-0000-0000-0000000008d3/'
    else '00000000-0000-0000-0000-0000000008a2/00000000-0000-0000-0000-0000000008b2/00000000-0000-0000-0000-0000000008d2/'
  end || '00000000-0000-0000-0000-' || lpad(p_n::text, 12, '0') || '.' || p_extension;
$$;

-- What Storage writes once the file has arrived.
create function pg_temp.stored(p_org text, p_n integer, p_bytes bigint, p_extension text default 'png') returns text
language sql as $$
  select format(
    $q$ insert into storage.objects (bucket_id, name, metadata) values (%L, %L, %L::jsonb) $q$,
    case p_extension when 'mp4' then 'media-videos' else 'media-images' end,
    pg_temp.file(p_org, p_n, p_extension),
    json_build_object('size', p_bytes, 'contentLength', p_bytes, 'mimetype', 'image/png')::text);
$$;

\set editor   '''e0000000-0000-0000-0000-000000000801'''
\set outsider '''a1000000-0000-0000-0000-000000000802'''
\set orga     '''00000000-0000-0000-0000-0000000008a1'''
\set orgb     '''00000000-0000-0000-0000-0000000008a2'''
\set orgc     '''00000000-0000-0000-0000-0000000008a3'''

select pg_temp.make_user(:editor,   'editor@pgtap-media-limit.test');
select pg_temp.make_user(:outsider, 'outsider@pgtap-media-limit.test');

insert into public.orgs (id, name, slug) values
  (:orga, 'Full', 'pgtap-media-limit-a'), (:orgb, 'Roomy', 'pgtap-media-limit-b'),
  (:orgc, 'Paid', 'pgtap-media-limit-c');
insert into public.org_members (org_id, user_id, role) values
  (:orga, :editor, 'editor'), (:orgb, :outsider, 'editor'), (:orgc, :editor, 'editor');
insert into public.projects (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000008b1', :orga, 'A'), ('00000000-0000-0000-0000-0000000008b2', :orgb, 'B'),
  ('00000000-0000-0000-0000-0000000008b3', :orgc, 'C');
insert into public.documents (id, org_id, project_id, type, title) values
  ('00000000-0000-0000-0000-0000000008d1', :orga, '00000000-0000-0000-0000-0000000008b1', 'whiteboard', 'A'),
  ('00000000-0000-0000-0000-0000000008d2', :orgb, '00000000-0000-0000-0000-0000000008b2', 'whiteboard', 'B'),
  ('00000000-0000-0000-0000-0000000008d3', :orgc, '00000000-0000-0000-0000-0000000008b3', 'whiteboard', 'C');
insert into public.subscriptions (org_id, stripe_customer_id, status, seats) values
  (:orgc, 'cus_pgtap_media_limit', 'active', 1);

-- Unlimited while unset ------------------------------------------------------

-- The Storage API sets this before it deletes; without it a trigger refuses
-- every direct delete.
select set_config('storage.allow_delete_query', 'true', true);

update private.config set free_media_storage_limit_bytes = null, paid_media_storage_limit_bytes = null;
select lives_ok(pg_temp.stored('a', 1, 50000000000),
  'with no limit set, an org keeps as much as it likes');
select is(private.media_bytes(:orga), 50000000000::bigint, 'and all of it is counted');
delete from storage.objects where name = pg_temp.file('a', 1);

-- A free org under and over the free limit ------------------------------------

update private.config set free_media_storage_limit_bytes = 1000, paid_media_storage_limit_bytes = 5000;

select lives_ok(pg_temp.stored('a', 2, 600), 'a file that fits is stored');
select lives_ok(pg_temp.stored('a', 3, 300, 'mp4'), 'a video counts in the same total');
select throws_ok(pg_temp.stored('a', 4, 200), '42501',
  'The free plan includes 1000 bytes of storage for pictures and videos, and this file does not fit in what is left.',
  'a file that would go over the limit is refused, with a message the app recognises');
select lives_ok(pg_temp.stored('a', 5, 100), 'a file that exactly fills it is stored');
select is(private.media_bytes(:orga), 1000::bigint, 'the org is at its limit');

-- The uploader's own check, before any bytes are sent -------------------------

select pg_temp.login(:editor, 'editor@pgtap-media-limit.test');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, metadata) values ('media-images', %L, '{"contentLength": 1}') $$,
    pg_temp.file('a', 6)),
  '42501', null, 'a full org is refused an upload before it starts');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('media-images', %L) $$, pg_temp.file('a', 6)),
  '42501', null, 'even one whose size is not declared');

-- Another org is unaffected -------------------------------------------------

select pg_temp.login(:outsider, 'outsider@pgtap-media-limit.test');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, metadata) values ('media-images', %L, '{"contentLength": 800}') $$,
    pg_temp.file('b', 1)),
  'a member of another org can still upload');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, metadata) values ('media-images', %L, '{"contentLength": 1200}') $$,
    pg_temp.file('b', 2)),
  '42501', null, 'but not a file that declares more than the limit');
select pg_temp.logout();
select lives_ok(pg_temp.stored('b', 3, 150), 'and the other org has its own total');
select is(private.media_bytes(:orgb), 950::bigint, 'which counts only its own files');

-- Deleting frees space; growing is counted -----------------------------------

delete from storage.objects where name = pg_temp.file('a', 2);
select lives_ok(pg_temp.stored('a', 7, 500), 'deleting a file makes room for another');
select throws_ok(
  format($$ update storage.objects set metadata = '{"size": 700}' where name = %L $$, pg_temp.file('a', 7)),
  '42501', null, 'a row that grows past the limit is refused');
select lives_ok(
  format($$ update storage.objects set metadata = '{"size": 400}' where name = %L $$, pg_temp.file('a', 7)),
  'one that shrinks is not');

-- What the settings page reads ------------------------------------------------

select pg_temp.login(:editor, 'editor@pgtap-media-limit.test');
select results_eq(
  format('select used_bytes, limit_bytes from public.org_media_usage(%L)', :orga),
  $$ values (800::bigint, 1000::bigint) $$,
  'a member reads the org''s usage and limit');
select is((select count(*) from public.org_media_usage(:orgb)), 0::bigint,
  'nobody reads the usage of an org they are not in');

-- A paid org has the paid limit ----------------------------------------------

select lives_ok(pg_temp.stored('c', 1, 1500), 'a paid org stores more than the free limit');
select lives_ok(pg_temp.stored('c', 2, 3000), 'and more, while it is under the paid limit');
select throws_ok(pg_temp.stored('c', 3, 1000), '42501',
  'This file does not fit in what is left of this org''s 5000 bytes of storage for pictures and videos.',
  'past the paid limit it is refused, with the paid plan''s message');
select pg_temp.login(:editor, 'editor@pgtap-media-limit.test');
select results_eq(
  format('select used_bytes, limit_bytes from public.org_media_usage(%L)', :orgc),
  $$ values (4500::bigint, 5000::bigint) $$,
  'a paid org''s usage reads against the paid limit');
select pg_temp.logout();

update private.config set paid_media_storage_limit_bytes = null;
select lives_ok(pg_temp.stored('c', 4, 50000000000), 'with no paid limit set, a paid org is unlimited');
select throws_ok(pg_temp.stored('a', 9, 500), '42501', null, 'while a free org keeps the free limit');
select pg_temp.login(:editor, 'editor@pgtap-media-limit.test');
select is((select limit_bytes from public.org_media_usage(:orgc)), null::bigint,
  'and a paid org reads no limit');
select pg_temp.logout();

-- An org that stops paying is back under the free limit.
update public.subscriptions set status = 'canceled' where org_id = :orgc;
select throws_ok(pg_temp.stored('c', 5, 1), '42501',
  'The free plan includes 1000 bytes of storage for pictures and videos, and this file does not fit in what is left.',
  'a lapsed org is refused past the free limit');

-- A cap agreed with one org replaces its plan's ------------------------------

-- Org c keeps 50,000,004,500 bytes; give it 500 more than that.
insert into private.org_media_storage_limits (org_id, limit_bytes, note)
values (:orgc, 50000005000, 'pgTAP');
select lives_ok(pg_temp.stored('c', 6, 400), 'an agreed cap replaces the plan''s, even for a free org');
select throws_like(pg_temp.stored('c', 7, 200),
  'This file does not fit in what is left of this org''s % of storage for pictures and videos.',
  'past the agreed cap it is refused, with the org''s own message');
select pg_temp.login(:editor, 'editor@pgtap-media-limit.test');
select is((select limit_bytes from public.org_media_usage(:orgc)), 50000005000::bigint,
  'the org reads its agreed cap');
select pg_temp.logout();
delete from private.org_media_storage_limits where org_id = :orgc;
select throws_ok(pg_temp.stored('c', 8, 1), '42501',
  'The free plan includes 1000 bytes of storage for pictures and videos, and this file does not fit in what is left.',
  'without the agreed cap the plan''s applies again');

-- Unset again, nothing is refused --------------------------------------------

select pg_temp.logout();
update private.config set free_media_storage_limit_bytes = null;
select lives_ok(pg_temp.stored('a', 8, 5000), 'unsetting the limit lifts it');

select * from finish();
rollback;
