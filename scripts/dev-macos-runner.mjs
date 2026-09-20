// Cargo calls this after every build (including an unchanged binary), before run.
// execve preserves Cargo/Tauri's PID and signal handling during hot reloads.
import { resolve, basename } from 'node:path';
import { signDevelopmentBinary } from './dev-signing.mjs';

try {
  const [file, ...args] = process.argv.slice(2);
  if (!file || basename(file) !== 'nova-notes') throw new Error('Expected the Nova development executable.');
  if (typeof process.execve !== 'function') throw new Error('Nova development requires Node.js 22.22.2+ or 24.15+.');
  const binary = resolve(file);
  signDevelopmentBinary(binary);
  process.execve(binary, [binary, ...args], process.env);
} catch (error) {
  console.error(`Nova development signing: ${error.message}`);
  process.exitCode = 1;
}
