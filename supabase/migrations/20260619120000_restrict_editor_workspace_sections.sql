create or replace function app_private.can_update_workspace_data(
  target_organization_id uuid,
  previous_data jsonb,
  next_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_role public.app_role;
begin
  member_role := app_private.org_role(target_organization_id);

  if member_role in ('owner', 'admin') then
    return true;
  end if;

  if member_role = 'editor' then
    return (previous_data -> 'company') is not distinct from (next_data -> 'company')
      and (previous_data -> 'catalog') is not distinct from (next_data -> 'catalog');
  end if;

  return false;
end;
$$;

create or replace function app_private.enforce_workspace_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.can_update_workspace_data(old.organization_id, old.data, new.data) then
    raise exception 'Modification des informations société et des articles réservée aux administrateurs.';
  end if;

  return new;
end;
$$;

drop trigger if exists organization_workspaces_guard_restricted_sections on public.organization_workspaces;
create trigger organization_workspaces_guard_restricted_sections
before update on public.organization_workspaces
for each row execute function app_private.enforce_workspace_update_permissions();

drop policy if exists "workspaces_insert_editors" on public.organization_workspaces;
drop policy if exists "workspaces_insert_managers" on public.organization_workspaces;
create policy "workspaces_insert_managers"
on public.organization_workspaces
for insert
to authenticated
with check ((select app_private.can_manage_org(organization_id)));

drop policy if exists "workspaces_update_editors" on public.organization_workspaces;
create policy "workspaces_update_editors"
on public.organization_workspaces
for update
to authenticated
using ((select app_private.can_edit_org(organization_id)))
with check ((select app_private.can_edit_org(organization_id)));

grant execute on function app_private.can_update_workspace_data(uuid, jsonb, jsonb) to authenticated;
grant execute on function app_private.enforce_workspace_update_permissions() to authenticated;
