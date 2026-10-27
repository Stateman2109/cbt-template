-- =====================================================================
-- 04 - One attempt per exam (enforced by the database) + teacher "Reopen" for auto-submitted students.
-- SAFE TO RE-RUN. Run AFTER 03_cards_staff_exams.sql. Does not touch old schools' exams.
-- =====================================================================
alter table public.exam_incidents add column if not exists class_exam_id uuid;
create index if not exists idx_incidents_class_exam on public.exam_incidents (class_exam_id);

-- a student can have only ONE result per teacher exam (even if someone tries to bypass the page)
do $$ begin
  create unique index if not exists results_one_attempt_class on public.results (user_id, class_exam_id) where class_exam_id is not null;
exception when others then raise notice 'Could not create one-attempt index: %', sqlerrm;
end $$;

-- history of every reopen (who, when, why, and what the old attempt looked like)
create table if not exists public.class_exam_reopens (
  id bigint generated always as identity primary key,
  exam_id uuid not null, user_id uuid not null, reopened_by uuid default auth.uid(),
  reopened_at timestamptz not null default now(), reason text,
  old_results jsonb, old_incidents jsonb
);
alter table public.class_exam_reopens enable row level security;
grant select on public.class_exam_reopens to authenticated;
drop policy if exists "student reads own reopens" on public.class_exam_reopens;
drop policy if exists "staff read reopens"        on public.class_exam_reopens;
create policy "student reads own reopens" on public.class_exam_reopens for select to authenticated using (user_id = auth.uid());
create policy "staff read reopens" on public.class_exam_reopens for select to authenticated
  using (exists (select 1 from public.class_exams e where e.id = exam_id and public.staff_can_see(e.school_id::text, e.section)));

create or replace function public.reopen_class_exam(p_exam uuid, p_student uuid, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare e public.class_exams%rowtype; v_res jsonb; v_inc jsonb;
begin
  select * into e from public.class_exams where id = p_exam;
  if not found or not exists (select 1 from public.my_staff() m where m.staff_school = e.school_id::text and m.staff_section = e.section) then
    raise exception 'You can only reopen exams you set for your own section.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_student and p.role = 'student' and p.school_id::text = e.school_id::text and lower(coalesce(p.student_section, '')) = e.section) then
    raise exception 'That student is not in your section.';
  end if;
  if not exists (select 1 from public.exam_incidents i where i.user_id = p_student and i.class_exam_id = p_exam and i.kind = 'auto_submitted') then
    raise exception 'Only an auto-submitted exam can be reopened.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]') into v_res from public.results r where r.user_id = p_student and r.class_exam_id = p_exam;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]') into v_inc from public.exam_incidents i where i.user_id = p_student and i.class_exam_id = p_exam;
  insert into public.class_exam_reopens (exam_id, user_id, reason, old_results, old_incidents) values (p_exam, p_student, nullif(trim(p_reason), ''), v_res, v_inc);
  delete from public.exam_incidents where user_id = p_student and class_exam_id = p_exam;
  delete from public.results where user_id = p_student and class_exam_id = p_exam;
  return 'ok';
end $$;
revoke all on function public.reopen_class_exam(uuid, uuid, text) from public;
grant execute on function public.reopen_class_exam(uuid, uuid, text) to authenticated;
