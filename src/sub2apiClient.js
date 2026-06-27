'use strict';

class Sub2ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'Sub2ApiError';
    this.status = options.status || 0;
    this.code = options.code || '';
    this.reason = options.reason || '';
    this.metadata = options.metadata || {};
    this.needsToken = Boolean(options.needsToken);
    this.requires2fa = Boolean(options.requires2fa);
  }
}

function normalizeApiBase(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) {
    throw new Sub2ApiError('Base URL is required', { code: 'BAD_BASE_URL' });
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  url.hash = '';
  url.search = '';

  const trimmedPath = url.pathname.replace(/\/+$/, '');
  if (trimmedPath.endsWith('/api/v1')) {
    url.pathname = trimmedPath;
  } else if (trimmedPath.endsWith('/api')) {
    url.pathname = `${trimmedPath}/v1`;
  } else {
    url.pathname = `${trimmedPath}/api/v1`;
  }

  return url.toString().replace(/\/+$/, '');
}

function normalizeWebBase(baseUrl, provider) {
  const siteLike = baseUrl && typeof baseUrl === 'object' ? baseUrl : { baseUrl, provider };
  const apiBase = normalizeSiteProvider(siteLike) === 'newapi'
    ? normalizeNewApiBase(siteLike.baseUrl || siteLike.url || '')
    : normalizeApiBase(siteLike.baseUrl || siteLike.url || baseUrl);
  const url = new URL(apiBase);
  return `${url.origin}/`;
}

function normalizeSiteProvider(value) {
  const provider = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? value.provider || value.type
      : '';
  return String(provider || '').trim().toLowerCase().replace(/[\s_-]+/g, '') === 'newapi'
    ? 'newapi'
    : 'sub2api';
}

function normalizeNewApiBase(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) {
    throw new Sub2ApiError('Base URL is required', { code: 'BAD_BASE_URL' });
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  url.hash = '';
  url.search = '';

  const trimmedPath = url.pathname.replace(/\/+$/, '');
  if (trimmedPath.endsWith('/api/v1')) {
    url.pathname = trimmedPath.slice(0, -3);
  } else if (trimmedPath.endsWith('/api')) {
    url.pathname = trimmedPath;
  } else {
    url.pathname = `${trimmedPath}/api`;
  }

  return url.toString().replace(/\/+$/, '');
}

function unwrapEnvelope(payload, status) {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'code')) {
    if (payload.code === 0) {
      return payload.data;
    }

    throw new Sub2ApiError(payload.message || 'sub2api request failed', {
      status,
      code: payload.code,
      reason: payload.reason,
      metadata: payload.metadata
    });
  }
  return payload;
}

function unwrapNewApiEnvelope(payload, status, keepEnvelope = false) {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
    if (payload.success === false) {
      throw new Sub2ApiError(payload.message || 'New API request failed', {
        status,
        code: payload.code || 'NEW_API_ERROR',
        reason: payload.reason,
        metadata: payload
      });
    }

    return keepEnvelope ? payload : payload.data;
  }
  if (payload && typeof payload === 'object' && typeof payload.code === 'boolean') {
    if (!payload.code) {
      throw new Sub2ApiError(payload.message || 'New API request failed', {
        status,
        code: 'NEW_API_ERROR',
        metadata: payload
      });
    }

    return keepEnvelope ? payload : payload.data;
  }

  return payload;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const shortText = text.length > 220 ? `${text.slice(0, 220)}...` : text;
    throw new Sub2ApiError(`Response is not JSON: ${shortText}`, {
      status: response.status,
      code: 'NON_JSON_RESPONSE'
    });
  }
}

