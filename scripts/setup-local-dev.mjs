// Supabase local only. Never link/push/reset a remote project or print CLI credentials.
import { spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cli = ['dlx', 'supabase@2.120.0'];
async function run(command, args) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, SUPABASE_USE_SLIM_IMAGES: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    const phases = new Set();
    const progress = chunk => {
      const text = chunk.toString();
      for (const match of text.matchAll(/(?:Pulling from|Applying migration) ([A-Za-z0-9_./:-]+)/g)) {
        if (!phases.has(match[0])) { phases.add(match[0]); console.log(match[0]); }
      }
    };
    child.stdout.on('data', chunk => { output += chunk; progress(chunk); });
    child.stderr.on('data', chunk => { errors += chunk; progress(chunk); });
    child.on('error', () => reject(new Error('Không khởi chạy được công cụ local.')));
    child.on('close', async code => {
      if (code === 0) return accept(output);
      // Diagnostic file may contain CLI credentials; keep it private and out of output.
      const log = resolve(root, 'data/local-dev/setup-error.log');
      await mkdir(resolve(root, 'data/local-dev'), { recursive: true, mode: 0o700 });
      await writeFile(log, output + errors, { mode: 0o600 });
      await chmod(log, 0o600);
      reject(new Error('Công cụ local thất bại; chẩn đoán ở data/local-dev/setup-error.log (không chia sẻ nội dung nguyên file).'));
    });
  });
}
async function privateFile(path, content) {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}
async function envFile(path, changes) {
  const target = resolve(root, path);
  let contents = existsSync(target) ? await readFile(target, 'utf8') : '';
  if (existsSync(target) && !existsSync(`${target}.before-local`)) await copyFile(target, `${target}.before-local`);
  if (existsSync(`${target}.before-local`)) await chmod(`${target}.before-local`, 0o600);
  for (const [key, value] of Object.entries(changes)) {
    if (/[\r\n]/.test(value)) throw new Error('Invalid local environment value');
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${JSON.stringify(value)}`;
    contents = pattern.test(contents) ? contents.replace(pattern, () => line) : `${contents.trimEnd()}\n${line}\n`;
  }
  await privateFile(target, contents);
}

async function setup() {
  if (!existsSync(resolve(root, 'supabase/config.toml'))) await run('pnpm', [...cli, 'init']);
  const path = resolve(root, 'supabase/config.toml');
  let config = await readFile(path, 'utf8');
  if (!config.includes('project_id = "shop-base-ai-local"')) throw new Error('Cần config.toml cho project local shop-base-ai-local trước khi start.');
  if (!config.includes('enable_confirmations = false')) throw new Error('Cần tắt email confirmations trên local trước khi nghiệm thu password signup.');
  const network = 'shop-base-ai-loopback';
  try { await run('docker', ['network', 'inspect', network]); }
  catch { await run('docker', ['network', 'create', '-o', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network]); }
  if (process.argv.includes('--restart')) await run('pnpm', [...cli, 'stop']);
  console.log('Đang khởi động Supabase local; lượt đầu cần tải Docker images.');
  await run('pnpm', [...cli, 'start', '--network-id', network]);
  const status = await run('pnpm', [...cli, 'status', '--output', 'json']);
  const state = JSON.parse(status.slice(status.indexOf('{'), status.lastIndexOf('}') + 1));
  if (state.API_URL !== 'http://127.0.0.1:54321' || !state.ANON_KEY || !state.SERVICE_ROLE_KEY) throw new Error('Supabase local status không đúng cấu hình dự kiến.');
  await mkdir(resolve(root, 'data/local-dev'), { recursive: true, mode: 0o700 });
  const keyFile = resolve(root, 'data/local-dev/service-role.key');
  await privateFile(keyFile, state.SERVICE_ROLE_KEY);
  await envFile('apps/web/.env.local', {
    SUPABASE_URL: state.API_URL, SUPABASE_PUBLISHABLE_KEY: state.ANON_KEY,
    APP_ORIGIN: 'http://localhost:5175', MARKETPLACE_SERVICE_KEY_FILE: keyFile,
  });
  await envFile('frontend/.env.local', { VITE_SUPABASE_URL: state.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: state.ANON_KEY });
  await envFile('.env.chat-dev.local', {
    CHAT_DEV_PROJECT_REF: 'shop-base-ai-local', CHAT_DEV_SUPABASE_URL: state.API_URL,
    CHAT_DEV_PUBLISHABLE_KEY: state.ANON_KEY, CHAT_DEV_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
    CHAT_DEV_ALLOW_FIXTURES: 'shop-base-ai-local',
  });
  console.log('Supabase local chạy tại http://127.0.0.1:54321; Studio http://127.0.0.1:54323.');
  console.log('Đã cấu hình local cho BFF/frontend/runner; env cũ giữ trong *.before-local. Không in credential.');
}
setup().catch(error => { console.error(error.message); process.exitCode = 1; });
