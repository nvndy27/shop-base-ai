// Run only after verify-chat-dev and the staged realtime migration have succeeded.
// Real Auth JWT/WebSockets, with no fake sessions or client message broadcasts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { devHarness } from './dev-harness.mjs';

const h = devHarness();
let stage = 'signup', channels = [];
const observers = [];
function subscribe(actor, topic = `shopbase-chat:inbox:${actor.id}`, rejected = false) {
  return new Promise(async (accept, reject) => {
    let finished = false;
    const timer = setTimeout(() => { if (!finished) reject(new Error('Realtime subscription timeout')); }, 15000);
    const observer = { events: [], waiters: [], channel: null };
    try {
      await actor.client.realtime.setAuth(await h.token(actor));
      observer.channel = actor.client.channel(topic, { config: { private: true, broadcast: { ack: true, self: true } } })
        .on('postgres_changes', { event: '*', schema: 'chat', table: 'change_notifications' }, event => {
          observer.events.push(event.new);
          for (const waiter of [...observer.waiters]) waiter(event.new);
        })
        .on('broadcast', { event: 'spoof' }, () => reject(new Error('Client broadcast unexpectedly delivered')))
        .subscribe(status => {
          if (finished) return;
          if (status === 'SUBSCRIBED') {
            finished = true; clearTimeout(timer);
            if (rejected) reject(new Error('Foreign channel joined')); else accept(observer);
          } else if (status === 'CHANNEL_ERROR') {
            finished = true; clearTimeout(timer);
            if (rejected) accept(observer); else reject(new Error('Own channel denied'));
          }
        });
      channels.push({ client: actor.client, channel: observer.channel });
      observers.push(observer);
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}
function next(observer, cid, revision = 0) {
  return new Promise((accept, reject) => {
    const ready = event => event.conversation_id === cid && event.revision > revision;
    const existing = observer.events.find(ready);
    if (existing) return accept(existing);
    const timer = setTimeout(() => { observer.waiters = observer.waiters.filter(value => value !== callback); reject(new Error('Realtime event missing')); }, 15000);
    function callback(event) {
      if (!ready(event)) return;
      clearTimeout(timer);
      observer.waiters = observer.waiters.filter(value => value !== callback);
      accept(event);
    }
    observer.waiters.push(callback);
  });
}

async function verify() {
  const buyer = await h.actor('rt-buyer'), seller = await h.actor('rt-seller');
  const staff = await h.actor('rt-staff'), outsider = await h.actor('rt-outsider');
  const shop = h.checked(await h.admin.from('shops').insert({ owner_user_id: seller.id, name: 'Realtime acceptance fixture', slug: `rt-${h.runId}`, status: 'active' }).select('id').single(), 'Fixture shop').id;
  h.created.shops.push(shop);
  h.checked(await h.admin.from('shop_members').insert([{ shop_id: shop, user_id: seller.id, role: 'owner' }, { shop_id: shop, user_id: staff.id, role: 'fulfillment' }]), 'Fixture members');
  stage = 'private channels';
  const buyerEvents = await subscribe(buyer), sellerEvents = await subscribe(seller), staffEvents = await subscribe(staff), outsiderEvents = await subscribe(outsider);
  await subscribe(outsider, `shopbase-chat:inbox:${buyer.id}`, true);
  console.log('PASS own private inboxes; foreign private channel denied');
  stage = 'persisted message event';
  const opened = await h.allowed(buyer, '/chat/conversations', { method: 'POST', body: { shop_id: shop } });
  const cid = opened.conversation.id;
  const input = { body: 'Real realtime acceptance fixture', client_message_id: randomUUID() };
  const sent = await h.allowed(buyer, `/chat/conversations/${cid}/messages`, { method: 'POST', body: input });
  const received = await Promise.all([next(buyerEvents, cid, 1), next(sellerEvents, cid, 1), next(staffEvents, cid, 1)]);
  for (const event of received) assert.deepEqual(Object.keys(event).sort(), ['changed_at', 'conversation_id', 'revision']);
  assert.equal(outsiderEvents.events.some(event => event.conversation_id === cid), false);
  assert.equal((await h.allowed(seller, `/chat/conversations/${cid}`)).items[0].id, sent.message.id);
  const repeat = await h.allowed(buyer, `/chat/conversations/${cid}/messages`, { method: 'POST', body: input });
  assert.equal(repeat.message.id, sent.message.id);
  console.log('PASS persisted message → metadata-only event → authorized BFF history; outsider receives nothing');

  stage = 'client broadcast denial';
  const forged = await buyerEvents.channel.send({ type: 'broadcast', event: 'spoof', payload: { body: 'Forged system message' } });
  assert.notEqual(forged, 'ok', 'Client must not inject chat broadcasts');
  console.log('PASS client cannot spoof chat broadcasts');

  stage = 'revocation with existing socket/JWT';
  const previous = received[1].revision, staffCount = staffEvents.events.length;
  const staffToken = await h.token(staff);
  h.checked(await h.admin.from('shop_members').update({ active: false }).eq('shop_id', shop).eq('user_id', staff.id), 'Revoke fixture staff');
  await h.allowed(buyer, `/chat/conversations/${cid}/messages`, { method: 'POST', body: { body: 'After revocation', client_message_id: randomUUID() } });
  await next(sellerEvents, cid, previous);
  // Bounded negative observation, while the authorized receiver proves the event was emitted.
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert.equal(staffEvents.events.length, staffCount);
  assert.equal(await h.token(staff), staffToken, 'Revocation must work before JWT replacement');
  assert.equal((await h.api(staff, `/chat/conversations/${cid}`)).status, 403);
  console.log('PASS revoked staff gets no later change/content over an existing socket and unchanged JWT');
  console.log('4 nhóm nghiệm thu private realtime local đạt.');
}
try { await verify(); }
catch (error) { console.error(`FAIL realtime at ${stage}: ${error.message}`); process.exitCode = 1; }
finally {
  for (const { client, channel } of channels) await client.removeChannel(channel);
  for (const client of h.clients) client.auth.stopAutoRefresh();
  console.log(`Fixture local giữ lại: ${JSON.stringify({ run_id: h.runId, ...h.created })}`);
}
