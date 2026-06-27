'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStorage } = require('../src/storage');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub2api-storage-cache-'));

try {
  const storage = createStorage(tempDir);
  const saved = storage.saveSite({
    name: 'Cache Relay',
    baseUrl: 'https://cache.test',
    provider: 'sub2api'
  });

  assert.equal(storage.getPreferences().startupMode, 'snapshot');

  storage.savePreferences({ favoriteGroups: ['cc-max'], startupMode: 'refresh' });
  assert.deepEqual(storage.getPreferences().favoriteGroups, ['cc-max']);
  assert.equal(storage.getPreferences().startupMode, 'refresh');

  storage.savePreferences({ startupMode: 'blank' });
  assert.deepEqual(storage.getPreferences().favoriteGroups, ['cc-max']);
  assert.equal(storage.getPreferences().startupMode, 'blank');

  const snapshot = storage.saveResultSnapshot({
    selectedId: saved.id,
    results: [
      {
        ok: true,
        siteId: saved.id,
        siteName: saved.name,
        baseUrl: saved.baseUrl,
        provider: 'sub2api',
        keyRows: [
          { keyName: 'main', groupName: 'cc-max', quota: 100, quotaUsed: 25, apiKey: 'sk-should-not-persist' }
        ],
        rows: [],
        monitorRows: [],
        groups: [{ id: 'cc-max', name: 'cc-max', platform: 'anthropic', rate: 0.4 }],
        summary: { groups: 1, keyRows: 1, monitorRows: 0 }
      }
    ]
  });

  assert.equal(snapshot.results.length, 1);
  assert.equal(snapshot.selectedId, saved.id);
  assert.ok(snapshot.updatedAt);
  assert.equal(snapshot.results[0].keyRows[0].quota, 100);
  assert.equal(snapshot.results[0].keyRows[0].apiKey, undefined);

  const reloaded = createStorage(tempDir).getResultSnapshot();
  assert.equal(reloaded.results.length, 1);
  assert.equal(reloaded.results[0].siteId, saved.id);
  assert.deepEqual(createStorage(tempDir).getPreferences().favoriteGroups, ['cc-max']);
  assert.equal(createStorage(tempDir).getPreferences().startupMode, 'blank');

  console.log('storage cache check passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
