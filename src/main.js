'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { createStorage } = require('./storage');
const { normalizeSiteProvider, normalizeWebBase, querySite, serializeError } = require('./sub2apiClient');

app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');

let mainWindow;
let storage;
const loginWindows = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 650,
    useContentSize: true,
    title: 'Sub2API Rate Checker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createSuccessResult(site, payload) {
  const groups = Array.isArray(payload.groups) ? payload.groups : [];
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const keyRows = Array.isArray(payload.keyRows) ? payload.keyRows : rows;
  const monitorRows = Array.isArray(payload.monitorRows) ? payload.monitorRows : [];
  const monitors = Array.isArray(payload.monitors) ? payload.monitors : [];
  const monitorDetails = Array.isArray(payload.monitorDetails) ? payload.monitorDetails : [];

  return {
    ok: true,
    siteId: site.id,
    siteName: site.name || site.baseUrl,
    baseUrl: site.baseUrl,
    provider: payload.provider || normalizeSiteProvider(site),
    summary: {
      groups: groups.length,
      keys: keys.length,
      monitors: monitors.length,
      keyRows: keyRows.length,
      monitorRows: monitorRows.length,
      rows: rows.length
    },
    rows,
    keyRows,
    monitorRows,
    groups,
    groupSource: payload.groupSource || '',
    groupFetchFallbacks: payload.groupFetchFallbacks || [],
    rates: payload.rates || {},
    monitors,
    monitorDetails
  };
}

function createErrorResult(site, error) {
  return {
    ok: false,
    siteId: site.id,
    siteName: site.name || site.baseUrl,
    baseUrl: site.baseUrl,
    provider: normalizeSiteProvider(site),
    error: serializeError(error),
    rows: [],
    keyRows: [],
    monitorRows: []
  };
}

async function queryOne(site) {
  try {
    const payload = await querySite(site);
    if (payload.updatedTokens && Object.keys(payload.updatedTokens).length > 0) {
      storage.updateTokens(site.id, payload.updatedTokens);
    }
    return createSuccessResult(site, payload);
  } catch (error) {
    return createErrorResult(site, error);
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function sendLoginUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('login:update', payload);
  }
}

function loginPartition(site) {
  const provider = normalizeSiteProvider(site);
  return `persist:${provider}-login-${String(site.id || site).replace(/[^a-z0-9_-]/gi, '_')}`;
}

async function readTokensFromLoginWindow(win, provider) {
  if (!win || win.isDestroyed()) {
    return { authToken: '', refreshToken: '', tokenExpiresAt: '', newApiUserId: '' };
  }

  return win.webContents.executeJavaScript(
    `(async () => {
      try {
        const provider = ${JSON.stringify(provider || 'sub2api')};
        const storage = {};
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          storage[key] = localStorage.getItem(key) || '';
        }
        const read = (...keys) => {
          for (const key of keys) {
            if (storage[key]) return storage[key];
          }
          return '';
        };
        const parseJson = (value) => {
          try {
            return value ? JSON.parse(value) : null;
          } catch {
            return null;
          }
        };
        const findToken = () => {
          if (provider !== 'newapi') {
            return read('auth_token');
          }
          const explicit = read('access_token', 'accessToken', 'user_token', 'userToken', 'token', 'auth_token', 'new_api_token');
          if (explicit) return explicit;
          for (const [key, value] of Object.entries(storage)) {
            const lowerKey = key.toLowerCase();
            if ((lowerKey.includes('token') || lowerKey.includes('auth')) && value && value.length > 20) {
              return value;
            }
            const parsed = parseJson(value);
            if (parsed && typeof parsed === 'object') {
              const nested = parsed.token || parsed.access_token || parsed.accessToken || parsed.user_token;
              if (nested) return nested;
              if (parsed.user && typeof parsed.user === 'object') {
                const userNested = parsed.user.token || parsed.user.access_token || parsed.user.accessToken;
                if (userNested) return userNested;
              }
            }
          }
          return '';
        };
        const findUserId = () => {
          const explicit = read('uid', 'user_id', 'userId', 'id', 'new_api_user_id');
          if (explicit) return explicit;
          for (const value of Object.values(storage)) {
            const parsed = parseJson(value);
            if (!parsed || typeof parsed !== 'object') continue;
            const direct = parsed.id || parsed.user_id || parsed.userId;
            if (direct) return String(direct);
            if (parsed.user && typeof parsed.user === 'object') {
              const nested = parsed.user.id || parsed.user.user_id || parsed.user.userId;
              if (nested) return String(nested);
            }
          }
          return '';
        };
        const fetchNewApiAccessToken = async (userId) => {
          if (provider !== 'newapi' || !userId) {
            return '';
          }
          try {
            const response = await fetch('/api/user/token', {
              method: 'GET',
              credentials: 'include',
              headers: {
                Accept: 'application/json',
                'New-Api-User': String(userId)
              }
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload || payload.success === false) {
              return '';
            }
            if (typeof payload.data === 'string') {
              return payload.data;
            }
            if (payload.data && typeof payload.data === 'object') {
              return payload.data.access_token || payload.data.accessToken || payload.data.token || '';
            }
            return '';
          } catch {
            return '';
          }
        };
        const userId = findUserId();
        const localToken = findToken();
        const generatedToken = await fetchNewApiAccessToken(userId);
        return {
          authToken: generatedToken || localToken,
          refreshToken: read('refresh_token', 'refreshToken'),
          tokenExpiresAt: read('token_expires_at', 'tokenExpiresAt', 'expires_at'),
          newApiUserId: userId,
          source: generatedToken ? 'newapi-access-token' : localToken ? 'local-storage' : ''
        };
      } catch (error) {
        return { authToken: '', refreshToken: '', tokenExpiresAt: '', newApiUserId: '', error: String(error && error.message ? error.message : error) };
      }
    })()`,
    true
  );
}

