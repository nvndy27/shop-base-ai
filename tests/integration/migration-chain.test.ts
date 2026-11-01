import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('applies the complete migration chain to an empty database and verifies deployment permissions', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../../supabase/tests/bootstrap.sql', import.meta.url), 'utf8'));
    // Emulate only the Supabase-owned Storage tables. Never deploy this harness to cloud.
    await db.exec(`create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text);
      alter table storage.objects enable row level security;`);
    await db.exec(`create schema realtime;
      create table realtime.messages(id uuid default gen_random_uuid(),extension text,payload jsonb);
      alter table realtime.messages enable row level security;
      grant usage on schema realtime to anon,authenticated;
      grant select,insert on realtime.messages to anon,authenticated;
      create function realtime.topic() returns text language sql stable as
        $$ select current_setting('realtime.topic',true) $$;
      create publication supabase_realtime;`);
    const directory = new URL('../../supabase/migrations/', import.meta.url);
    const migrations = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of migrations) await db.exec(await readFile(new URL(name, directory), 'utf8'));
    for (const name of ['verify_m1_deployment.sql', 'verify_marketplace_deployment.sql', 'verify_chat_deployment.sql']) {
      const result = await db.exec(await readFile(new URL(`../../supabase/tests/${name}`, import.meta.url), 'utf8'));
      expect(result.at(-1)?.rows.length).toBeGreaterThan(0);
    }
    const chatVerifier = await readFile(new URL('../../supabase/tests/verify_chat_deployment.sql', import.meta.url), 'utf8');
    await db.exec('grant select (sender_id) on chat.messages to authenticated');
    await expect(db.exec(chatVerifier)).rejects.toThrow('private identity columns exposed');
    await db.exec('rollback; revoke select (sender_id) on chat.messages from authenticated');
    await db.exec('alter table chat.messages disable row level security');
    await expect(db.exec(chatVerifier)).rejects.toThrow('RLS disabled');
    await db.exec('rollback');
  } finally {
    await db.close();
  }
}, 30000);
