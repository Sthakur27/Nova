import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
const cargoBin = join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'bin');
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let server;
let child;
let stopping = false;

async function stop(signal) {
  if (stopping) return;
  stopping = true;
  child?.kill(signal);
  await server?.close();
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));

try {
  const configArgs = [];
  if (!args.includes('--help') && !args.includes('-h') && !args.includes('--version') && !args.includes('-V')) {
    // Own the frontend server so Tauri and Vite always agree on the chosen port.
    // Leave existing preview servers alone; Vite tries the next available port.
    server = await createServer({
      root,
      server: { host: '127.0.0.1', port: 1420, strictPort: false },
    });
    await server.listen();
    const address = server.httpServer.address();
    const devUrl = `http://127.0.0.1:${address.port}`;
    console.log(`Nova live development: ${devUrl}`);
    configArgs.push('--config', JSON.stringify({ build: { beforeDevCommand: '', devUrl } }));
  }
  child = spawn(process.execPath, [
    require.resolve('@tauri-apps/cli/tauri.js'), 'dev', ...args, ...configArgs,
  ], {
    cwd: root,
    env: { ...process.env, [pathKey]: `${cargoBin}${delimiter}${process.env[pathKey] || ''}` },
    stdio: 'inherit',
  });
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? (stopping ? 0 : 1)));
  });
  await server?.close();
  process.exitCode = status;
} catch (error) {
  console.error(error.message);
  await stop('SIGTERM');
  process.exitCode = 1;
}
