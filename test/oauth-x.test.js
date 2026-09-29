import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createXOAuth, X_SCOPES, X_CALLBACK } from '../server/oauth-x.js';
function fixture(fetcher, now) {
  let values = { xClientId: 'test-public-client' };
  const vault = {
    read: () => ({ ...values }),
    save: (patch) => {
      values = { ...values, ...patch };
    },
  };
  return { vault, oauth: createXOAuth(vault, fetcher, now) };
}
function tokenResponse(patch = {}) {
  return {
    ok: true,
    json: async () => ({
      access_token: 'test-access',
      refresh_token: 'test-refresh',
      token_type: 'bearer',
      expires_in: 7200,
      scope: X_SCOPES,
      ...patch,
    }),
  };
}
test('X OAuth binds single-use state to browser and verifies PKCE before saving server-side', async () => {
  let calls = 0,
    request;
  const { vault, oauth } = fixture(async (url, options) => {
    calls++;
    request = options;
    assert.equal(url, 'https://api.x.com/2/oauth2/token');
    return tokenResponse();
  });
  const { url, session } = oauth.begin(),
    params = new URL(url).searchParams;
  assert.equal(params.get('redirect_uri'), X_CALLBACK);
  assert.equal(params.get('scope'), X_SCOPES);
  assert.equal(params.get('code_challenge_method'), 'S256');
  const state = params.get('state');
  await assert.rejects(oauth.complete({ state, code: 'code', session: 'other-browser' }));
  await assert.rejects(
    oauth.complete({ state, code: 'code', session: 'é'.repeat(session.length) }),
  );
  assert.equal(calls, 0);
  assert.equal(await oauth.complete({ state, code: 'code', session }), undefined);
  assert.equal(
    createHash('sha256').update(request.body.get('code_verifier')).digest('base64url'),
    params.get('code_challenge'),
  );
  assert.equal(request.redirect, 'error');
  assert.equal(vault.read().xToken, 'test-access');
  await assert.rejects(oauth.complete({ state, code: 'code', session }));
  assert.equal(calls, 1);
});
test('expired state, denied scopes, and provider errors do not save or expose credentials', async () => {
  let clock = 1000;
  const expired = fixture(
    () => {
      throw new Error('must not call');
    },
    () => clock,
  );
  const started = expired.oauth.begin();
  clock += 600001;
  await assert.rejects(
    expired.oauth.complete({
      state: new URL(started.url).searchParams.get('state'),
      code: 'code',
      session: started.session,
    }),
  );
  for (const fetcher of [
    async () => tokenResponse({ scope: 'tweet.read' }),
    async () => {
      throw new Error('SECRET_PROVIDER_DETAIL');
    },
  ]) {
    const { vault, oauth } = fixture(fetcher);
    const start = oauth.begin();
    await assert.rejects(
      oauth.complete({
        state: new URL(start.url).searchParams.get('state'),
        code: 'code',
        session: start.session,
      }),
      { message: 'X authorization could not be completed. Reconnect from Office settings.' },
    );
    assert.equal(vault.read().xToken, undefined);
  }
});
test('a disconnect during authorization invalidates the pending exchange', async () => {
  let resolve;
  const { vault, oauth } = fixture(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const start = oauth.begin();
  const complete = oauth.complete({
    state: new URL(start.url).searchParams.get('state'),
    code: 'code',
    session: start.session,
  });
  oauth.cancelPending();
  vault.save({ xToken: '' });
  resolve(tokenResponse());
  await assert.rejects(complete, /configuration changed/);
  assert.equal(vault.read().xToken, '');
});
test('refresh runs once for concurrent publishing and preserves other credentials', async () => {
  let calls = 0;
  const { vault, oauth } = fixture(
    async (url, options) => {
      calls++;
      assert.equal(options.body.get('grant_type'), 'refresh_token');
      return tokenResponse();
    },
    () => 1000,
  );
  vault.save({
    xToken: 'old',
    xRefreshToken: 'old-refresh',
    xExpiresAt: '900',
    linkedinToken: 'linkedin',
  });
  const credentials = vault.read();
  const results = await Promise.all([
    oauth.forPublishing('x', credentials),
    oauth.forPublishing('x', credentials),
  ]);
  assert.equal(calls, 1);
  assert.equal(results[0].linkedinToken, 'linkedin');
  assert.equal(results[1].xToken, 'test-access');
  assert.equal(vault.read().xRefreshToken, 'test-refresh');
  await oauth.forPublishing('x', vault.read());
  assert.equal(calls, 1);
});
test('disconnect during refresh cannot restore old authorization', async () => {
  let resolve;
  const { vault, oauth } = fixture(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => 1000,
  );
  vault.save({ xToken: 'old', xRefreshToken: 'old-refresh', xExpiresAt: '900' });
  const refreshing = oauth.forPublishing('x', vault.read());
  vault.save({ xToken: '', xRefreshToken: '' });
  resolve(tokenResponse());
  await assert.rejects(refreshing, /connection changed/);
  assert.equal(vault.read().xToken, '');
});
