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

    return {
      siteId: site.id,
      siteName: site.name || site.baseUrl,
      baseUrl: site.baseUrl,
      keyId: key.id,
      keyName: key.name || '',
      keyMasked: maskKey(key.key),
      keyStatus: key.status || '',
      groupId,
      groupName: group ? group.name : '',
      platform: group ? group.platform : '',
      defaultRate,
      customRate: customRate === undefined || customRate === null ? null : Number(customRate),
      effectiveRate,
      quota: key.quota ?? null,
      quotaUsed: key.quota_used ?? null,
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
    return { token: site.authToken, updated };
  }

  return { token: '', updated };
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
  try {
    return await requestJson(apiBase, '/pricing', newApiRequestOptions(site, token, { keepEnvelope: true }));
  } catch (error) {
    if (token && error instanceof Sub2ApiError && error.status === 401) {
      return requestJson(apiBase, '/pricing', { envelope: 'newapi', keepEnvelope: true });
    }
    throw error;
  }
}

async function getNewApiGroupDirectory(apiBase, site, token) {
  const fallbacks = [];

  if (token) {
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
  if (!token) {
    return null;
  }

  try {
    return await requestJson(apiBase, '/user/self', newApiRequestOptions(site, token));
  } catch {
    return null;
  }
}

async function listNewApiTokens(apiBase, site, token) {
  if (!token) {
    return [];
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

  return all;
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
    const usedQuota = toFiniteNumber(firstValue(token.used_quota, token.usedQuota, token.used_amount, token.used));
    const remainQuota = toFiniteNumber(firstValue(token.remain_quota, token.remainQuota, token.remained_quota));
    const directQuota = toFiniteNumber(firstValue(token.quota, token.total_quota, token.totalQuota));
    const quota = token.unlimited_quota || token.unlimitedQuota
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
      keyStatus: normalizeNewApiStatus(firstValue(token.status, token.enabled)),
      groupId: group ? group.id : groupName || null,
      groupName: group ? group.name : groupName,
      platform: 'new-api',
      defaultRate: rate,
      customRate: null,
      effectiveRate: rate,
      quota,
      quotaUsed: usedQuota,
      expiresAt: toIsoDate(firstValue(token.expired_time, token.expires_at, token.expiredAt)),
      lastUsedAt: toIsoDate(firstValue(token.accessed_time, token.last_used_at, token.lastUsedAt))
    };
  });
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

  let keys = [];
  if (token) {
    try {
      keys = await listNewApiTokens(apiBase, site, token);
    } catch (error) {
      fallbacks.push(serializeError(error));
    }
  }

  const normalizedGroups = normalizeNewApiGroups(pricing, groupDirectory.groups);
  const rateMap = Object.fromEntries(
    normalizedGroups.map((group) => [group.id, group.rate_multiplier])
  );
  const keyRows = buildNewApiRows(site, keys, normalizedGroups, profile);

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
  serializeError
};
