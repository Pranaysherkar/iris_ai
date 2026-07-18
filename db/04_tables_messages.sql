create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.message_role not null,
  seq_no bigint not null,
  content text not null,
  -- Tree / edit branches (ChatGPT-style <1/2> versions)
  parent_message_id uuid references public.messages(id) on delete set null,
  sibling_group_id uuid not null default gen_random_uuid(),
  branch_version integer not null default 1 check (branch_version >= 1),
  is_active_path boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  model_name text,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer generated always as (prompt_tokens + completion_tokens) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  unique (conversation_id, seq_no),
  unique (sibling_group_id, branch_version)
);

-- ---------------------------------------------------------------------------
-- ALTER: existing Supabase projects (safe to re-run)
-- Run AFTER 03_tables_conversations.sql
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists parent_message_id uuid;

alter table public.messages
  add column if not exists sibling_group_id uuid;

alter table public.messages
  add column if not exists branch_version integer;

alter table public.messages
  add column if not exists is_active_path boolean;

-- Backfill linear history into a single active path
update public.messages m
set sibling_group_id = m.id
where m.sibling_group_id is null;

update public.messages m
set branch_version = 1
where m.branch_version is null;

update public.messages m
set is_active_path = true
where m.is_active_path is null;

-- parent = previous seq in same conversation (one-time linear backfill)
update public.messages m
set parent_message_id = p.id
from public.messages p
where m.parent_message_id is null
  and p.conversation_id = m.conversation_id
  and p.user_id = m.user_id
  and p.seq_no = m.seq_no - 1
  and p.deleted_at is null
  and m.deleted_at is null;

alter table public.messages
  alter column sibling_group_id set default gen_random_uuid();

alter table public.messages
  alter column branch_version set default 1;

alter table public.messages
  alter column is_active_path set default true;

alter table public.messages
  alter column sibling_group_id set not null;

alter table public.messages
  alter column branch_version set not null;

alter table public.messages
  alter column is_active_path set not null;

-- FK: parent_message_id -> messages(id)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_parent_message_id_fkey'
  ) then
    alter table public.messages
      add constraint messages_parent_message_id_fkey
      foreign key (parent_message_id) references public.messages(id) on delete set null;
  end if;
end $$;

-- Unique version per sibling group (edit versions 1,2,3…)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_sibling_group_id_branch_version_key'
  ) then
    alter table public.messages
      add constraint messages_sibling_group_id_branch_version_key
      unique (sibling_group_id, branch_version);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_branch_version_check'
  ) then
    alter table public.messages
      add constraint messages_branch_version_check
      check (branch_version >= 1);
  end if;
end $$;

-- conversations.active_leaf_message_id FK (column added in 03)
alter table public.conversations
  add column if not exists active_leaf_message_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_active_leaf_message_id_fkey'
  ) then
    alter table public.conversations
      add constraint conversations_active_leaf_message_id_fkey
      foreign key (active_leaf_message_id) references public.messages(id) on delete set null;
  end if;
end $$;

-- Set leaf to latest message on active path per conversation
update public.conversations c
set active_leaf_message_id = sub.id
from (
  select distinct on (m.conversation_id) m.id, m.conversation_id
  from public.messages m
  where m.deleted_at is null
    and m.is_active_path = true
  order by m.conversation_id, m.seq_no desc
) sub
where c.id = sub.conversation_id
  and c.active_leaf_message_id is null;

create index if not exists idx_messages_parent
  on public.messages(parent_message_id)
  where deleted_at is null;

create index if not exists idx_messages_sibling_group
  on public.messages(sibling_group_id, branch_version)
  where deleted_at is null;

create index if not exists idx_messages_conv_active_path
  on public.messages(conversation_id, seq_no)
  where deleted_at is null and is_active_path = true;

create index if not exists idx_conversations_active_leaf
  on public.conversations(active_leaf_message_id)
  where active_leaf_message_id is not null;

comment on column public.messages.parent_message_id is
  'Previous message on this branch (null = root).';
comment on column public.messages.sibling_group_id is
  'Shared id for edit versions of the same turn; UI shows <n/m> within this group.';
comment on column public.messages.branch_version is
  'Version index within sibling_group_id (1-based). Cap enforced in app via CONVERSATION_BRANCH_LIMIT.';
comment on column public.messages.is_active_path is
  'True if this message is on the currently viewed branch path.';
