-- =====================================================================
-- 02 - Branding + super developer dashboard. SAFE TO RE-RUN.
-- Adds columns only (existing schools keep working, nothing is changed in their rows).
-- Run in Supabase -> SQL Editor. It does NOT touch profiles/results policies,
-- so each school's admin still sees only students registered on their own domain.
-- =====================================================================

-- 1. Branding columns
alter table public.schools add column if not exists short_name      text;
alter table public.schools add column if not exists tagline         text;
alter table public.schools add column if not exists city            text;
alter table public.schools add column if not exists location        text;
alter table public.schools add column if not exists email           text;
alter table public.schools add column if not exists favicon_url     text;
alter table public.schools add column if not exists images          jsonb default '{}'::jsonb;
alter table public.schools add column if not exists anthem_url      text;
alter table public.schools add column if not exists animation_style text default 'fade';
alter table public.schools drop constraint if exists schools_animation_chk;
alter table public.schools add constraint schools_animation_chk check (animation_style in ('fade','slide','zoom','none'));
create unique index if not exists schools_domain_unique on public.schools (lower(domain));

-- 2. What the public site may read (only the branding fields, only active schools)
grant select (id, school_name, short_name, tagline, city, location, address, phone, email, domain,
              logo_url, favicon_url, primary_color, secondary_color, images, anthem_url, animation_style, is_active)
  on public.schools to anon, authenticated;

-- 3. Who is a super developer
create table if not exists public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.platform_admins enable row level security;
drop policy if exists "platform admin reads self" on public.platform_admins;
create policy "platform admin reads self" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- 4. Only super developers can create / edit / delete schools, and see inactive ones
grant select, insert, update, delete on public.schools to authenticated;
drop policy if exists "super admin reads all schools" on public.schools;
drop policy if exists "super admin writes schools"    on public.schools;
create policy "super admin reads all schools" on public.schools for select to authenticated using (public.is_super_admin());
create policy "super admin writes schools"    on public.schools for all    to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- 5. Make a school's admin: the person first registers on THAT school's website, then you promote them here.
create or replace function public.super_set_school_admin(p_email text, p_school uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v profiles%rowtype;
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  select * into v from profiles where lower(email) = lower(trim(p_email)) limit 1;
  if not found then raise exception 'No account with that email. Ask them to register on the school website first.'; end if;
  if v.school_id is not null and v.school_id::text <> p_school::text then raise exception 'That account is registered on a different school.'; end if;
  update profiles set role = 'admin', school_id = p_school where id = v.id;
  return 'ok';
end $$;
revoke all on function public.super_set_school_admin(text, uuid) from public;
grant execute on function public.super_set_school_admin(text, uuid) to authenticated;

-- 6. File storage for logos, photos and anthems (public read, super developer write)
insert into storage.buckets (id, name, public) values ('school-assets', 'school-assets', true) on conflict (id) do nothing;
drop policy if exists "school assets public read"  on storage.objects;
drop policy if exists "school assets super write"  on storage.objects;
create policy "school assets public read" on storage.objects for select using (bucket_id = 'school-assets');
create policy "school assets super write" on storage.objects for all to authenticated
  using (bucket_id = 'school-assets' and public.is_super_admin()) with check (bucket_id = 'school-assets' and public.is_super_admin());

-- 7. Make YOURSELF the first super developer (create your user in Authentication -> Users first, then run with your email):
-- insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';