async function requestJson(apiBase, path, options = {}) {
  const url = new URL(`${apiBase}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    Accept: 'application/json',
    'Accept-Language': 'zh-CN',
    ...(options.headers || {})
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.newApiUserId) {
    headers['New-Api-User'] = String(options.newApiUserId);
  }

  let response;
  try {
    response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch (error) {
    throw new Sub2ApiError(error.message || 'Network request failed', {
      code: 'NETWORK_ERROR'
    });
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    if (payload && typeof payload === 'object') {
      throw new Sub2ApiError(payload.message || `HTTP ${response.status}`, {
        status: response.status,
        code: payload.code || response.status,
        reason: payload.reason,
        metadata: payload.metadata
      });
    }

    throw new Sub2ApiError(`HTTP ${response.status}`, {
      status: response.status,
      code: response.status
    });
  }

  if (options.envelope === 'newapi') {
    return unwrapNewApiEnvelope(payload, response.status, Boolean(options.keepEnvelope));
  }

  return unwrapEnvelope(payload, response.status);
}

function tokenExpiresSoon(expiresAt) {
  const value = Number(expiresAt || 0);
  if (!value) {
    return false;
  }
  return value <= Date.now() + 60 * 1000;
}

async function login(apiBase, site) {
  if (!site.email || !site.password) {
    throw new Sub2ApiError('Email and password are required for automatic login', {
      code: 'NO_PASSWORD_LOGIN',
      needsToken: true
    });
  }

  const data = await requestJson(apiBase, '/auth/login', {
    method: 'POST',
    body: {
      email: site.email,
      password: site.password,
      turnstile_token: site.turnstileToken || ''
    }
  });

  if (data && data.requires_2fa) {
    throw new Sub2ApiError('This site requires 2FA; paste auth_token instead', {
      code: '2FA_REQUIRED',
      requires2fa: true,
      needsToken: true
    });
  }

  if (!data || !data.access_token) {
    throw new Sub2ApiError('Login response did not include access_token', {
      code: 'LOGIN_NO_TOKEN',
      needsToken: true
    });
  }

  return {
    authToken: data.access_token,
    refreshToken: data.refresh_token || site.refreshToken || '',
    tokenExpiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : site.tokenExpiresAt || ''
  };
}

async function refreshToken(apiBase, site) {
  if (!site.refreshToken) {
    throw new Sub2ApiError('No refresh token saved', {
      code: 'NO_REFRESH_TOKEN',
      needsToken: true
    });
  }

  const data = await requestJson(apiBase, '/auth/refresh', {
    method: 'POST',
    body: { refresh_token: site.refreshToken }
  });

  if (!data || !data.access_token) {
    throw new Sub2ApiError('Refresh response did not include access_token', {
      code: 'REFRESH_NO_TOKEN',
      needsToken: true
    });
  }

  return {
    authToken: data.access_token,
    refreshToken: data.refresh_token || site.refreshToken,
    tokenExpiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : site.tokenExpiresAt || ''
  };
}

async function resolveToken(apiBase, site) {
  const updated = {};

  if (site.authToken && !tokenExpiresSoon(site.tokenExpiresAt)) {
    return { token: site.authToken, updated };
  }

  if (site.refreshToken) {
    try {
      const tokens = await refreshToken(apiBase, site);
      Object.assign(updated, tokens);
      return { token: tokens.authToken, updated };
    } catch (error) {
      if (!(error instanceof Sub2ApiError)) {
        throw error;
      }
    }
  }

  if (site.email && site.password) {
    const tokens = await login(apiBase, site);
    Object.assign(updated, tokens);
    return { token: tokens.authToken, updated };
  }

  if (site.authToken) {
    return { token: site.authToken, updated };
  }

  throw new Sub2ApiError('No usable token or login credentials configured', {
    code: 'NO_AUTH_METHOD',
    needsToken: true
  });
}

function asRateMap(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value;
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBooleanFlag(value) {
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0 || value === null || value === undefined || value === '') {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'unlimited', 'infinite'].includes(normalized);
}

function hasUnlimitedQuota(row, directQuota) {
  const flag = firstValue(
    row && row.unlimited_quota,
    row && row.unlimitedQuota,
    row && row.is_unlimited,
    row && row.isUnlimited,
    row && row.unlimited
  );
  const rawQuota = firstValue(
    row && row.quota,
    row && row.total_quota,
    row && row.totalQuota,
    row && row.total,
    row && row.quota_limit,
    row && row.quotaLimit,
    row && row.limit
  );
  const quotaText = String(rawQuota || '').trim().toLowerCase();
  return toBooleanFlag(flag) ||
    (directQuota !== null && directQuota < 0) ||
    ['unlimited', 'infinite', 'inf'].includes(quotaText);
}

function toPositiveNumber(value) {
  const number = toFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function toIsoDate(value) {
  const number = toFiniteNumber(value);
  if (number !== null && number > 0) {
    const millis = number > 1000000000000 ? number : number * 1000;
    return new Date(millis).toISOString();
  }

  if (!value) {
    return '';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

async function listAllKeys(apiBase, token) {
  const all = [];
  let page = 1;
  let pages = 1;
  const pageSize = 100;

  do {
    const data = await requestJson(apiBase, '/keys', {
      token,
      query: {
        page,
        page_size: pageSize,
        sort_by: 'created_at',
        sort_order: 'desc'
      }
    });

    const items = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : [];
    all.push(...items);
    pages = data && Number(data.pages) ? Number(data.pages) : page >= 1 ? page : 1;
    page += 1;
  } while (page <= pages && page <= 50);

  return all;
}

async function listGroupsDirectory(apiBase, token) {
  const fallbacks = [];

  try {
    const adminGroups = await requestJson(apiBase, '/admin/groups/all', {
      token,
      query: { include_inactive: 'true' }
    });
    if (Array.isArray(adminGroups)) {
      return { groups: adminGroups, source: 'admin' };
    }
  } catch (error) {
    fallbacks.push(serializeError(error));
  }

  try {
    const userGroups = await requestJson(apiBase, '/groups/available', { token });
    if (Array.isArray(userGroups)) {
      return { groups: userGroups, source: 'available', fallbacks };
    }
  } catch (error) {
    fallbacks.push(serializeError(error));
  }

  return { groups: [], source: 'derived', fallbacks };
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

async function listChannelMonitors(apiBase, token) {
  try {
    const data = await requestJson(apiBase, '/channel-monitors', { token });
    return data && Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    if (error instanceof Sub2ApiError && (error.status === 404 || error.status === 403)) {
      return [];
    }
    throw error;
  }
}

async function listChannelMonitorDetails(apiBase, token, monitors) {
  return mapLimit(monitors || [], 6, async (monitor) => {
    try {
      return await requestJson(apiBase, `/channel-monitors/${monitor.id}/status`, { token });
    } catch (error) {
      return {
        id: monitor.id,
        name: monitor.name,
        provider: monitor.provider,
        group_name: monitor.group_name,
        models: [],
        error: serializeError(error)
      };
    }
  });
}

function maskKey(key) {
  const value = String(key || '');
  if (value.length <= 10) {
    return value ? `${value.slice(0, 2)}***` : '';
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function openAiCompatibleChatUrl(site) {
  const webBase = normalizeWebBase(site);
  return new URL('/v1/chat/completions', webBase).toString();
}

function shortErrorMessage(error) {
  const message = error && error.message ? String(error.message) : String(error || '请求失败');
  return message.length > 140 ? `${message.slice(0, 140)}...` : message;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function keyRowsWithApiKeys(payload) {
  const rows = Array.isArray(payload && payload.keyRows)
    ? payload.keyRows
    : Array.isArray(payload && payload.rows)
      ? payload.rows
      : [];
  return rows.filter((row) => row && typeof row.apiKey === 'string' && row.apiKey.trim());
}

function modelNamesFromMonitor(row) {
  const names = [];
  if (row && row.primaryModel) {
    names.push(row.primaryModel);
  }
  for (const item of row && Array.isArray(row.models) ? row.models : []) {
    const name = firstValue(item.model, item.name, item.id);
    if (name) {
      names.push(name);
    }
  }
  return names.map((name) => String(name || '').trim()).filter(Boolean);
}

function buildSpeedTestModelHints(payload) {
  const monitorRows = Array.isArray(payload && payload.monitorRows) ? payload.monitorRows : [];
  const hints = {
    byGroupPlatform: new Map(),
    byGroup: new Map(),
    byPlatform: new Map(),
    first: ''
  };

  for (const row of monitorRows) {
    const model = modelNamesFromMonitor(row)[0];
    if (!model) {
      continue;
    }
    if (!hints.first) {
      hints.first = model;
    }
    const group = normalizeText(row.groupName);
    const platform = normalizeText(row.provider || row.platform);
    if (group && platform) {
      hints.byGroupPlatform.set(`${group}|${platform}`, model);
    }
    if (group && !hints.byGroup.has(group)) {
      hints.byGroup.set(group, model);
    }
    if (platform && !hints.byPlatform.has(platform)) {
      hints.byPlatform.set(platform, model);
    }
  }

  return hints;
}

function fallbackSpeedTestModel(row) {
  const platform = normalizeText(row && row.platform);
  const groupName = normalizeText(row && row.groupName);
  const text = `${platform} ${groupName}`;
  if (text.includes('claude') || text.includes('anthropic')) {
    return 'claude-3-5-haiku-20241022';
  }
  if (text.includes('gemini') || text.includes('google')) {
    return 'gemini-1.5-flash';
  }
  if (text.includes('deepseek')) {
    return 'deepseek-chat';
  }
  return 'gpt-4o-mini';
}

function selectSpeedTestModel(site, row, hints, options = {}) {
  const explicit = firstValue(options.model, row && row.testModel, site && site.speedTestModel);
  if (explicit) {
    return String(explicit).trim();
  }

  const group = normalizeText(row && row.groupName);
  const platform = normalizeText(row && row.platform);
  if (group && platform && hints.byGroupPlatform.has(`${group}|${platform}`)) {
    return hints.byGroupPlatform.get(`${group}|${platform}`);
  }
  if (group && hints.byGroup.has(group)) {
    return hints.byGroup.get(group);
  }
  if (platform && hints.byPlatform.has(platform)) {
    return hints.byPlatform.get(platform);
  }
  return hints.first || fallbackSpeedTestModel(row);
}

function buildChatSpeedTestBody(model) {
  return {
    model,
    messages: [
      { role: 'user', content: 'hi' }
    ],
    max_tokens: 8,
    stream: false
  };
}

async function readResponseText(response) {
  const text = await response.text();
  return text.length > 16000 ? `${text.slice(0, 16000)}...` : text;
}

function parseJsonMaybe(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractChatResponseText(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  const message = choice && choice.message ? choice.message : null;
  const content = message ? message.content : null;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? firstValue(item.text, item.content)
          : '')
      .filter(Boolean)
      .join('')
      .trim();
  }
  return String(firstValue(payload.output_text, payload.text) || '').trim();
}

function extractResponseError(payload, fallback) {
  if (payload && typeof payload === 'object') {
    const error = payload.error;
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object') {
      return String(firstValue(error.message, error.reason, error.code) || fallback);
    }
    return String(firstValue(payload.message, payload.reason, payload.code) || fallback);
  }
  return fallback;
}

async function speedTestKeyRow(site, row, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 8000);
  const url = openAiCompatibleChatUrl(site);
  const model = selectSpeedTestModel(site, row, options.modelHints || buildSpeedTestModelHints(options.payload), options);
  const body = buildChatSpeedTestBody(model);
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${row.apiKey}`
      },
      body: JSON.stringify(body)
    }, timeoutMs);
    const latencyMs = Date.now() - startedAt;
    const responseText = await readResponseText(response);
    const payload = parseJsonMaybe(responseText);
    const reply = extractChatResponseText(payload);
    const ok = response.ok && reply.length > 0;
    const message = ok
      ? '模型已响应'
      : response.ok
        ? 'HTTP 2xx 但模型回复为空'
        : extractResponseError(payload, `HTTP ${response.status}`);
    return {
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      provider: normalizeSiteProvider(site),
      keyId: row.keyId,
      keyName: row.keyName || '',
      keyMasked: row.keyMasked || maskKey(row.apiKey),
      groupId: row.groupId ?? null,
      groupName: row.groupName || '',
      platform: row.platform || '',
      model,
      status: ok ? 'ok' : 'failed',
      ok,
      httpStatus: response.status,
      latencyMs,
      message,
      responseText: reply ? shortErrorMessage(reply) : '',
      testedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      provider: normalizeSiteProvider(site),
      keyId: row.keyId,
      keyName: row.keyName || '',
      keyMasked: row.keyMasked || maskKey(row.apiKey),
      groupId: row.groupId ?? null,
      groupName: row.groupName || '',
      platform: row.platform || '',
      model,
      status: 'failed',
      ok: false,
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      message: shortErrorMessage(error),
      testedAt: new Date().toISOString()
    };
  }
}

