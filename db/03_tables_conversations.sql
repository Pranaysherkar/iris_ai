create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  summary text,
  summary_version integer not null default 0,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create table if not exists public.conversation_counters (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  last_seq bigint not null default 0,
  updated_at timestamptz not null default now()
);
