-- =====================================================================
-- 03 - Student ID cards, Teacher (Junior/Senior) + Principal dashboards, class exams, real stats.
-- SAFE TO RE-RUN. Run AFTER 02_branding_migration.sql. Old schools are not changed:
--   * ID cards are only issued for schools where  schools.id_card_enabled = true (the dashboard turns it on for new schools)
--   * every new policy only ADDS access for the new staff roles, always limited to ONE school.
-- Roles used in profiles.role:  principal | teacher_junior | teacher_senior   (students stay 'student')
-- =====================================================================

alter table public.schools  add column if not exists id_card_enabled boolean default false;
alter table public.profiles add column if not exists candidate_no text;
alter table public.profiles add column if not exists verify_token text;
alter table public.profiles add column if not exists photo_at     timestamptz;
alter table public.profiles add column if not exists student_section text;
create unique index if not exists profiles_verify_token_school_uq on public.profiles (verify_token) where verify_token is not null;

-- 1. Card numbers (only for schools with id_card_enabled) ------------------------------------------
create sequence if not exists public.school_card_seq;
create or replace function public.issue_school_card() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_on boolean; v_code text;
begin
  if tg_op = 'UPDATE' then
    if old.candidate_no is not null then new.candidate_no := old.candidate_no; end if;
    if old.verify_token is not null then new.verify_token := old.verify_token; end if;
  end if;
  if new.role = 'student' and new.candidate_no is null and new.school_id is not null then
    select id_card_enabled, school_code into v_on, v_code from public.schools where id::text = new.school_id::text;
    if coalesce(v_on, false) then
      new.candidate_no := upper(left(regexp_replace(coalesce(v_code, 'SCH'), '[^A-Za-z0-9]', '', 'g'), 6))
        || '-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.school_card_seq')::text, 5, '0');
      new.verify_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_issue_school_card on public.profiles;
create trigger zz_issue_school_card before insert or update on public.profiles for each row execute function public.issue_school_card();

-- public QR check: shows only name, number, class, section, photo
create or replace function public.verify_school_card(p_token text)
returns table (full_name text, candidate_no text, school_name text, class_level text, student_section text, photo_at timestamptz, logo_url text)
language sql stable security definer set search_path = public as $$
  select p.full_name, p.candidate_no, s.school_name, p.class_level, p.student_section, p.photo_at, s.logo_url
  from public.profiles p join public.schools s on s.id::text = p.school_id::text
  where p.verify_token = p_token and length(p_token) >= 40 and p.role = 'student' limit 1;
$$;
grant execute on function public.verify_school_card(text) to anon, authenticated;

insert into storage.buckets (id, name, public) values ('student-photos', 'student-photos', true) on conflict (id) do nothing;
drop policy if exists "student photos read"   on storage.objects;
drop policy if exists "student photos insert" on storage.objects;
drop policy if exists "student photos update" on storage.objects;
create policy "student photos read"   on storage.objects for select using (bucket_id = 'student-photos');
create policy "student photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and name = (select p.verify_token || '.jpg' from public.profiles p where p.id = auth.uid()));
create policy "student photos update" on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and name = (select p.verify_token || '.jpg' from public.profiles p where p.id = auth.uid()));

-- 2. Who is staff, and what may they see -------------------------------------------------------------
create or replace function public.my_staff()
returns table (staff_role text, staff_school text, staff_section text)
language sql stable security definer set search_path = public as $$
  select p.role, p.school_id::text,
         case p.role when 'teacher_junior' then 'junior' when 'teacher_senior' then 'senior' end
  from public.profiles p where p.id = auth.uid() and p.role in ('principal', 'teacher_junior', 'teacher_senior') limit 1;
$$;
create or replace function public.staff_can_see(p_school text, p_section text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.my_staff() m
                 where m.staff_school = p_school and (m.staff_role = 'principal' or m.staff_section = lower(coalesce(p_section, ''))));
