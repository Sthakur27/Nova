import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRelease } from './prepare-release.mjs';
it('publishes every platform with matching artifact URLs and signatures; rejects incomplete releases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nova-release-'));
  try {
    for (const label of ['mac-apple-silicon', 'mac-intel', 'windows-x64']) {
      const dir = join(root, 'installers', `Nova-${label}-abc`, 'bundle');
      await mkdir(dir, { recursive: true });
      const mac = label.startsWith('mac');
      await writeFile(join(dir, mac ? 'Nova.dmg' : 'Nova.exe'), 'installer');
      const artifact = join(dir, mac ? 'Nova.app.tar.gz' : 'Nova.exe');
      await writeFile(artifact, label);
      await writeFile(`${artifact}.sig`, `signed-${label}`);
    }
    const options = { input: join(root, 'installers'), output: join(root, 'release'), repository: 'Sthakur27/Nova', sha: 'abc', run: '42', runId: '123', attempt: '2' };
    await prepareRelease(options);
    const manifest = JSON.parse(await readFile(join(options.output, 'latest.json'), 'utf8'));
    expect(manifest.version).toBe('0.2.42');
    expect(Object.keys(manifest.platforms)).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
    for (const entry of Object.values(manifest.platforms)) {
      expect(entry.url).toContain('/releases/download/build-123-2/');
      const name = entry.url.split('/').at(-1);
      const bytes = await readFile(join(options.output, name), 'utf8');
      expect(entry.signature).toBe(`signed-${bytes}`);
    }
    await rm(join(root, 'installers', 'Nova-windows-x64-abc', 'bundle', 'Nova.exe.sig'));
    await expect(prepareRelease({ ...options, output: join(root, 'incomplete') })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
