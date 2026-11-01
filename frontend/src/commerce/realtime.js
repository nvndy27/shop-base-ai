// Events are hints to refetch through the authorized API, never trusted chat messages.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function subscribeChatChanges(client, actorId, changed, statusChanged) {
  let stopped = false, channel;
  if (!client || !uuid.test(actorId || '')) {
    statusChanged('unavailable');
    return () => {};
  }
  statusChanged('connecting');
  async function connect() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token || data.session.user.id !== actorId) throw new Error('Session unavailable');
    await client.realtime.setAuth(data.session.access_token);
    if (stopped) return;
    channel = client.channel(`shopbase-chat:inbox:${actorId}`, { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'chat', table: 'change_notifications' }, event => {
        const id = event.new?.conversation_id;
        if (!stopped && uuid.test(id || '') && Number.isSafeInteger(event.new?.revision) && event.new.revision > 0) changed(id);
      })
      .subscribe(state => {
        if (stopped) return;
        statusChanged(state === 'SUBSCRIBED' ? 'connected' : state === 'CLOSED' ? 'disconnected' : 'connecting');
        if (state === 'SUBSCRIBED') changed(null); // Catch up after a lost connection.
        if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') statusChanged('unavailable');
      });
  }
  connect().catch(() => { if (!stopped) statusChanged('unavailable'); });
  return () => {
    stopped = true;
    if (channel) void client.removeChannel(channel).catch(() => {});
  };
}
