import { readFileSync, writeFileSync, lstatSync, chmodSync, renameSync, unlinkSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';

const fields = {
  xToken: 'BUTLER_X_ACCESS_TOKEN',
  xClientId: 'BUTLER_X_CLIENT_ID',
  xRefreshToken: 'BUTLER_X_REFRESH_TOKEN',
  xExpiresAt: 'BUTLER_X_EXPIRES_AT',
  xScope: 'BUTLER_X_SCOPE',
  xConnectedAt: 'BUTLER_X_CONNECTED_AT',
  linkedinToken: 'BUTLER_LINKEDIN_ACCESS_TOKEN',
  linkedinClientId: 'BUTLER_LINKEDIN_CLIENT_ID',
  linkedinClientSecret: 'BUTLER_LINKEDIN_CLIENT_SECRET',
  linkedinExpiresAt: 'BUTLER_LINKEDIN_EXPIRES_AT',
  linkedinConnectedAt: 'BUTLER_LINKEDIN_CONNECTED_AT',
  linkedinAuthor: 'BUTLER_LINKEDIN_AUTHOR',
  linkedinVersion: 'BUTLER_LINKEDIN_VERSION',
  anthropicKey: 'BUTLER_ANTHROPIC_API_KEY',
  openaiKey: 'BUTLER_OPENAI_API_KEY',
};
const header =
  '# Butler publishing and AI-provider credentials. Keep this file private and out of Git.\n# Use official user OAuth access tokens and API keys, never passwords or browser cookies.\n';

// Read only these keys; do not load secrets into process.env or child LLM processes.
export function createEnvCredentials(file, legacyVault) {
  function contents() {
    const info = lstatSync(file, { throwIfNoEntry: false });
    if (!info) return '';
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1)
      throw new Error('The credentials .env must be a regular private file, not a link.');
    if (process.platform !== 'win32') chmodSync(file, 0o600);
    return readFileSync(file, 'utf8');
  }
  function validate(value) {
    if (typeof value !== 'string' || value.length > 5000 || /[\r\n\0']/.test(value))
      throw new Error('Credential values must be single-line strings without single quotes.');
    return value;
  }
  function read() {
    try {
      const parsed = parseEnv(contents());
      return Object.fromEntries(
        Object.entries(fields).map(([name, key]) => [name, validate(parsed[key] || '')]),
      );
    } catch {
      throw new Error(
        'Could not read the private credentials file. Check .env format and permissions.',
      );
    }
  }
  function save(patch) {
    for (const [name, value] of Object.entries(patch)) {
      if (!Object.hasOwn(fields, name)) throw new Error('Unknown credential field.');
      validate(value);
    }
    const raw = contents();
    const parsed = parseEnv(raw);
    const next = { ...read(), ...patch };
    let updated = raw || header;
    for (const [name, key] of Object.entries(fields)) {
      if (!Object.hasOwn(patch, name) && Object.hasOwn(parsed, key)) continue;
      const line = `${key}='${next[name] || ''}'`;
      const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, 'gm');
      if (Object.hasOwn(parsed, key)) updated = updated.replace(pattern, () => line);
      else updated += `${updated.endsWith('\n') ? '' : '\n'}${line}\n`;
    }
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, updated, { mode: 0o600, flag: 'wx' });
      renameSync(temporary, file);
    } catch {
      try {
        unlinkSync(temporary);
      } catch {}
      throw new Error('Could not save credentials to the private .env file.');
    }
  }
  // Migrate only absent keys. An explicitly empty token means disconnected.
  const current = parseEnv(contents()),
    legacy = legacyVault?.read() || {};
  const missing = Object.fromEntries(
    Object.entries(fields)
      .filter(([, key]) => !Object.hasOwn(current, key))
      .map(([name]) => [name, legacy[name] || (name === 'linkedinVersion' ? '202603' : '')]),
  );
  if (Object.keys(missing).length) save(missing);
  return {
    read,
    save,
    status() {
      const c = read();
      return {
        linkedin: Boolean(c.linkedinToken && c.linkedinAuthor),
        linkedinOAuthConfigured: Boolean(c.linkedinClientId && c.linkedinClientSecret),
        linkedinAuthorized: Boolean(c.linkedinToken && c.linkedinAuthor && c.linkedinConnectedAt),
        x: Boolean(c.xToken),
        xOAuthConfigured: Boolean(c.xClientId),
        xAuthorized: Boolean(c.xToken && c.xConnectedAt),
        linkedinAuthor: c.linkedinAuthor,
        linkedinVersion: c.linkedinVersion || '202603',
        anthropic: Boolean(c.anthropicKey),
        openai: Boolean(c.openaiKey),
        storage: '.env',
      };
    },
  };
}
