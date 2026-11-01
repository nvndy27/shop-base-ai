import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDatabase, setActor, users, shops } from '../helpers/database';

type Conversation = {
  id: string; shop_id: string; shop_name: string; counterpart_name: string;
  unread_count: number; last_message: { body: string; mine: boolean } | null;
};
type Message = { id: string; sequence: number; body: string; mine: boolean; client_message_id: string };
let db: PGlite;
let productB: string;
let conversationId: string;

async function rpc<T = Record<string, unknown>>(op: string, body: unknown = {}) {
  return (await db.query<{ result: T }>('select public.chat($1,$2) result', [op, body])).rows[0]!.result;
}
async function conversations() {
  return (await rpc<{ items: Conversation[] }>('conversations')).items;
}
async function send(body: string, key = randomUUID()) {
  return rpc<{ message: Message }>('message_send', { conversation_id: conversationId, body, client_message_id: key });
}

describe('Persistent chat: derived membership, read cursor and idempotent sends', () => {
  beforeAll(async () => {
    db = await createDatabase();
    await db.exec(await readFile(new URL('../../supabase/migrations/202610030003_marketplace_cod.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/202610050001_chat.sql', import.meta.url), 'utf8'));
    await db.query("update public.profiles set display_name = 'Người mua A' where user_id = $1", [users.buyerA]);
    productB = (await db.query<{ id: string }>(
      "insert into commerce.products(shop_id,title,category,status) values($1,'Sản phẩm shop B','All_Beauty','published') returning id",
      [shops.b],
    )).rows[0]!.id;
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it('denies anon before any membership exists', async () => {
    await setActor(db, null);
    await expect(rpc('conversations')).rejects.toMatchObject({ code: '42501' });
    await expect(rpc('message_send', { conversation_id: randomUUID(), body: 'Xin chào', client_message_id: randomUUID() }))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('opens one conversation per shop and rejects self-shop and foreign context', async () => {
    await setActor(db, users.buyerA);
    const opened = await rpc<{ conversation: Conversation }>('conversation_open', { shop_id: shops.a });
    conversationId = opened.conversation.id;
    expect(opened.conversation.counterpart_name).toBe('Shop A');
    expect(opened.conversation.unread_count).toBe(0);
    const again = await rpc<{ conversation: Conversation }>('conversation_open', { shop_id: shops.a });
    expect(again.conversation.id).toBe(conversationId);
    expect(await conversations()).toHaveLength(1);

    await expect(rpc('conversation_open', { shop_id: shops.a, context_product_id: productB }))
      .rejects.toMatchObject({ code: '22023' });
    await expect(rpc('conversation_open', { shop_id: shops.a, context_product_id: null }))
      .rejects.toMatchObject({ code: '22023' });
    await expect(rpc('conversation_open', { shop_id: shops.a, surprise: 1 }))
      .rejects.toMatchObject({ code: '22023' });
    await expect(rpc('conversation_open', { shop_id: 'not-a-uuid' }))
      .rejects.toMatchObject({ code: '22023' });
    await expect(rpc('conversation_open', { shop_id: randomUUID() }))
      .rejects.toMatchObject({ code: 'P0002' });

    await setActor(db, users.sellerA);
    await expect(rpc('conversation_open', { shop_id: shops.a })).rejects.toMatchObject({ code: '22023' });
  });

  it('shows the buyer name to the shop without exposing buyer_id or sender_id columns', async () => {
    await setActor(db, users.sellerA);
    const list = await conversations();
    expect(list).toHaveLength(1);
    expect(list[0]!.counterpart_name).toBe('Người mua A');
    await expect(db.query('select buyer_id from chat.conversations')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select sender_id from chat.messages')).rejects.toMatchObject({ code: '42501' });
  });

  it('keeps separate buyers apart and denies staff without orders:read', async () => {
    await setActor(db, users.buyerB);
    const other = await rpc<{ conversation: Conversation }>('conversation_open', { shop_id: shops.b });
    expect(other.conversation.id).not.toBe(conversationId);
    await expect(rpc('messages', { conversation_id: conversationId })).rejects.toMatchObject({ code: '42501' });
    await expect(rpc('message_send', { conversation_id: conversationId, body: 'Xin chào', client_message_id: randomUUID() }))
      .rejects.toMatchObject({ code: '42501' });

    await setActor(db, users.staff);
    await expect(rpc('messages', { conversation_id: conversationId })).rejects.toMatchObject({ code: '42501' });
    await expect(rpc('message_send', { conversation_id: conversationId, body: 'Xin chào', client_message_id: randomUUID() }))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('stores one row per client_message_id and trims the body', async () => {
    await setActor(db, users.buyerA);
    const key = randomUUID();
    const sent = await send('  Còn hàng không?  ', key);
    expect(sent.message.body).toBe('Còn hàng không?');
    expect(sent.message.mine).toBe(true);
    const retry = await send('Còn hàng không?', key);
    expect(retry.message.id).toBe(sent.message.id);
    expect(retry.message.sequence).toBe(sent.message.sequence);
    await expect(send('   ')).rejects.toMatchObject({ code: '22023' });
    await expect(rpc('message_send', { conversation_id: conversationId, body: 'Thiếu key' }))
      .rejects.toMatchObject({ code: '22023' });
  });

  // ->> stringifies a JSON object, so without an explicit type check a direct RPC call would
  // store '{"text":"x"}' as a message body. BFF validation is not a security boundary.
  it('rejects a non-string body sent straight to the RPC', async () => {
    await setActor(db, users.buyerA);
    for (const body of [{ text: 'x' }, ['x'], 42, true]) {
      await expect(rpc('message_send', { conversation_id: conversationId, body, client_message_id: randomUUID() }))
        .rejects.toMatchObject({ code: '22023' });
    }
    await expect(rpc('message_send', { conversation_id: conversationId, body: null, client_message_id: randomUUID() }))
      .rejects.toMatchObject({ code: '22023' });
    const bodies = (await rpc<{ items: Message[] }>('messages', { conversation_id: conversationId, limit: 100 })).items
      .map((m) => m.body);
    expect(bodies.some((b) => b.includes('"text"'))).toBe(false);
  });

  it('marks the sender message as not mine and clears unread through the read cursor', async () => {
    await setActor(db, users.sellerA);
    let list = await conversations();
    expect(list[0]!.unread_count).toBe(1);
    expect(list[0]!.last_message!.mine).toBe(false);
    const page = await rpc<{ items: Message[]; has_more: boolean }>('messages', { conversation_id: conversationId });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.mine).toBe(false);
    expect(page.has_more).toBe(false);
    await rpc('conversation_read', { conversation_id: conversationId, up_to_seq: page.items[0]!.sequence });
    list = await conversations();
    expect(list[0]!.unread_count).toBe(0);
  });

  it('clamps the read cursor so a later message stays unread', async () => {
    await setActor(db, users.sellerA);
    await rpc('conversation_read', { conversation_id: conversationId, up_to_seq: 999999 });
    await setActor(db, users.buyerA);
    await send('Tin nhắn mới');
    await setActor(db, users.sellerA);
    expect((await conversations())[0]!.unread_count).toBe(1);
  });

  it('pages messages newest-first by cursor and returns them ascending', async () => {
    await setActor(db, users.buyerA);
    for (const body of ['Tin 2', 'Tin 3', 'Tin 4']) await send(body);
    const all = (await rpc<{ items: Message[] }>('messages', { conversation_id: conversationId, limit: 100 })).items;
    const bodies = all.map((m) => m.body);
    expect(bodies.at(-1)).toBe('Tin 4');

    const first = await rpc<{ items: Message[]; has_more: boolean }>('messages', { conversation_id: conversationId, limit: 2 });
    expect(first.items.map((m) => m.body)).toEqual(bodies.slice(-2));
    expect(first.has_more).toBe(true);

    const older = await rpc<{ items: Message[]; has_more: boolean }>('messages',
      { conversation_id: conversationId, limit: 2, before_seq: first.items[0]!.sequence });
    expect(older.items.map((m) => m.body)).toEqual(bodies.slice(-4, -2));
    expect(older.has_more).toBe(bodies.length > 4);

    await expect(rpc('messages', { conversation_id: conversationId, limit: 0 }))
      .rejects.toMatchObject({ code: '22023' });
  });

  it('revokes read and write the moment a shop member is deactivated', async () => {
    await db.exec('reset role');
    await db.query('update public.shop_members set active = false where shop_id = $1 and user_id = $2', [shops.a, users.sellerA]);
    await setActor(db, users.sellerA);
    await expect(rpc('messages', { conversation_id: conversationId })).rejects.toMatchObject({ code: '42501' });
    await expect(rpc('message_send', { conversation_id: conversationId, body: 'Xin chào', client_message_id: randomUUID() }))
      .rejects.toMatchObject({ code: '42501' });
    expect(await conversations()).toHaveLength(0);
    await db.exec('reset role');
    await db.query('update public.shop_members set active = true where shop_id = $1 and user_id = $2', [shops.a, users.sellerA]);
    await setActor(db, users.sellerA);
    expect(await conversations()).toHaveLength(1);
  });

  // Shop status gates posting only. Both sides keep the thread and the sidebar entry, so a
  // closure never costs the seller their history.
  it('stops new sends once the shop is closed but keeps history readable on both sides', async () => {
    await db.exec('reset role');
    await db.query("update public.shops set status = 'closed' where id = $1", [shops.a]);
    try {
      await setActor(db, users.buyerA);
      await expect(send('Còn không?')).rejects.toMatchObject({ code: '42501' });
      expect((await rpc<{ items: Message[] }>('messages', { conversation_id: conversationId })).items.length).toBeGreaterThan(0);
      expect(await conversations()).toHaveLength(1);

      await setActor(db, users.sellerA);
      expect((await rpc<{ items: Message[] }>('messages', { conversation_id: conversationId })).items.length).toBeGreaterThan(0);
      expect((await conversations()).map((c) => c.id)).toContain(conversationId);
      await expect(send('Shop đã đóng')).rejects.toMatchObject({ code: '42501' });
    } finally {
      // Restore even when an assertion above throws, so one failure cannot cascade.
      await db.exec('reset role');
      await db.query("update public.shops set status = 'active' where id = $1", [shops.a]);
    }
  });

  // A policy predicate is evaluated with the caller's own privileges, so the table-read path
  // must work through PostgREST-style column reads, not only through the RPC.
  it('lets a member read the granted columns directly and hides the rows from outsiders', async () => {
    await setActor(db, users.buyerA);
    const buyerRows = await db.query<{ id: string }>('select id, shop_id, last_message_at from chat.conversations');
    expect(buyerRows.rows.map((r) => r.id)).toContain(conversationId);
    expect((await db.query('select id, seq, body from chat.messages')).rows.length).toBeGreaterThan(0);
    expect((await db.query('select conversation_id, last_read_seq from chat.conversation_members')).rows.length).toBeGreaterThan(0);

    await setActor(db, users.sellerA);
    const sellerRows = await db.query<{ id: string }>('select id, shop_id from chat.conversations');
    expect(sellerRows.rows.map((r) => r.id)).toContain(conversationId);
    expect((await db.query('select id, seq, body from chat.messages')).rows.length).toBeGreaterThan(0);

    // buyerB is a member of the shop-B thread only, so the shop-A rows must stay invisible.
    await setActor(db, users.buyerB);
    expect((await db.query<{ id: string }>('select id from chat.conversations')).rows.map((r) => r.id))
      .not.toContain(conversationId);
    expect((await db.query('select id from chat.messages')).rows).toHaveLength(0);

    // staff holds no orders-reading role, so it sees nothing even though it is a shop member.
    await setActor(db, users.staff);
    expect((await db.query('select id from chat.conversations')).rows).toHaveLength(0);
  });

  it('rejects unknown operations', async () => {
    await setActor(db, users.buyerA);
    await expect(rpc('nope')).rejects.toMatchObject({ code: '22023' });
  });
});
