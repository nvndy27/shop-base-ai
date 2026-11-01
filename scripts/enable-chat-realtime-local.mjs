// Promote/apply the staged migration only after real text/JWT acceptance; enable UI after
// real WebSocket authorization/revocation checks. Local only, no production or fake proof.
import { spawn } from 'node:child_process';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chatDevConfig } from './chat-dev-config.mjs';

const root = resolve(import.meta.dirname, '..');
async function run(command, args, print = false) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, SUPABASE_USE_SLIM_IMAGES: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => reject(new Error('Không chạy được công cụ nghiệm thu.')));
    child.on('close', code => {
      if (print) process.stdout.write(output);
      code === 0 ? accept() : reject(new Error('Migration hoặc nghiệm thu realtime không đạt; UI vẫn chưa được bật.'));
    });
    child.stderr.on('data', () => {}); // Never surface CLI raw credentials/errors.
  });
}
async function enable() {
  const config = chatDevConfig(process.env);
  if (config.url !== 'http://127.0.0.1:54321') throw new Error('Realtime bootstrap chỉ cho phép local.');
  const proof = JSON.parse(await readFile(resolve(root, 'data/local-dev/chat-text-acceptance.json'), 'utf8'));
  const age = Date.now() - Date.parse(proof.passed_at);
  if (proof.url !== config.url || proof.checks < 7 || !Number.isFinite(age) || age < 0 || age > 86400000) {
    throw new Error('Cần chạy verify-chat-dev đạt trên local trong 24 giờ trước khi bật realtime.');
  }
  const staged = resolve(root, 'supabase/realtime/chat_realtime.sql');
  const target = resolve(root, 'supabase/migrations/202610120002_chat_realtime.sql');
  if (!existsSync(target)) await rename(staged, target);
  await run('pnpm', ['dlx', 'supabase@2.120.0', 'migration', 'up', '--local']);
  await run(process.execPath, ['--env-file=.env.chat-dev.local', 'scripts/verify-chat-realtime-dev.mjs'], true);
  const env = resolve(root, 'apps/web/.env.local');
  const content = await readFile(env, 'utf8');
  const pattern = /^CHAT_REALTIME_ENABLED=.*$/m;
  await writeFile(env, pattern.test(content) ? content.replace(pattern, 'CHAT_REALTIME_ENABLED=true') : `${content.trimEnd()}\nCHAT_REALTIME_ENABLED=true\n`, { mode: 0o600 });
  await chmod(env, 0o600);
  console.log('PASS: private realtime nghiệm thu đạt và đã bật cho frontend local.');
}
enable().catch(error => { console.error(error.message); process.exitCode = 1; });