async function speedTestSite(inputSite, options = {}) {
  const site = { ...inputSite };
  const payload = options.payload || await querySite(site);
  const rows = keyRowsWithApiKeys(payload);
  const limit = Math.max(1, Math.min(Number(options.concurrency || 4), 8));
  const testedAt = new Date().toISOString();
  const modelHints = buildSpeedTestModelHints(payload);

  if (rows.length === 0) {
    return {
      ok: false,
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      provider: normalizeSiteProvider(site),
      testedAt,
      summary: {
        total: 0,
        ok: 0,
        failed: 0,
        fastestLatencyMs: null,
        averageLatencyMs: null
      },
      rows: [],
      error: {
        name: 'Sub2ApiError',
        message: '没有可测速的 API Key',
        status: 0,
        code: 'NO_API_KEYS'
      }
    };
  }

  const results = await mapLimit(rows, limit, (row) => speedTestKeyRow(site, row, {
    ...options,
    payload,
    modelHints
  }));
  const okRows = results.filter((row) => row.ok);
  const fastestLatencyMs = okRows.length
    ? Math.min(...okRows.map((row) => row.latencyMs))
    : null;
  const averageLatencyMs = okRows.length
    ? okRows.reduce((sum, row) => sum + row.latencyMs, 0) / okRows.length
    : null;

  return {
    ok: okRows.length > 0,
    siteId: site.id,
    siteName: site.name || site.baseUrl,
    baseUrl: site.baseUrl,
    provider: normalizeSiteProvider(site),
    testedAt,
    summary: {
      total: results.length,
      ok: okRows.length,
      failed: results.length - okRows.length,
      fastestLatencyMs,
      averageLatencyMs
    },
    rows: results
  };
}

