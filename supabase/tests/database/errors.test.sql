begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Error reports (migration error_reports): only the server's secret key
-- reads or writes them, the same error is one row counted, a flood of new
-- ones is capped, and what was not seen for 30 days goes. Uses fingerprints
-- of its own so it passes against a database that already holds reports.

-- Who can reach it -----------------------------------------------------------------

set local role anon;
select throws_ok($$ select * from private.error_reports $$, '42501', null, 'a visitor cannot read error reports');
select throws_ok($$ select public.record_error('pgtap-e1', 'browser', 'Error', 'x', null, '/') $$, '42501', null,
  'nor write one: the browser posts to the app, which writes with the secret key');

set local role authenticated;
select throws_ok($$ select * from private.error_reports $$, '42501', null, 'a signed-in person cannot read them');
select throws_ok($$ select public.record_error('pgtap-e1', 'browser', 'Error', 'x', null, '/') $$, '42501', null,
  'nor write one');
select throws_ok($$ select public.daily_errors(current_date) $$, '42501', null, 'nor read a day of them');
select throws_ok($$ select public.delete_old_errors() $$, '42501', null, 'nor delete them');
reset role;

-- Grouping -----------------------------------------------------------------------

select set_config('role', 'service_role', true);
select is(public.record_error('pgtap-e1', 'server', 'TypeError', 'Cannot read properties of undefined', 'at f (a.js)', '/[org]', 'abc123'),
  'new', 'the server''s key records a new error');
select is(public.record_error('pgtap-e1', 'server', 'TypeError', 'Cannot read properties of undefined', 'at f (a.js)', '/[org]', 'def456'),
  'counted', 'the same fingerprint again is counted, not added');
select is((select count from private.error_reports where fingerprint = 'pgtap-e1'), 2::bigint, 'its count is two');
select is((select release from private.error_reports where fingerprint = 'pgtap-e1'), 'def456', 'with the latest release');
select is((select count from private.error_days where fingerprint = 'pgtap-e1' and day = (now() at time zone 'utc')::date),
  2::bigint, 'and two for today');
select ok((select (public.daily_errors((now() at time zone 'utc')::date) -> 'top') @> '[{"message": "Cannot read properties of undefined", "count": 2, "new": true}]'),
  'the day''s summary lists it with its count, as new');

-- The cap on new errors ---------------------------------------------------------------

-- The cap counts today's new browser errors, which a database in use
-- already has some of.
create function pg_temp.today() returns integer
language sql as $$
  select count(*)::integer from private.error_reports
  where source = 'browser' and first_seen >= (now() at time zone 'utc')::date::timestamp at time zone 'utc';
$$;

select is(public.record_error('pgtap-e2', 'browser', 'Error', 'one', null, '/', null, pg_temp.today() + 1), 'new',
  'a new browser error under the day''s cap is added');
select is(
  public.record_error('pgtap-e3', 'browser', 'Error', 'two', null, '/', null, pg_temp.today()),
  'refused', 'past the cap a new one is refused');
select is(public.record_error('pgtap-e2', 'browser', 'Error', 'one', null, '/', null, pg_temp.today()), 'counted',
  'while a known one is still counted');
select is((select count(*) from private.error_reports where fingerprint = 'pgtap-e3'), 0::bigint, 'the refused one was not stored');

-- Retention ------------------------------------------------------------------------

reset role;
update private.error_reports set last_seen = now() - interval '31 days' where fingerprint = 'pgtap-e2';
select set_config('role', 'service_role', true);
select ok(public.delete_old_errors() >= 1, 'errors not seen for 30 days are deleted');
select is((select count(*) from private.error_reports where fingerprint in ('pgtap-e1', 'pgtap-e2')), 1::bigint,
  'and only those');

select * from finish();
rollback;
