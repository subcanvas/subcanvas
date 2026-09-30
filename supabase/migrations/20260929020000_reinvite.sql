-- Invites that work every time (R6.4).
--
-- Accepting an invite used to mark it accepted and keep it. The row went on
-- holding the org's one invite for that address (unique org_id, email), so
-- inviting someone again after they left or were removed failed, and the
-- Members page, which lists open invites only, offered no way to clear it.
--
-- Now an invite exists only while it is open. Accepting one turns it into a
-- membership and deletes it, and inviting an address that already has an
-- invite, open or expired, renews that invite instead of failing.

-- Invites accepted before this migration have done their job.
delete from public.org_invites where accepted_at is not null;

comment on column public.org_invites.accepted_at is
  'No longer set: accepting an invite deletes it. Kept while the previous version of the app, which reads it, may still be running.';

---------------------------------------------------------------------------
-- Creating and renewing
---------------------------------------------------------------------------

-- How many invites each person may have emailed in a day. Anyone can sign
-- up and make an org, and an invite email goes to any address with the
-- org's name in it: without a cap, this server's mail would be a free way
-- to send spam. Past the cap the invite is still made and the admin copies
-- its link instead.
create table private.invite_emails (
  inviter uuid not null references public.profiles (id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index invite_emails_inviter_idx on private.invite_emails (inviter, sent_at);
revoke all on private.invite_emails from public, anon, authenticated;

-- Invites someone, or renews the invite their address already has: it
-- takes the role asked for now and runs for another 7 days from now. The
-- token, and so the link, stays the same, which makes a link sent earlier
-- work again. Admins only; the address must not belong to a member.
--
-- `renewed` says which of the two happened. `may_email` says whether the
-- app may email this one, and counts it when it may.
create function public.create_invite(p_org_id uuid, p_email text, p_role public.org_role)
returns table (id uuid, token uuid, expires_at timestamptz, renewed boolean, may_email boolean)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_email text := lower(trim(p_email));
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;
  if not private.has_org_role(p_org_id, 'admin') then
    raise exception 'Only admins can invite people.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.org_members m join public.profiles p on p.id = m.user_id
    where m.org_id = p_org_id and p.email = v_email
  ) then
    raise exception 'That person is already a member.' using errcode = 'P0001';
  end if;

  renewed := exists (
    select 1 from public.org_invites i where i.org_id = p_org_id and i.email = v_email
  );

  insert into public.org_invites as i (org_id, email, role, invited_by)
  values (p_org_id, v_email, p_role, v_uid)
  on conflict (org_id, email) do update
    set role = excluded.role,
        invited_by = excluded.invited_by,
        expires_at = now() + interval '7 days'
  returning i.id, i.token, i.expires_at into id, token, expires_at;

  delete from private.invite_emails e where e.inviter = v_uid and e.sent_at < now() - interval '1 day';
  may_email := (select count(*) from private.invite_emails e where e.inviter = v_uid) < 50;
  if may_email then
    insert into private.invite_emails (inviter) values (v_uid);
  end if;

  return next;
end;
$$;

revoke execute on function public.create_invite(uuid, text, public.org_role) from public, anon;
grant execute on function public.create_invite(uuid, text, public.org_role) to authenticated;

---------------------------------------------------------------------------
-- Reading and accepting
---------------------------------------------------------------------------

-- What an invite link shows before it is accepted. Callable by anyone
-- holding the token. An expired invite is returned too, so its page can say
-- that it expired and who can send it again; an unknown, accepted, or
-- revoked token returns nothing.
drop function public.get_invite(uuid);
create function public.get_invite(p_token uuid)
returns table (
  org_name text, org_slug text, email text, role public.org_role, expires_at timestamptz, inviter text
)
language sql stable security definer set search_path = ''
as $$
  select o.name, o.slug, i.email, i.role, i.expires_at, coalesce(p.display_name, p.email)
  from public.org_invites i
  join public.orgs o on o.id = i.org_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token;
$$;

grant execute on function public.get_invite(uuid) to anon, authenticated;

-- Accepts an invite: the caller becomes a member with the invite's role and
-- the invite is gone. The caller's email must match the invited email.
create or replace function public.accept_invite(p_token uuid)
returns public.orgs
language plpgsql security definer set search_path = ''
as $$
declare
  v_invite public.org_invites;
  v_org public.orgs;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  select * into v_invite
  from public.org_invites
  where token = p_token and expires_at > now()
  for update;

  if not found then
    raise exception 'This invite is invalid or has expired.' using errcode = 'P0001';
  end if;

  if v_invite.email <> lower((select auth.jwt()) ->> 'email') then
    raise exception 'This invite was sent to a different email address.' using errcode = 'P0001';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_invite.org_id, (select auth.uid()), v_invite.role)
  on conflict (org_id, user_id) do nothing;

  delete from public.org_invites where id = v_invite.id;

  select * into v_org from public.orgs where id = v_invite.org_id;
  return v_org;
end;
$$;
