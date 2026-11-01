-- Staged additive migration. Move into migrations ONLY after real chat JWT acceptance.
-- Realtime carries invalidation metadata only; message bodies stay behind public.chat/RLS.
-- Recovery: disable CHAT_REALTIME_ENABLED and remove this table from publication via a
-- forward migration. Preserve chat history; do not drop messages/conversations.
begin;
create table chat.change_notifications (
  conversation_id uuid primary key references chat.conversations(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  changed_at timestamptz not null default now()
);
alter table chat.change_notifications enable row level security;
revoke all on chat.change_notifications from public,anon,authenticated,service_role;
grant select on chat.change_notifications to authenticated;
create policy chat_changes_member on chat.change_notifications for select to authenticated
  using (private.is_conversation_member(conversation_id));

create function private.chat_notify_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.last_message_at is not distinct from old.last_message_at then
    return new;
  end if;
  insert into chat.change_notifications(conversation_id) values(new.id)
  on conflict(conversation_id) do update set
    revision = chat.change_notifications.revision + 1, changed_at = now();
  return new;
end $$;
revoke all on function private.chat_notify_change() from public,anon,authenticated,service_role;
create trigger chat_conversation_changed after insert or update of last_message_at
  on chat.conversations for each row execute function private.chat_notify_change();
insert into chat.change_notifications(conversation_id) select id from chat.conversations;

-- Private inbox topic identifies only the current user. Visibility of each PostgreSQL
-- change is separately rechecked by table RLS, including revoked membership with old JWT.
-- No bodies, sender IDs or buyer IDs are in the published relation.
create policy shopbase_chat_receive on realtime.messages for select to authenticated
  using (realtime.topic() = 'shopbase-chat:inbox:' || auth.uid()::text and private.is_active());
-- Restrictive policies prevent a future broad permissive policy enabling spoofed chat
-- broadcasts or joining another user's inbox. Other applications' topics are unaffected.
create policy shopbase_chat_topic_scope on realtime.messages as restrictive for select to authenticated
  using (realtime.topic() not like 'shopbase-chat:%'
    or (realtime.topic() = 'shopbase-chat:inbox:' || auth.uid()::text and private.is_active()));
create policy shopbase_chat_no_client_broadcast on realtime.messages as restrictive for insert to anon,authenticated
  with check (realtime.topic() not like 'shopbase-chat:%');

alter publication supabase_realtime add table chat.change_notifications;
commit;
