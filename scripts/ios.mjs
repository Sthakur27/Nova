import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cargoBin = join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'bin');
const env = { ...process.env, PATH: `${cargoBin}${delimiter}${process.env.PATH || ''}` };
// A fresh Xcode install can leave the system selection on Command Line Tools.
// Use the full SDK for this command without changing the user's global selection.
const installedXcode = '/Applications/Xcode.app/Contents/Developer';
const selected = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout?.trim();
if (!env.DEVELOPER_DIR && selected === '/Library/Developer/CommandLineTools' && existsSync(installedXcode)) {
  env.DEVELOPER_DIR = installedXcode;
}
// Tauri's archive command can remove DEVELOPER_DIR; select the actual binary too.
if (env.DEVELOPER_DIR) env.PATH = `${join(env.DEVELOPER_DIR, 'usr', 'bin')}${delimiter}${env.PATH}`;
env.IPHONEOS_DEPLOYMENT_TARGET ||= '15.0';
const child = spawn(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'ios', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env,
  stdio: 'inherit',
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
