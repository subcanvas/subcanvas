begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Uses its own email domain, slugs and ids so it passes against a local
-- database that already holds development data.

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

\set editor   '''e0000000-0000-0000-0000-000000000701'''
\set viewer   '''f0000000-0000-0000-0000-000000000702'''
\set outsider '''a1000000-0000-0000-0000-000000000703'''
\set org      '''00000000-0000-0000-0000-0000000007a1'''
\set other    '''00000000-0000-0000-0000-0000000007a2'''
\set closed   '''00000000-0000-0000-0000-0000000007b1'''
\set open     '''00000000-0000-0000-0000-0000000007b2'''
\set shutdoc  '''00000000-0000-0000-0000-0000000007d1'''
\set opendoc  '''00000000-0000-0000-0000-0000000007d2'''
\set childdoc '''00000000-0000-0000-0000-0000000007d3'''

select pg_temp.make_user(:editor,   'editor@pgtap-media.test');
select pg_temp.make_user(:viewer,   'viewer@pgtap-media.test');
select pg_temp.make_user(:outsider, 'outsider@pgtap-media.test');

insert into public.orgs (id, name, slug) values
  (:org, 'Media', 'pgtap-media'), (:other, 'Elsewhere', 'pgtap-media-other');
insert into public.org_members (org_id, user_id, role) values
  (:org, :editor, 'editor'), (:org, :viewer, 'viewer'), (:other, :outsider, 'editor');
insert into public.projects (id, org_id, name, visibility) values
  (:closed, :org, 'Closed', 'private'), (:open, :org, 'Open', 'public');
insert into public.documents (id, org_id, project_id, type, title) values
  (:shutdoc, :org, :closed, 'whiteboard', 'Secret'), (:opendoc, :org, :open, 'whiteboard', 'Readable');
insert into public.documents (id, org_id, project_id, type, title, parent_document_id) values
  (:childdoc, :org, :closed, 'whiteboard', 'Inside the secret', :shutdoc);

-- Names are <org>/<project>/<document>/<file>.<extension>.
\set private_png '''00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007d1/00000000-0000-0000-0000-00000000f001.png'''
\set child_mp4   '''00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007d3/00000000-0000-0000-0000-00000000f002.mp4'''
\set public_png  '''00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b2/00000000-0000-0000-0000-0000000007d2/00000000-0000-0000-0000-00000000f003.png'''

-- Uploading ------------------------------------------------------------------

select pg_temp.login(:editor, 'editor@pgtap-media.test');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values
    ('media-images', %L), ('media-videos', %L), ('media-images', %L) $$, :private_png, :child_mp4, :public_png),
  'an editor can upload to a whiteboard of their org');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media-images',
     '00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007d1/00000000-0000-0000-0000-00000000f004.svg') $$,
  '42501', null, 'an extension the bucket does not take is refused');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media-images',
     '00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007d1/00000000-0000-0000-0000-00000000f004.mp4') $$,
  '42501', null, 'a video is refused by the bucket for images');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media-images',
     '00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b2/00000000-0000-0000-0000-0000000007d1/00000000-0000-0000-0000-00000000f004.png') $$,
  '42501', null, 'a name whose project is not the document''s own is refused');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media-images', 'not/a/media/name.png') $$,
  '42501', null, 'a malformed name is refused, not an error');

select pg_temp.login(:viewer, 'viewer@pgtap-media.test');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media-images',
     '00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007d1/00000000-0000-0000-0000-00000000f005.png') $$,
  '42501', null, 'a viewer cannot upload');

select pg_temp.login(:outsider, 'outsider@pgtap-media.test');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media-images',
     '00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b2/00000000-0000-0000-0000-0000000007d2/00000000-0000-0000-0000-00000000f006.png') $$,
  '42501', null, 'nobody outside the org can upload, even to a public project');

-- Reading --------------------------------------------------------------------

select pg_temp.login(:viewer, 'viewer@pgtap-media.test');
select is((select count(*) from storage.objects where bucket_id like 'media-%' and name like '00000000-0000-0000-0000-0000000007a1/%'),
  3::bigint, 'a viewer reads the media of their org');

select pg_temp.login(:outsider, 'outsider@pgtap-media.test');
select is((select array_agg(name) from storage.objects where bucket_id like 'media-%' and name like '00000000-0000-0000-0000-0000000007a1/%'),
  array[:public_png], 'a member of another org reads only what is public');

set local role anon;
select set_config('request.jwt.claims', '', true);
select is((select array_agg(name) from storage.objects where bucket_id like 'media-%' and name like '00000000-0000-0000-0000-0000000007a1/%'),
  array[:public_png], 'an anonymous visitor reads the media of a public project only');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('media-images',
     '00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007b2/00000000-0000-0000-0000-0000000007d2/00000000-0000-0000-0000-00000000f007.png') $$,
  '42501', null, 'an anonymous visitor cannot upload');

select pg_temp.logout();
update public.projects set taken_down_at = now() where id = :open;
set local role anon;
select is((select count(*) from storage.objects where bucket_id like 'media-%' and name like '00000000-0000-0000-0000-0000000007a1/%'),
  0::bigint, 'media of a project that was taken down is no longer public');

-- Deleting -------------------------------------------------------------------
-- The Storage API sets this before it deletes; without it a trigger refuses
-- every direct delete, whatever the policies say.

select pg_temp.login(:viewer, 'viewer@pgtap-media.test');
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = :public_png;
select pg_temp.login(:outsider, 'outsider@pgtap-media.test');
delete from storage.objects where name = :public_png;
select pg_temp.logout();
select is((select count(*) from storage.objects where name = :public_png), 1::bigint,
  'neither a viewer nor a member of another org can delete');

select pg_temp.login(:outsider, 'outsider@pgtap-media.test');
select is((select count(*) from public.media_objects(:org)), 0::bigint,
  'the list of an org''s files is empty for someone outside it');

select pg_temp.login(:editor, 'editor@pgtap-media.test');
select is(
  (select array_agg(name order by name) from public.media_objects(:org, :shutdoc)),
  array[:private_png, :child_mp4],
  'the files of a document include those of the documents inside it');

-- A file outlives its document, so that it can still be removed afterwards.
select pg_temp.logout();
delete from public.documents where id = :shutdoc;
select pg_temp.login(:editor, 'editor@pgtap-media.test');
delete from storage.objects where name in (:private_png, :child_mp4);
select pg_temp.logout();
select is((select count(*) from storage.objects where name in (:private_png, :child_mp4)), 0::bigint,
  'an editor can delete the files of a document that is gone');
select is((select count(*) from storage.objects where name = :public_png), 1::bigint,
  'and nothing else went with them');

select * from finish();
rollback;
