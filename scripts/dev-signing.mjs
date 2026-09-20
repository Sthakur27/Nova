import { spawnSync } from 'node:child_process';

export const identityName = 'Nova Local Development';
export const signingIdentifier = 'com.nova.notes.prototype.development';

export function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed: ${result.stderr || `exit ${result.status}`}`);
  return result.stdout;
}

export function developmentIdentity() {
  const identities = command('/usr/bin/security', ['find-identity', '-p', 'codesigning']);
  const matches = [...identities.matchAll(/\b([A-F0-9]{40})\s+"Nova Local Development"/g)];
  const fingerprints = [...new Set(matches.map(match => match[1]))];
  if (fingerprints.length !== 1) {
    throw new Error(`Expected one ${identityName} signing identity. Run node scripts/setup-dev-signing.mjs first.`);
  }
  return fingerprints[0];
}

export function signDevelopmentBinary(binary) {
  const identity = developmentIdentity();
  // Pin the certificate as well as the identifier. An identifier-only ad-hoc
  // requirement would let unrelated code impersonate Nova to the Keychain.
  const requirement = `designated => identifier "${signingIdentifier}" and certificate leaf = H"${identity}"`;
  command('/usr/bin/codesign', ['--force', '--sign', identity, '--timestamp=none',
    '--identifier', signingIdentifier, '--requirements', `=${requirement}`, binary]);
  command('/usr/bin/codesign', ['--verify', '--strict', '-R', `=${requirement.replace('designated => ', '')}`, binary]);
}

export function developmentRunner(node, script) {
  const runner = JSON.stringify([node, script]);
  return { cmd: 'cargo', args: [
    '--config', `target.aarch64-apple-darwin.runner=${runner}`,
    '--config', `target.x86_64-apple-darwin.runner=${runner}`,
  ] };
}
