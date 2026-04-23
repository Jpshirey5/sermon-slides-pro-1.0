create table if not exists public.global_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience_type text not null default 'all' check (audience_type in ('all', 'account')),
  target_account_id uuid references public.accounts(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  starts_at timestamptz,
  ends_at timestamptz,
  cta_label text,
  cta_url text,
  created_by_admin_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint global_messages_title_not_blank check (char_length(btrim(title)) > 0),
  constraint global_messages_body_not_blank check (char_length(btrim(body)) > 0),
  constraint global_messages_account_target_required check (
    (audience_type = 'all' and target_account_id is null)
    or (audience_type = 'account' and target_account_id is not null)
  )
);

create index if not exists idx_global_messages_status_window
  on public.global_messages (status, starts_at, ends_at);

create index if not exists idx_global_messages_target_account
  on public.global_messages (target_account_id, status);

create table if not exists public.global_message_views (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.global_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  viewed_on date not null default current_date,
  dismissed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, viewed_on)
);

create index if not exists idx_global_message_views_user_message
  on public.global_message_views (user_id, message_id, viewed_on desc);

create index if not exists idx_global_message_views_account
  on public.global_message_views (account_id, created_at desc);

alter table public.global_messages enable row level security;
alter table public.global_message_views enable row level security;

drop trigger if exists touch_global_messages_updated_at on public.global_messages;
create trigger touch_global_messages_updated_at
before update on public.global_messages
for each row execute function public.touch_admin_updated_at();

drop policy if exists "Admins and targeted members can view global messages" on public.global_messages;
create policy "Admins and targeted members can view global messages"
on public.global_messages
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and (
      audience_type = 'all'
      or public.is_account_member(auth.uid(), target_account_id)
    )
  )
);

drop policy if exists "Only admins can insert global messages" on public.global_messages;
create policy "Only admins can insert global messages"
on public.global_messages
for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "Only admins can update global messages" on public.global_messages;
create policy "Only admins can update global messages"
on public.global_messages
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Only admins can delete global messages" on public.global_messages;
create policy "Only admins can delete global messages"
on public.global_messages
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Users can view own global message views" on public.global_message_views;
create policy "Users can view own global message views"
on public.global_message_views
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "Users can insert own global message views" on public.global_message_views;
create policy "Users can insert own global message views"
on public.global_message_views
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_account_member(auth.uid(), account_id)
);

drop policy if exists "Users can update own global message views" on public.global_message_views;
create policy "Users can update own global message views"
on public.global_message_views
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_account_member(auth.uid(), account_id)
);
