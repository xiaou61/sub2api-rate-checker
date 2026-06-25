'use strict';

const assert = require('node:assert/strict');
const { normalizeNewApiBase, querySite } = require('../src/sub2apiClient');

async function run() {
  const calls = [];
  const installFetch = (mockOptions = {}) => {
    calls.length = 0;
    global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    calls.push({
      path: parsed.pathname,
      search: parsed.search,
      method: options.method || 'GET',
      body: options.body,
      auth: options.headers && options.headers.Authorization,
      newApiUser: options.headers && options.headers['New-Api-User']
    });

    let payload;
    if (parsed.pathname === '/api/pricing') {
      if (!options.headers.Authorization || options.headers.Authorization === 'Bearer sk-current-token') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: false, message: 'pricing requires login' })
        };
      }
      payload = {
        success: true,
        data: [
          {
            model_name: 'claude-test',
            enable_group: ['alpha', 'tiny'],
            model_ratio: 1,
            completion_ratio: 1
          }
        ],
        group_ratio: {
          alpha: 0.45,
          tiny: 0.00001,
          zero: 0
        },
        usable_group: {
          alpha: 'Alpha group',
          tiny: 'Tiny group',
          zero: 'Zero group'
        }
      };
    } else if (parsed.pathname === '/api/user/self/groups') {
      payload = {
        success: true,
        data: {
          alpha: { ratio: 0.4, desc: 'User alpha' }
        }
      };
    } else if (parsed.pathname === '/api/user/self') {
      payload = {
        success: true,
        data: { group: 'alpha' }
      };
    } else if (parsed.pathname === '/api/token/') {
      if (options.headers && options.headers.Authorization === 'Bearer sk-current-token') {
        return {
          ok: false,
          status: 200,
          text: async () => JSON.stringify({ success: false, message: 'invalid access token' })
        };
      }
      payload = {
        success: true,
        data: {
          items: [
            {
              id: 9,
              name: 'main',
              key: 'mock********7890',
              status: 1,
              group: 'alpha',
              remain_quota: 9,
              accessed_time: 1760000000
            }
          ],
          total: 1,
          page: 1,
          page_size: 100
        }
      };
    } else if (parsed.pathname === '/api/token/batch/keys') {
      if (mockOptions.batchFails) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: false, message: 'batch unavailable' })
        };
      }
      payload = {
        success: true,
        data: {
          keys: {
            9: 'mock-key-abc1234567890'
          }
        }
      };
    } else if (parsed.pathname === '/api/token/9/key') {
      payload = {
        success: true,
        data: {
          key: 'mock-key-abc1234567890'
        }
      };
    } else if (parsed.pathname === '/api/usage/token/') {
      payload = {
        code: true,
        message: 'ok',
        data: {
          object: 'token_usage',
          name: 'current',
          total_granted: 15,
          total_used: 6,
          total_available: 9,
          unlimited_quota: false
        }
      };
    } else {
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ success: false, message: 'missing' })
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload)
    };
  };
  };

  assert.equal(normalizeNewApiBase('https://example.com'), 'https://example.com/api');
  assert.equal(normalizeNewApiBase('https://example.com/api/v1'), 'https://example.com/api');

  installFetch();
  const result = await querySite({
    id: 'n1',
    provider: 'newapi',
    name: 'New API Demo',
    baseUrl: 'https://example.com',
    authToken: 'TOKEN',
    newApiUserId: '77'
  });

  assert.equal(result.provider, 'newapi');
  assert.equal(result.groupSource, 'newapi-user-groups');
  assert.deepEqual(result.groups.map((group) => group.id).sort(), ['alpha', 'tiny']);
  assert.equal(result.rates.alpha, 0.4);
  assert.equal(result.rates.tiny, 0.00001);
  assert.equal(result.keyRows.length, 1);
  assert.equal(result.keyRows[0].groupName, 'alpha');
  assert.equal(result.keyRows[0].keyMasked, 'mock-k...7890');
  assert.equal(calls.some((call) => call.path === '/api/token/' && call.auth === 'Bearer TOKEN'), true);
  assert.equal(calls.some((call) => call.path === '/api/token/batch/keys' && call.method === 'POST'), true);
  assert.equal(calls.some((call) => call.newApiUser === '77'), true);

  installFetch({ batchFails: true });
  const fallbackResult = await querySite({
    id: 'n1-fallback',
    provider: 'newapi',
    name: 'New API Demo',
    baseUrl: 'https://example.com',
    authToken: 'TOKEN',
    newApiUserId: '77'
  });

  assert.equal(fallbackResult.keyRows.length, 1);
  assert.equal(fallbackResult.keyRows[0].keyMasked, 'mock-k...7890');
  assert.equal(calls.some((call) => call.path === '/api/token/batch/keys'), true);
  assert.equal(calls.some((call) => call.path === '/api/token/9/key' && call.method === 'POST'), true);

  installFetch();
  const relayTokenResult = await querySite({
    id: 'n2',
    provider: 'newapi',
    name: 'New API Key Demo',
    baseUrl: 'https://example.com',
    authToken: 'sk-current-token'
  });

  assert.equal(relayTokenResult.provider, 'newapi');
  assert.equal(relayTokenResult.groups.length, 0);
  assert.equal(relayTokenResult.keyRows.length, 1);
  assert.equal(relayTokenResult.keyRows[0].keyName, 'current');
  assert.equal(relayTokenResult.keyRows[0].quota, 15);
  assert.equal(relayTokenResult.keyRows[0].quotaUsed, 6);
  assert.equal(relayTokenResult.groupFetchFallbacks.some((item) => item.code === 'NEW_API_PRICING_AUTH_REQUIRED'), true);
  assert.equal(calls.some((call) => call.path === '/api/token/'), false);
  assert.equal(calls.some((call) => call.path === '/api/usage/token/' && call.auth === 'Bearer sk-current-token'), true);

  await assert.rejects(
    () => querySite({
      id: 'n3',
      provider: 'newapi',
      name: 'Missing User ID',
      baseUrl: 'https://example.com',
      authToken: 'ACCESS_TOKEN_WITHOUT_USER_ID'
    }),
    (error) => error && error.code === 'NEW_API_USER_ID_REQUIRED'
  );

  console.log('newapi client check passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
