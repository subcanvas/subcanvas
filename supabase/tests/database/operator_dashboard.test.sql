begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- The operator's dashboard (migration operator_dashboard): only an operator
-- sees it, and an operator is never counted in it. Uses its own email domain
-- so it passes against a local database that already holds development data.

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

\set operator '''e0000000-0000-0000-0000-0000000008a1'''
\set someone  '''e0000000-0000-0000-0000-0000000008a2'''

select pg_temp.make_user(:operator, 'operator@dashboard.pgtap.test');
select pg_temp.make_user(:someone, 'someone@dashboard.pgtap.test');
insert into private.operators (user_id) values (:operator);

set local role anon;
select throws_ok($$ select public.operator_dashboard() $$, '42501', null, 'a visitor cannot ask for it');
reset role;

select pg_temp.login(:someone);
select is(public.operator_dashboard(), null, 'someone signed in who is not an operator gets nothing');
select throws_ok($$ select * from private.operators $$, '42501', null, 'nor can they read who the operators are');
select pg_temp.logout();

select pg_temp.login(:operator);
create temp table dashboard on commit drop as select public.operator_dashboard() as d;
select pg_temp.logout();

select ok((select d -> 'accounts' @> '[{"email": "someone@dashboard.pgtap.test"}]' from dashboard),
  'an operator sees the accounts');
select ok((select not (d -> 'accounts' @> '[{"email": "operator@dashboard.pgtap.test"}]') from dashboard),
  'but not their own');
select is((select jsonb_array_length(d -> 'sign_ups_by_day') from dashboard), 30, 'sign-ups for each of the last 30 days');
select is((select d -> 'steps' -> 0 ->> 'step' from dashboard), 'signed_up', 'the steps in the order an account meets them');

select * from finish();
rollback;
