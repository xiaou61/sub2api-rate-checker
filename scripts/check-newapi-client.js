'use strict';

const assert = require('node:assert/strict');
const { normalizeNewApiBase, querySite } = require('../src/sub2apiClient');

async function run() {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    calls.push({
      path: parsed.pathname,
      search: parsed.search,
      auth: options.headers && options.headers.Authorization,
      newApiUser: options.headers && options.headers['New-Api-User']
    });

    let payload;
    if (parsed.pathname === '/api/pricing') {
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
      payload = {
        success: true,
        data: {
          items: [
            {
              id: 9,
              name: 'main',
              key: 'mock-key-abc1234567890',
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

  assert.equal(normalizeNewApiBase('https://example.com'), 'https://example.com/api');
  assert.equal(normalizeNewApiBase('https://example.com/api/v1'), 'https://example.com/api');

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
  assert.equal(calls.some((call) => call.path === '/api/token/' && call.auth === 'Bearer TOKEN'), true);
  assert.equal(calls.some((call) => call.newApiUser === '77'), true);

  console.log('newapi client check passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
