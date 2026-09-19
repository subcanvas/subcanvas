-- Org slugs are top-level URL segments. Three app routes added since the first
-- migration were never reserved: /p (public projects), /terms, and /privacy.
-- An org with one of those slugs could be created and then never opened.
alter table public.orgs
  add constraint orgs_slug_not_a_route
  check (slug not in ('p', 'terms', 'privacy'));
