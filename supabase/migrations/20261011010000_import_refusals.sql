-- Why an import from GitHub was refused, in the step record (migration
-- account_steps): one step per kind of refusal, the first time an account
-- met it. Only the kind is kept, never the repository's name. Opening the
-- dialog and leaving without a project said nothing about why; these say
-- whether it was a repository GitHub would not show (a private one looks
-- the same as one that does not exist), a limit, or GitHub itself.

alter type private.account_step add value if not exists 'import_refused_not_found' after 'imported_repository';
alter type private.account_step add value if not exists 'import_refused_rate_limited' after 'import_refused_not_found';
alter type private.account_step add value if not exists 'import_refused_too_large' after 'import_refused_rate_limited';
alter type private.account_step add value if not exists 'import_refused_nothing_to_map' after 'import_refused_too_large';
alter type private.account_step add value if not exists 'import_refused_unavailable' after 'import_refused_nothing_to_map';
alter type private.account_step add value if not exists 'import_refused_limit' after 'import_refused_unavailable';
alter type private.account_step add value if not exists 'import_refused_other' after 'import_refused_limit';

create or replace function public.record_step(p_step text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;
  if p_step is null or p_step not in
     ('opened_github_import', 'imported_repository', 'imported_files', 'connected_agent', 'opened_billing',
      'import_refused_not_found', 'import_refused_rate_limited', 'import_refused_too_large',
      'import_refused_nothing_to_map', 'import_refused_unavailable', 'import_refused_limit',
      'import_refused_other')
  then
    raise exception 'Not a step the app records.' using errcode = '22023';
  end if;
  perform private.reach_step((select auth.uid()), p_step::private.account_step);
end;
$$;
