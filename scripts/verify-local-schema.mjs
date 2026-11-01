import { readFile } from 'node:fs/promises';
import { localSql } from './local-database.mjs';

try {
  for (const name of ['verify_m1_deployment.sql', 'verify_marketplace_deployment.sql', 'verify_chat_deployment.sql']) {
    await localSql(await readFile(new URL(`../supabase/tests/${name}`, import.meta.url), 'utf8'));
    console.log(`PASS local deployment ${name}`);
  }
} catch { console.error('FAIL local schema/grants verification; chưa nghiệm thu deployment.'); process.exitCode = 1; }
