create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campuses_name_not_blank check (char_length(btrim(name)) > 0)
);

alter table public.campuses enable row level security;

create unique index if not exists idx_campuses_account_primary_unique
  on public.campuses (account_id)
  where is_primary;

create unique index if not exists idx_campuses_account_name_unique
  on public.campuses (account_id, lower(name));

create index if not exists idx_campuses_account_id
  on public.campuses (account_id);

alter table public.sermons
  add column if not exists campus_id uuid references public.campuses(id) on delete set null,
  add column if not exists former_campus_name text;

create index if not exists idx_sermons_account_id_campus_id_presentation_date_desc
  on public.sermons (account_id, campus_id, presentation_date desc);

create index if not exists idx_sermons_account_id_former_campus_name
  on public.sermons (account_id, former_campus_name);

create or replace function public.ensure_enterprise_main_campus_for_account(_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_plan_tier text;
  existing_primary_id uuid;
  existing_campus_id uuid;
  next_campus_id uuid;
begin
  select coalesce(plan_tier, 'free')
  into account_plan_tier
  from public.accounts
  where id = _account_id;

  if account_plan_tier <> 'enterprise' then
    return null;
  end if;

  select id
  into existing_primary_id
  from public.campuses
  where account_id = _account_id
    and is_primary = true
  order by created_at asc
  limit 1;

  if existing_primary_id is not null then
    return existing_primary_id;
  end if;

  select id
  into existing_campus_id
  from public.campuses
  where account_id = _account_id
  order by created_at asc
  limit 1;

  if existing_campus_id is not null then
    update public.campuses
    set is_primary = true
    where id = existing_campus_id;

    return existing_campus_id;
  end if;

  insert into public.campuses (account_id, name, is_primary)
  values (_account_id, 'Main Campus', true)
  returning id into next_campus_id;

  return next_campus_id;
end;
$$;

create or replace function public.enforce_campus_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_plan_tier text;
  campus_count integer;
begin
  new.name := btrim(new.name);

  if new.name = '' then
    raise exception 'Campus name is required'
      using errcode = 'P0001';
  end if;

  select coalesce(plan_tier, 'free')
  into account_plan_tier
  from public.accounts
  where id = new.account_id;

  if account_plan_tier <> 'enterprise' then
    raise exception 'Campuses are only available on Enterprise plans'
      using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    select count(*)
    into campus_count
    from public.campuses
    where account_id = new.account_id;

    if campus_count >= 5 then
      raise exception 'Enterprise accounts can have up to 5 campuses'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_campus_rules_before_write on public.campuses;

create trigger enforce_campus_rules_before_write
before insert or update on public.campuses
for each row
execute function public.enforce_campus_rules();

drop trigger if exists update_campuses_updated_at on public.campuses;

create trigger update_campuses_updated_at
before update on public.campuses
for each row
execute function public.update_updated_at_column();

create or replace function public.ensure_enterprise_main_campus_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.plan_tier, 'free') = 'enterprise' then
    perform public.ensure_enterprise_main_campus_for_account(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_enterprise_main_campus_after_account_change on public.accounts;

create trigger ensure_enterprise_main_campus_after_account_change
after insert or update of plan_tier on public.accounts
for each row
execute function public.ensure_enterprise_main_campus_trigger();

create or replace function public.validate_sermon_campus_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_plan_tier text;
  campus_account_id uuid;
begin
  new.former_campus_name := nullif(btrim(coalesce(new.former_campus_name, '')), '');

  select coalesce(plan_tier, 'free')
  into account_plan_tier
  from public.accounts
  where id = new.account_id;

  if new.campus_id is not null then
    select account_id
    into campus_account_id
    from public.campuses
    where id = new.campus_id;

    if campus_account_id is null then
      raise exception 'Selected campus does not exist'
        using errcode = 'P0001';
    end if;

    if campus_account_id <> new.account_id then
      raise exception 'Selected campus does not belong to this account'
        using errcode = 'P0001';
    end if;
  end if;

  if account_plan_tier = 'enterprise' and new.campus_id is null then
    raise exception 'Enterprise presentations require a campus'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_sermon_campus_assignment_before_write on public.sermons;

create trigger validate_sermon_campus_assignment_before_write
before insert or update of account_id, campus_id, former_campus_name on public.sermons
for each row
execute function public.validate_sermon_campus_assignment();

create or replace function public.create_campus(_account_id uuid, _name text)
returns public.campuses
language plpgsql
security definer
set search_path = public
as $$
declare
  next_campus public.campuses;
begin
  if not public.is_account_owner(auth.uid(), _account_id) then
    raise exception 'Only account owners can create campuses'
      using errcode = 'P0001';
  end if;

  insert into public.campuses (account_id, name, is_primary)
  values (_account_id, btrim(_name), false)
  returning * into next_campus;

  return next_campus;
end;
$$;

create or replace function public.rename_campus(_campus_id uuid, _name text)
returns public.campuses
language plpgsql
security definer
set search_path = public
as $$
declare
  target_account_id uuid;
  next_campus public.campuses;
begin
  select account_id
  into target_account_id
  from public.campuses
  where id = _campus_id;

  if target_account_id is null then
    raise exception 'Campus not found'
      using errcode = 'P0001';
  end if;

  if not public.is_account_owner(auth.uid(), target_account_id) then
    raise exception 'Only account owners can rename campuses'
      using errcode = 'P0001';
  end if;

  update public.campuses
  set name = btrim(_name)
  where id = _campus_id
  returning * into next_campus;

  return next_campus;
end;
$$;

create or replace function public.set_primary_campus(_campus_id uuid)
returns public.campuses
language plpgsql
security definer
set search_path = public
as $$
declare
  target_account_id uuid;
  next_campus public.campuses;
begin
  select account_id
  into target_account_id
  from public.campuses
  where id = _campus_id;

  if target_account_id is null then
    raise exception 'Campus not found'
      using errcode = 'P0001';
  end if;

  if not public.is_account_owner(auth.uid(), target_account_id) then
    raise exception 'Only account owners can change the primary campus'
      using errcode = 'P0001';
  end if;

  update public.campuses
  set is_primary = false
  where account_id = target_account_id;

  update public.campuses
  set is_primary = true
  where id = _campus_id
  returning * into next_campus;

  return next_campus;
end;
$$;

create or replace function public.delete_campus(_campus_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campus public.campuses;
  replacement_campus_id uuid;
  total_campuses integer;
begin
  select *
  into target_campus
  from public.campuses
  where id = _campus_id;

  if target_campus.id is null then
    raise exception 'Campus not found'
      using errcode = 'P0001';
  end if;

  if not public.is_account_owner(auth.uid(), target_campus.account_id) then
    raise exception 'Only account owners can delete campuses'
      using errcode = 'P0001';
  end if;

  select count(*)
  into total_campuses
  from public.campuses
  where account_id = target_campus.account_id;

  if total_campuses <= 1 then
    raise exception 'At least one campus is required for Enterprise accounts'
      using errcode = 'P0001';
  end if;

  if target_campus.is_primary then
    select id
    into replacement_campus_id
    from public.campuses
    where account_id = target_campus.account_id
      and id <> target_campus.id
    order by created_at asc, id asc
    limit 1;

    update public.campuses
    set is_primary = false
    where account_id = target_campus.account_id;

    update public.campuses
    set is_primary = true
    where id = replacement_campus_id;
  else
    select id
    into replacement_campus_id
    from public.campuses
    where account_id = target_campus.account_id
      and is_primary = true
    order by created_at asc, id asc
    limit 1;
  end if;

  if replacement_campus_id is null then
    raise exception 'Could not determine a replacement campus'
      using errcode = 'P0001';
  end if;

  update public.sermons
  set
    campus_id = replacement_campus_id,
    former_campus_name = target_campus.name
  where account_id = target_campus.account_id
    and campus_id = target_campus.id;

  delete from public.campuses
  where id = target_campus.id;

  return replacement_campus_id;
end;
$$;

create policy "Members can view account campuses"
on public.campuses
for select
to authenticated
using (public.is_account_member(auth.uid(), account_id));

create policy "Owners can insert campuses"
on public.campuses
for insert
to authenticated
with check (public.is_account_owner(auth.uid(), account_id));

create policy "Owners can update campuses"
on public.campuses
for update
to authenticated
using (public.is_account_owner(auth.uid(), account_id));

create policy "Owners can delete campuses"
on public.campuses
for delete
to authenticated
using (public.is_account_owner(auth.uid(), account_id));

select public.ensure_enterprise_main_campus_for_account(id)
from public.accounts
where coalesce(plan_tier, 'free') = 'enterprise';

update public.sermons s
set campus_id = c.id
from public.campuses c
where s.account_id = c.account_id
  and c.is_primary = true
  and s.campus_id is null
  and exists (
    select 1
    from public.accounts a
    where a.id = s.account_id
      and coalesce(a.plan_tier, 'free') = 'enterprise'
  );