function buildRows(site, keys, groups, rates) {
  const groupMap = new Map();
  for (const group of groups || []) {
    groupMap.set(Number(group.id), group);
  }

  return (keys || []).map((key) => {
    const groupId = key.group_id ?? (key.group && key.group.id) ?? null;
    const group = key.group || (groupId === null ? null : groupMap.get(Number(groupId))) || null;
    const customRate = groupId === null ? undefined : rates[String(groupId)] ?? rates[Number(groupId)];
    const defaultRate = group && group.rate_multiplier !== undefined ? Number(group.rate_multiplier) : null;
    const effectiveRate = customRate !== undefined && customRate !== null ? Number(customRate) : defaultRate;
    const quotaUsed = toFiniteNumber(firstValue(
      key.quota_used,
      key.quotaUsed,
      key.used_quota,
      key.usedQuota,
      key.used_amount,
      key.usedAmount,
      key.used_tokens,
      key.usedTokens,
      key.consumed_quota,
      key.consumedQuota,
      key.used
    ));
    const quotaRemaining = toFiniteNumber(firstValue(
      key.remain_quota,
      key.remainQuota,
      key.remain,
      key.remaining_quota,
      key.remainingQuota,
      key.remaining,
      key.quota_remaining,
      key.quotaRemaining,
      key.remained_quota,
      key.available_quota,
      key.availableQuota,
      key.available,
      key.left_quota,
      key.leftQuota,
      key.quota_left,
      key.quotaLeft,
      key.balance
    ));
    const directQuota = toFiniteNumber(firstValue(
      key.quota,
      key.total_quota,
      key.totalQuota,
      key.total,
      key.quota_limit,
      key.quotaLimit,
      key.limit,
      key.amount,
      key.total_amount,
      key.totalAmount
    ));
    const unlimitedQuota = hasUnlimitedQuota(key, directQuota);
    const quota = unlimitedQuota
      ? null
      : directQuota !== null
        ? directQuota
        : quotaUsed !== null && quotaRemaining !== null
          ? quotaUsed + quotaRemaining
          : null;

    return {
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      keyId: key.id,
      keyName: key.name || '',
      keyMasked: maskKey(key.key),
      apiKey: key.key || '',
      keyStatus: key.status || '',
      groupId,
      groupName: group ? group.name : '',
      platform: group ? group.platform : '',
      defaultRate,
      customRate: customRate === undefined || customRate === null ? null : Number(customRate),
      effectiveRate,
      quota,
      quotaUsed,
      quotaRemaining,
      unlimitedQuota,
      expiresAt: key.expires_at || '',
      lastUsedAt: key.last_used_at || ''
    };
  });
}

function buildMonitorRows(site, monitors, monitorDetails) {
  const detailMap = new Map();
  for (const detail of monitorDetails || []) {
    if (detail && detail.id !== undefined) {
      detailMap.set(Number(detail.id), detail);
    }
  }

  return (monitors || []).map((monitor) => {
    const detail = detailMap.get(Number(monitor.id));
    const models = detail && Array.isArray(detail.models) && detail.models.length > 0
      ? detail.models
      : [
          {
            model: monitor.primary_model,
            latest_status: monitor.primary_status,
            latest_latency_ms: monitor.primary_latency_ms,
            availability_7d: monitor.availability_7d
          },
          ...((monitor.extra_models || []).map((item) => ({
            model: item.model,
            latest_status: item.status,
            latest_latency_ms: item.latency_ms,
            availability_7d: null
          })))
        ].filter((item) => item.model);

    const latestPoint = Array.isArray(monitor.timeline) && monitor.timeline.length > 0
      ? monitor.timeline[0]
      : null;

    return {
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      monitorId: monitor.id,
      name: monitor.name || '',
      provider: monitor.provider || '',
      groupName: monitor.group_name || '',
      primaryModel: monitor.primary_model || '',
      primaryStatus: monitor.primary_status || '',
      primaryLatencyMs: monitor.primary_latency_ms ?? null,
      primaryPingLatencyMs: monitor.primary_ping_latency_ms ?? null,
      availability7d: monitor.availability_7d ?? null,
      latestCheckedAt: latestPoint ? latestPoint.checked_at : '',
      modelCount: models.length,
      models,
      detailError: detail && detail.error ? detail.error : null
    };
  });
}

