'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '') === 'newapi'
    ? 'newapi'
    : 'sub2api';
}

const SNAPSHOT_SECRET_KEYS = new Set([
  'apiKey',
  'authToken',
  'refreshToken',
  'password',
  'real_key',
  'full_key',
  'token',
  'key',
  'value'
]);

const STARTUP_MODES = new Set(['snapshot', 'refresh', 'blank']);

function normalizeStartupMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return STARTUP_MODES.has(mode) ? mode : 'snapshot';
}

function normalizePreferences(input) {
  const preferences = input && typeof input === 'object' ? input : {};
  return {
    favoriteGroups: Array.isArray(preferences.favoriteGroups) ? preferences.favoriteGroups : [],
    startupMode: normalizeStartupMode(preferences.startupMode)
  };
}

function sanitizeSnapshotValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSnapshotValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (SNAPSHOT_SECRET_KEYS.has(key)) {
      continue;
    }
    output[key] = sanitizeSnapshotValue(child);
  }
  return output;
}

function normalizeResultSnapshot(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const results = Array.isArray(input.results)
    ? input.results.map((result) => sanitizeSnapshotValue(result)).filter(Boolean)
    : [];
  if (results.length === 0) {
    return null;
  }
  return {
    updatedAt: String(input.updatedAt || nowIso()),
    selectedId: String(input.selectedId || ''),
    results
  };
}

function createStorage(userDataPath) {
  const filePath = path.join(userDataPath, 'sites.json');

  function ensureDir() {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  function read() {
    ensureDir();
    if (!fs.existsSync(filePath)) {
      return { version: 1, sites: [] };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        version: 1,
        sites: Array.isArray(parsed.sites) ? parsed.sites : [],
        preferences: normalizePreferences(parsed.preferences),
        resultSnapshot: normalizeResultSnapshot(parsed.resultSnapshot)
      };
    } catch {
      return { version: 1, sites: [] };
    }
  }

  function write(data) {
    ensureDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  function listSites() {
    return read().sites;
  }

  function getPreferences() {
    const data = read();
    return normalizePreferences(data.preferences);
  }

  function savePreferences(input) {
    const data = read();
    const existingPreferences = normalizePreferences(data.preferences);
    const favoriteGroups = Array.isArray(input && input.favoriteGroups)
      ? input.favoriteGroups
        .map((group) => String(group || '').trim())
        .filter(Boolean)
      : existingPreferences.favoriteGroups;
    data.preferences = {
      ...existingPreferences,
      favoriteGroups: Array.from(new Set(favoriteGroups)),
      startupMode: input && input.startupMode !== undefined
        ? normalizeStartupMode(input.startupMode)
        : existingPreferences.startupMode
    };
    write(data);
    return data.preferences;
  }

  function getResultSnapshot() {
    const data = read();
    return data.resultSnapshot || null;
  }

  function saveResultSnapshot(input) {
    const data = read();
    const snapshot = normalizeResultSnapshot({
      ...(input && typeof input === 'object' ? input : {}),
      updatedAt: nowIso()
    });
    data.resultSnapshot = snapshot;
    write(data);
    return snapshot;
  }

  function clearResultSnapshot() {
    const data = read();
    data.resultSnapshot = null;
    write(data);
    return true;
  }

  function getSite(id) {
    return listSites().find((site) => site.id === id) || null;
  }

  function saveSite(input) {
    const data = read();
    const existingIndex = data.sites.findIndex((site) => site.id === input.id);
    const existing = existingIndex >= 0 ? data.sites[existingIndex] : null;
    const timestamp = nowIso();
    const site = {
      id: input.id || crypto.randomUUID(),
      provider: normalizeProvider(input.provider !== undefined ? input.provider : existing ? existing.provider : ''),
      name: String(input.name || '').trim(),
      baseUrl: String(input.baseUrl || '').trim(),
      email: String(input.email || '').trim(),
      password: input.password !== undefined ? String(input.password || '') : existing ? existing.password || '' : '',
      turnstileToken: input.turnstileToken !== undefined ? String(input.turnstileToken || '') : existing ? existing.turnstileToken || '' : '',
      authToken: input.authToken !== undefined ? String(input.authToken || '') : existing ? existing.authToken || '' : '',
      refreshToken: input.refreshToken !== undefined ? String(input.refreshToken || '') : existing ? existing.refreshToken || '' : '',
      tokenExpiresAt: input.tokenExpiresAt !== undefined ? input.tokenExpiresAt || '' : existing ? existing.tokenExpiresAt || '' : '',
      newApiUserId: input.newApiUserId !== undefined ? String(input.newApiUserId || '') : existing ? existing.newApiUserId || '' : '',
      speedTestModel: input.speedTestModel !== undefined ? String(input.speedTestModel || '').trim() : existing ? existing.speedTestModel || '' : '',
      groupAliases: input.groupAliases !== undefined ? String(input.groupAliases || '') : existing ? existing.groupAliases || '' : '',
      notes: String(input.notes || ''),
      createdAt: existing ? existing.createdAt || timestamp : timestamp,
      updatedAt: timestamp
    };

    if (!site.name) {
      site.name = site.baseUrl;
    }
    if (!site.baseUrl) {
      throw new Error('Base URL is required');
    }

    if (existingIndex >= 0) {
      data.sites[existingIndex] = site;
    } else {
      data.sites.push(site);
    }

    write(data);
    return site;
  }

  function updateTokens(id, tokens) {
    const data = read();
    const site = data.sites.find((item) => item.id === id);
    if (!site) {
      return null;
    }

    if (tokens.authToken !== undefined) {
      site.authToken = tokens.authToken || '';
    }
    if (tokens.refreshToken !== undefined) {
      site.refreshToken = tokens.refreshToken || '';
    }
    if (tokens.tokenExpiresAt !== undefined) {
      site.tokenExpiresAt = tokens.tokenExpiresAt || '';
    }
    if (tokens.newApiUserId !== undefined) {
      site.newApiUserId = tokens.newApiUserId || '';
    }
    site.updatedAt = nowIso();
    write(data);
    return site;
  }

  function deleteSite(id) {
    const data = read();
    const nextSites = data.sites.filter((site) => site.id !== id);
    const changed = nextSites.length !== data.sites.length;
    data.sites = nextSites;
    write(data);
    return changed;
  }

  return {
    filePath,
    listSites,
    getSite,
    saveSite,
    getPreferences,
    savePreferences,
    getResultSnapshot,
    saveResultSnapshot,
    clearResultSnapshot,
    updateTokens,
    deleteSite
  };
}

module.exports = { createStorage };
