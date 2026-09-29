import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { join } from 'node:path';

// Encryption avoids plaintext token storage. The adjacent local key is not an OS keychain.
export function createVault(dir) {
  const keyFile = join(dir, 'vault.key'),
    file = join(dir, 'credentials.enc');
  if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const key = readFileSync(keyFile);
  function read() {
    if (!existsSync(file)) return {};
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
    return JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(data.body, 'hex')), decipher.final()]).toString(),
    );
  }
  return {
    read,
    status() {
      const c = read();
      return {
        linkedin: Boolean(c.linkedinToken && c.linkedinAuthor),
        x: Boolean(c.xToken),
        linkedinAuthor: c.linkedinAuthor || '',
        linkedinVersion: c.linkedinVersion || '202603',
      };
    },
    save(patch) {
      const data = { ...read(), ...patch },
        iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
      writeFileSync(
        file + '.tmp',
        JSON.stringify({
          iv: iv.toString('hex'),
          tag: cipher.getAuthTag().toString('hex'),
          body: body.toString('hex'),
        }),
        { mode: 0o600 },
      );
      renameSync(file + '.tmp', file);
    },
  };
}