async function resolveNewApiToken(apiBase, site) {
  const updated = {};
  if (site.authToken) {
    const token = String(site.authToken || '').trim();
    if (token && !isNewApiRelayToken(token) && !site.newApiUserId) {
      throw new Sub2ApiError('New API AccessToken requires New API User ID; use browser login capture again or fill it manually.', {
        code: 'NEW_API_USER_ID_REQUIRED',
        needsToken: true
      });
    }
    return { token, updated };
  }

  return { token: '', updated };
}

function isNewApiRelayToken(token) {
  return String(token || '').trim().toLowerCase().startsWith('sk-');
}

function newApiRequestOptions(site, token, extra = {}) {
  return {
    ...extra,
    envelope: 'newapi',
    token,
    newApiUserId: site.newApiUserId
  };
}

async function getNewApiPricing(apiBase, site, token) {
  const useUserAuth = token && !isNewApiRelayToken(token) && site.newApiUserId;
  try {
    return await requestJson(
      apiBase,
      '/pricing',
      useUserAuth
        ? newApiRequestOptions(site, token, { keepEnvelope: true })
        : { envelope: 'newapi', keepEnvelope: true }
    );
  } catch (error) {
    if (error instanceof Sub2ApiError && error.code !== 'NETWORK_ERROR' && error.code !== 'NON_JSON_RESPONSE') {
      return {
        success: true,
        data: [],
        group_ratio: {},
        usable_group: {},
        pricingAuthError: serializeError(new Sub2ApiError(
          'New API pricing requires login; capture AccessToken with New API User ID to load group rates.',
          {
            status: error.status,
            code: 'NEW_API_PRICING_AUTH_REQUIRED',
            needsToken: true,
            metadata: error.metadata
          }
        ))
      };
    }
    throw error;
  }
}

async function getNewApiGroupDirectory(apiBase, site, token) {
  const fallbacks = [];

  if (token && !isNewApiRelayToken(token) && site.newApiUserId) {
    try {
      const groups = await requestJson(apiBase, '/user/self/groups', newApiRequestOptions(site, token));
      if (groups && typeof groups === 'object') {
        return { groups, source: 'newapi-user-groups', fallbacks };
      }
    } catch (error) {
      fallbacks.push(serializeError(error));
    }
  }

  try {
    const groups = await requestJson(apiBase, '/user/groups', { envelope: 'newapi' });
    if (groups && typeof groups === 'object') {
      return { groups, source: 'newapi-public-groups', fallbacks };
    }
  } catch (error) {
    fallbacks.push(serializeError(error));
  }

  return { groups: null, source: 'newapi-pricing', fallbacks };
}

async function getNewApiProfile(apiBase, site, token) {
  if (!token || isNewApiRelayToken(token)) {
    return null;
  }

  try {
    return await requestJson(apiBase, '/user/self', newApiRequestOptions(site, token));
  } catch {
    return null;
  }
}

function newApiTokenId(token) {
  return firstValue(token && token.id, token && token.token_id, token && token.tokenId);
}

function newApiNumericTokenId(token) {
  const id = toFiniteNumber(newApiTokenId(token));
  return id !== null && Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeNewApiTokenKeyMap(payload) {
  const sources = [
    payload && payload.keys,
    payload && payload.data && payload.data.keys,
    payload
  ];

  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      continue;
    }
    const entries = Object.entries(source)
      .filter(([, value]) => typeof value === 'string' && value.trim());
    if (entries.length > 0) {
      return new Map(entries.map(([id, key]) => [String(id), key]));
    }
  }

  return new Map();
}

function extractNewApiTokenKey(payload) {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    return firstValue(
      payload.key,
      payload.token,
      payload.value,
      payload.api_key,
      payload.apiKey,
      payload.data && payload.data.key
    );
  }
  return '';
}

async function fetchNewApiTokenKeysBatch(apiBase, site, token, ids) {
  const data = await requestJson(apiBase, '/token/batch/keys', newApiRequestOptions(site, token, {
    method: 'POST',
    body: { ids }
  }));
  return normalizeNewApiTokenKeyMap(data);
}

async function fetchNewApiTokenKey(apiBase, site, token, id) {
  const data = await requestJson(
    apiBase,
    `/token/${encodeURIComponent(String(id))}/key`,
    newApiRequestOptions(site, token, { method: 'POST' })
  );
  return extractNewApiTokenKey(data);
}

async function hydrateNewApiTokenKeys(apiBase, site, token, tokens) {
  const rows = Array.isArray(tokens) ? tokens : [];
  const fallbacks = [];
  const ids = [...new Set(rows.map(newApiNumericTokenId).filter((id) => id !== null))];
  const keyMap = new Map();

  if (ids.length === 0) {
    return { tokens: rows, fallbacks };
  }

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    try {
      const chunkMap = await fetchNewApiTokenKeysBatch(apiBase, site, token, chunk);
      for (const [id, key] of chunkMap.entries()) {
        keyMap.set(String(id), key);
      }
    } catch (error) {
      fallbacks.push(serializeError(error));
    }
  }

  const missing = rows.filter((row) => {
    const id = newApiNumericTokenId(row);
    return id !== null && !keyMap.has(String(id));
  });
  if (missing.length > 0) {
    const singleResults = await mapLimit(missing, 6, async (row) => {
      const id = newApiNumericTokenId(row);
      try {
        return { id, key: await fetchNewApiTokenKey(apiBase, site, token, id) };
      } catch (error) {
        return { id, error };
      }
    });
    for (const result of singleResults) {
      if (result && result.key) {
        keyMap.set(String(result.id), result.key);
      } else if (result && result.error) {
        const fallback = serializeError(result.error);
        fallback.metadata = { ...(fallback.metadata || {}), tokenId: result.id };
        fallbacks.push(fallback);
      }
    }
  }

  if (keyMap.size === 0) {
    return { tokens: rows, fallbacks };
  }

  return {
    tokens: rows.map((row) => {
      const id = newApiNumericTokenId(row);
      const key = id === null ? '' : keyMap.get(String(id));
      return key
        ? { ...row, key, token: key, real_key: key, full_key: key }
        : row;
    }),
    fallbacks
  };
}

