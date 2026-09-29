import { randomBytes, timingSafeEqual } from 'node:crypto';
export const LINKEDIN_CALLBACK = 'http://127.0.0.1:4310/api/oauth/linkedin/callback';
export const LINKEDIN_SCOPES = 'openid profile w_member_social';
const nonce = () => randomBytes(32).toString('base64url');
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function createLinkedInOAuth(vault, fetcher = fetch, now = Date.now) {
  const pending = new Map();
  let generation = 0;
  return {
    cancelPending() {
      generation++;
      pending.clear();
    },
    begin() {
      const { linkedinClientId, linkedinClientSecret } = vault.read();
      if (!linkedinClientId || !linkedinClientSecret)
        throw new Error('Save the LinkedIn app Client ID and secret first.');
      for (const [key, value] of pending) if (value.expires < now()) pending.delete(key);
      if (pending.size >= 10) pending.delete(pending.keys().next().value);
      const state = nonce(),
        session = nonce();
      pending.set(state, {
        session,
        clientId: linkedinClientId,
        generation,
        expires: now() + 600000,
      });
      const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: linkedinClientId,
        redirect_uri: LINKEDIN_CALLBACK,
        scope: LINKEDIN_SCOPES,
        state,
      });
      return { url: url.href, session };
    },
    async complete({ state, code, session }) {
      try {
        const request = typeof state === 'string' && pending.get(state);
        if (
          !request ||
          request.expires < now() ||
          !equal(session, request.session) ||
          typeof code !== 'string' ||
          !code ||
          code.length > 3000
        )
          throw new Error();
        pending.delete(state);
        const initial = vault.read();
        if (generation !== request.generation || initial.linkedinClientId !== request.clientId)
          throw new Error();
        const response = await fetcher('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: initial.linkedinClientId,
            client_secret: initial.linkedinClientSecret,
            redirect_uri: LINKEDIN_CALLBACK,
          }),
        });
        if (!response.ok) throw new Error();
        const token = await response.json();
        if (
          typeof token.access_token !== 'string' ||
          !token.access_token ||
          token.access_token.length > 5000 ||
          !Number.isFinite(token.expires_in) ||
          token.expires_in <= 0
        )
          throw new Error();
        // Some responses omit scope; successful authorization grants the requested scopes.
        if (
          token.scope &&
          !LINKEDIN_SCOPES.split(' ').every((s) => token.scope.split(/[ ,]+/).includes(s))
        )
          throw new Error();
        const user = await fetcher('https://api.linkedin.com/v2/userinfo', {
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (!user.ok) throw new Error();
        const profile = await user.json();
        if (typeof profile.sub !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(profile.sub))
          throw new Error();
        const current = vault.read();
        if (
          generation !== request.generation ||
          current.linkedinClientId !== initial.linkedinClientId ||
          current.linkedinClientSecret !== initial.linkedinClientSecret
        )
          throw new Error();
        vault.save({
          linkedinToken: token.access_token,
          linkedinAuthor: `urn:li:person:${profile.sub}`,
          linkedinExpiresAt: String(now() + token.expires_in * 1000),
          linkedinConnectedAt: new Date(now()).toISOString(),
        });
      } catch {
        throw new Error(
          'LinkedIn authorization could not be completed. Check app products and reconnect from Office settings.',
        );
      }
    },
  };
}
