import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLinkedInOAuth,
  LINKEDIN_CALLBACK,
  LINKEDIN_SCOPES,
} from '../server/oauth-linkedin.js';
function fixture(fetcher, now) {
  let c = { linkedinClientId: 'client', linkedinClientSecret: 'TEST_SECRET' };
  const vault = {
    read: () => ({ ...c }),
    save: (patch) => {
      c = { ...c, ...patch };
    },
  };
  return { vault, oauth: createLinkedInOAuth(vault, fetcher, now) };
}
const response = (json) => ({ ok: true, json: async () => json });
const token = { access_token: 'TEST_ACCESS', expires_in: 5184000, scope: LINKEDIN_SCOPES };
function args(start) {
  return {
    state: new URL(start.url).searchParams.get('state'),
    session: start.session,
    code: 'test-code',
  };
}
test('LinkedIn binds state to browser, exchanges secret only server-side and resolves personal author', async () => {
  let calls = 0;
  const { vault, oauth } = fixture(async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/accessToken')) {
      assert.equal(options.body.get('client_secret'), 'TEST_SECRET');
      assert.equal(options.body.get('redirect_uri'), LINKEDIN_CALLBACK);
      return response(token);
    }
    assert.equal(url, 'https://api.linkedin.com/v2/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer TEST_ACCESS');
    return response({ sub: 'test-member', name: 'Private name not stored' });
  });
  const start = oauth.begin();
  assert.ok(!start.url.includes('TEST_SECRET'));
  assert.equal(new URL(start.url).searchParams.get('scope'), LINKEDIN_SCOPES);
  await assert.rejects(oauth.complete({ ...args(start), session: 'wrong' }));
  assert.equal(calls, 0);
  await oauth.complete(args(start));
  assert.equal(vault.read().linkedinAuthor, 'urn:li:person:test-member');
  assert.equal(vault.read().linkedinToken, 'TEST_ACCESS');
  assert.ok(!JSON.stringify(vault.read()).includes('Private name'));
  await assert.rejects(oauth.complete(args(start)));
  assert.equal(calls, 2);
});
test('LinkedIn rejects missing scope, malformed identity and provider errors without leaking them', async () => {
  for (const fetcher of [
    async () => response({ ...token, scope: 'openid' }),
    async (url) => response(url.endsWith('/accessToken') ? token : { sub: 'bad/value' }),
    async () => {
      throw new Error('TEST_SECRET');
    },
  ]) {
    const { vault, oauth } = fixture(fetcher);
    await assert.rejects(oauth.complete(args(oauth.begin())), {
      message:
        'LinkedIn authorization could not be completed. Check app products and reconnect from Office settings.',
    });
    assert.equal(vault.read().linkedinToken, undefined);
  }
});
test('LinkedIn expiration and disconnect invalidate pending authorization', async () => {
  let now = 1000;
  const expired = fixture(
    () => {
      throw new Error('must not call');
    },
    () => now,
  );
  const start = expired.oauth.begin();
  now += 600001;
  await assert.rejects(expired.oauth.complete(args(start)));
  let resolve;
  const { vault, oauth } = fixture((url) =>
    url.endsWith('/accessToken')
      ? new Promise((r) => {
          resolve = r;
        })
      : response({ sub: 'member' }),
  );
  const complete = oauth.complete(args(oauth.begin()));
  oauth.cancelPending();
  vault.save({ linkedinToken: '' });
  resolve(response(token));
  await assert.rejects(complete);
  assert.equal(vault.read().linkedinToken, '');
});
