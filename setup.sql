-- ============================================
-- 清单插件 Supabase 数据库初始化
-- 复制粘贴到 Supabase SQL Editor 运行
-- ============================================

-- 用户数据表（存整个 JSON blob）
create table if not exists user_data (
  user_id   uuid primary key references auth.users on delete cascade,
  tasks     jsonb not null default '[]'::jsonb,
  settings  jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 自动更新 updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_user_data_updated_at
  before update on user_data
  for each row execute function update_updated_at();

-- Row Level Security
alter table user_data enable row level security;

create policy "Users can read own data"
  on user_data for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own data"
  on user_data for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own data"
  on user_data for update
  to authenticated
  using ((select auth.uid()) = user_id);
