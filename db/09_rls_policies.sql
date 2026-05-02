alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.conversation_summaries enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversation_counters enable row level security;

drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own on public.conversations
for select to authenticated
using (auth.uid() = user_id and deleted_at is null);

drop policy if exists conversations_insert_own on public.conversations;
create policy conversations_insert_own on public.conversations
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own on public.conversations
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
for select to authenticated
using (auth.uid() = user_id and deleted_at is null);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
      and c.deleted_at is null
  )
);

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own on public.messages
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists attachments_select_own on public.attachments;
create policy attachments_select_own on public.attachments
for select to authenticated
using (auth.uid() = user_id and deleted_at is null);

drop policy if exists attachments_insert_own on public.attachments;
create policy attachments_insert_own on public.attachments
for insert to authenticated
with check (
  auth.uid() = user_id
  and (
    conversation_id is null
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.deleted_at is null
    )
  )
);

drop policy if exists attachments_update_own on public.attachments;
create policy attachments_update_own on public.attachments
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists summaries_select_own on public.conversation_summaries;
create policy summaries_select_own on public.conversation_summaries
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists summaries_insert_own on public.conversation_summaries;
create policy summaries_insert_own on public.conversation_summaries
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists chunks_select_own on public.document_chunks;
create policy chunks_select_own on public.document_chunks
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists chunks_insert_own on public.document_chunks;
create policy chunks_insert_own on public.document_chunks
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists counters_select_own on public.conversation_counters;
create policy counters_select_own on public.conversation_counters
for select to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.user_id = auth.uid()
  )
);
