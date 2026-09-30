// Pinned official Ollama distributions; never package the developer's .runtime/models or logs.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const releases = {
  darwin: {
    file: 'ollama-darwin.tgz',
    sha256: '2608dbb0a0f0136a198db9d48b4f74ece55f452314a39452fca35b7cf20c2589',
  },
  win32: {
    file: 'ollama-windows-amd64.zip',
    sha256: 'd6f7d3dd4f5d013553a78c1e78b2521fcf41d43dd2863e4596cdc046fe6036db',
  },
};
const platform = process.argv[2] || process.platform;
const release = releases[platform];
if (!release) throw new Error('Desktop packages currently support macOS and Windows x64.');
const version = '0.35.0';
const root = resolve('build-resources/runtime', platform);
const stamp = resolve(root, 'butler-runtime.json');
if (existsSync(stamp) && JSON.parse(await readFile(stamp, 'utf8')).sha256 === release.sha256) {
  console.log(`Ollama ${version} for ${platform} is ready.`);
} else {
  await mkdir(resolve('build-resources/downloads'), { recursive: true });
  const archive = resolve('build-resources/downloads', release.file);
  if (!existsSync(archive)) {
    console.log(`Downloading the bundled Ollama engine for ${platform}…`);
    const response = await fetch(
      `https://github.com/ollama/ollama/releases/download/v${version}/${release.file}`,
      { signal: AbortSignal.timeout(30 * 60 * 1000) },
    );
    if (!response.ok) throw new Error(`Runtime download failed: HTTP ${response.status}`);
    await pipeline(response.body, createWriteStream(archive + '.partial'));
    await rename(archive + '.partial', archive);
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== release.sha256) {
    await rm(archive);
    throw new Error('Ollama download checksum did not match. Run preparation again.');
  }
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const extraction =
    platform === 'darwin'
      ? spawnSync('tar', ['-xzf', archive, '-C', root], { stdio: 'inherit' })
      : process.platform === 'win32'
        ? spawnSync('tar', ['-xf', archive, '-C', root], { stdio: 'inherit' })
        : spawnSync('unzip', ['-q', archive, '-d', root], { stdio: 'inherit' });
  if (extraction.error || extraction.status !== 0)
    throw extraction.error || new Error('Could not extract Ollama.');
  if (!existsSync(resolve(root, platform === 'win32' ? 'ollama.exe' : 'ollama')))
    throw new Error('The runtime archive layout changed.');
  await writeFile(stamp, JSON.stringify({ version, sha256: release.sha256 }));
  console.log(`Bundled Ollama ${version} is ready.`);
}
