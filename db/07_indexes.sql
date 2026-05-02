create index if not exists idx_conversations_user_updated_active
  on public.conversations(user_id, updated_at desc)
  where deleted_at is null;

create index if not exists idx_conversations_user_last_message_active
  on public.conversations(user_id, last_message_at desc nulls last)
  where deleted_at is null;

create index if not exists idx_conversations_metadata_gin
  on public.conversations using gin (metadata jsonb_path_ops);

create index if not exists idx_messages_conv_seq_active
  on public.messages(conversation_id, seq_no desc)
  where deleted_at is null;

create index if not exists idx_messages_user_created_active
  on public.messages(user_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_messages_metadata_gin
  on public.messages using gin (metadata jsonb_path_ops);

create index if not exists idx_attachments_user_created_active
  on public.attachments(user_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_attachments_conv_active
  on public.attachments(conversation_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_attachments_message_active
  on public.attachments(message_id)
  where deleted_at is null;

create index if not exists idx_attachments_status_type_active
  on public.attachments(ingestion_status, type, created_at desc)
  where deleted_at is null;

create index if not exists idx_attachments_metadata_gin
  on public.attachments using gin (metadata jsonb_path_ops);

create index if not exists idx_summaries_conv_created
  on public.conversation_summaries(conversation_id, created_at desc);

create index if not exists idx_chunks_attachment_index
  on public.document_chunks(attachment_id, chunk_index);

create index if not exists idx_chunks_user_created
  on public.document_chunks(user_id, created_at desc);
