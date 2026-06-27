'use strict';

const assert = require('node:assert/strict');
const {
  buildBalanceSummary,
  balanceSummaryText,
  balanceHealthText,
  buildSiteOverviewRows,
  __setTestState
} = require('../src/renderer/renderer');

const balance = buildBalanceSummary([
  { keyName: 'a', quota: 100, quotaUsed: 35 },
  { keyName: 'b', quota: 10, quotaUsed: 3 },
  { keyName: 'c', quota: null, quotaUsed: null },
  { keyName: 'd', unlimitedQuota: true, quotaUsed: 9 }
]);

assert.equal(balance.keyCount, 4);
assert.equal(balance.knownCount, 2);
assert.equal(balance.unlimitedCount, 1);
assert.equal(balance.unknownCount, 1);
assert.equal(balance.quota, 110);
assert.equal(balance.used, 47);
assert.equal(balance.remaining, 72);
assert.equal(balanceSummaryText(balance), '剩 72 / 总 110 · 不限量 1 · 未知 1');
assert.equal(balance.healthLevel, 'unknown');
assert.equal(balanceHealthText(balance), '余额未知');

const unlimitedBalance = buildBalanceSummary([
  { keyName: 'newapi-unlimited', unlimitedQuota: true, quota: null, quotaUsed: 12 }
]);
assert.equal(unlimitedBalance.unlimitedCount, 1);
assert.equal(balanceSummaryText(unlimitedBalance), '不限量 1');
assert.equal(unlimitedBalance.healthLevel, 'unlimited');

const remainingOnlyBalance = buildBalanceSummary([
  { keyName: 'remaining-only', quota: null, quotaUsed: null, quotaRemaining: 9 }
]);
assert.equal(remainingOnlyBalance.knownCount, 1);
assert.equal(remainingOnlyBalance.remainingKnownCount, 1);
assert.equal(remainingOnlyBalance.unknownCount, 0);
assert.equal(balanceSummaryText(remainingOnlyBalance), '剩 9');
assert.equal(remainingOnlyBalance.healthLevel, 'warn');

const aliasBalance = buildBalanceSummary([
  { keyName: 'remaining-alias', remaining: 12 },
  { keyName: 'balance-alias', balance: '8' },
  { keyName: 'unlimited-negative', quota: -1, quotaUsed: 2 }
]);
assert.equal(aliasBalance.knownCount, 2);
assert.equal(aliasBalance.remainingKnownCount, 2);
assert.equal(aliasBalance.unlimitedCount, 1);
assert.equal(aliasBalance.unknownCount, 0);
assert.equal(balanceSummaryText(aliasBalance), '剩 20 · 不限量 1');
assert.equal(aliasBalance.healthLevel, 'good');

const lowBalance = buildBalanceSummary([
  { keyName: 'almost-empty', quota: 100, quotaUsed: 96 }
]);
assert.equal(lowBalance.healthLevel, 'danger');
assert.equal(balanceHealthText(lowBalance), '余额紧张');

const warnBalance = buildBalanceSummary([
  { keyName: 'low', quota: 100, quotaUsed: 85 }
]);
assert.equal(warnBalance.healthLevel, 'warn');
assert.equal(balanceHealthText(warnBalance), '余额偏低');

const goodBalance = buildBalanceSummary([
  { keyName: 'fine', quota: 100, quotaUsed: 30 }
]);
assert.equal(goodBalance.healthLevel, 'good');

__setTestState({
  sites: [
    { id: 'a', name: 'Alpha Relay', baseUrl: 'https://a.test', provider: 'sub2api' },
    { id: 'b', name: 'Beta Relay', baseUrl: 'https://b.test', provider: 'newapi' }
  ],
  selectedId: 'a',
  groupFilter: 'all',
  speedResults: {
    b: {
      ok: true,
      summary: { total: 1, ok: 1, failed: 0, fastestLatencyMs: 88, averageLatencyMs: 88 },
      rows: []
    }
  },
  speedBusySiteIds: [],
  results: [
    {
      ok: true,
      siteId: 'a',
      siteName: 'Alpha Relay',
      baseUrl: 'https://a.test',
      provider: 'sub2api',
      summary: { groups: 2, keyRows: 2, monitorRows: 1 },
      groups: [
        { id: 'cc', name: 'cc-max', platform: 'anthropic', rate: 0.4 },
        { id: 'fast', name: 'fast', platform: 'openai', rate: 0.7 }
      ],
      keyRows: [
        { keyName: 'alpha-main', groupId: 'cc', groupName: 'cc-max', platform: 'anthropic', effectiveRate: 0.4, quota: 100, quotaUsed: 10 },
        { keyName: 'alpha-fast', groupId: 'fast', groupName: 'fast', platform: 'openai', effectiveRate: 0.7, quota: 50, quotaUsed: 20 }
      ],
      monitorRows: [{}]
    },
    {
      ok: true,
      siteId: 'b',
      siteName: 'Beta Relay',
      baseUrl: 'https://b.test',
      provider: 'newapi',
      summary: { groups: 2, keyRows: 1, monitorRows: 0 },
      groups: [
        { id: 'cc', name: 'cc-max', platform: 'anthropic', rate: 0.35 },
        { id: 'slow', name: 'slow', platform: 'openai', rate: 0.9 }
      ],
      keyRows: [
        { keyName: 'beta-main', groupId: 'cc', groupName: 'cc-max', platform: 'anthropic', effectiveRate: 0.35, quota: 30, quotaUsed: 5 }
      ],
      monitorRows: []
    },
    {
      ok: false,
      siteId: 'broken',
      siteName: 'Broken Relay',
      baseUrl: 'https://broken.test',
      provider: 'sub2api',
      error: { message: 'bad token' },
      summary: { groups: 0, keyRows: 0, monitorRows: 0 },
      keyRows: [],
      monitorRows: []
    }
  ]
});

const rows = buildSiteOverviewRows();
assert.equal(rows.length, 3);
assert.equal(rows[0].siteId, 'b');
assert.equal(rows[0].bestOffer.groupName, 'cc-max');
assert.equal(rows[0].bestOffer.rate, 0.35);
assert.equal(rows[0].provider, 'newapi');
assert.equal(rows[0].balance.remaining, 25);
assert.equal(rows[0].speed.summary.fastestLatencyMs, 88);
assert.equal(rows[1].siteId, 'a');
assert.equal(rows[1].balance.remaining, 120);
assert.equal(rows[2].siteId, 'broken');
assert.equal(rows[2].ok, false);
assert.equal(rows[2].bestOffer, null);

console.log('site overview check passed');
