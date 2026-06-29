create or replace function app_private.delete_superadmin_organization(target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if target_organization_id is null then
    raise exception 'Entreprise introuvable.';
  end if;

  if not (select app_private.is_superadmin()) then
    raise exception 'Acces superadmin requis.' using errcode = '42501';
  end if;

  delete from public.organizations
  where id = target_organization_id;

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'Entreprise introuvable ou déjà supprimée.';
  end if;
end;
$$;

create or replace function public.delete_superadmin_organization(target_organization_id uuid)
returns void
language sql
set search_path = ''
as $$
  select app_private.delete_superadmin_organization(target_organization_id);
$$;

grant execute on function app_private.delete_superadmin_organization(uuid) to authenticated;
grant execute on function public.delete_superadmin_organization(uuid) to authenticated;
