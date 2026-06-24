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
        sites: Array.isArray(parsed.sites) ? parsed.sites : []
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
    updateTokens,
    deleteSite
  };
}

module.exports = { createStorage };
