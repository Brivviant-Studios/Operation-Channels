create extension if not exists pgcrypto;

create table if not exists public.channels (
  id text primary key,
  name text not null unique,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references public.channels(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now(),
  unique(channel_id, name)
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  username text unique,
  password_hash text,
  role text default 'standard' check (role in ('admin','standard')),
  is_active boolean default true,
  created_at timestamptz default now()
);



alter table public.people add column if not exists username text;
alter table public.people add column if not exists password_hash text;
alter table public.people add column if not exists role text default 'standard';
alter table public.people add column if not exists is_active boolean default true;
do $$ begin
  alter table public.people add constraint people_role_check check (role in ('admin','standard'));
exception when duplicate_object then null;
end $$;
create unique index if not exists people_username_unique on public.people(username) where username is not null;

create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int default 0
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  channel_name text not null,
  program_name text not null,
  episode_name text,
  episode_number text,
  title text not null,
  owner_name text,
  status text default 'لم يبدأ',
  due date,
  priority text default 'Normal',
  notes text,
  delay_reason text,
  archived_from_tasks boolean default false,
  archived_at timestamptz,
  delivered_at timestamptz,
  delivered_by text,
  delivered_upload_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel_name text,
  program_name text,
  episode text,
  by_name text,
  task_id uuid references public.tasks(id) on delete set null,
  task_title text,
  link text,
  github_path text,
  notes text,
  created_at timestamptz default now()
);

alter table public.channels enable row level security;
alter table public.programs enable row level security;
alter table public.people enable row level security;
alter table public.statuses enable row level security;
alter table public.tasks enable row level security;
alter table public.uploads enable row level security;

drop policy if exists "public access channels" on public.channels;
drop policy if exists "public access programs" on public.programs;
drop policy if exists "public access people" on public.people;
drop policy if exists "public access statuses" on public.statuses;
drop policy if exists "public access tasks" on public.tasks;
drop policy if exists "public access uploads" on public.uploads;

create policy "public access channels" on public.channels for all using (true) with check (true);
create policy "public access programs" on public.programs for all using (true) with check (true);
create policy "public access people" on public.people for all using (true) with check (true);
create policy "public access statuses" on public.statuses for all using (true) with check (true);
create policy "public access tasks" on public.tasks for all using (true) with check (true);
create policy "public access uploads" on public.uploads for all using (true) with check (true);


-- تنظيف أي أسماء مكررة احتياطيًا، ثم الإبقاء على unique name
delete from public.people a
using public.people b
where a.name = b.name
and a.id > b.id;


-- Default admin account stored in database with SHA-256 password hash.
-- Username: Brivviant
-- Password: Brivviant@123456
insert into public.people (name, username, password_hash, role, is_active)
values (
  'Brivviant',
  'Brivviant',
  encode(digest('Brivviant@123456', 'sha256'), 'hex'),
  'admin',
  true
)
on conflict (name) do update set
  username = excluded.username,
  password_hash = excluded.password_hash,
  role = 'admin',
  is_active = true;
