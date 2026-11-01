import { describe, expect, it, vi } from 'vitest';
import { subscribeChatChanges } from '../../frontend/src/commerce/realtime.js';

const actor = '10000000-0000-4000-8000-000000000001';
const cid = '20000000-0000-4000-8000-000000000001';
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function setup() {
  let change, subscription;
  const channel = { on: vi.fn((_, __, callback) => { change = callback; return channel; }), subscribe: vi.fn(callback => { subscription = callback; return channel; }) };
  const client = { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'fixture', user: { id: actor } } }, error: null })) },
    realtime: { setAuth: vi.fn(async () => {}) }, channel: vi.fn(() => channel), removeChannel: vi.fn(async () => {}) };
  return { client, emit: event => change(event), state: state => subscription(state) };
}
describe('private chat invalidation subscription', () => {
  it('uses a private own inbox and only requests refetches for valid metadata', async () => {
    const state = setup(), changed = vi.fn(), status = vi.fn();
    const close = subscribeChatChanges(state.client, actor, changed, status);
    await settle();
    expect(state.client.channel).toHaveBeenCalledWith(`shopbase-chat:inbox:${actor}`, { config: { private: true } });
    state.state('SUBSCRIBED'); expect(changed).toHaveBeenCalledWith(null);
    state.emit({ new: { conversation_id: cid, revision: 2, body: 'never treated as a message' } });
    expect(changed).toHaveBeenLastCalledWith(cid);
    state.emit({ new: { conversation_id: 'invalid', revision: 1 } });
    state.emit({ new: { conversation_id: cid, revision: -1 } });
    expect(changed).toHaveBeenCalledTimes(2);
    close(); state.emit({ new: { conversation_id: cid, revision: 3 } });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(state.client.removeChannel).toHaveBeenCalledTimes(1);
  });
  it('never connects with a missing/mismatched session and reports failures without fake online state', async () => {
    const state = setup(), status = vi.fn();
    state.client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    subscribeChatChanges(state.client, actor, vi.fn(), status);
    await settle();
    expect(state.client.channel).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('unavailable');
  });
  it('does not create a channel after cleanup while the session was being read', async () => {
    const state = setup();
    const close = subscribeChatChanges(state.client, actor, vi.fn(), vi.fn());
    close(); await settle();
    expect(state.client.channel).not.toHaveBeenCalled();
  });
});
