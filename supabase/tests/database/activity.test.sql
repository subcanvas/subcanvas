begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- The step record and the operator's view of accounts (migration
-- account_steps). Uses its own email domain, slugs and ids so it passes
-- against a local database that already holds development data.

-- Fixtures -----------------------------------------------------------------

create function pg_temp.make_user(p_id uuid, p_email text, p_created timestamptz default now()) returns void
language sql as $$
  insert into auth.users (id, email, aud, role, instance_id, created_at, raw_app_meta_data)
  values (p_id, p_email, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', p_created,
          '{"provider": "github", "providers": ["github"]}');
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
  perform set_config('request.headers', '', true);
end;
$$;

create function pg_temp.steps(p_id uuid) returns text[]
language sql as $$
  select coalesce(array_agg(step::text order by step), '{}') from private.account_steps where user_id = p_id;
$$;

\set ada  '''0b000000-0000-0000-0000-000000000a01'''
\set old  '''0b000000-0000-0000-0000-000000000a02'''
\set team '''00000000-0000-0000-0000-00000000ac01'''
\set proj '''00000000-0000-0000-0000-00000000ac11'''

select pg_temp.make_user(:ada, 'ada@pgtap-activity.test');
select pg_temp.make_user(:old, 'old@pgtap-activity.test', now() - interval '3 days');

-- Signing up -----------------------------------------------------------------

select is(pg_temp.steps(:ada), array['signed_up'], 'creating an account records that it signed up, and nothing else');

-- Who can read it ---------------------------------------------------------------

set local role anon;
select throws_ok($$ select * from private.account_activity $$, '42501', null,
  'a visitor cannot read the operator''s view of accounts');
select throws_ok($$ select * from private.account_steps $$, '42501', null, 'nor the steps');
select throws_ok($$ select public.daily_activity(current_date) $$, '42501', null, 'nor the daily summary');
select throws_ok($$ select public.record_step('opened_billing') $$, '42501', null, 'and records no steps');

select pg_temp.login(:ada);
select throws_ok($$ select * from private.account_activity $$, '42501', null,
  'a signed-in person cannot read the view, not even their own row');
select throws_ok($$ select * from private.account_steps $$, '42501', null, 'nor the steps');
select throws_ok($$ select public.daily_activity(current_date) $$, '42501', null, 'nor the daily summary');
select throws_ok($$ insert into private.account_steps (user_id, step) values ('0b000000-0000-0000-0000-000000000a01', 'upgraded') $$,
  '42501', null, 'nor write a step directly');
select pg_temp.logout();

-- Steps that are rows -------------------------------------------------------------

insert into public.orgs (id, name, slug, created_by) values (:team, 'Activity team', 'pgtap-activity-team', :ada);
insert into public.org_members (org_id, user_id, role) values (:team, :ada, 'owner');

select pg_temp.login(:ada);
insert into public.projects (id, org_id, name, created_by) values (:proj, :team, 'Made here', :ada);
insert into public.documents (org_id, project_id, type, created_by) values (:team, :proj, 'text', :ada);
select pg_temp.logout();
select is(pg_temp.steps(:ada), array['signed_up', 'created_project'],
  'New project records a project; a page is not a whiteboard');

-- What an import writes says so in a header, and is neither a whiteboard
-- made nor an edit.
select pg_temp.login(:ada);
select set_config('request.headers', '{"x-subcanvas-import": "1"}', true);
insert into public.projects (org_id, name, created_by, source)
values (:team, 'Imported', :ada, '{"provider": "github", "repository": "o/r"}');
insert into public.documents (org_id, project_id, type, created_by) values (:team, :proj, 'whiteboard', :ada);
insert into public.document_updates (document_id, update)
select id, '\x00'::bytea from public.documents where project_id = :proj and type = 'whiteboard';
select pg_temp.logout();
select is(pg_temp.steps(:ada), array['signed_up', 'created_project'],
  'an import makes no project, whiteboard or edit step: it is recorded when it succeeds');

select pg_temp.login(:ada);
insert into public.documents (org_id, project_id, type, created_by) values (:team, :proj, 'whiteboard', :ada);
insert into public.document_updates (document_id, update)
select id, '\x01'::bytea from public.documents where project_id = :proj and type = 'text';
select pg_temp.logout();
select is(pg_temp.steps(:ada), array['signed_up', 'created_project', 'created_whiteboard', 'made_edit'],
  'a whiteboard made by hand, and an edit, are recorded');

select pg_temp.login(:ada);
select * from public.create_invite(:team, 'friend@pgtap-activity.test', 'editor');
select pg_temp.logout();
select ok('invited_someone' = any (pg_temp.steps(:ada)), 'inviting someone is recorded');

