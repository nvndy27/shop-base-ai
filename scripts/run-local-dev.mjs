// Local development supervisor: BFF, Vite and a non-overlapping outbox/expiry worker.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const children = new Set();
let stopped = false, workerTimer;
function launch(command, args) {
  const child = spawn(command, args, { cwd: root, env: process.env, stdio: 'inherit', detached: true });
  children.add(child);
  child.once('error', () => { console.error('Không khởi chạy được dịch vụ local.'); stop(1); });
  child.once('exit', () => children.delete(child));
  return child;
}
function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  clearTimeout(workerTimer);
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ } }
  process.exitCode = code;
}
async function start() {
  const env = await readFile(resolve(root, 'apps/web/.env.local'), 'utf8');
  const line = env.split('\n').find(value => value.startsWith('SUPABASE_URL='));
  const url = line?.slice('SUPABASE_URL='.length).replace(/^"|"$/g, '');
  if (url !== 'http://127.0.0.1:54321') throw new Error('Chạy setup-local-dev trước; supervisor chỉ cho phép Supabase local.');
  const health = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error('Supabase local chưa sẵn sàng.');
  for (const [command, args] of [['pnpm', ['--filter', '@shop/web', 'dev']], ['pnpm', ['--dir', 'frontend', 'dev']]]) {
    launch(command, args).once('exit', code => { if (!stopped) stop(code || 1); });
  }
  function tick() {
    if (stopped) return;
    launch(process.execPath, ['--env-file=apps/web/.env.local', 'scripts/marketplace-worker.mjs'])
      .once('exit', () => { if (!stopped) workerTimer = setTimeout(tick, 60000); });
  }
  tick();
  console.log('Local: frontend http://localhost:5175, BFF http://localhost:3000; worker mỗi phút. Ctrl+C dừng các tiến trình app, giữ database.');
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
start().catch(error => { console.error(error.message || 'Local chưa được cấu hình.'); stop(1); });
