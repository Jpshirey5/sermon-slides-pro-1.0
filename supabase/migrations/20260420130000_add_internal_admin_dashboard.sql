create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  invited_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_not_blank check (char_length(btrim(email)) > 0)
);

create unique index if not exists idx_admin_users_email_lower
  on public.admin_users (lower(email));

create unique index if not exists idx_admin_users_email_unique
  on public.admin_users (email);

create index if not exists idx_admin_users_user_id_status
  on public.admin_users (user_id, status);

create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique default gen_random_uuid()::text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references public.admin_users(id) on delete set null,
  accepted_by uuid references public.admin_users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_invites_email_not_blank check (char_length(btrim(email)) > 0)
);

create index if not exists idx_admin_invites_email_status
  on public.admin_invites (lower(email), status);

create index if not exists idx_admin_invites_token_status
  on public.admin_invites (token, status);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  organization text,
  phone text,
  subject text not null default 'Customer Support',
  message text not null,
  submitted_from text,
  notification_sent boolean not null default false,
  notification_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_email_not_blank check (char_length(btrim(email)) > 0),
  constraint support_requests_message_not_blank check (char_length(btrim(message)) > 0)
);

create index if not exists idx_support_requests_created_at
  on public.support_requests (created_at desc);

create index if not exists idx_support_requests_email_lower
  on public.support_requests (lower(email));

alter table public.admin_users enable row level security;
alter table public.admin_invites enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.support_requests enable row level security;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = _user_id
      and status = 'active'
  );
$$;

create or replace function public.touch_admin_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_admin_users_updated_at on public.admin_users;
create trigger touch_admin_users_updated_at
before update on public.admin_users
for each row execute function public.touch_admin_updated_at();

drop trigger if exists touch_admin_invites_updated_at on public.admin_invites;
create trigger touch_admin_invites_updated_at
before update on public.admin_invites
for each row execute function public.touch_admin_updated_at();

drop trigger if exists touch_support_requests_updated_at on public.support_requests;
create trigger touch_support_requests_updated_at
before update on public.support_requests
for each row execute function public.touch_admin_updated_at();

drop policy if exists "Admins can view admin users" on public.admin_users;
create policy "Admins can view admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can view admin invites" on public.admin_invites;
create policy "Admins can view admin invites"
on public.admin_invites
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can view admin audit logs" on public.admin_audit_logs;
create policy "Admins can view admin audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can view support requests" on public.support_requests;
create policy "Admins can view support requests"
on public.support_requests
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete support requests" on public.support_requests;
create policy "Admins can delete support requests"
on public.support_requests
for delete
to authenticated
using (public.is_admin(auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _invite_token text;
  _admin_invite_token text;
  _new_account_id uuid;
begin
    _invite_token := NEW.raw_user_meta_data ->> 'invite_token';
    _admin_invite_token := NEW.raw_user_meta_data ->> 'admin_invite_token';

    if _admin_invite_token is not null and _admin_invite_token != '' then
      perform public.ensure_profile_exists(
        NEW.id,
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.email,
        NEW.raw_user_meta_data ->> 'church_role'
      );
      return NEW;
    end if;

    if _invite_token is not null and _invite_token != '' then
      -- Supabase admin invites create the auth user record before acceptance.
      -- Defer profile and membership creation until the invite is accepted.
      return NEW;
    end if;

    perform public.ensure_profile_exists(
      NEW.id,
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.email,
      NEW.raw_user_meta_data ->> 'church_role'
    );

    insert into public.accounts (name, city, state)
    values (
      coalesce(NEW.raw_user_meta_data ->> 'org_name', 'My Church'),
      NEW.raw_user_meta_data ->> 'org_city',
      NEW.raw_user_meta_data ->> 'org_state'
    )
    returning id into _new_account_id;

    insert into public.account_members (account_id, user_id, role, accepted_at)
    values (_new_account_id, NEW.id, 'owner', now());

    return NEW;
end;
$function$;
