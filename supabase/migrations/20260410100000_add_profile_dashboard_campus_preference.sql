alter table public.profiles
  add column if not exists preferred_dashboard_campus_id uuid
  references public.campuses(id)
  on delete set null;

create index if not exists idx_profiles_preferred_dashboard_campus_id
  on public.profiles (preferred_dashboard_campus_id);