async function listNewApiTokens(apiBase, site, token) {
  if (!token || isNewApiRelayToken(token)) {
    return { tokens: [], fallbacks: [] };
  }

  const all = [];
  let page = 1;
  const pageSize = 100;

  do {
    const data = await requestJson(apiBase, '/token/', newApiRequestOptions(site, token, {
      query: { p: page, page, page_size: pageSize, size: pageSize }
    }));
    const items = Array.isArray(data)
      ? data
      : data && Array.isArray(data.items)
        ? data.items
        : data && Array.isArray(data.tokens)
          ? data.tokens
          : data && Array.isArray(data.list)
            ? data.list
            : [];
    all.push(...items);

    const total = toFiniteNumber(data && (data.total || data.count || data.total_count));
    if (total !== null && all.length >= total) {
      break;
    }
    if (items.length < pageSize) {
      break;
    }
    page += 1;
  } while (page <= 50);

  return hydrateNewApiTokenKeys(apiBase, site, token, all);
}

async function getNewApiTokenUsage(apiBase, site, token) {
  if (!token || !isNewApiRelayToken(token)) {
    return null;
  }

  try {
    return await requestJson(apiBase, '/usage/token/', newApiRequestOptions(site, token));
  } catch {
    return null;
  }
}

function pricingGroupDescription(pricing, groupName) {
  const usable = pricing && pricing.usable_group;
  if (!usable) {
    return '';
  }
  if (Array.isArray(usable)) {
    return usable.includes(groupName) ? '可用分组' : '';
  }
  const value = usable[groupName];
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    return String(firstValue(value.desc, value.description, value.name, value.label) || '');
  }
  return value ? String(value) : '';
}

function addNewApiGroup(groupMap, name, details = {}) {
  const groupName = String(name || '').trim();
  if (!groupName) {
    return;
  }
  const key = normalizeText(groupName);
  const existing = groupMap.get(key) || {
    id: groupName,
    name: groupName,
    platform: 'new-api',
    status: '',
    rate_multiplier: null
  };

  const rate = toPositiveNumber(firstValue(
    details.rate_multiplier,
    details.rateMultiplier,
    details.ratio,
    details.rate,
    details.multiplier,
    details.value
  ));
  if (rate !== null) {
    existing.rate_multiplier = rate;
  }

  const description = firstValue(details.desc, details.description, details.label, details.status);
  if (description && !existing.status) {
    existing.status = String(description);
  }

  groupMap.set(key, existing);
}

function addNewApiGroupsFromPayload(groupMap, payload) {
  if (!payload) {
    return;
  }
  if (Array.isArray(payload)) {
    for (const group of payload) {
      if (typeof group === 'string') {
        addNewApiGroup(groupMap, group);
      } else if (group && typeof group === 'object') {
        addNewApiGroup(groupMap, firstValue(group.id, group.name, group.group, group.group_name), group);
      }
    }
    return;
  }
  if (payload && typeof payload === 'object') {
    for (const [name, value] of Object.entries(payload)) {
      if (value && typeof value === 'object') {
        addNewApiGroup(groupMap, name, value);
      } else {
        addNewApiGroup(groupMap, name, { ratio: value });
      }
    }
  }
}

function normalizeNewApiGroups(pricing, directoryGroups) {
  const groupMap = new Map();
  const ratios = pricing && pricing.group_ratio && typeof pricing.group_ratio === 'object'
    ? pricing.group_ratio
    : {};

  for (const [name, ratio] of Object.entries(ratios)) {
    addNewApiGroup(groupMap, name, {
      ratio,
      desc: pricingGroupDescription(pricing, name)
    });
  }

  const usable = pricing && pricing.usable_group;
  if (Array.isArray(usable)) {
    for (const name of usable) {
      addNewApiGroup(groupMap, name, { desc: pricingGroupDescription(pricing, name) });
    }
  } else if (usable && typeof usable === 'object') {
    for (const [name, value] of Object.entries(usable)) {
      addNewApiGroup(groupMap, name, typeof value === 'object' ? value : { desc: value });
    }
  }

  addNewApiGroupsFromPayload(groupMap, directoryGroups);

  return [...groupMap.values()].filter((group) => toPositiveNumber(group.rate_multiplier) !== null);
}

function normalizeNewApiStatus(value) {
  if (value === 1 || value === true || value === '1' || value === 'enabled' || value === 'active') {
    return 'active';
  }
  if (value === 0 || value === false || value === '0' || value === 'disabled') {
    return 'disabled';
  }
  return value === undefined || value === null || value === '' ? '' : String(value);
}

function groupNameFromNewApiValue(value) {
  if (Array.isArray(value)) {
    return value.find((item) => String(item || '').trim()) || '';
  }
  if (value && typeof value === 'object') {
    return firstValue(value.id, value.name, value.group, value.group_name, value.groupName) || '';
  }
  return firstValue(value) || '';
}

