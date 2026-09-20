-- Settings: what the settings pages need from the database that it did not
-- already enforce. Renaming an org, leaving one, and deleting one were
-- covered by the first migration's policies and need nothing here.

-- Whether the caller can sign in with a password. The auth API does not say:
-- an account made by magic link has the same "email" identity as one made
-- with a password. Answers only about the caller.
create function public.has_password()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select encrypted_password <> '' from auth.users where id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.has_password() from public, anon;
grant execute on function public.has_password() to authenticated;

-- What a person may put in their own profile. Collaborators see both fields,
-- so a picture is an https address and a name is short and not blank. This
-- runs on update only: a new account's name and picture come from Google or
-- GitHub, and a surprising value there must not stop someone signing up.
create function private.check_profile_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.display_name is not null
     and (new.display_name <> trim(new.display_name) or char_length(new.display_name) not between 1 and 80)
  then
    raise exception 'A display name is 1 to 80 characters.' using errcode = '23514';
  end if;
  if new.avatar_url is not null
     and (new.avatar_url !~ '^https://[^\s]+$' or char_length(new.avatar_url) > 2048)
  then
    raise exception 'A picture must be an https address.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_profile_fields
before update of display_name, avatar_url on public.profiles
for each row execute function private.check_profile_fields();

-- An org with a running subscription cannot be deleted by a person: the row
-- that ties it to Stripe would go with it and the card would keep being
-- charged. The owner cancels in Billing first; a subscription already set to
-- end with its period charges nothing more, so it does not block. The
-- service role (no auth.uid()) is the operator and is not stopped.
create function private.protect_subscribed_org()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and exists (
       select 1 from public.subscriptions
       where org_id = old.id and private.is_paid_status(status) and not cancel_at_period_end
     )
  then
    raise exception 'Cancel the subscription before deleting this org.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger protect_subscribed_org
before delete on public.orgs
for each row execute function private.protect_subscribed_org();
