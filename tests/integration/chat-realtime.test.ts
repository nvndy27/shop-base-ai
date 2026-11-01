import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createDatabase, setActor, shops, users } from '../helpers/database';

let db: PGlite, cid: string;
async function rpc<T>(op: string, input = {}) {
  return (await db.query<{ result: T }>('select public.chat($1,$2) result', [op, input])).rows[0]!.result;
}
describe('staged private realtime: invalidations and current DB permissions', () => {
  beforeAll(async () => {
    db = await createDatabase();
    for (const name of ['202610030003_marketplace_cod.sql', '202610050001_chat.sql']) {
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    // Supabase-owned objects, emulated ONLY for SQL policy tests; never deploy this bootstrap.
    await db.exec(`create schema realtime;
      create table realtime.messages(id uuid default gen_random_uuid(), extension text, payload jsonb);
      alter table realtime.messages enable row level security;
      grant usage on schema realtime to anon,authenticated;
      grant select,insert on realtime.messages to anon,authenticated;
      create function realtime.topic() returns text language sql stable as
        $$ select current_setting('realtime.topic',true) $$;
      create publication supabase_realtime;`);
    const promoted = new URL('../../supabase/migrations/202610120002_chat_realtime.sql', import.meta.url);
    await db.exec(await readFile(existsSync(promoted) ? promoted : new URL('../../supabase/realtime/chat_realtime.sql', import.meta.url), 'utf8'));
    await db.query("update public.shop_members set role='fulfillment' where user_id=$1", [users.staff]);
    await setActor(db, users.buyerA);
    cid = (await rpc<{ conversation: { id: string } }>('conversation_open', { shop_id: shops.a })).conversation.id;
  }, 30000);
  afterAll(async () => { await db?.close(); });

  it('publishes no message content and does not invalidate again for an idempotent retry', async () => {
    const body = { conversation_id: cid, body: 'Private body fixture', client_message_id: randomUUID() };
    await rpc('message_send', body);
    const first = (await db.query<{ revision: number }>('select * from chat.change_notifications')).rows[0]!;
    expect(Object.keys(first).sort()).toEqual(['changed_at', 'conversation_id', 'revision']);
    await rpc('message_send', body);
    expect((await db.query<{ revision: number }>('select revision from chat.change_notifications')).rows[0]!.revision).toBe(first.revision);
    await db.exec('reset role');
    const published = await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname='supabase_realtime'");
    expect(published.rows.map(row => row.tablename)).toEqual(['change_notifications']);
  });
  it('denies other buyers and revoked staff with the same valid JWT claims on the next change', async () => {
    await setActor(db, users.buyerB);
    expect((await db.query('select * from chat.change_notifications')).rows).toHaveLength(0);
    await setActor(db, users.staff);
    expect((await db.query('select * from chat.change_notifications')).rows).toHaveLength(1);
    await db.exec('reset role');
    await db.query('update public.shop_members set active=false where user_id=$1', [users.staff]);
    await setActor(db, users.buyerA);
    await rpc('message_send', { conversation_id: cid, body: 'After revoke', client_message_id: randomUUID() });
    await setActor(db, users.staff);
    expect((await db.query('select * from chat.change_notifications')).rows).toHaveLength(0);
    await expect(rpc('messages', { conversation_id: cid })).rejects.toMatchObject({ code: '42501' });
  });
  it('blocks foreign private topics and spoofed chat broadcasts even with broad permissive policies', async () => {
    await db.exec(`reset role;
      insert into realtime.messages(extension,payload) values('broadcast','{}');
      create policy fixture_broad_read on realtime.messages for select to authenticated using(true);
      create policy fixture_broad_insert on realtime.messages for insert to authenticated with check(true);`);
    await setActor(db, users.buyerA);
    await db.query("select set_config('realtime.topic',$1,false)", [`shopbase-chat:inbox:${users.buyerA}`]);
    expect((await db.query('select * from realtime.messages')).rows).toHaveLength(1);
    await expect(db.query("insert into realtime.messages(extension,payload) values('broadcast','{}')")).rejects.toMatchObject({ code: '42501' });
    await db.query("select set_config('realtime.topic',$1,false)", [`shopbase-chat:inbox:${users.buyerB}`]);
    expect((await db.query('select * from realtime.messages')).rows).toHaveLength(0);
    await db.query("select set_config('realtime.topic','unrelated-app-topic',false)");
    expect((await db.query('select * from realtime.messages')).rows).toHaveLength(1);
    await expect(db.query("insert into chat.change_notifications(conversation_id) values($1)", [randomUUID()])).rejects.toMatchObject({ code: '42501' });
  });
});
