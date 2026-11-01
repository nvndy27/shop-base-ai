import { spawn } from 'node:child_process';
import { chatDevConfig } from './chat-dev-config.mjs';

// Trusted local verification SQL only. No RPC, HTTP input or remote database URL.
export function localSql(sql) {
  if (chatDevConfig(process.env).url !== 'http://127.0.0.1:54321') throw new Error('SQL verifier chỉ cho phép Supabase local.');
  return new Promise((accept, reject) => {
    const child = spawn('docker', ['exec', '-i', 'supabase_db_shop-base-ai-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => {}); // Schema verifier should never echo server payloads.
    child.once('error', () => reject(new Error('Không truy cập được container database local.')));
    child.once('close', code => code === 0 ? accept(output) : reject(new Error('Kiểm tra SQL local không đạt.')));
    child.stdin.on('error', () => {});
    child.stdin.end(sql);
  });
}
