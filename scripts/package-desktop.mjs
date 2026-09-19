import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log('Usage: npm run package -- [--target <Rust target triple>]\nBuilds a release DMG on macOS or a setup EXE on Windows.');
  process.exit(0);
}

const platforms = {
  darwin: { bundle: 'dmg', targets: ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'universal-apple-darwin'] },
  win32: { bundle: 'nsis', targets: ['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc'] },
};
const platform = platforms[process.platform];
if (!platform) {
  console.error('Nova installers must be built on macOS or Windows. Use GitHub Actions to build both.');
  process.exit(1);
}
if (values.target && !platform.targets.includes(values.target)) {
  console.error(`Unsupported target for this OS. Choose: ${platform.targets.join(', ')}`);
  process.exit(1);
}

// Invoke the installed CLI with Node, avoiding shell quoting and Windows .cmd shims.
const cli = require.resolve('@tauri-apps/cli/tauri.js');
const args = [cli, 'build', '--ci', '--bundles', platform.bundle];
if (values.target) args.push('--target', values.target);
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Installer generated in Cargo's release/bundle/${platform.bundle}/ directory (under src-tauri/target by default).`);
