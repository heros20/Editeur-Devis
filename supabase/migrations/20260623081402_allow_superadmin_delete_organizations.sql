drop policy if exists "organizations_delete_superadmins" on public.organizations;
create policy "organizations_delete_superadmins"
on public.organizations
for delete
to authenticated
using ((select app_private.is_superadmin()));

drop policy if exists "document_attachments_delete_superadmins" on storage.objects;
create policy "document_attachments_delete_superadmins"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'document-attachments'
  and (select app_private.is_superadmin())
);

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
    raise exception 'Entreprise introuvable ou deja supprimee.';
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
