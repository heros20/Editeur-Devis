update public.organization_members member
set email = auth_user.email
from auth.users auth_user
where member.user_id = auth_user.id
  and nullif(trim(coalesce(member.email, '')), '') is null
  and auth_user.email is not null;

create or replace function app_private.handle_organization_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (organization_id, user_id, email, role, created_by)
  values (
    new.id,
    new.created_by,
    (select auth_user.email from auth.users auth_user where auth_user.id = new.created_by),
    'owner',
    new.created_by
  )
  on conflict (organization_id, user_id) do update
  set email = coalesce(public.organization_members.email, excluded.email);

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