$$;
create or replace function public.my_student_scope()
returns table (scope_school text, scope_section text)
language sql stable security definer set search_path = public as $$
  select p.school_id::text, lower(coalesce(p.student_section, '')) from public.profiles p where p.id = auth.uid() and p.role = 'student' limit 1;
$$;
revoke all on function public.my_staff(), public.staff_can_see(text, text), public.my_student_scope() from public;
grant execute on function public.my_staff(), public.staff_can_see(text, text), public.my_student_scope() to authenticated;

drop policy if exists "staff read own school students" on public.profiles;
create policy "staff read own school students" on public.profiles for select to authenticated
  using (role = 'student' and public.staff_can_see(school_id::text, student_section));
drop policy if exists "staff read own school results" on public.results;
create policy "staff read own school results" on public.results for select to authenticated
  using (user_id in (select p.id from public.profiles p where p.role = 'student' and public.staff_can_see(p.school_id::text, p.student_section)));
drop policy if exists "staff read own school incidents" on public.exam_incidents;
create policy "staff read own school incidents" on public.exam_incidents for select to authenticated
  using (user_id in (select p.id from public.profiles p where p.role = 'student' and public.staff_can_see(p.school_id::text, p.student_section)));

-- 3. Class exams (teachers set them for their Junior or Senior students) ----------------------------
create table if not exists public.class_exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  section text not null check (section in ('junior', 'senior')),
  title text not null, subject text not null,
  duration_minutes int not null default 30 check (duration_minutes between 1 and 300),
  opens_at timestamptz, closes_at timestamptz,
  published boolean not null default false, is_active boolean not null default true,
  question_count int not null default 0,
  created_by uuid default auth.uid(), created_at timestamptz default now()
);
create table if not exists public.class_exam_questions (
  id bigint generated always as identity primary key,
  exam_id uuid not null references public.class_exams(id) on delete cascade,
  position int default 0, question_text text not null,
  option_a text, option_b text, option_c text, option_d text, correct_answer text not null
);
alter table public.results add column if not exists class_exam_id uuid references public.class_exams(id) on delete set null;
create index if not exists idx_results_class_exam on public.results (class_exam_id);

create or replace function public.count_class_questions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.class_exams set question_count = (select count(*) from public.class_exam_questions where exam_id = coalesce(new.exam_id, old.exam_id))
  where id = coalesce(new.exam_id, old.exam_id);
  return null;
end $$;
drop trigger if exists trg_count_class_questions on public.class_exam_questions;
create trigger trg_count_class_questions after insert or delete on public.class_exam_questions for each row execute function public.count_class_questions();

alter table public.class_exams enable row level security;
alter table public.class_exam_questions enable row level security;
grant select on public.class_exams, public.class_exam_questions to authenticated;
grant insert, delete on public.class_exam_questions to authenticated;

drop policy if exists "staff read class exams"    on public.class_exams;
drop policy if exists "students read class exams" on public.class_exams;
create policy "staff read class exams" on public.class_exams for select to authenticated using (public.staff_can_see(school_id::text, section));
create policy "students read class exams" on public.class_exams for select to authenticated
  using (published and is_active and exists (select 1 from public.my_student_scope() s where s.scope_school = school_id::text and s.scope_section = section));

drop policy if exists "staff read class questions"    on public.class_exam_questions;
drop policy if exists "students read class questions" on public.class_exam_questions;
drop policy if exists "teacher adds class questions"  on public.class_exam_questions;
drop policy if exists "teacher deletes class questions" on public.class_exam_questions;
create policy "staff read class questions" on public.class_exam_questions for select to authenticated
  using (exists (select 1 from public.class_exams e where e.id = exam_id and public.staff_can_see(e.school_id::text, e.section)));
create policy "students read class questions" on public.class_exam_questions for select to authenticated
  using (exists (select 1 from public.class_exams e, public.my_student_scope() s
                 where e.id = exam_id and e.published and e.is_active and s.scope_school = e.school_id::text and s.scope_section = e.section));
create policy "teacher adds class questions" on public.class_exam_questions for insert to authenticated
  with check (exists (select 1 from public.class_exams e, public.my_staff() m
                      where e.id = exam_id and not e.published and m.staff_school = e.school_id::text and m.staff_section = e.section));
