create table if not exists public.conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  covered_until_seq bigint,
  model_name text,
  token_count integer check (token_count is null or token_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.attachments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer check (token_count is null or token_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (attachment_id, chunk_index)
);
