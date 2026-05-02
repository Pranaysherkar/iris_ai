do $$
begin
  if not exists (select 1 from pg_type where typname = 'message_role') then
    create type public.message_role as enum ('system', 'user', 'assistant', 'tool');
  end if;

  if not exists (select 1 from pg_type where typname = 'attachment_type') then
    create type public.attachment_type as enum ('pdf', 'image', 'text', 'audio', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'ingestion_status') then
    create type public.ingestion_status as enum ('pending', 'processing', 'ready', 'failed');
  end if;
end $$;
