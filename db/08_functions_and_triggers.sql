create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.assign_message_seq()
returns trigger
language plpgsql
as $$
declare
  v_seq bigint;
begin
  if new.seq_no is not null and new.seq_no > 0 then
    return new;
  end if;

  insert into public.conversation_counters (conversation_id, last_seq, updated_at)
  values (new.conversation_id, 1, now())
  on conflict (conversation_id)
  do update set last_seq = public.conversation_counters.last_seq + 1,
                updated_at = now()
  returning last_seq into v_seq;

  new.seq_no := v_seq;
  return new;
end;
$$;

create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set last_message_at = greatest(coalesce(last_message_at, '-infinity'::timestamptz), new.created_at),
      updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

drop trigger if exists trg_attachments_updated_at on public.attachments;
create trigger trg_attachments_updated_at
before update on public.attachments
for each row execute function public.set_updated_at();

drop trigger if exists trg_assign_message_seq on public.messages;
create trigger trg_assign_message_seq
before insert on public.messages
for each row execute function public.assign_message_seq();

drop trigger if exists trg_touch_conversation_last_message on public.messages;
create trigger trg_touch_conversation_last_message
after insert on public.messages
for each row execute function public.touch_conversation_last_message();