function buildNewApiRows(site, tokens, groups, profile) {
  const groupMap = new Map();
  for (const group of groups || []) {
    groupMap.set(normalizeText(group.id), group);
    groupMap.set(normalizeText(group.name), group);
  }

  const profileGroup = groupNameFromNewApiValue(firstValue(
    profile && profile.group,
    profile && profile.group_name,
    profile && profile.groupName,
    profile && profile.user && profile.user.group
  ));

  return (tokens || []).map((token) => {
    const rawGroup = firstValue(
      token.group,
      token.group_name,
      token.groupName,
      token.group_id,
      token.groupId,
      token.user_group,
      token.userGroup,
      profileGroup
    );
    const groupName = groupNameFromNewApiValue(rawGroup);
    const group = groupName ? groupMap.get(normalizeText(groupName)) || null : null;
    const rate = group ? toPositiveNumber(group.rate_multiplier) : null;
    const usedQuota = toFiniteNumber(firstValue(
      token.used_quota,
      token.usedQuota,
      token.used_amount,
      token.usedAmount,
      token.used_tokens,
      token.usedTokens,
      token.consumed_quota,
      token.consumedQuota,
      token.used
    ));
    const remainQuota = toFiniteNumber(firstValue(
      token.remain_quota,
      token.remainQuota,
      token.remained_quota,
      token.remaining_quota,
      token.remainingQuota,
      token.remaining,
      token.remain,
      token.available_quota,
      token.availableQuota,
      token.available,
      token.left_quota,
      token.leftQuota,
      token.quota_left,
      token.quotaLeft,
      token.balance
    ));
    const directQuota = toFiniteNumber(firstValue(
      token.quota,
      token.total_quota,
      token.totalQuota,
      token.total,
      token.quota_limit,
      token.quotaLimit,
      token.limit,
      token.amount,
      token.total_amount,
      token.totalAmount
    ));
    const unlimitedQuota = hasUnlimitedQuota(token, directQuota);
    const quota = unlimitedQuota
      ? null
      : directQuota !== null
        ? directQuota
        : usedQuota !== null && remainQuota !== null
          ? usedQuota + remainQuota
          : null;

    return {
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      keyId: firstValue(token.id, token.token_id, token.tokenId),
      keyName: firstValue(token.name, token.token_name, token.tokenName) || '',
      keyMasked: maskKey(firstValue(token.key, token.token, token.value)),
      apiKey: firstValue(token.key, token.token, token.value) || '',
      keyStatus: normalizeNewApiStatus(firstValue(token.status, token.enabled)),
      groupId: group ? group.id : groupName || null,
      groupName: group ? group.name : groupName,
      platform: 'new-api',
      defaultRate: rate,
      customRate: null,
      effectiveRate: rate,
      quota,
      quotaUsed: usedQuota,
      quotaRemaining: remainQuota,
      unlimitedQuota,
      expiresAt: toIsoDate(firstValue(token.expired_time, token.expires_at, token.expiredAt)),
      lastUsedAt: toIsoDate(firstValue(token.accessed_time, token.last_used_at, token.lastUsedAt))
    };
  });
}

function buildNewApiUsageRow(site, usage, groups, token) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const groupName = groupNameFromNewApiValue(firstValue(
    usage.group,
    usage.group_name,
    usage.groupName,
    usage.token_group,
    usage.tokenGroup
  ));
  const group = groupName
    ? groups.find((item) => normalizeText(item.id) === normalizeText(groupName) || normalizeText(item.name) === normalizeText(groupName))
    : groups.length === 1
      ? groups[0]
      : null;
  const rate = group ? toPositiveNumber(group.rate_multiplier) : null;
  const totalGranted = toFiniteNumber(firstValue(
    usage.total_granted,
    usage.totalGranted,
    usage.quota,
    usage.total_quota,
    usage.totalQuota,
    usage.total,
    usage.quota_limit,
    usage.quotaLimit,
    usage.limit,
    usage.amount,
    usage.total_amount,
    usage.totalAmount
  ));
  const totalAvailable = toFiniteNumber(firstValue(
    usage.total_available,
    usage.totalAvailable,
    usage.remain_quota,
    usage.remainQuota,
    usage.remained_quota,
    usage.remaining_quota,
    usage.remainingQuota,
    usage.remaining,
    usage.remain,
    usage.available_quota,
    usage.availableQuota,
    usage.available,
    usage.left_quota,
    usage.leftQuota,
    usage.quota_left,
    usage.quotaLeft,
    usage.balance
  ));
  const totalUsed = toFiniteNumber(firstValue(
    usage.total_used,
    usage.totalUsed,
    usage.used_quota,
    usage.usedQuota,
    usage.used_amount,
    usage.usedAmount,
    usage.used_tokens,
    usage.usedTokens,
    usage.consumed_quota,
    usage.consumedQuota,
    usage.used
  ));
  const unlimitedQuota = hasUnlimitedQuota(usage, totalGranted);
  const quota = unlimitedQuota
    ? null
    : totalGranted !== null
      ? totalGranted
      : totalAvailable !== null && totalUsed !== null
        ? totalAvailable + totalUsed
        : null;

  return {
    siteId: site.id,
    siteName: site.name || site.baseUrl,
    baseUrl: site.baseUrl,
    keyId: firstValue(usage.id, usage.token_id, usage.tokenId) || 'current',
    keyName: firstValue(usage.name, usage.token_name, usage.tokenName) || '当前 API Key',
    keyMasked: maskKey(token),
    apiKey: token || '',
    keyStatus: normalizeNewApiStatus(firstValue(usage.status, usage.enabled, 'active')),
    groupId: group ? group.id : groupName || null,
    groupName: group ? group.name : groupName,
    platform: 'new-api',
    defaultRate: rate,
    customRate: null,
    effectiveRate: rate,
    quota,
    quotaUsed: totalUsed,
    quotaRemaining: totalAvailable,
    unlimitedQuota,
    expiresAt: toIsoDate(firstValue(usage.expires_at, usage.expiresAt)),
    lastUsedAt: ''
  };
}

