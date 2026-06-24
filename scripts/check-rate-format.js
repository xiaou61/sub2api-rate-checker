'use strict';

const assert = require('node:assert/strict');
const { formatRateValue, toPositiveRate } = require('../src/renderer/renderer');

assert.equal(toPositiveRate(0), null);
assert.equal(toPositiveRate(''), null);
assert.equal(formatRateValue(0), '');
assert.equal(formatRateValue(''), '');
assert.equal(formatRateValue(0.25), '0.25');
assert.equal(formatRateValue(0.0001), '0.0001');
assert.equal(formatRateValue(0.00009), '0.00009');
assert.equal(formatRateValue(0.00001), '0.00001');
assert.notEqual(formatRateValue(0.00001), '0');

console.log('rate format check passed');
