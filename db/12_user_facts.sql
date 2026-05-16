-- Long-term user facts extracted from chat (name, preferences, etc.)

create table if not exists public.user_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fact_key text not null,
  fact_value text not null,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fact_key)
);

create index if not exists idx_user_facts_user_id on public.user_facts(user_id);

drop trigger if exists trg_user_facts_updated_at on public.user_facts;
create trigger trg_user_facts_updated_at
before update on public.user_facts
for each row execute function public.set_updated_at();

alter table public.user_facts enable row level security;

drop policy if exists user_facts_select_own on public.user_facts;
create policy user_facts_select_own on public.user_facts
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists user_facts_insert_own on public.user_facts;
create policy user_facts_insert_own on public.user_facts
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists user_facts_update_own on public.user_facts;
create policy user_facts_update_own on public.user_facts
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_facts_delete_own on public.user_facts;
create policy user_facts_delete_own on public.user_facts
for delete to authenticated
using (auth.uid() = user_id);
