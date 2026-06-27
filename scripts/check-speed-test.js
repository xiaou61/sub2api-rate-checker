'use strict';

const assert = require('node:assert/strict');
const { querySite, speedTestSite } = require('../src/sub2apiClient');

async function run() {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    calls.push({
      path: parsed.pathname,
      method: options.method || 'GET',
      auth: options.headers && options.headers.Authorization,
      body: options.body ? JSON.parse(options.body) : null
    });

    if (parsed.pathname === '/api/v1/auth/login') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          code: 0,
          data: {
            access_token: 'admin-token'
          }
        })
      };
    }

    if (parsed.pathname === '/api/v1/admin/groups/all') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          code: 0,
          data: [
            { id: 1, name: 'cc-max', platform: 'anthropic', rate_multiplier: 0.4 }
          ]
        })
      };
    }

    if (parsed.pathname === '/api/v1/groups/rates') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          code: 0,
          data: { 1: 0.35 }
        })
      };
    }

    if (parsed.pathname === '/api/v1/keys') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          code: 0,
          data: {
            items: [
              {
                id: 'k1',
                name: 'main',
                key: 'sk-speed-real-secret',
                status: 'active',
                group_id: 1,
                quota: 100,
                quota_used: 20
              }
            ],
            pages: 1
          }
        })
      };
    }

    if (parsed.pathname === '/api/v1/channel-monitors') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          code: 0,
          data: { items: [] }
        })
      };
    }

    if (parsed.pathname === '/v1/chat/completions') {
      assert.equal(options.headers.Authorization, 'Bearer sk-speed-real-secret');
      const body = JSON.parse(options.body);
      assert.equal(options.method, 'POST');
      assert.equal(body.messages[0].content, 'hi');
      assert.equal(body.stream, false);
      assert.equal(body.max_tokens, 8);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          id: 'chatcmpl-speed',
          choices: [
            { message: { role: 'assistant', content: 'hi' } }
          ]
        })
      };
    }

    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ code: 404, message: 'missing' })
    };
  };

  const site = {
    id: 'speed-a',
    name: 'Speed Alpha',
    baseUrl: 'https://relay.test',
    provider: 'sub2api',
    email: 'user@example.com',
    password: 'pass'
  };

  const payload = await querySite(site);
  assert.equal(payload.keyRows.length, 1);
  assert.equal(payload.keyRows[0].apiKey, 'sk-speed-real-secret');

  const speed = await speedTestSite(site, { payload, timeoutMs: 3000 });
  assert.equal(speed.ok, true);
  assert.equal(speed.summary.total, 1);
  assert.equal(speed.summary.ok, 1);
  assert.equal(speed.rows[0].keyMasked, 'sk-spe...cret');
  assert.equal(speed.rows[0].message, '模型已响应');
  assert.equal(speed.rows[0].responseText, 'hi');
  assert.equal(Object.prototype.hasOwnProperty.call(speed.rows[0], 'apiKey'), false);
  assert.equal(calls.some((call) => call.path === '/v1/chat/completions' && call.method === 'POST' && call.auth === 'Bearer sk-speed-real-secret'), true);
  assert.equal(calls.some((call) => call.path === '/v1/models'), false);

  console.log('speed test check passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
