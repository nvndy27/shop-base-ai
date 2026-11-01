import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chatDevConfig } from './chat-dev-config.mjs';

async function verify() {
  const config = chatDevConfig(process.env);
  const runId = randomUUID();
  const created = { users: [], shops: [] };
  let checks = 0;
  async function request(path, { token, admin = false, method = 'POST', body, prefer } = {}) {
    const response = await fetch(`${config.url}${path}`, {
      method,
      headers: {
        apikey: admin ? config.serviceKey : config.key,
        ...(admin || token ? { Authorization: `Bearer ${admin ? config.serviceKey : token}` } : {}),
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  }
  async function admin(path, options = {}) {
    const result = await request(path, { ...options, admin: true });
    if (result.status >= 300) throw new Error(`Thiết lập fixture thất bại (HTTP ${result.status}).`);
    return result.data;
  }
  const rpc = (token, operation, input = {}) => request('/rest/v1/rpc/chat', {
    token, body: { p_op: operation, p_input: input },
  });
  async function allowed(token, operation, input) {
    const result = await rpc(token, operation, input);
    assert.equal(result.status, 200, `RPC ${operation} phải thành công`);
    return result.data;
  }
  async function denied(token, operation, input) {
    const result = await rpc(token, operation, input);
    assert.ok([401, 403].includes(result.status), `RPC ${operation} phải bị từ chối`);
    assert.equal(result.data?.code, '42501');
  }
  function pass(name) { checks += 1; console.log(`PASS ${name}`); }
  async function actor(name) {
    const email = `chat-${runId}-${name}@example.test`;
    const password = `${randomUUID()}-${randomUUID()}`;
    const user = await admin('/auth/v1/admin/users', { body: { email, password, email_confirm: true } });
    assert.ok(user.id);
    created.users.push(user.id);
    const signedIn = await request('/auth/v1/token?grant_type=password', { body: { email, password } });
    assert.equal(signedIn.status, 200, 'Auth phải cấp JWT thật');
    assert.equal(signedIn.data?.user?.id, user.id);
    assert.ok(signedIn.data.access_token);
    return { id: user.id, token: signedIn.data.access_token };
  }
  async function shop(owner, suffix) {
    const rows = await admin('/rest/v1/shops', {
      prefer: 'return=representation',
      body: { owner_user_id: owner.id, slug: `chat-${runId}-${suffix}`, name: `Chat dev ${suffix}`, status: 'active' },
    });
    const id = rows[0]?.id;
    assert.ok(id);
    created.shops.push(id);
    await admin('/rest/v1/shop_members', { body: { shop_id: id, user_id: owner.id, role: 'owner' } });
    return id;
  }
  try {
    await denied(undefined, 'conversations');
    pass('Anonymous bị từ chối và RPC đã tồn tại');
    const buyerA = await actor('buyer-a');
    const buyerB = await actor('buyer-b');
    const sellerA = await actor('seller-a');
    const sellerB = await actor('seller-b');
    const staff = await actor('staff');
    const shopA = await shop(sellerA, 'a');
    const shopB = await shop(sellerB, 'b');
    await admin('/rest/v1/shop_members', { body: { shop_id: shopA, user_id: staff.id, role: 'fulfillment' } });
    const opened = await allowed(buyerA.token, 'conversation_open', { shop_id: shopA });
    const conversationId = opened.conversation.id;
    const repeated = await allowed(buyerA.token, 'conversation_open', { shop_id: shopA });
    assert.equal(repeated.conversation.id, conversationId);
    await allowed(buyerB.token, 'conversation_open', { shop_id: shopB });
    pass('Mở hội thoại idempotent bằng JWT buyer thật');
    const messageInput = { conversation_id: conversationId, body: 'Chat dev acceptance', client_message_id: randomUUID() };
    const sent = await allowed(buyerA.token, 'message_send', messageInput);
    const retried = await allowed(buyerA.token, 'message_send', messageInput);
    assert.equal(sent.message.id, retried.message.id);
    const thread = await allowed(sellerA.token, 'messages', { conversation_id: conversationId });
    assert.equal(thread.items.length, 1);
    assert.equal(thread.items[0].mine, false);
    assert.equal('sender_id' in thread.items[0], false);
    assert.equal('buyer_id' in opened.conversation, false);
    pass('Retry một hàng, DTO không lộ ID người gửi/người mua');
    for (const outsider of [buyerB, sellerB]) {
      await denied(outsider.token, 'messages', { conversation_id: conversationId });
      await denied(outsider.token, 'message_send', messageInput);
      const listed = await allowed(outsider.token, 'conversations');
      assert.equal(listed.items.some((item) => item.id === conversationId), false);
    }
    pass('Buyer B và seller B không đọc/gửi/nhìn thấy hội thoại A');
    await allowed(sellerA.token, 'conversation_read', { conversation_id: conversationId, up_to_seq: sent.message.sequence });
    const list = await allowed(sellerA.token, 'conversations');
    assert.equal(list.items.find((item) => item.id === conversationId).unread_count, 0);
    pass('Read cursor xóa unread');
    const memberPath = `/rest/v1/shop_members?shop_id=eq.${shopA}&user_id=eq.${staff.id}`;
    await allowed(staff.token, 'messages', { conversation_id: conversationId });
    try {
      await admin(memberPath, { method: 'PATCH', body: { active: false } });
      await denied(staff.token, 'messages', { conversation_id: conversationId });
      await denied(staff.token, 'message_send', messageInput);
      pass('Thu hồi nhân viên có hiệu lực với JWT còn hạn');
    } finally {
      await admin(memberPath, { method: 'PATCH', body: { active: true } });
    }
    try {
      await admin(`/rest/v1/shops?id=eq.${shopA}`, { method: 'PATCH', body: { status: 'closed' } });
      for (const member of [buyerA, sellerA]) {
        await allowed(member.token, 'messages', { conversation_id: conversationId });
        const history = await allowed(member.token, 'conversations');
        assert.ok(history.items.some((item) => item.id === conversationId));
        await denied(member.token, 'message_send', { ...messageInput, client_message_id: randomUUID() });
      }
      pass('Shop đóng giữ lịch sử hai phía nhưng chặn gửi');
    } finally {
      await admin(`/rest/v1/shops?id=eq.${shopA}`, { method: 'PATCH', body: { status: 'active' } });
    }
    console.log(`${checks} nhóm kiểm tra dịch vụ dev thật đạt. Chưa bao gồm BFF/UI/realtime.`);
    if (config.url === 'http://127.0.0.1:54321') {
      await mkdir(new URL('../data/local-dev/', import.meta.url), { recursive: true, mode: 0o700 });
      await writeFile(new URL('../data/local-dev/chat-text-acceptance.json', import.meta.url),
        JSON.stringify({ url: config.url, run_id: runId, checks, passed_at: new Date().toISOString() }), { mode: 0o600 });
    }
  } finally {
    console.log(`Fixture dev được giữ lại, không tự xóa: ${JSON.stringify({ run_id: runId, ...created })}`);
  }
}

verify().catch(() => {
  console.error('FAIL kiểm thử chat dev. Kiểm tra cấu hình, migration và quyền; không ghi token/payload lỗi vào log.');
  process.exitCode = 1;
});
