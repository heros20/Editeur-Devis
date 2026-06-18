create or replace function app_private.org_has_members(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
  );
$$;

drop policy if exists "members_insert_managers" on public.organization_members;
create policy "members_insert_managers"
on public.organization_members
for insert
to authenticated
with check (
  (
    role = 'owner'
    and user_id = (select auth.uid())
    and created_by = (select auth.uid())
    and not (select app_private.org_has_members(organization_id))
  )
  or (
    (select app_private.can_manage_org(organization_id))
    and role <> 'owner'
  )
);

grant execute on function app_private.org_has_members(uuid) to authenticated;
