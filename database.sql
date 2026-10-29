-- SO'FI OLLOH YOR database schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  username text unique,
  role text not null default 'student' check (role in ('student','teacher','admin','parent')),
  avatar_url text,
  birth_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  specialty text,
  bio text,
  experience_years int default 0,
  phone text,
  photo_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  short_description text,
  category text,
  level text,
  duration text,
  lessons_count int default 0,
  price numeric(12,2) default 0,
  discount_price numeric(12,2),
  image_url text,
  published boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  name text not null,
  room text,
  capacity int default 15,
  start_date date,
  end_date date,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  status text default 'active',
  enrolled_at timestamptz default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  title text not null,
  description text,
  video_url text,
  pdf_url text,
  audio_url text,
  lesson_order int default 1,
  duration_minutes int default 0,
  published boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  completed boolean default false,
  percent numeric(5,2) default 0,
  last_position_seconds int default 0,
  updated_at timestamptz default now(),
  unique(lesson_id, student_id)
);

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  description text,
  duration_minutes int default 30,
  published boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid references public.tests(id) on delete cascade,
  question text not null,
  points numeric(8,2) default 1,
  order_no int default 1
);

create table if not exists public.test_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.test_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean default false
);

create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid references public.tests(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  score numeric(8,2) default 0,
  total numeric(8,2) default 0,
  started_at timestamptz default now(),
  submitted_at timestamptz
);

create table if not exists public.homework (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid references public.homework(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  answer_text text,
  file_url text,
  score numeric(8,2),
  teacher_comment text,
  submitted_at timestamptz default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  application_no text unique,
  full_name text not null,
  phone text not null,
  telegram text,
  birth_date date,
  age int,
  gender text,
  region text,
  district text,
  address text,
  school text,
  parent_name text,
  parent_phone text,
  course_id uuid references public.courses(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  format text default 'offline',
  preferred_time text,
  preferred_days text,
  note text,
  status text default 'new' check(status in ('new','reviewing','accepted','rejected')),
  created_at timestamptz default now()
);

create table if not exists public.schedule (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  day_of_week int not null,
  start_time time not null,
  end_time time not null,
  room text,
  created_at timestamptz default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  lesson_date date not null,
  status text default 'present',
  note text,
  unique(group_id, student_id, lesson_date)
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete set null,
  exam_name text not null,
  subject text,
  score numeric(8,2),
  max_score numeric(8,2),
  result_date date,
  certificate_url text,
  public_visible boolean default true
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  amount numeric(12,2) not null,
  status text default 'pending',
  method text,
  paid_at timestamptz,
  receipt_url text,
  created_at timestamptz default now()
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  excerpt text,
  body text,
  image_url text,
  published boolean default false,
  published_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text not null,
  category text,
  published boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.faq (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  sort_order int default 0,
  published boolean default true
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  certificate_no text unique,
  issued_at date default current_date,
  file_url text
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Admin helper
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- New user profile trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- Public read policies
drop policy if exists public_courses_read on public.courses;
create policy public_courses_read on public.courses for select using (published = true or public.is_admin());

drop policy if exists public_teachers_read on public.teachers;
create policy public_teachers_read on public.teachers for select using (is_active = true or public.is_admin());

drop policy if exists public_news_read on public.news;
create policy public_news_read on public.news for select using (published = true or public.is_admin());

drop policy if exists public_gallery_read on public.gallery;
create policy public_gallery_read on public.gallery for select using (published = true or public.is_admin());

drop policy if exists public_faq_read on public.faq;
create policy public_faq_read on public.faq for select using (published = true or public.is_admin());

drop policy if exists public_results_read on public.results;
create policy public_results_read on public.results for select using (public_visible = true or public.is_admin());

drop policy if exists public_applications_insert on public.applications;
create policy public_applications_insert on public.applications for insert to anon, authenticated with check (true);

-- Admin full access policies
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','teachers','courses','groups','enrollments','lessons','lesson_progress',
    'tests','test_questions','test_options','test_attempts','homework','homework_submissions',
    'applications','schedule','attendance','results','payments','news','gallery','faq',
    'certificates','notifications','site_settings'
  ] loop
    execute format('drop policy if exists admin_all_%I on public.%I', t, t);
    execute format('create policy admin_all_%I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- Own profile
drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists own_profile_update on public.profiles;
create policy own_profile_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Own progress
drop policy if exists own_progress on public.lesson_progress;
create policy own_progress on public.lesson_progress for all to authenticated
using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

-- Own attempts
drop policy if exists own_attempts on public.test_attempts;
create policy own_attempts on public.test_attempts for all to authenticated
using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

-- Own submissions
drop policy if exists own_submissions on public.homework_submissions;
create policy own_submissions on public.homework_submissions for all to authenticated
using (student_id = auth.uid() or public.is_admin())
with check (student_id = auth.uid() or public.is_admin());

-- Seed courses
insert into public.courses(title,slug,short_description,category,level,duration,price,published)
values
('Arab tili','arab-tili','Arab tilini bosqichma-bosqich o‘rganish','Til','Boshlang‘ich','6 oy',450000,true),
('Ingliz tili','ingliz-tili','Speaking, Grammar va imtihon tayyorgarligi','Til','Boshlang‘ich–Yuqori','6 oy',450000,true),
('Matematika','matematika','Maktab va imtihonlarga puxta tayyorgarlik','Aniq fan','O‘rta','8 oy',400000,true),
('IT va dasturlash','it-dasturlash','Zamonaviy dasturlash asoslari','IT','Boshlang‘ich','6 oy',500000,true)
on conflict (slug) do nothing;
