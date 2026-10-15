-- /try is the playground (src/app/try): the whiteboard with no account. An
-- org with that slug could be created and then never opened. NOT VALID:
-- checked for every new slug and every change, without failing the deploy
-- over a workspace that may already have it.
alter table public.orgs
  add constraint orgs_slug_not_the_playground
  check (slug <> 'try') not valid;