insert into public.subscriptions (org_id, stripe_customer_id) values (:team, 'cus_pgtap_activity');
select ok(not 'upgraded' = any (pg_temp.steps(:ada)), 'a Stripe customer alone is not an upgrade');
update public.subscriptions set status = 'active' where org_id = :team;
select ok('upgraded' = any (pg_temp.steps(:ada)), 'a paid subscription is, for the workspace''s owners');

select is((select count(*) from private.account_steps where user_id = :ada and step = 'made_edit'), 1::bigint,
  'a step is recorded once, however often it is reached');
select ok(not 'came_back' = any (pg_temp.steps(:ada)), 'all of it on the day of sign-up is not coming back');

-- Steps the server records ---------------------------------------------------------

select pg_temp.login(:ada);
select lives_ok($$ select public.record_step('opened_github_import') $$, 'the server records a step for the person');
select throws_ok($$ select public.record_step('upgraded') $$, '22023', null,
  'but not one that a row decides');
select throws_ok($$ select public.record_step('read your diary') $$, '22023', null, 'nor anything else');
select pg_temp.logout();
select ok('opened_github_import' = any (pg_temp.steps(:ada)), 'the step is there');

-- The sign-up email and coming back -----------------------------------------------------

select pg_temp.login(:ada);
select is(public.record_visit(), true, 'the first visit of a new account claims the email to the operator');
select is(public.record_visit(), false, 'and no later one does: it is sent once');
select pg_temp.logout();

select pg_temp.login(:old);
select is(public.record_visit(), false, 'an account older than a day is not announced');
select pg_temp.logout();
select is(pg_temp.steps(:old), array['signed_up', 'came_back'], 'and a visit on a later day is coming back');

delete from private.account_steps where user_id = :old and step = 'came_back';
select pg_temp.login(:old);
select public.record_step('opened_billing');
select pg_temp.logout();
select is(pg_temp.steps(:old), array['signed_up', 'opened_billing', 'came_back'],
  'so is any step reached on a later day');

-- The view ----------------------------------------------------------------------------

select results_eq(
  format($$ select email, signed_up_with, personal_workspace is not null, team_workspaces_created, projects_created,
                   repositories_imported, whiteboards_created, pages_created, invites_open, plan, came_back
            from private.account_activity where user_id = %L $$, :ada),
  $$ values ('ada@pgtap-activity.test', 'github', true, 1::bigint, 2::bigint, 1::bigint, 2::bigint, 1::bigint,
             1::bigint, 'Pro', false) $$,
  'the operator''s view has a row per account, from the data that exists');
select is((select steps from private.account_activity where user_id = :ada),
  array['signed_up', 'opened_github_import', 'created_project', 'created_whiteboard', 'made_edit',
        'invited_someone', 'upgraded'],
  'and the steps, in the order they were reached (one transaction here, so in the order of the list)');
select is((select came_back from private.account_activity where user_id = :old), true, 'and who came back');

select set_config('role', 'service_role', true);
select is((select count(*) from private.account_activity where email like '%@pgtap-activity.test'), 2::bigint,
  'the server''s secret key reads the view');
select is(
  (select jsonb_path_query_array(public.daily_activity((now() at time zone 'utc')::date),
     '$.new[*] ? (@.email == "ada@pgtap-activity.test").steps[*].step')),
  '["signed_up", "opened_github_import", "created_project", "created_whiteboard", "made_edit", "invited_someone", "upgraded"]'::jsonb,
  'the day''s summary lists a new account with its steps');
select is(
  (select jsonb_path_query_array(public.daily_activity((now() at time zone 'utc')::date),
     '$.returning[*] ? (@.email == "old@pgtap-activity.test").steps[*].step')),
  '["opened_billing", "came_back"]'::jsonb,
  'and an older account that was active, with the steps it reached that day');
select ok((public.daily_activity((now() at time zone 'utc')::date) -> 'steps' ->> 'signed_up')::integer >= 1,
  'and how many accounts reached each step');
select pg_temp.logout();

-- Deleting the account ------------------------------------------------------------------

update public.subscriptions set status = 'canceled' where org_id = :team;
select set_config('role', 'service_role', true);
select * from public.delete_account(:ada);
select pg_temp.logout();
select is((select count(*) from private.account_steps where user_id = :ada), 0::bigint,
  'deleting an account deletes its steps');
select is((select count(*) from private.sign_up_emails where user_id = :ada), 0::bigint,
  'and the record that the operator was told');

select * from finish();
rollback;
