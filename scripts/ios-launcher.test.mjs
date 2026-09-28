import { expect, it } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real launcher without stopping development sessions or building
// an app: capture its process invocations at the executable boundary.
function launch(args) {
  const dir = mkdtempSync(join(tmpdir(), 'nova-ios-launcher-'));
  const log = join(dir, 'calls');
  try {
    for (const command of ['node', 'npm']) {
      writeFileSync(join(dir, command), `#!/bin/bash\nprintf '%s\\n' '${command}' "$@" >> "$NOVA_LAUNCH_TEST_LOG"\nprintf '\\n' >> "$NOVA_LAUNCH_TEST_LOG"\n`, { mode: 0o755 });
    }
    const result = spawnSync('/bin/bash', [resolve('runios.sh'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}`, NOVA_LAUNCH_TEST_LOG: log },
    });
    expect(result.status, result.stderr).toBe(0);
    return { output: result.stdout, calls: existsSync(log) ? readFileSync(log, 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

it.each([[], ['--standalone']])('bundles the default and explicit standalone installs (%j)', (...args) => {
  const { calls, output } = launch([...args, '--target', 'aarch64-sim']);
  expect(calls).toBe('node\nscripts/stop-dev.mjs\n\nnpm\nrun\nios:build\n--\n--debug\n--open\n--target\naarch64-sim\n\n');
  expect(output).toContain('click Run');
});

it('requires explicit live mode and preserves arguments including spaces', () => {
  const { calls, output } = launch(['--live', '--config', 'a path/config.json']);
  expect(calls).toBe('node\nscripts/stop-dev.mjs\n\nnpm\nrun\nios:dev\n--\n--open\n--host\n--config\na path/config.json\n\n');
  expect(output).toContain('must be able to reach this Mac');
});

it('explains the modes without invoking build tools', () => {
  const { output, calls } = launch(['--help']);
  expect(output).toContain('Default: bundle the interface');
  expect(calls).toBe('');
});
