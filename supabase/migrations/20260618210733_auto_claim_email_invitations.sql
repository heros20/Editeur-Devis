create or replace function app_private.claim_pending_organization_invitation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.organization_invitations%rowtype;
  current_user_id uuid;
  current_email text;
begin
  current_user_id := (select auth.uid());
  current_email := lower(coalesce((select auth.jwt()->>'email'), ''));

  if current_user_id is null or current_email = '' then
    raise exception 'Utilisateur non connecte';
  end if;

  select *
  into invite
  from public.organization_invitations
  where email = current_email
    and accepted_at is null
    and expires_at > now()
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  insert into public.organization_members (organization_id, user_id, email, role, created_by)
  values (invite.organization_id, current_user_id, current_email, invite.role, invite.created_by)
  on conflict (organization_id, user_id) do update
  set role = excluded.role,
      email = excluded.email,
      updated_at = now();

  update public.organization_invitations
  set accepted_at = now(),
      accepted_by = current_user_id
  where id = invite.id;

  return invite.organization_id;
end;
$$;

create or replace function public.claim_pending_organization_invitation()
returns uuid
language sql
set search_path = ''
as $$
  select app_private.claim_pending_organization_invitation();
$$;

grant execute on function public.claim_pending_organization_invitation() to authenticated;
grant execute on function app_private.claim_pending_organization_invitation() to authenticated;
