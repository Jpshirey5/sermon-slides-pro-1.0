alter table public.global_messages
  drop constraint if exists global_messages_account_target_required;

alter table public.global_messages
  add constraint global_messages_account_target_required check (
    (audience_type in ('all', 'beta') and target_account_id is null)
    or (audience_type = 'account' and target_account_id is not null)
  );

alter table public.global_messages
  drop constraint if exists global_messages_audience_type_check;

alter table public.global_messages
  add constraint global_messages_audience_type_check
  check (audience_type in ('all', 'account', 'beta'));

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
      or (audience_type = 'account' and public.is_account_member(auth.uid(), target_account_id))
      or (
        audience_type = 'beta'
        and exists (
          select 1
          from public.account_members am
          join public.accounts a on a.id = am.account_id
          where am.user_id = auth.uid()
            and a.is_beta_user = true
        )
      )
    )
  )
);