create policy "teacher deletes class questions" on public.class_exam_questions for delete to authenticated
  using (exists (select 1 from public.class_exams e, public.my_staff() m
                 where e.id = exam_id and not e.published and m.staff_school = e.school_id::text and m.staff_section = e.section));

create or replace function public.create_class_exam(p_title text, p_subject text, p_duration int, p_opens timestamptz, p_closes timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare m record; v uuid;
begin
  select * into m from public.my_staff();
  if m.staff_section is null then raise exception 'Only Junior or Senior teachers can create exams.'; end if;
  insert into public.class_exams (school_id, section, title, subject, duration_minutes, opens_at, closes_at)
  values (m.staff_school::uuid, m.staff_section, trim(p_title), trim(p_subject), p_duration, p_opens, p_closes) returning id into v;
  return v;
end $$;
create or replace function public.update_class_exam(p_id uuid, p_opens timestamptz, p_closes timestamptz, p_duration int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.class_exams e set opens_at = p_opens, closes_at = p_closes, duration_minutes = p_duration, is_active = p_active
  where e.id = p_id and exists (select 1 from public.my_staff() m where m.staff_school = e.school_id::text and m.staff_section = e.section);
  if not found then raise exception 'Exam not found for your class.'; end if;
end $$;
create or replace function public.publish_class_exam(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.class_exam_questions where exam_id = p_id) = 0 then raise exception 'Add at least one question first.'; end if;
  update public.class_exams e set published = true where e.id = p_id
    and exists (select 1 from public.my_staff() m where m.staff_school = e.school_id::text and m.staff_section = e.section);
  if not found then raise exception 'Exam not found for your class.'; end if;
end $$;
create or replace function public.delete_class_exam(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.class_exams e where e.id = p_id
    and exists (select 1 from public.my_staff() m where m.staff_school = e.school_id::text and m.staff_section = e.section);
  if not found then raise exception 'Exam not found for your class.'; end if;
end $$;
revoke all on function public.create_class_exam(text,text,int,timestamptz,timestamptz), public.update_class_exam(uuid,timestamptz,timestamptz,int,boolean),
  public.publish_class_exam(uuid), public.delete_class_exam(uuid) from public;
grant execute on function public.create_class_exam(text,text,int,timestamptz,timestamptz), public.update_class_exam(uuid,timestamptz,timestamptz,int,boolean),
  public.publish_class_exam(uuid), public.delete_class_exam(uuid) to authenticated;

-- 4. Real numbers for the home page (counts only, nothing personal) --------------------------------
create or replace function public.school_public_stats(p_domain text)
returns table (students bigint, junior bigint, senior bigint)
language sql stable security definer set search_path = public as $$
  select count(*), count(*) filter (where lower(p.student_section) = 'junior'), count(*) filter (where lower(p.student_section) = 'senior')
  from public.profiles p join public.schools s on s.id::text = p.school_id::text
  where lower(s.domain) = lower(p_domain) and s.is_active and p.role = 'student';
$$;
grant execute on function public.school_public_stats(text) to anon, authenticated;

-- 5. Super developer: give someone a staff role for ONE school -------------------------------------
create or replace function public.super_set_school_staff(p_email text, p_school uuid, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare v profiles%rowtype;
begin
  if not public.is_super_admin() then raise exception 'not allowed'; end if;
  if p_role not in ('admin', 'principal', 'teacher_junior', 'teacher_senior') then raise exception 'unknown role'; end if;
  select * into v from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  if not found then raise exception 'No account with that email. Ask them to register on the school website first.'; end if;
  if v.school_id is not null and v.school_id::text <> p_school::text then raise exception 'That account is registered on a different school.'; end if;
  update public.profiles set role = p_role, school_id = p_school where id = v.id;
  return 'ok';
end $$;
revoke all on function public.super_set_school_staff(text, uuid, text) from public;
grant execute on function public.super_set_school_staff(text, uuid, text) to authenticated;