async function queryNewApiSite(inputSite) {
  const site = { ...inputSite, provider: 'newapi' };
  const apiBase = normalizeNewApiBase(site.baseUrl);
  const { token, updated } = await resolveNewApiToken(apiBase, site);
  if (updated.newApiUserId && !site.newApiUserId) {
    site.newApiUserId = updated.newApiUserId;
  }

  const fallbacks = [];
  const [pricing, groupDirectory, profile] = await Promise.all([
    getNewApiPricing(apiBase, site, token),
    getNewApiGroupDirectory(apiBase, site, token),
    getNewApiProfile(apiBase, site, token)
  ]);
  fallbacks.push(...(groupDirectory.fallbacks || []));
  if (pricing && pricing.pricingAuthError) {
    fallbacks.push(pricing.pricingAuthError);
  }

  let keys = [];
  let tokenUsage = null;
  if (token) {
    if (isNewApiRelayToken(token)) {
      tokenUsage = await getNewApiTokenUsage(apiBase, site, token);
      if (!tokenUsage) {
        fallbacks.push({
          name: 'Sub2ApiError',
          message: 'New API API Key can only query pricing; use AccessToken and New API User ID to list all tokens.',
          status: 0,
          code: 'NEW_API_RELAY_TOKEN_LIMITED'
        });
      }
    } else {
      try {
        const tokenResult = await listNewApiTokens(apiBase, site, token);
        keys = tokenResult.tokens;
        fallbacks.push(...(tokenResult.fallbacks || []));
      } catch (error) {
        fallbacks.push(serializeError(error));
      }
    }
  }

  const normalizedGroups = normalizeNewApiGroups(pricing, groupDirectory.groups);
  const rateMap = Object.fromEntries(
    normalizedGroups.map((group) => [group.id, group.rate_multiplier])
  );
  const usageRow = buildNewApiUsageRow(site, tokenUsage, normalizedGroups, token);
  const keyRows = usageRow ? [usageRow] : buildNewApiRows(site, keys, normalizedGroups, profile);

  return {
    siteId: site.id,
    siteName: site.name || site.baseUrl,
    baseUrl: site.baseUrl,
    apiBase,
    provider: 'newapi',
    status: 'ok',
    groups: normalizedGroups,
    groupSource: groupDirectory.source || 'newapi-pricing',
    groupFetchFallbacks: fallbacks,
    rates: rateMap,
    keys,
    monitors: [],
    monitorDetails: [],
    rows: keyRows,
    keyRows,
    monitorRows: [],
    updatedTokens: updated
  };
}

async function querySub2ApiSite(inputSite) {
  const site = { ...inputSite };
  const apiBase = normalizeApiBase(site.baseUrl);
  const { token, updated } = await resolveToken(apiBase, site);

  async function queryPayload(activeToken) {
    const [groupDirectory, rates, keys, monitors] = await Promise.all([
      listGroupsDirectory(apiBase, activeToken),
      requestJson(apiBase, '/groups/rates', { token: activeToken }).catch((error) => {
        if (error instanceof Sub2ApiError && (error.status === 404 || error.status === 403)) {
          return {};
        }
        throw error;
      }),
      listAllKeys(apiBase, activeToken),
      listChannelMonitors(apiBase, activeToken)
    ]);
    const monitorDetails = await listChannelMonitorDetails(apiBase, activeToken, monitors);

    const normalizedGroups = Array.isArray(groupDirectory.groups) ? groupDirectory.groups : [];
    const rateMap = asRateMap(rates);
    const keyRows = buildRows(site, keys, normalizedGroups, rateMap);
    const monitorRows = buildMonitorRows(site, monitors, monitorDetails);
    return {
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      apiBase,
      provider: 'sub2api',
      status: 'ok',
      groups: normalizedGroups,
      groupSource: groupDirectory.source,
      groupFetchFallbacks: groupDirectory.fallbacks || [],
      rates: rateMap,
      keys,
      monitors,
      monitorDetails,
      rows: keyRows,
      keyRows,
      monitorRows,
      updatedTokens: updated
    };
  }

  try {
    return await queryPayload(token);
  } catch (error) {
    if (error instanceof Sub2ApiError && error.status === 401 && site.refreshToken) {
      const tokens = await refreshToken(apiBase, site);
      Object.assign(updated, tokens);
      return await queryPayload(tokens.authToken);
    }
    throw error;
  }
}

async function querySite(inputSite) {
  return normalizeSiteProvider(inputSite) === 'newapi'
    ? queryNewApiSite(inputSite)
    : querySub2ApiSite(inputSite);
}

function serializeError(error) {
  if (error instanceof Sub2ApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      code: error.code,
      reason: error.reason,
      metadata: error.metadata,
      needsToken: error.needsToken,
      requires2fa: error.requires2fa
    };
  }

  return {
    name: error && error.name ? error.name : 'Error',
    message: error && error.message ? error.message : String(error),
    status: 0,
    code: 'UNKNOWN'
  };
}

module.exports = {
  Sub2ApiError,
  normalizeApiBase,
  normalizeNewApiBase,
  normalizeSiteProvider,
  normalizeWebBase,
  login,
  refreshToken,
  querySite,
  speedTestSite,
  serializeError
};
