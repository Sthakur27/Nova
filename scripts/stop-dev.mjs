// Stop this checkout's dev sessions, including their Vite/Cargo children.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const processes = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' })
  .trim().split('\n').map(line => {
    const [, pid, parent, command] = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    return { pid: Number(pid), parent: Number(parent), command };
  });
const protectedPids = new Set([process.pid]);
let ancestor = process.ppid;
while (ancestor && !protectedPids.has(ancestor)) {
  protectedPids.add(ancestor);
  ancestor = processes.find(item => item.pid === ancestor)?.parent;
}

function belongsToCheckout(pid) {
  try {
    const cwd = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').find(line => line.startsWith('n'))?.slice(1);
    return cwd && (cwd === root || cwd.startsWith(`${root}/`));
  } catch {
    return false; // Process already exited or cannot be inspected.
  }
}

const devCommand = /^(?:\S*\/)?(?:node|npm|vite|tauri)(?:\s|$)/;
const devEntry = /(?:scripts\/(?:dev-desktop|ios)\.mjs\b|(?:^|\/)vite(?:\.js)?(?:\s|$)|\btauri(?:\.js)?\s+(?:ios\s+)?dev\b|\bnpm\s+run\s+(?:desktop|dev|ios:dev)(?:\s|$))/;
const targets = new Set(processes.filter(item =>
  !protectedPids.has(item.pid) && devCommand.test(item.command) && devEntry.test(item.command)
  && !/scripts\/ios\.mjs\s+(?:build|init)\b/.test(item.command)
  && belongsToCheckout(item.pid)
).map(item => item.pid));
// Capture descendants before stopping their parents so orphaned servers and
// build processes cannot retain ports or the iOS development lock.
let previousSize;
do {
  previousSize = targets.size;
  for (const item of processes) {
    if (targets.has(item.parent) && !protectedPids.has(item.pid)) targets.add(item.pid);
  }
} while (targets.size !== previousSize);

function signal(pid, name) {
  try { process.kill(pid, name); } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

if (targets.size) {
  console.log(`Stopping Nova development processes: ${[...targets].join(', ')}`);
  if (!process.argv.includes('--dry-run')) {
    for (const pid of targets) signal(pid, 'SIGTERM');
    for (let attempt = 0; attempt < 30 && [...targets].some(alive); attempt++) await setTimeout(100);
    for (const pid of targets) if (alive(pid)) signal(pid, 'SIGKILL');
    for (let attempt = 0; attempt < 20 && [...targets].some(alive); attempt++) await setTimeout(100);
    if ([...targets].some(alive)) throw new Error('Some Nova dev processes have not exited; retry the launcher.');
  }
}
