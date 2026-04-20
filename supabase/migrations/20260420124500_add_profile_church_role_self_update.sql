create or replace function public.update_my_church_role(_church_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _normalized_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = 'P0001';
  end if;

  _normalized_role := nullif(btrim(coalesce(_church_role, '')), '');

  update public.profiles
  set church_role = _normalized_role
  where id = auth.uid();

  if not found then
    insert into public.profiles (id, church_role)
    values (auth.uid(), _normalized_role)
    on conflict (id) do update
    set church_role = excluded.church_role;
  end if;

  return _normalized_role;
end;
$$;
