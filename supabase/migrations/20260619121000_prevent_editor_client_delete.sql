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
      and (previous_data -> 'catalog') is not distinct from (next_data -> 'catalog')
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(previous_data -> 'clients', '[]'::jsonb)) as previous_client
        where previous_client ? 'id'
          and not exists (
            select 1
            from jsonb_array_elements(coalesce(next_data -> 'clients', '[]'::jsonb)) as next_client
            where next_client ->> 'id' = previous_client ->> 'id'
          )
      );
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
    raise exception 'Modification non autorisée pour ce rôle.';
  end if;

  return new;
end;
$$;

grant execute on function app_private.can_update_workspace_data(uuid, jsonb, jsonb) to authenticated;
grant execute on function app_private.enforce_workspace_update_permissions() to authenticated;
