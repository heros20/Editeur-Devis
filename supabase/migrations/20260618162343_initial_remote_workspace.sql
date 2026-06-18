create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('owner', 'admin', 'editor', 'viewer');
  end if;
end $$;

create schema if not exists app_private;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role public.app_role not null default 'viewer',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.organization_workspaces (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  counter_type text not null check (counter_type in ('quote', 'order', 'invoice', 'client')),
  next_value integer not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, counter_type)
);

create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists organization_members_organization_id_idx on public.organization_members (organization_id);
create index if not exists organization_members_role_idx on public.organization_members (organization_id, role);
create index if not exists organization_workspaces_updated_at_idx on public.organization_workspaces (updated_at desc);
create index if not exists organization_counters_organization_id_idx on public.organization_counters (organization_id);

create or replace function app_private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_organization_id
        and member.user_id = (select auth.uid())
    ),
    false
  );
$$;

create or replace function app_private.org_role(target_organization_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.organization_members member
  where member.organization_id = target_organization_id
    and member.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function app_private.can_edit_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select app_private.org_role(target_organization_id)) in ('owner', 'admin', 'editor'), false);
$$;

create or replace function app_private.can_manage_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select app_private.org_role(target_organization_id)) in ('owner', 'admin'), false);
$$;

create or replace function app_private.is_org_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select app_private.org_role(target_organization_id)) = 'owner', false);
$$;

create or replace function app_private.storage_organization_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  folder text;
begin
  folder := (storage.foldername(object_name))[1];
  if folder is null or folder = '' then
    return null;
  end if;
  return folder::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function app_private.handle_organization_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (organization_id, user_id, role, created_by)
  values (new.id, new.created_by, 'owner', new.created_by)
  on conflict (organization_id, user_id) do nothing;

  insert into public.organization_workspaces (organization_id, data, updated_by)
  values (new.id, '{}'::jsonb, new.created_by)
  on conflict (organization_id) do nothing;

  insert into public.organization_counters (organization_id, counter_type, next_value)
  values
    (new.id, 'quote', 1),
    (new.id, 'order', 1),
    (new.id, 'invoice', 1),
    (new.id, 'client', 1)
  on conflict (organization_id, counter_type) do nothing;

  return new;
end;
$$;

create or replace function public.reserve_business_number(target_organization_id uuid, target_counter_type text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  reserved_value integer;
begin
  if target_counter_type not in ('quote', 'order', 'invoice', 'client') then
    raise exception 'Unsupported counter type: %', target_counter_type;
  end if;

  update public.organization_counters
  set next_value = next_value + 1,
      updated_at = now()
  where organization_id = target_organization_id
    and counter_type = target_counter_type
  returning next_value - 1 into reserved_value;

  if reserved_value is null then
    raise exception 'Counter not found';
  end if;

  return reserved_value;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function app_private.set_updated_at();

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function app_private.set_updated_at();

drop trigger if exists organization_workspaces_set_updated_at on public.organization_workspaces;
create trigger organization_workspaces_set_updated_at
before update on public.organization_workspaces
for each row execute function app_private.set_updated_at();

drop trigger if exists organizations_after_insert on public.organizations;
create trigger organizations_after_insert
after insert on public.organizations
for each row execute function app_private.handle_organization_insert();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_workspaces enable row level security;
alter table public.organization_counters enable row level security;

drop policy if exists "organizations_select_members" on public.organizations;
create policy "organizations_select_members"
on public.organizations
for select
to authenticated
using ((select app_private.is_org_member(id)));

drop policy if exists "organizations_insert_authenticated_owner" on public.organizations;
create policy "organizations_insert_authenticated_owner"
on public.organizations
for insert
to authenticated
with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

drop policy if exists "organizations_update_managers" on public.organizations;
create policy "organizations_update_managers"
on public.organizations
for update
to authenticated
using ((select app_private.can_manage_org(id)))
with check ((select app_private.can_manage_org(id)));

drop policy if exists "organizations_delete_owner" on public.organizations;
create policy "organizations_delete_owner"
on public.organizations
for delete
to authenticated
using ((select app_private.is_org_owner(id)));

drop policy if exists "members_select_members" on public.organization_members;
create policy "members_select_members"
on public.organization_members
for select
to authenticated
using ((select app_private.is_org_member(organization_id)));

drop policy if exists "members_insert_managers" on public.organization_members;
create policy "members_insert_managers"
on public.organization_members
for insert
to authenticated
with check ((select app_private.can_manage_org(organization_id)));

drop policy if exists "members_update_managers" on public.organization_members;
create policy "members_update_managers"
on public.organization_members
for update
to authenticated
using ((select app_private.can_manage_org(organization_id)))
with check ((select app_private.can_manage_org(organization_id)));

drop policy if exists "members_delete_managers" on public.organization_members;
create policy "members_delete_managers"
on public.organization_members
for delete
to authenticated
using ((select app_private.can_manage_org(organization_id)));

drop policy if exists "workspaces_select_members" on public.organization_workspaces;
create policy "workspaces_select_members"
on public.organization_workspaces
for select
to authenticated
using ((select app_private.is_org_member(organization_id)));

drop policy if exists "workspaces_insert_editors" on public.organization_workspaces;
create policy "workspaces_insert_editors"
on public.organization_workspaces
for insert
to authenticated
with check ((select app_private.can_edit_org(organization_id)));

drop policy if exists "workspaces_update_editors" on public.organization_workspaces;
create policy "workspaces_update_editors"
on public.organization_workspaces
for update
to authenticated
using ((select app_private.can_edit_org(organization_id)))
with check ((select app_private.can_edit_org(organization_id)));

drop policy if exists "counters_select_members" on public.organization_counters;
create policy "counters_select_members"
on public.organization_counters
for select
to authenticated
using ((select app_private.is_org_member(organization_id)));

drop policy if exists "counters_update_editors" on public.organization_counters;
create policy "counters_update_editors"
on public.organization_counters
for update
to authenticated
using ((select app_private.can_edit_org(organization_id)))
with check ((select app_private.can_edit_org(organization_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-attachments',
  'document-attachments',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "document_attachments_select_members" on storage.objects;
create policy "document_attachments_select_members"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'document-attachments'
  and (select app_private.is_org_member(app_private.storage_organization_id(name)))
);

drop policy if exists "document_attachments_insert_editors" on storage.objects;
create policy "document_attachments_insert_editors"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'document-attachments'
  and (select app_private.can_edit_org(app_private.storage_organization_id(name)))
);

drop policy if exists "document_attachments_update_editors" on storage.objects;
create policy "document_attachments_update_editors"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'document-attachments'
  and (select app_private.can_edit_org(app_private.storage_organization_id(name)))
)
with check (
  bucket_id = 'document-attachments'
  and (select app_private.can_edit_org(app_private.storage_organization_id(name)))
);

drop policy if exists "document_attachments_delete_editors" on storage.objects;
create policy "document_attachments_delete_editors"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'document-attachments'
  and (select app_private.can_edit_org(app_private.storage_organization_id(name)))
);

grant usage on schema public to anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;
grant execute on function public.reserve_business_number(uuid, text) to authenticated;

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update on public.organization_workspaces to authenticated;
grant select, update on public.organization_counters to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
