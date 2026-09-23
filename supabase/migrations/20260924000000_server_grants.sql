-- What the app's own server may do with its secret key.
--
-- The server (SUPABASE_SECRET_KEY, role service_role) does two things a
-- browser may not: it keeps the subscriptions table in step with Stripe, and
-- it counts an org's editors to know how many seats to charge. Every other
-- table it touches goes through the person's own client and row-level
-- security.
--
-- Said explicitly, like every other grant in these migrations, because the
-- role's default privileges cannot be relied on: a local stack and a preview
-- branch give service_role no read or write on tables these migrations
-- create, and hosted production happens to. Starting checkout failed with
-- "permission denied for table subscriptions" the first time billing ran
-- anywhere but production.
grant select, insert, update on public.subscriptions to service_role;
grant select on public.org_members to service_role;

-- Writing a subscription fires track_lapse, which runs as the writer and
-- asks private.is_paid_status whether the new status counts as paid.
grant usage on schema private to service_role;
grant execute on function private.is_paid_status(text) to service_role;
