create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role public.app_role not null default 'viewer' check (role <> 'owner'),
  token text not null unique check (char_length(token) between 8 and 64),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_invitations_organization_id_idx
  on public.organization_invitations (organization_id);

create index if not exists organization_invitations_email_idx
  on public.organization_invitations (email);

create index if not exists organization_invitations_token_idx
  on public.organization_invitations (token);

drop trigger if exists organization_invitations_set_updated_at on public.organization_invitations;
create trigger organization_invitations_set_updated_at
before update on public.organization_invitations
for each row execute function app_private.set_updated_at();

alter table public.organization_invitations enable row level security;

drop policy if exists "invitations_select_managers_or_invitee" on public.organization_invitations;
create policy "invitations_select_managers_or_invitee"
on public.organization_invitations
for select
to authenticated
using (
  (select app_private.can_manage_org(organization_id))
  or (
    email = lower(coalesce((select auth.jwt()->>'email'), ''))
    and accepted_at is null
    and expires_at > now()
  )
);

drop policy if exists "invitations_insert_managers" on public.organization_invitations;
create policy "invitations_insert_managers"
on public.organization_invitations
for insert
to authenticated
with check (
  (select app_private.can_manage_org(organization_id))
  and email = lower(trim(email))
  and role <> 'owner'
);

drop policy if exists "invitations_update_managers" on public.organization_invitations;
create policy "invitations_update_managers"
on public.organization_invitations
for update
to authenticated
using ((select app_private.can_manage_org(organization_id)))
with check (
  (select app_private.can_manage_org(organization_id))
  and email = lower(trim(email))
  and role <> 'owner'
);

drop policy if exists "invitations_delete_managers" on public.organization_invitations;
create policy "invitations_delete_managers"
on public.organization_invitations
for delete
to authenticated
using ((select app_private.can_manage_org(organization_id)));

create or replace function app_private.claim_organization_invitation(invitation_token text)
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
  where token = upper(trim(invitation_token))
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invitation introuvable ou expiree';
  end if;

  if invite.email <> current_email then
    raise exception 'Invitation reservee a une autre adresse email';
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

create or replace function public.claim_organization_invitation(invitation_token text)
returns uuid
language sql
set search_path = ''
as $$
  select app_private.claim_organization_invitation(invitation_token);
$$;

grant select, insert, update, delete on public.organization_invitations to authenticated;
grant execute on function public.claim_organization_invitation(text) to authenticated;
grant execute on function app_private.claim_organization_invitation(text) to authenticated;