async function captureLoginWindowTokens(site, options = {}) {
  const entry = loginWindows.get(site.id);
  if (!entry || !entry.window || entry.window.isDestroyed()) {
    throw new Error('登录窗口未打开');
  }

  const provider = normalizeSiteProvider(site);
  const tokens = await readTokensFromLoginWindow(entry.window, provider);
  if (!tokens.authToken) {
    if (options.manual) {
      sendLoginUpdate({
        type: 'missing',
        siteId: site.id,
        siteName: site.name || site.baseUrl,
        message: provider === 'newapi' ? '未发现 New API token' : '未发现 auth_token'
      });
    }
    return null;
  }

  const tokenUpdate = {
    authToken: tokens.authToken,
    refreshToken: tokens.refreshToken || '',
    tokenExpiresAt: tokens.tokenExpiresAt || ''
  };
  if (provider === 'newapi') {
    tokenUpdate.newApiUserId = tokens.newApiUserId || site.newApiUserId || '';
  }
  const updatedSite = storage.updateTokens(site.id, tokenUpdate);
  entry.captured = true;

  sendLoginUpdate({
    type: 'captured',
    siteId: site.id,
    siteName: site.name || site.baseUrl,
    message: '已采集 token',
    site: updatedSite
  });

  if (entry.timer) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
  if (!entry.window.isDestroyed()) {
    setTimeout(() => {
      if (!entry.window.isDestroyed()) {
        entry.window.close();
      }
    }, 500);
  }

  return updatedSite;
}

function startLoginPolling(site) {
  const entry = loginWindows.get(site.id);
  if (!entry) {
    return;
  }

  const poll = async () => {
    try {
      await captureLoginWindowTokens(site);
    } catch {
      // Page can be mid-navigation or still on a non-web origin; keep polling.
    }
  };

  entry.timer = setInterval(poll, 1500);
  entry.window.webContents.on('did-finish-load', poll);
  entry.window.webContents.on('did-navigate', poll);
  entry.window.webContents.on('did-navigate-in-page', poll);
}

function openBrowserLogin(site) {
  const existing = loginWindows.get(site.id);
  if (existing && existing.window && !existing.window.isDestroyed()) {
    existing.window.focus();
    return { opened: true, focused: true };
  }

  const loginUrl = normalizeWebBase(site);
  const win = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 920,
    minHeight: 640,
    title: `登录 - ${site.name || site.baseUrl}`,
    autoHideMenuBar: true,
    parent: mainWindow || undefined,
    webPreferences: {
    partition: loginPartition(site),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  loginWindows.set(site.id, { window: win, timer: null, captured: false });
  win.on('closed', () => {
    const entry = loginWindows.get(site.id);
    if (entry && entry.timer) {
      clearInterval(entry.timer);
    }
    loginWindows.delete(site.id);
    if (!entry || !entry.captured) {
      sendLoginUpdate({
        type: 'closed',
        siteId: site.id,
        siteName: site.name || site.baseUrl,
        message: '登录窗口已关闭'
      });
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    win.loadURL(url);
    return { action: 'deny' };
  });

  startLoginPolling(site);
  win.loadURL(loginUrl);
  sendLoginUpdate({
    type: 'opened',
    siteId: site.id,
    siteName: site.name || site.baseUrl,
    message: '已打开浏览器登录窗口'
  });

  return { opened: true, focused: false, loginUrl };
}

function registerIpc() {
  ipcMain.handle('sites:list', () => storage.listSites());

  ipcMain.handle('sites:save', (_event, site) => {
    return storage.saveSite(site);
  });

  ipcMain.handle('sites:delete', (_event, id) => {
    return storage.deleteSite(id);
  });

  ipcMain.handle('sites:query', async (_event, id) => {
    const site = storage.getSite(id);
    if (!site) {
      return createErrorResult({ id, name: 'Unknown site', baseUrl: '' }, new Error('Site not found'));
    }
    return queryOne(site);
  });

  ipcMain.handle('sites:queryAll', async () => {
    const sites = storage.listSites();
    return mapLimit(sites, 4, queryOne);
  });

  ipcMain.handle('sites:openBrowserLogin', (_event, id) => {
    const site = storage.getSite(id);
    if (!site) {
      throw new Error('Site not found');
    }
    return openBrowserLogin(site);
  });

  ipcMain.handle('sites:captureLoginTokens', async (_event, id) => {
    const site = storage.getSite(id);
    if (!site) {
      throw new Error('Site not found');
    }
    return captureLoginWindowTokens(site, { manual: true });
  });

  ipcMain.handle('app:storagePath', () => storage.filePath);
}

app.whenReady().then(() => {
  storage = createStorage(app.getPath('userData'));
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
