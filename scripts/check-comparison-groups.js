'use strict';

const assert = require('node:assert/strict');
const { buildPriceComparisonGroups, formatRateValue } = require('../src/renderer/renderer');

const groups = buildPriceComparisonGroups([
  { siteId: 'a', siteName: 'A', baseUrl: 'https://a.test', groupName: 'cc-max', platform: 'anthropic', rate: 0.4 },
  { siteId: 'b', siteName: 'B', baseUrl: 'https://b.test', groupName: 'cc-max', platform: 'anthropic', rate: 0.4 },
  { siteId: 'c', siteName: 'C', baseUrl: 'https://c.test', groupName: 'cc-max', platform: 'anthropic', rate: 0.4 },
  { siteId: 'd', siteName: 'D', baseUrl: 'https://d.test', groupName: 'cc-max', platform: 'anthropic', rate: 0.45 },
  { siteId: 'e', siteName: 'E', baseUrl: 'https://e.test', groupName: 'tiny', platform: 'new-api', rate: 0.00001 },
  { siteId: 'f', siteName: 'F', baseUrl: 'https://f.test', groupName: 'bad', platform: 'new-api', rate: 0 },
  { siteId: 'g', siteName: 'G', baseUrl: 'https://g.test', groupName: 'cc-solo', platform: 'anthropic', rate: 0.4 },
  { siteId: 'h', siteName: 'H', baseUrl: 'https://h.test', groupName: 'cc-solo', platform: 'anthropic', rate: 0.5 }
]);

assert.equal(groups.length, 3);
assert.equal(groups[0].groupName, 'tiny');
assert.equal(formatRateValue(groups[0].bestRate), '0.00001');
assert.notEqual(formatRateValue(groups[0].bestRate), '0');
assert.deepEqual(groups.map((group) => group.groupName), ['tiny', 'cc-max', 'cc-solo']);

const ccMax = groups.find((group) => group.groupName === 'cc-max');
assert.ok(ccMax);
assert.equal(ccMax.bestRate, 0.4);
assert.equal(ccMax.bestSites.length, 3);
assert.equal(ccMax.runnerUpRate, 0.45);
assert.equal(formatRateValue(ccMax.deltaToRunnerUp), '0.05');
assert.deepEqual(ccMax.bestSites.map((offer) => offer.siteName), ['A', 'B', 'C']);

console.log('comparison group check passed');
