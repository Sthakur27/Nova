import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { command, developmentIdentity, identityName } from './dev-signing.mjs';

if (process.platform !== 'darwin') throw new Error('Development signing is only needed on macOS.');

// Reuse the certificate: replacing it would invalidate existing Keychain grants.
const identities = command('/usr/bin/security', ['find-identity', '-p', 'codesigning']);
if (identities.includes(`"${identityName}"`)) {
  console.log(`Reusing ${identityName}: ${developmentIdentity()}`);
} else {
  const directory = mkdtempSync(join(tmpdir(), 'nova-dev-signing-'));
  try {
    const config = join(directory, 'openssl.cnf');
    const key = join(directory, 'key.pem');
    const cert = join(directory, 'cert.pem');
    const archive = join(directory, 'identity.p12');
    const password = randomBytes(32).toString('hex');
    writeFileSync(config, `[req]\nprompt = no\ndistinguished_name = subject\nx509_extensions = extensions\n[subject]\nCN = ${identityName}\n[extensions]\nbasicConstraints = critical,CA:false\nkeyUsage = critical,digitalSignature\nextendedKeyUsage = critical,codeSigning\n`, { mode: 0o600 });
    command('/usr/bin/openssl', ['req', '-new', '-x509', '-newkey', 'rsa:3072', '-nodes',
      '-days', '3650', '-sha256', '-config', config, '-keyout', key, '-out', cert]);
    command('/usr/bin/openssl', ['pkcs12', '-export', '-inkey', key, '-in', cert,
      '-name', identityName, '-out', archive, '-passout', 'env:NOVA_TEMP_SIGNING_PASSWORD'],
      { env: { ...process.env, NOVA_TEMP_SIGNING_PASSWORD: password } });
    const keychain = command('/usr/bin/security', ['default-keychain', '-d', 'user']).trim().replace(/^"|"$/g, '');
    // Import a non-exportable key; only Apple's codesign tool gets access.
    command('/usr/bin/security', ['import', archive, '-k', keychain, '-f', 'pkcs12',
      '-P', password, '-x', '-T', '/usr/bin/codesign']);
    console.log(`Created ${identityName}: ${developmentIdentity()}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
