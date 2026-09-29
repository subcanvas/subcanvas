-- A report now reaches a person (R6.7). The app emails the operator once a
-- report is stored, so the function says whether it stored one: the new
-- report's id, or null when the flood guard dropped it, which must not
-- turn into a flood of email either.
drop function public.report_abuse(uuid, uuid, text, text);
create function public.report_abuse(
  p_project_id uuid, p_document_id uuid, p_reason text, p_reporter_email text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.project_is_public(p_project_id) then
    raise exception 'This project is not public.' using errcode = 'P0001';
  end if;
  -- A crude flood guard. Reports are read by a person, so a handful is enough.
  if (select count(*) from public.abuse_reports
      where project_id = p_project_id and created_at > now() - interval '1 hour') >= 20 then
    return null;
  end if;

  insert into public.abuse_reports (project_id, document_id, reason, reporter_email)
  values (p_project_id, p_document_id, trim(p_reason), nullif(trim(p_reporter_email), ''))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.report_abuse(uuid, uuid, text, text) to anon, authenticated;
