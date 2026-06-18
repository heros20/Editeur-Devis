drop policy if exists "members_insert_managers" on public.organization_members;
create policy "members_insert_managers"
on public.organization_members
for insert
to authenticated
with check (
  (select app_private.can_manage_org(organization_id))
  and role <> 'owner'
);

drop policy if exists "members_update_managers" on public.organization_members;
create policy "members_update_managers"
on public.organization_members
for update
to authenticated
using (
  (select app_private.can_manage_org(organization_id))
  and role <> 'owner'
)
with check (
  (select app_private.can_manage_org(organization_id))
  and role <> 'owner'
);

drop policy if exists "members_delete_managers" on public.organization_members;
create policy "members_delete_managers"
on public.organization_members
for delete
to authenticated
using (
  (select app_private.can_manage_org(organization_id))
  and role <> 'owner'
);
