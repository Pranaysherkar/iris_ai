create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  summary text,
  summary_version integer not null default 0,
  last_message_at timestamptz,
  -- Tip of the currently viewed branch (FK added after public.messages exists; see 04_tables_messages.sql)
  active_leaf_message_id uuid,
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

-- ---------------------------------------------------------------------------
-- ALTER: existing Supabase projects (safe to re-run)
-- Chat edit / branch tip — run this file, then 04_tables_messages.sql
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists active_leaf_message_id uuid;

comment on column public.conversations.active_leaf_message_id is
  'Message id at the tip of the active branch path (foredit versions).';
