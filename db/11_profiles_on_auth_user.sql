-- Create or update `public.profiles` when a new row is inserted into `auth.users`.
-- Reads `full_name` and `dob` from `raw_user_meta_data` (set by signUp options.data).
-- Run this in the Supabase SQL Editor after `10_tables_profiles.sql` is applied.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_dob text;
  v_dob_date date;
begin
  v_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_dob := nullif(trim(coalesce(new.raw_user_meta_data->>'dob', '')), '');

  if v_dob is not null then
    begin
      v_dob_date := v_dob::date;
    exception
      when others then
        v_dob_date := null;
    end;
  else
    v_dob_date := null;
  end if;

  insert into public.profiles (id, full_name, date_of_birth)
  values (new.id, v_name, v_dob_date)
  on conflict (id) do update
    set
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      date_of_birth = coalesce(excluded.date_of_birth, public.profiles.date_of_birth);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
