import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const X_CALLBACK = 'http://127.0.0.1:4310/api/oauth/x/callback';
export const X_SCOPES = 'tweet.read tweet.write users.read offline.access';
const tokenURL = 'https://api.x.com/2/oauth2/token';
const nonce = () => randomBytes(32).toString('base64url');
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createXOAuth(vault, fetcher = fetch, now = Date.now) {
  const pending = new Map();
  let generation = 0;
  let refreshing;
  async function exchange(params) {
    try {
      const response = await fetcher(tokenURL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      });
      if (!response.ok) throw new Error();
      const token = await response.json();
      const scopes = new Set((token.scope || '').split(' '));
      if (
        typeof token.access_token !== 'string' ||
        !token.access_token ||
        token.access_token.length > 5000 ||
        token.token_type?.toLowerCase() !== 'bearer' ||
        !Number.isFinite(token.expires_in) ||
        token.expires_in <= 0 ||
        !X_SCOPES.split(' ').every((scope) => scopes.has(scope))
      )
        throw new Error();
      if (
        typeof token.refresh_token !== 'string' ||
        !token.refresh_token ||
        token.refresh_token.length > 5000
      )
        throw new Error();
      return {
        xToken: token.access_token,
        xRefreshToken: token.refresh_token,
        xExpiresAt: String(now() + token.expires_in * 1000),
        xScope: token.scope,
        xConnectedAt: new Date(now()).toISOString(),
      };
    } catch {
      throw new Error('X authorization could not be completed. Reconnect from Office settings.');
    }
  }
  return {
    cancelPending() {
      generation++;
      pending.clear();
    },
    begin() {
      const { xClientId } = vault.read();
      if (!xClientId) throw new Error('Save the X OAuth 2.0 Client ID in Office settings first.');
      for (const [key, value] of pending) if (value.expires < now()) pending.delete(key);
      if (pending.size >= 10) pending.delete(pending.keys().next().value);
      const state = nonce(),
        session = nonce(),
        verifier = nonce();
      pending.set(state, {
        session,
        verifier,
        clientId: xClientId,
        generation,
        expires: now() + 600000,
      });
      const url = new URL('https://x.com/i/oauth2/authorize');
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: xClientId,
        redirect_uri: X_CALLBACK,
        scope: X_SCOPES,
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      });
      return { url: url.href, session };
    },
    async complete({ state, code, session }) {
      const request = typeof state === 'string' && pending.get(state);
      if (
        !request ||
        request.expires < now() ||
        !equal(session, request.session) ||
        typeof code !== 'string' ||
        !code ||
        code.length > 3000
      )
        throw new Error('Invalid or expired X authorization. Start again from Office settings.');
      pending.delete(state); // Single use, including unsuccessful exchanges.
      if (generation !== request.generation || vault.read().xClientId !== request.clientId)
        throw new Error('X app configuration changed. Start authorization again.');
      const credentials = await exchange({
        grant_type: 'authorization_code',
        code,
        client_id: request.clientId,
        redirect_uri: X_CALLBACK,
        code_verifier: request.verifier,
      });
      if (generation !== request.generation || vault.read().xClientId !== request.clientId)
        throw new Error('X app configuration changed. Start authorization again.');
      vault.save(credentials);
    },
    async forPublishing(platform, credentials) {
      if (
        platform !== 'x' ||
        !credentials.xExpiresAt ||
        Number(credentials.xExpiresAt) > now() + 60000
      )
        return credentials;
      if (!credentials.xClientId || !credentials.xRefreshToken)
        throw new Error('X access has expired. Reconnect from Office settings.');
      if (!refreshing)
        refreshing = (async () => {
          const fresh = await exchange({
            grant_type: 'refresh_token',
            refresh_token: credentials.xRefreshToken,
            client_id: credentials.xClientId,
          });
          const current = vault.read();
          if (
            current.xToken !== credentials.xToken ||
            current.xRefreshToken !== credentials.xRefreshToken ||
            current.xClientId !== credentials.xClientId
          )
            throw new Error('X connection changed during refresh. Check Office settings.');
          vault.save(fresh);
          return { ...current, ...fresh };
        })().finally(() => {
          refreshing = null;
        });
      return refreshing;
    },
  };
}
