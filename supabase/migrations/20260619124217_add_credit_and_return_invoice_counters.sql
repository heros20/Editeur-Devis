alter table public.organization_counters
drop constraint if exists organization_counters_counter_type_check;

alter table public.organization_counters
add constraint organization_counters_counter_type_check
check (counter_type in ('quote', 'order', 'invoice', 'creditNote', 'returnInvoice', 'client'));

insert into public.organization_counters (organization_id, counter_type, next_value)
select organization.id, counter_type.value, 1
from public.organizations organization
cross join (
  values
    ('creditNote'),
    ('returnInvoice')
) as counter_type(value)
on conflict (organization_id, counter_type) do nothing;

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
    (new.id, 'creditNote', 1),
    (new.id, 'returnInvoice', 1),
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
  if target_counter_type not in ('quote', 'order', 'invoice', 'creditNote', 'returnInvoice', 'client') then
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

grant execute on function public.reserve_business_number(uuid, text) to authenticated;
