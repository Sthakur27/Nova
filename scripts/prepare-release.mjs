import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export async function prepareRelease({ input, output, repository, sha, run, runId, attempt, date = new Date().toISOString() }) {
  if (!/^\d+$/.test(run) || !/^\d+$/.test(attempt) || !/^\d+$/.test(runId) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release coordinates');
  const version = `0.2.${run}`;
  const base = `https://github.com/${repository}/releases/download/build-${runId}-${attempt}`;
  // GITHUB_RUN_ID identifies the release; RUN_NUMBER determines version ordering.
  await mkdir(output, { recursive: true });
  const platforms = {};
  async function filesIn(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]));
    return groups.flat();
  }
  for (const [label, target, extension] of [
    ['mac-apple-silicon', 'darwin-aarch64', 'dmg'],
    ['mac-intel', 'darwin-x86_64', 'dmg'],
    ['windows-x64', 'windows-x86_64', 'exe'],
  ]) {
    const files = await filesIn(join(input, `Nova-${label}-${sha}`));
    const one = suffix => {
      const matches = files.filter(file => file.endsWith(suffix));
      if (matches.length !== 1) throw new Error(`Expected one ${suffix} for ${label}, found ${matches.length}`);
      return matches[0];
    };
    await copyFile(one(`.${extension}`), join(output, `Nova-${label}.${extension}`));
    const artifact = extension === 'dmg' ? one('.app.tar.gz') : one('.exe');
    const signature = (await readFile(`${artifact}.sig`, 'utf8')).trim();
    if (!signature) throw new Error(`Missing signature for ${label}`);
    const name = `Nova-${label}.${extension === 'dmg' ? 'app.tar.gz' : 'exe'}`;
    await copyFile(artifact, join(output, name));
    await writeFile(join(output, `${name}.sig`), signature + '\n');
    platforms[target] = { url: `${base}/${name}`, signature };
  }
  await writeFile(join(output, 'latest.json'), JSON.stringify({ version, notes: `Nova ${version}`, pub_date: date, platforms }, null, 2) + '\n');
  const checksums = await Promise.all((await readdir(output)).sort().map(async name => `${createHash('sha256').update(await readFile(join(output, name))).digest('hex')}  ${name}`));
  await writeFile(join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  await prepareRelease({ input: 'installers', output: 'release', repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_NUMBER, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT });
}
