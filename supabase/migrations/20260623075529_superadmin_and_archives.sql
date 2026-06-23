create table if not exists public.superadmins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint superadmins_email_lowercase check (email = lower(email)),
  constraint superadmins_has_identity check (user_id is not null or nullif(trim(email), '') is not null)
);

create index if not exists superadmins_user_id_idx on public.superadmins (user_id);
create index if not exists superadmins_email_idx on public.superadmins (email);

alter table public.superadmins enable row level security;

create or replace function app_private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.superadmins admin
      where admin.user_id = (select auth.uid())
         or admin.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    ),
    false
  );
$$;

create or replace function app_private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app_private.is_superadmin())
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_organization_id
        and member.user_id = (select auth.uid())
    ),
    false
  );
$$;

create or replace function app_private.can_edit_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app_private.org_role(target_organization_id)) in ('owner', 'admin', 'editor'),
    false
  );
$$;

create or replace function app_private.can_manage_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app_private.org_role(target_organization_id)) in ('owner', 'admin'),
    false
  );
$$;

create or replace function app_private.is_org_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app_private.org_role(target_organization_id)) = 'owner',
    false
  );
$$;

drop policy if exists "superadmins_select_self" on public.superadmins;
create policy "superadmins_select_self"
on public.superadmins
for select
to authenticated
using (
  user_id = (select auth.uid())
  or email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  or (select app_private.is_superadmin())
);

grant select on public.superadmins to authenticated;
grant execute on function app_private.is_superadmin() to authenticated;

insert into public.superadmins (user_id, email)
select auth_user.id, lower(auth_user.email)
from auth.users auth_user
where lower(auth_user.email) = 'herosqwerty@gmail.com'
on conflict (email) do update
set user_id = coalesce(public.superadmins.user_id, excluded.user_id);

insert into public.superadmins (email)
values ('herosqwerty@gmail.com')
on conflict (email) do nothing;
