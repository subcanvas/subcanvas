begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Connect GitHub (migration github_connections): who can see a workspace's
-- connections, who can remove one, and that nobody but the server can add
-- one. Uses its own email domain and slugs so it passes against a local
-- database that already holds development data.

create function pg_temp.make_user(p_id uuid, p_email text) returns void
language sql as $$
  insert into auth.users (id, email, aud, role, instance_id)
  values (p_id, p_email, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
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

\set admin    '''e0000000-0000-0000-0000-0000000006e1'''
\set editor   '''e0000000-0000-0000-0000-0000000006e2'''
\set outsider '''e0000000-0000-0000-0000-0000000006e3'''
\set org      '''00000000-0000-0000-0000-0000000006a1'''
\set other    '''00000000-0000-0000-0000-0000000006a2'''

select pg_temp.make_user(:admin,    'admin@github.pgtap.test');
select pg_temp.make_user(:editor,   'editor@github.pgtap.test');
select pg_temp.make_user(:outsider, 'outsider@github.pgtap.test');
insert into public.orgs (id, name, slug) values (:org, 'GitHub', 'pgtap-github'), (:other, 'Other', 'pgtap-github-other');
insert into public.org_members (org_id, user_id, role) values
  (:org, :admin, 'admin'), (:org, :editor, 'editor'), (:other, :outsider, 'owner');

-- As the server writes one, with its secret key.
set local role service_role;
insert into public.github_connections (org_id, installation_id, account_login, account_type, connected_by)
values (:org, 101, 'acme', 'Organization', :admin), (:org, 102, 'ada', 'User', :admin);
reset role;

select throws_ok($$ insert into public.github_connections (org_id, installation_id, account_login, account_type)
                    values ('00000000-0000-0000-0000-0000000006a1', 1, 'Bad Name!', 'User') $$,
  '23514', null, 'an account name is one GitHub could have');

-- Reading ------------------------------------------------------------------------------
select pg_temp.login(:editor);
select is((select count(*) from public.github_connections where org_id = :org), 2::bigint,
  'a member sees the workspace''s connections');
select pg_temp.login(:outsider);
select is((select count(*) from public.github_connections), 0::bigint, 'and nobody outside it does');

-- Adding -------------------------------------------------------------------------------
select pg_temp.login(:admin);
select throws_ok($$ insert into public.github_connections (org_id, installation_id, account_login, account_type)
                    values ('00000000-0000-0000-0000-0000000006a1', 999, 'mallory', 'User') $$,
  '42501', null, 'not even an admin can add a connection: only the server, once GitHub has vouched for them');
select pg_temp.login(:outsider);
select throws_ok($$ insert into public.github_connections (org_id, installation_id, account_login, account_type)
                    values ('00000000-0000-0000-0000-0000000006a2', 101, 'acme', 'Organization') $$,
  '42501', null, 'nor attach another workspace''s installation to their own');
select throws_ok($$ update public.github_connections set org_id = '00000000-0000-0000-0000-0000000006a2' $$,
  '42501', null, 'nor move one');

-- Removing -----------------------------------------------------------------------------
select pg_temp.login(:editor);
delete from public.github_connections where installation_id = 101;
select pg_temp.logout();
select is((select count(*) from public.github_connections where org_id = :org), 2::bigint,
  'an editor cannot remove one');

select pg_temp.login(:admin);
select lives_ok($$ delete from public.github_connections where installation_id = 101 $$, 'an admin can');
select pg_temp.logout();
select is((select count(*) from public.github_connections where org_id = :org), 1::bigint, 'and it is gone');

-- With the workspace -------------------------------------------------------------------
delete from public.orgs where id = :org;
select is((select count(*) from public.github_connections where org_id = :org), 0::bigint,
  'a workspace''s connections go with it');

-- The step -----------------------------------------------------------------------------
select pg_temp.login(:admin);
select lives_ok($$ select public.record_step('connected_github') $$, 'connecting GitHub is a step the server records');
select pg_temp.logout();

select * from finish();
rollback;
