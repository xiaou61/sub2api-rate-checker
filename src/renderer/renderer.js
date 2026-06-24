'use strict';

const hasDocument = typeof document !== 'undefined';
const byId = (id) => (hasDocument ? document.getElementById(id) : null);
const SMALL_RATE_FORMATTER = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 12
});

const state = {
  sites: [],
  selectedId: '',
  results: [],
  groupFilter: 'all',
  groupSearch: '',
  groupDropdownOpen: false,
  selectedComparisonKey: ''
};

const elements = {
  storagePath: byId('storagePath'),
  siteList: byId('siteList'),
  siteForm: byId('siteForm'),
  siteId: byId('siteId'),
  name: byId('name'),
  baseUrl: byId('baseUrl'),
  provider: byId('provider'),
  newApiUserId: byId('newApiUserId'),
  email: byId('email'),
  password: byId('password'),
  turnstileToken: byId('turnstileToken'),
  authToken: byId('authToken'),
  refreshToken: byId('refreshToken'),
  notes: byId('notes'),
  newSiteBtn: byId('newSiteBtn'),
  browserLoginBtn: byId('browserLoginBtn'),
  captureTokenBtn: byId('captureTokenBtn'),
  saveSiteBtn: byId('saveSiteBtn'),
  deleteSiteBtn: byId('deleteSiteBtn'),
  querySelectedBtn: byId('querySelectedBtn'),
  queryAllBtn: byId('queryAllBtn'),
  statusBar: byId('statusBar'),
  resultRows: byId('resultRows'),
  failures: byId('failures'),
  summarySites: byId('summarySites'),
  summarySuccess: byId('summarySuccess'),
  summaryFailed: byId('summaryFailed'),
  summaryKeys: byId('summaryKeys'),
  summaryMonitors: byId('summaryMonitors'),
  monitorRows: byId('monitorRows'),
  groupFilterLabel: byId('groupFilterLabel'),
  groupSearch: byId('groupSearch'),
  groupList: byId('groupList'),
  groupCount: byId('groupCount'),
  groupSourceText: byId('groupSourceText'),
  groupDropdownBtn: byId('groupDropdownBtn'),
  groupDropdownMenu: byId('groupDropdownMenu'),
  groupDropdownValue: byId('groupDropdownValue'),
  groupDropdownMeta: byId('groupDropdownMeta'),
  bestOffer: byId('bestOffer'),
  comparisonRows: byId('comparisonRows'),
  comparisonOffers: byId('comparisonOffers'),
  comparisonCount: byId('comparisonCount'),
  siteCount: byId('siteCount'),
  selectedSiteTitle: byId('selectedSiteTitle'),
  selectedSiteMeta: byId('selectedSiteMeta')
};

function setStatus(message, type = '') {
  if (!elements.statusBar) {
    return;
  }
  elements.statusBar.innerHTML = `<span class="status-message">${escapeHtml(message)}</span>`;
  elements.statusBar.className = `status-bar ${type}`.trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function trimFixedNumber(value) {
  return value.replace(/0+$/, '').replace(/\.$/, '');
}

function trimExponentialNumber(value) {
  return value
    .replace(/(\.\d*?[1-9])0+e/i, '$1e')
    .replace(/\.0+e/i, 'e');
}

function formatCompactNumber(number) {
  if (number === 0 || Math.abs(number) >= 0.0001) {
    return trimFixedNumber(Number(number).toFixed(4));
  }

  const formatted = SMALL_RATE_FORMATTER.format(number);
  if (Number(formatted) !== 0) {
    return formatted;
  }

  return trimExponentialNumber(Number(number).toExponential(6));
}

function formatRate(value) {
  const number = toFiniteNumber(value);
  if (number === null) {
    return '';
  }
  return formatCompactNumber(number);
}

function formatDate(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '';
  }
  return `${Number(value).toFixed(1).replace(/\.0$/, '')}%`;
}

function formatLatency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '';
  }
  return `${Math.round(Number(value))} ms`;
}

function selectedSite() {
  return state.sites.find((site) => site.id === state.selectedId) || null;
}

function selectedResult() {
  return state.results.find((result) => result.siteId === state.selectedId) || null;
}

function visibleResults() {
  const result = selectedResult();
  return result ? [result] : [];
}

function clearForm() {
  state.selectedId = '';
  state.groupFilter = 'all';
  state.groupSearch = '';
  state.selectedComparisonKey = '';
  if (elements.groupSearch) {
    elements.groupSearch.value = '';
  }
  elements.siteForm.reset();
  elements.siteId.value = '';
  if (elements.provider) {
    elements.provider.value = 'sub2api';
  }
  if (elements.newApiUserId) {
    elements.newApiUserId.value = '';
  }
  renderSites();
  renderResults();
}

function fillForm(site) {
  state.selectedId = site.id;
  state.groupFilter = 'all';
  state.groupSearch = '';
  state.selectedComparisonKey = '';
  if (elements.groupSearch) {
    elements.groupSearch.value = '';
  }
  elements.siteId.value = site.id || '';
  elements.name.value = site.name || '';
  elements.baseUrl.value = site.baseUrl || '';
  if (elements.provider) {
    elements.provider.value = site.provider || 'sub2api';
  }
  if (elements.newApiUserId) {
    elements.newApiUserId.value = site.newApiUserId || '';
  }
  elements.email.value = site.email || '';
  elements.password.value = site.password || '';
  elements.turnstileToken.value = site.turnstileToken || '';
  elements.authToken.value = site.authToken || '';
  elements.refreshToken.value = site.refreshToken || '';
  elements.notes.value = site.notes || '';
  renderSites();
  renderResults();
}

function readForm() {
  const current = selectedSite();
  const password = elements.password.value.trim();
  const turnstileToken = elements.turnstileToken.value.trim();
  const authToken = elements.authToken.value.trim();
  const refreshToken = elements.refreshToken.value.trim();

  return {
    id: elements.siteId.value || undefined,
    name: elements.name.value,
    baseUrl: elements.baseUrl.value,
    provider: elements.provider ? elements.provider.value : 'sub2api',
    newApiUserId: elements.newApiUserId ? elements.newApiUserId.value.trim() : '',
    email: elements.email.value,
    password: password || (current ? undefined : ''),
    turnstileToken: turnstileToken || (current ? undefined : ''),
    authToken: authToken || (current ? undefined : ''),
    refreshToken: refreshToken || (current ? undefined : ''),
    notes: elements.notes.value
  };
}

function renderSites() {
  if (elements.siteCount) {
    elements.siteCount.textContent = String(state.sites.length);
  }

  if (state.sites.length === 0) {
    elements.siteList.innerHTML = '<div class="empty-state compact"><strong>暂无站点</strong><span>先保存一个中转站。</span></div>';
    return;
  }

  elements.siteList.innerHTML = state.sites
    .map((site) => {
      const active = site.id === state.selectedId ? ' active' : '';
      const hasToken = site.authToken || site.refreshToken ? '<span class="site-badge">token</span>' : '';
      const provider = site.provider === 'newapi' ? 'New API' : 'sub2api';
      return `
        <button class="site-row${active}" data-site-id="${escapeHtml(site.id)}" type="button">
          <span class="site-name">${escapeHtml(site.name || site.baseUrl)}</span>
          <span class="site-badges">
            <span class="site-badge provider ${site.provider === 'newapi' ? 'alt' : ''}">${escapeHtml(provider)}</span>
            ${hasToken}
          </span>
          <span class="site-url">${escapeHtml(site.baseUrl)}</span>
        </button>
      `;
    })
    .join('');

  for (const button of elements.siteList.querySelectorAll('.site-row')) {
    button.addEventListener('click', () => {
      const site = state.sites.find((item) => item.id === button.dataset.siteId);
      if (site) {
        fillForm(site);
      }
    });
  }
}

function renderSummary() {
  const results = state.results;
  const success = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const rows = success.flatMap((result) => (result.keyRows || result.rows || []).filter((row) => rowMatchesGroup(row, state.groupFilter, result)));
  const monitors = success.flatMap((result) => (result.monitorRows || []).filter((row) => rowMatchesGroup(row, state.groupFilter, result)));
  elements.summarySites.textContent = String(results.length);
  elements.summarySuccess.textContent = String(success.length);
  elements.summaryFailed.textContent = String(failed.length);
  elements.summaryKeys.textContent = String(rows.length);
  elements.summaryMonitors.textContent = String(monitors.length);
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

function toPositiveRate(value) {
  const number = toFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatRateValue(value) {
  const number = toPositiveRate(value);
  if (number === null) {
    return '';
  }
  return formatCompactNumber(number);
}

function groupSignature(label, platform) {
  return `${normalizeText(platform)}|${normalizeText(label)}`;
}

function resolveGroupRate(group, result) {
  const direct = toPositiveRate(
    group.rate_multiplier ??
    group.rateMultiplier ??
    group.rate ??
    group.multiplier ??
    group.default_rate ??
    group.defaultRate ??
    group.pricing?.rate_multiplier ??
    group.pricing?.rateMultiplier
  );
  if (direct !== null) {
    return direct;
  }

  const rateMap = result && result.rates ? result.rates : {};
  if (group.id !== null && group.id !== undefined) {
    const byId = toPositiveRate(rateMap[String(group.id)] ?? rateMap[Number(group.id)]);
    if (byId !== null) {
      return byId;
    }
  }

  const byName = toPositiveRate(rateMap[group.name] ?? rateMap[normalizeText(group.name)]);
  return byName;
}

function mergeGroupOption(target, source) {
  const merged = { ...target };
  merged.rate = toPositiveRate(target.rate) ?? toPositiveRate(source.rate);
  const targetRate = toPositiveRate(target.rate);
  const sourceRate = toPositiveRate(source.rate);
  if (targetRate !== null && sourceRate !== null) {
    merged.rate = Math.min(targetRate, sourceRate);
  }
  merged.platform = merged.platform || source.platform || '';
  merged.status = merged.status || source.status || '';
  const aliases = new Set([...(target.aliases || []), ...(source.aliases || [])]);
  aliases.add(normalizeText(target.label));
  aliases.add(normalizeText(source.label));
  if (target.value && String(target.value).startsWith('name:')) {
    aliases.add(normalizeText(String(target.value).slice(5)));
  }
  if (source.value && String(source.value).startsWith('name:')) {
    aliases.add(normalizeText(String(source.value).slice(5)));
  }
  merged.aliases = [...aliases].filter(Boolean);
  return merged;
}

function upsertGroupOption(groupMap, labelIndex, option) {
  const value = String(option.value);
  const labelKey = normalizeText(option.label);
  const signature = groupSignature(option.label, option.platform);
  const existingValue = groupMap.has(value)
    ? value
    : groupMap.has(signature)
      ? signature
      : labelIndex.get(labelKey) || null;

  if (existingValue && groupMap.has(existingValue)) {
    const merged = mergeGroupOption(groupMap.get(existingValue), option);
    groupMap.set(existingValue, merged);
    groupMap.set(signature, merged);
    labelIndex.set(labelKey, existingValue);
    if (value !== existingValue) {
      groupMap.set(value, merged);
    }
    return;
  }

  const normalized = {
    value,
    label: option.label || `#${value}`,
    platform: option.platform || '',
    rate: toPositiveRate(option.rate),
    status: option.status || '',
    aliases: Array.from(new Set([labelKey, normalizeText(option.value), ...(option.aliases || []).map(normalizeText)]))
      .filter(Boolean)
  };

  groupMap.set(value, normalized);
  groupMap.set(signature, normalized);
  if (labelKey) {
    labelIndex.set(labelKey, value);
  }
}

function groupOptionsFromResult(result) {
  const groupMap = new Map();
  const labelIndex = new Map();
  const groups = result && Array.isArray(result.groups) ? result.groups : [];
  const keyRows = result && Array.isArray(result.keyRows) ? result.keyRows : [];
  const monitorRows = result && Array.isArray(result.monitorRows) ? result.monitorRows : [];

  for (const group of groups) {
    const label = group.name || `#${group.id}`;
    upsertGroupOption(groupMap, labelIndex, {
      value: group.id !== undefined && group.id !== null ? String(group.id) : label,
      label,
      platform: group.platform || '',
      rate: resolveGroupRate(group, result),
      status: group.status || '',
      aliases: [group.name, group.group_name, group.groupName]
    });
  }

  for (const row of keyRows) {
    if (row.groupId === null || row.groupId === undefined) {
      continue;
    }
    const label = row.groupName || `#${row.groupId}`;
    upsertGroupOption(groupMap, labelIndex, {
      value: String(row.groupId),
      label,
      platform: row.platform || '',
      rate: toPositiveRate(row.customRate ?? row.defaultRate ?? row.effectiveRate),
      status: row.keyStatus || '',
      aliases: [row.groupName]
    });
  }

  for (const row of monitorRows) {
    if (!row.groupName) {
      continue;
    }
    upsertGroupOption(groupMap, labelIndex, {
      value: `name:${row.groupName}`,
      label: row.groupName,
      platform: row.provider || '',
      rate: toPositiveRate(row.rate ?? row.defaultRate ?? row.primaryRate ?? row.primary_rate),
      status: row.primaryStatus || row.status || '',
      aliases: [row.groupName]
    });
  }

  const options = [];
  const seenOptions = new Set();
  for (const option of groupMap.values()) {
    const optionKey = groupSignature(option.label, option.platform);
    if (seenOptions.has(optionKey)) {
      continue;
    }
    seenOptions.add(optionKey);
    options.push(option);
  }

  const pricedOptions = options.filter((option) => toPositiveRate(option.rate) !== null);

  pricedOptions.sort((a, b) => {
    const rateA = toPositiveRate(a.rate);
    const rateB = toPositiveRate(b.rate);
    if (rateA !== null && rateB !== null && rateA !== rateB) {
      return rateA - rateB;
    }
    if (rateA !== null && rateB === null) {
      return -1;
    }
    if (rateA === null && rateB !== null) {
      return 1;
    }
    const platformCompare = String(a.platform || '').localeCompare(String(b.platform || ''), 'zh-Hans-CN');
    if (platformCompare !== 0) {
      return platformCompare;
    }
    return String(a.label || '').localeCompare(String(b.label || ''), 'zh-Hans-CN');
  });

  return pricedOptions.map((option) => ({
    ...option,
    aliases: Array.from(new Set([...(option.aliases || []), normalizeText(option.label)]))
  }));
}

function groupSourceLabel(result) {
  if (!selectedSite()) {
    return '未选站点';
  }
  if (!result) {
    return '未查询';
  }
  if (!result.ok) {
    return '查询失败';
  }
  if (result.provider === 'newapi') {
    if (result.groupSource === 'newapi-user-groups') {
      return 'New API 用户分组';
    }
    if (result.groupSource === 'newapi-public-groups') {
      return 'New API 公共分组';
    }
    if (result.groupSource === 'newapi-pricing') {
      return 'New API 定价';
    }
  }
  if (result.groupSource === 'admin') {
    return '管理员全量';
  }
  if (result.groupSource === 'available') {
    return '可用分组';
  }
  if (result.groupSource === 'derived') {
    return '从 Key / 监控派生';
  }
  return '未知来源';
}

function rowHasNoGroup(row) {
  const missingId = row.groupId === null || row.groupId === undefined || row.groupId === '';
  return missingId && !row.groupName;
}

function optionMatchesRow(option, row) {
  if (!option || !row) {
    return false;
  }
  if (row.groupId !== null && row.groupId !== undefined && String(row.groupId) === String(option.value)) {
    return true;
  }
  const rowLabel = normalizeText(row.groupName);
  const optionLabel = normalizeText(option.label);
  if (rowLabel && rowLabel === optionLabel) {
    return true;
  }
  return Array.isArray(option.aliases) && option.aliases.some((alias) => normalizeText(alias) === rowLabel);
}

function rowMatchesGroup(row, groupFilter = state.groupFilter, result = selectedResult()) {
  if (groupFilter === 'all') {
    return true;
  }
  if (groupFilter === 'ungrouped') {
    return rowHasNoGroup(row);
  }
  if (row.groupId !== null && row.groupId !== undefined && String(row.groupId) === groupFilter) {
    return true;
  }
  const selectedOption = groupOptionsFromResult(result).find((option) => String(option.value) === String(groupFilter));
  if (selectedOption && optionMatchesRow(selectedOption, row)) {
    return true;
  }
  return groupFilter.startsWith('name:') && normalizeText(row.groupName) === normalizeText(groupFilter.slice(5));
}

function countRowsForFilter(result, groupFilter) {
  if (!result || !result.ok) {
    return { keys: 0, monitors: 0, total: 0 };
  }
  const keyRows = result.keyRows || result.rows || [];
  const monitorRows = result.monitorRows || [];
  const keys = keyRows.filter((row) => rowMatchesGroup(row, groupFilter, result)).length;
  const monitors = monitorRows.filter((row) => rowMatchesGroup(row, groupFilter, result)).length;
  return { keys, monitors, total: keys + monitors };
}

function groupEntryMatchesSearch(entry, query) {
  if (!query) {
    return true;
  }
  const haystack = [
    entry.label,
    entry.platform,
    entry.status,
    toPositiveRate(entry.rate) !== null ? `x${formatRateValue(entry.rate)}` : '',
    entry.kind
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function setGroupDropdownOpen(isOpen) {
  state.groupDropdownOpen = Boolean(isOpen);
  if (elements.groupDropdownMenu) {
    elements.groupDropdownMenu.hidden = !state.groupDropdownOpen;
    if (state.groupDropdownOpen && elements.groupDropdownBtn) {
      positionGroupDropdown();
    } else {
      elements.groupDropdownMenu.style.left = '';
      elements.groupDropdownMenu.style.top = '';
      elements.groupDropdownMenu.style.width = '';
      elements.groupDropdownMenu.style.maxHeight = '';
      elements.groupDropdownMenu.style.removeProperty('--group-list-max-height');
    }
  }
  if (elements.groupDropdownBtn) {
    elements.groupDropdownBtn.setAttribute('aria-expanded', state.groupDropdownOpen ? 'true' : 'false');
  }
  if (state.groupDropdownOpen && elements.groupSearch) {
    requestAnimationFrame(() => elements.groupSearch.focus());
  }
}

function currentGroupEntry(result) {
  if (state.groupFilter === 'all') {
    return {
      value: 'all',
      label: '全部分组',
      platform: '全站比价',
      rate: null,
      status: '',
      kind: 'all',
      counts: countRowsForFilter(result, 'all')
    };
  }
  if (state.groupFilter === 'ungrouped') {
    return {
      value: 'ungrouped',
      label: '未绑定',
      platform: '无分组数据',
      rate: null,
      status: '',
      kind: 'ungrouped',
      counts: countRowsForFilter(result, 'ungrouped')
    };
  }
  const option = groupOptionsFromResult(result).find((item) => String(item.value) === String(state.groupFilter));
  if (option) {
    return {
      ...option,
      kind: 'group',
      counts: countRowsForFilter(result, option.value)
    };
  }
  return null;
}

function renderGroupDirectory(result) {
  if (elements.groupFilterLabel) {
    elements.groupFilterLabel.textContent = '分组筛选';
  }
  if (elements.groupSourceText) {
    elements.groupSourceText.textContent = groupSourceLabel(result);
  }

  const site = selectedSite();
  if (!elements.groupList || !elements.groupDropdownBtn) {
    return;
  }
  if (!site) {
    if (elements.groupCount) {
      elements.groupCount.textContent = '0';
    }
    elements.groupDropdownBtn.disabled = true;
    elements.groupDropdownValue.textContent = '请选择站点';
    elements.groupDropdownMeta.textContent = '未加载分组';
    elements.groupList.innerHTML = '<div class="empty-state"><strong>请选择站点</strong><span>分组会在选中站点后展示。</span></div>';
    setGroupDropdownOpen(false);
    return;
  }
  if (!result) {
    if (elements.groupCount) {
      elements.groupCount.textContent = '0';
    }
    elements.groupDropdownBtn.disabled = true;
    elements.groupDropdownValue.textContent = '尚未查询';
    elements.groupDropdownMeta.textContent = '查询当前或查询全部后加载';
    elements.groupList.innerHTML = '<div class="empty-state"><strong>尚未查询</strong><span>查询后加载分组和倍率。</span></div>';
    setGroupDropdownOpen(false);
    return;
  }
  if (!result.ok) {
    if (elements.groupCount) {
      elements.groupCount.textContent = '0';
    }
    elements.groupDropdownBtn.disabled = true;
    elements.groupDropdownValue.textContent = '查询失败';
    elements.groupDropdownMeta.textContent = '修复 Token 后重试';
    elements.groupList.innerHTML = '<div class="empty-state danger"><strong>查询失败</strong><span>修复 Token 或站点配置后重试。</span></div>';
    setGroupDropdownOpen(false);
    return;
  }

  const options = groupOptionsFromResult(result);
  const validValues = new Set(['all', 'ungrouped', ...options.map((option) => option.value)]);
  if (!validValues.has(state.groupFilter)) {
    state.groupFilter = 'all';
  }
  if (elements.groupCount) {
    elements.groupCount.textContent = String(options.length);
  }
  elements.groupDropdownBtn.disabled = false;

  const entries = [
    {
      value: 'all',
      label: '全部分组',
      platform: '全站比价',
      rate: null,
      status: '',
      kind: 'all'
    },
    {
      value: 'ungrouped',
      label: '未绑定',
      platform: '无分组 Key / 监控',
      rate: null,
      status: '',
      kind: 'ungrouped'
    },
    ...options.map((option) => ({
      ...option,
      kind: 'group'
    }))
  ].map((entry) => ({
    ...entry,
    counts: countRowsForFilter(result, entry.value)
  }));

  const currentEntry = currentGroupEntry(result) || entries[0];
  if (elements.groupDropdownValue) {
    elements.groupDropdownValue.textContent = currentEntry.label;
  }
  if (elements.groupDropdownMeta) {
    const currentRate = toPositiveRate(currentEntry.rate);
    elements.groupDropdownMeta.textContent = currentRate === null
      ? `${options.length} 个分组 · 按倍率排序`
      : `${currentEntry.platform || '分组'} · x${formatRateValue(currentRate)}`;
  }

  const query = state.groupSearch.trim().toLowerCase();
  const filteredEntries = entries.filter((entry) => groupEntryMatchesSearch(entry, query));

  if (filteredEntries.length === 0) {
    elements.groupList.innerHTML = '<div class="empty-state"><strong>没有匹配分组</strong><span>换个关键词再搜。</span></div>';
    return;
  }

  elements.groupList.innerHTML = filteredEntries
    .map((entry) => {
      const active = entry.value === state.groupFilter ? ' active' : '';
      const empty = entry.counts.total === 0 && entry.kind === 'group' ? ' is-empty' : '';
      const rate = toPositiveRate(entry.rate) !== null ? `x${formatRateValue(entry.rate)}` : '';
      const status = entry.status && entry.status !== 'active' ? entry.status : '';
      const meta = [entry.platform, rate, status].filter(Boolean);
      const totalLabel = entry.counts.total === 0 ? '0' : String(entry.counts.total);

      return `
        <button class="group-row${active}${empty}" type="button" data-group-value="${escapeHtml(entry.value)}" aria-pressed="${entry.value === state.groupFilter ? 'true' : 'false'}">
          <span class="group-line">
            <span class="group-name">${escapeHtml(entry.label)}</span>
            <span class="group-total">${escapeHtml(totalLabel)}</span>
          </span>
          <span class="group-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</span>
          <span class="group-counts">
            <span>Key ${entry.counts.keys}</span>
            <span>监控 ${entry.counts.monitors}</span>
          </span>
        </button>
      `;
    })
    .join('');

  for (const button of elements.groupList.querySelectorAll('.group-row')) {
    button.addEventListener('click', () => {
      state.groupFilter = button.dataset.groupValue;
      setGroupDropdownOpen(false);
      renderResults();
    });
  }

  if (state.groupDropdownOpen) {
    positionGroupDropdown();
  }
}

function successfulResults() {
  return state.results.filter((result) => result && result.ok);
}

function activeFilterOption() {
  if (state.groupFilter === 'all' || state.groupFilter === 'ungrouped') {
    return null;
  }
  const selected = selectedResult();
  const selectedOption = groupOptionsFromResult(selected).find((option) => String(option.value) === String(state.groupFilter));
  if (selectedOption) {
    return selectedOption;
  }
  for (const result of successfulResults()) {
    const option = groupOptionsFromResult(result).find((item) => String(item.value) === String(state.groupFilter));
    if (option) {
      return option;
    }
  }
  if (state.groupFilter.startsWith('name:')) {
    const label = state.groupFilter.slice(5);
    return { value: state.groupFilter, label, platform: '', aliases: [normalizeText(label)] };
  }
  return null;
}

function optionMatchesActiveFilter(option) {
  if (state.groupFilter === 'all') {
    return true;
  }
  if (state.groupFilter === 'ungrouped') {
    return false;
  }
  if (String(option.value) === String(state.groupFilter)) {
    return true;
  }
  const active = activeFilterOption();
  if (!active) {
    return false;
  }
  const sameLabel = normalizeText(option.label) === normalizeText(active.label) ||
    (Array.isArray(active.aliases) && active.aliases.includes(normalizeText(option.label)));
  const samePlatform = !active.platform || !option.platform || normalizeText(active.platform) === normalizeText(option.platform);
  return sameLabel && samePlatform;
}

function buildComparisonEntries() {
  const entries = [];
  const seen = new Map();

  for (const result of successfulResults()) {
    for (const option of groupOptionsFromResult(result)) {
      if (!optionMatchesActiveFilter(option)) {
        continue;
      }
      const rate = toPositiveRate(option.rate);
      if (rate === null) {
        continue;
      }
      const key = [
        result.siteId,
        normalizeText(option.label),
        normalizeText(option.platform)
      ].join('|');
      const entry = {
        siteId: result.siteId,
        siteName: result.siteName,
        baseUrl: result.baseUrl,
        groupValue: option.value,
        groupName: option.label,
        platform: option.platform || '-',
        rate,
        source: groupSourceLabel(result)
      };
      const existing = seen.get(key);
      if (!existing || entry.rate < existing.rate) {
        seen.set(key, entry);
      }
    }
  }

  entries.push(...seen.values());
  entries.sort((a, b) => {
    if (a.rate !== b.rate) {
      return a.rate - b.rate;
    }
    const groupCompare = a.groupName.localeCompare(b.groupName, 'zh-Hans-CN');
    if (groupCompare !== 0) {
      return groupCompare;
    }
    return a.siteName.localeCompare(b.siteName, 'zh-Hans-CN');
  });
  return entries;
}

function comparisonGroupKey(groupName, platform) {
  return groupSignature(groupName, platform || '-');
}

function compareOffers(a, b) {
  if (a.rate !== b.rate) {
    return a.rate - b.rate;
  }
  const siteCompare = String(a.siteName || '').localeCompare(String(b.siteName || ''), 'zh-Hans-CN');
  if (siteCompare !== 0) {
    return siteCompare;
  }
  return String(a.baseUrl || '').localeCompare(String(b.baseUrl || ''), 'zh-Hans-CN');
}

function buildPriceComparisonGroups(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const key = comparisonGroupKey(entry.groupName, entry.platform);
    const group = grouped.get(key) || {
      key,
      groupName: entry.groupName,
      platform: entry.platform || '-',
      allOffers: []
    };
    group.allOffers.push(entry);
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .map((group) => {
      const allOffers = group.allOffers.slice().sort(compareOffers);
      const bestRate = allOffers.length ? allOffers[0].rate : null;
      const bestSites = allOffers.filter((offer) => offer.rate === bestRate);
      const runnerUp = allOffers.find((offer) => offer.rate !== bestRate) || null;
      const runnerUpRate = runnerUp ? runnerUp.rate : null;
      return {
        ...group,
        allOffers,
        bestRate,
        bestSites,
        runnerUpRate,
        deltaToRunnerUp: runnerUpRate === null || bestRate === null ? null : runnerUpRate - bestRate,
        offerCount: allOffers.length
      };
    })
    .filter((group) => toPositiveRate(group.bestRate) !== null && formatRateValue(group.bestRate))
    .sort((a, b) => {
      if (a.bestRate !== b.bestRate) {
        return a.bestRate - b.bestRate;
      }
      if (a.bestSites.length !== b.bestSites.length) {
        return b.bestSites.length - a.bestSites.length;
      }
      return String(a.groupName || '').localeCompare(String(b.groupName || ''), 'zh-Hans-CN');
    });
}

function selectedComparisonGroup(groups) {
  if (groups.length === 0) {
    return null;
  }
  const selected = groups.find((group) => group.key === state.selectedComparisonKey);
  return selected || groups[0];
}

function offerSitesText(offers, limit = 3) {
  const urls = offers.map((offer) => offer.baseUrl || offer.siteName).filter(Boolean);
  const visible = urls.slice(0, limit).join(' / ');
  const extra = urls.length > limit ? ` / +${urls.length - limit}` : '';
  return `${visible}${extra}`;
}

function runnerUpText(group) {
  if (!group || group.offerCount <= 1) {
    return '仅 1 家报价';
  }
  if (group.runnerUpRate === null) {
    return '无次优报价';
  }
  const delta = group.deltaToRunnerUp === null ? '' : ` · 差 x${formatRateValue(group.deltaToRunnerUp)}`;
  return `次优 x${formatRateValue(group.runnerUpRate)}${delta}`;
}

function renderComparison() {
  if (!elements.bestOffer || !elements.comparisonRows) {
    return;
  }

  const entries = buildComparisonEntries().filter((entry) => toPositiveRate(entry.rate) !== null && formatRateValue(entry.rate));
  const groups = buildPriceComparisonGroups(entries);
  if (elements.comparisonCount) {
    elements.comparisonCount.textContent = String(groups.length);
  }

  if (successfulResults().length === 0) {
    elements.bestOffer.innerHTML = '<div class="empty-state compact"><strong>暂无比价数据</strong><span>查询全部后会汇总每个站点的分组倍率。</span></div>';
    elements.comparisonRows.innerHTML = '';
    if (elements.comparisonOffers) {
      elements.comparisonOffers.innerHTML = '';
    }
    return;
  }

  if (groups.length === 0) {
    elements.bestOffer.innerHTML = '<div class="empty-state compact"><strong>没有拿到有效倍率</strong><span>检查 Token 或站点分组接口。</span></div>';
    elements.comparisonRows.innerHTML = '';
    if (elements.comparisonOffers) {
      elements.comparisonOffers.innerHTML = '';
    }
    return;
  }

  const selectedGroup = selectedComparisonGroup(groups);
  state.selectedComparisonKey = selectedGroup.key;
  const bestLabel = selectedGroup.bestSites.length > 1
    ? `并列最低 · ${selectedGroup.bestSites.length} 个站点`
    : '当前最低';
  const bestSite = selectedGroup.bestSites[0];
  elements.bestOffer.innerHTML = `
    <button class="best-offer-card" type="button" data-comparison-key="${escapeHtml(selectedGroup.key)}" data-site-id="${escapeHtml(bestSite.siteId)}" data-group-name="${escapeHtml(selectedGroup.groupName)}" data-platform="${escapeHtml(selectedGroup.platform)}">
      <span class="best-kicker">${escapeHtml(bestLabel)}</span>
      <strong>${escapeHtml(selectedGroup.groupName)}</strong>
      <span class="best-rate">x${escapeHtml(formatRateValue(selectedGroup.bestRate))}</span>
      <span class="best-site">${escapeHtml(offerSitesText(selectedGroup.bestSites, 4))}</span>
    </button>
  `;

  elements.comparisonRows.innerHTML = groups
    .map((group, index) => {
      const active = group.key === selectedGroup.key ? ' active' : '';
      const tieText = group.bestSites.length > 1 ? `并列 ${group.bestSites.length} 家` : '最低 1 家';
      return `
        <button class="comparison-row ${index === 0 ? 'winner' : ''}${active}" type="button" aria-pressed="${group.key === selectedGroup.key ? 'true' : 'false'}" data-comparison-key="${escapeHtml(group.key)}" data-site-id="${escapeHtml(group.bestSites[0].siteId)}" data-group-name="${escapeHtml(group.groupName)}" data-platform="${escapeHtml(group.platform)}">
          <span class="rank">${index + 1}</span>
          <span class="comparison-main">
            <strong>${escapeHtml(group.groupName)}</strong>
            <span>${escapeHtml(group.platform)} · ${escapeHtml(tieText)} · ${escapeHtml(group.offerCount)} 家报价</span>
          </span>
          <span class="comparison-rate">
            <strong>x${escapeHtml(formatRateValue(group.bestRate))}</strong>
            <small>${escapeHtml(runnerUpText(group))}</small>
          </span>
          <span class="comparison-site">
            <strong>${escapeHtml(offerSitesText(group.bestSites, 2))}</strong>
            <span>${escapeHtml(group.bestSites.length > 1 ? '全部为并列最低' : '点击查看全部报价')}</span>
          </span>
        </button>
      `;
    })
    .join('');

  if (elements.comparisonOffers) {
    elements.comparisonOffers.innerHTML = `
      <div class="offer-panel-head">
        <span>当前分组报价</span>
        <strong>${escapeHtml(selectedGroup.groupName)} · x${escapeHtml(formatRateValue(selectedGroup.bestRate))}</strong>
      </div>
      <div class="offer-list">
        ${selectedGroup.allOffers.map((offer) => {
          const isBest = offer.rate === selectedGroup.bestRate;
          return `
            <button class="offer-row${isBest ? ' best' : ''}" type="button" data-site-id="${escapeHtml(offer.siteId)}" data-group-name="${escapeHtml(offer.groupName)}" data-platform="${escapeHtml(offer.platform)}">
              <span class="offer-site">
                <strong>${escapeHtml(offer.siteName)}</strong>
                <small>${escapeHtml(offer.baseUrl)}</small>
              </span>
              <span class="offer-rate">x${escapeHtml(formatRateValue(offer.rate))}</span>
              <span class="offer-badge">${escapeHtml(isBest ? (selectedGroup.bestSites.length > 1 ? '并列最低' : '最低') : '报价')}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

  for (const button of document.querySelectorAll('.best-offer-card, .comparison-row, .offer-row')) {
    button.addEventListener('click', () => {
      if (button.dataset.comparisonKey) {
        selectComparisonTarget(
          button.dataset.siteId,
          button.dataset.groupName,
          button.dataset.platform,
          button.dataset.comparisonKey
        );
        return;
      }
      selectComparisonTarget(button.dataset.siteId, button.dataset.groupName, button.dataset.platform);
    });
  }
}

function selectComparisonTarget(siteId, groupName, platform, comparisonKey = '') {
  const site = state.sites.find((item) => item.id === siteId);
  if (!site) {
    return;
  }
  fillForm(site);
  state.selectedComparisonKey = comparisonKey || comparisonGroupKey(groupName, platform);
  const result = selectedResult();
  const option = groupOptionsFromResult(result).find((item) => {
    const sameLabel = normalizeText(item.label) === normalizeText(groupName);
    const samePlatform = !platform || platform === '-' || !item.platform || normalizeText(item.platform) === normalizeText(platform);
    return sameLabel && samePlatform;
  });
  state.groupFilter = option ? option.value : 'all';
  renderResults();
}

function filteredKeyRows() {
  const result = selectedResult();
  const rows = result ? result.keyRows || result.rows || [] : [];
  return rows.filter((row) => rowMatchesGroup(row));
}

function filteredMonitorRows() {
  const result = selectedResult();
  const rows = result ? result.monitorRows || [] : [];
  return rows.filter((row) => rowMatchesGroup(row));
}

function renderResults() {
  const site = selectedSite();
  const result = selectedResult();
  const rows = filteredKeyRows().slice().sort((a, b) => {
    const rateA = toPositiveRate(a.effectiveRate ?? a.customRate ?? a.defaultRate);
    const rateB = toPositiveRate(b.effectiveRate ?? b.customRate ?? b.defaultRate);
    if (rateA !== null && rateB !== null && rateA !== rateB) {
      return rateA - rateB;
    }
    if (rateA !== null && rateB === null) {
      return -1;
    }
    if (rateA === null && rateB !== null) {
      return 1;
    }
    return String(a.groupName || a.keyName || '').localeCompare(String(b.groupName || b.keyName || ''), 'zh-Hans-CN');
  });
  const monitorRows = filteredMonitorRows();

  if (elements.selectedSiteTitle) {
    elements.selectedSiteTitle.textContent = site ? site.name || site.baseUrl : '请选择站点';
  }
  if (elements.selectedSiteMeta) {
    if (!site) {
      elements.selectedSiteMeta.textContent = '保存或选择一个站点后展示详情。';
    } else if (!result) {
      elements.selectedSiteMeta.textContent = `${site.baseUrl} · ${site.provider === 'newapi' ? 'New API' : 'sub2api'} · 尚未查询`;
    } else if (result.ok) {
      const fallbackText = result.groupFetchFallbacks && result.groupFetchFallbacks.length
        ? ` · ${result.groupFetchFallbacks.length} 次回退`
        : '';
      elements.selectedSiteMeta.textContent = `${site.baseUrl} · ${site.provider === 'newapi' ? 'New API' : 'sub2api'} · ${result.summary.groups || 0} 个分组 · ${result.summary.keyRows || 0} 个 Key · ${result.summary.monitorRows || 0} 个监控${fallbackText}`;
    } else {
      elements.selectedSiteMeta.textContent = `${site.baseUrl} · ${site.provider === 'newapi' ? 'New API' : 'sub2api'} · 查询失败`;
    }
  }
  renderGroupDirectory(result);
  renderComparison();

  if (rows.length === 0) {
    elements.resultRows.innerHTML = '<tr><td class="empty-row" colspan="9">当前站点暂无 API Key 结果</td></tr>';
  } else {
    elements.resultRows.innerHTML = rows
      .map((row) => {
        const defaultRate = toPositiveRate(row.defaultRate) === null ? '' : formatRateValue(row.defaultRate);
        const custom = toPositiveRate(row.customRate) === null ? '' : formatRateValue(row.customRate);
        const effective = toPositiveRate(row.effectiveRate) === null ? '' : formatRateValue(row.effectiveRate);
        const statusClass = row.keyStatus === 'active' ? 'ok' : row.keyStatus ? 'bad' : '';
        const quota = row.quota || row.quotaUsed ? `${formatRate(row.quotaUsed || 0)} / ${formatRate(row.quota || 0)}` : '';
        return `
          <tr>
            <td><div>${escapeHtml(row.keyName)}</div><div class="mono">${escapeHtml(row.keyMasked)}</div></td>
            <td><span class="pill ${statusClass}">${escapeHtml(row.keyStatus || '-')}</span></td>
            <td>${escapeHtml(row.groupName || (row.groupId ? `#${row.groupId}` : '未绑定'))}</td>
            <td>${escapeHtml(row.platform)}</td>
            <td>${defaultRate}</td>
            <td>${custom}</td>
            <td class="rate">${effective}</td>
            <td>${escapeHtml(quota)}</td>
            <td>${escapeHtml(formatDate(row.lastUsedAt))}</td>
          </tr>
        `;
      })
      .join('');
  }

  if (monitorRows.length === 0) {
    elements.monitorRows.innerHTML = '<tr><td class="empty-row" colspan="9">当前站点暂无渠道监控结果</td></tr>';
  } else {
    elements.monitorRows.innerHTML = monitorRows
      .map((row) => {
        const statusClass = row.primaryStatus === 'healthy' || row.primaryStatus === 'success' || row.primaryStatus === 'available'
          ? 'ok'
          : row.primaryStatus
            ? 'bad'
            : '';
        const models = (row.models || [])
          .slice(0, 6)
          .map((model) => {
            const status = model.latest_status || model.status || '';
            const latency = formatLatency(model.latest_latency_ms ?? model.latency_ms);
            const availability = formatPercent(model.availability_7d);
            return `<span class="model-line">${escapeHtml(model.model)} ${escapeHtml(status)} ${escapeHtml(latency)} ${escapeHtml(availability)}</span>`;
          })
          .join('');
        const more = row.models && row.models.length > 6 ? `<span class="model-line">还有 ${row.models.length - 6} 个模型...</span>` : '';

        return `
          <tr>
            <td><div>${escapeHtml(row.name)}</div><div class="mono">#${escapeHtml(row.monitorId)}</div></td>
            <td>${escapeHtml(row.groupName)}</td>
            <td>${escapeHtml(row.provider)}</td>
            <td>${escapeHtml(row.primaryModel)}</td>
            <td><span class="pill ${statusClass}">${escapeHtml(row.primaryStatus || '-')}</span></td>
            <td>${escapeHtml(formatLatency(row.primaryLatencyMs))}</td>
            <td>${escapeHtml(formatPercent(row.availability7d))}</td>
            <td>${escapeHtml(row.modelCount)}</td>
            <td class="models-cell">${models}${more}</td>
          </tr>
        `;
      })
      .join('');
  }

  const failures = visibleResults().filter((result) => !result.ok);
  if (failures.length === 0) {
    elements.failures.innerHTML = '<div class="empty-row">暂无失败</div>';
  } else {
    elements.failures.innerHTML = failures
      .map((result) => {
        const error = result.error || {};
        const code = error.requires2fa ? '2FA' : error.needsToken ? 'TOKEN' : error.code || '';
        return `
          <div class="failure-item">
            <strong>${escapeHtml(result.siteName)}</strong>
            <span class="failure-message">${escapeHtml(error.message || '查询失败')}</span>
            <span class="pill bad">${escapeHtml(code)}</span>
          </div>
        `;
      })
      .join('');
  }

  renderSummary();
}

async function loadSites(options = {}) {
  state.sites = await window.sub2api.listSites();
  const targetId = options.selectId || state.selectedId;
  if (targetId) {
    const target = state.sites.find((site) => site.id === targetId);
    if (target) {
      fillForm(target);
      return;
    }
  }

  if (!state.selectedId && state.sites.length > 0) {
    fillForm(state.sites[0]);
  } else {
    renderSites();
  }
}

async function saveSite(event) {
  event.preventDefault();
  try {
    const site = await window.sub2api.saveSite(readForm());
    state.selectedId = site.id;
    await loadSites({ selectId: site.id });
    setStatus('已保存', 'ok');
  } catch (error) {
    setStatus(error.message || '保存失败', 'bad');
  }
}

async function deleteSite() {
  if (!state.selectedId) {
    return;
  }

  await window.sub2api.deleteSite(state.selectedId);
  clearForm();
  await loadSites();
  setStatus('已删除', 'ok');
}

async function querySelected() {
  const site = selectedSite();
  if (!site) {
    setStatus('请选择站点', 'bad');
    return;
  }

  setBusy(true);
  setStatus(`正在查询 ${site.name || site.baseUrl}...`);
  const result = await window.sub2api.querySite(site.id);
  state.results = state.results.filter((item) => item.siteId !== result.siteId).concat(result);
  state.selectedComparisonKey = '';
  renderResults();
  await loadSites();
  setBusy(false);
  setStatus(result.ok ? '查询完成' : result.error && result.error.message ? result.error.message : '查询失败', result.ok ? 'ok' : 'bad');
}

async function openBrowserLogin() {
  const site = selectedSite();
  if (!site) {
    setStatus('请选择站点', 'bad');
    return;
  }

  try {
    await window.sub2api.openBrowserLogin(site.id);
    setStatus(`已打开 ${site.name || site.baseUrl} 登录窗口`);
  } catch (error) {
    setStatus(error.message || '打开登录窗口失败', 'bad');
  }
}

async function captureLoginTokens() {
  const site = selectedSite();
  if (!site) {
    setStatus('请选择站点', 'bad');
    return;
  }

  try {
    const updatedSite = await window.sub2api.captureLoginTokens(site.id);
    if (updatedSite) {
      await loadSites({ selectId: site.id });
      setStatus('已采集 token', 'ok');
    } else {
      setStatus(site.provider === 'newapi' ? '未发现 New API token' : '未发现 auth_token', 'bad');
    }
  } catch (error) {
    setStatus(error.message || '采集 token 失败', 'bad');
  }
}

function positionGroupDropdown() {
  if (!elements.groupDropdownBtn || !elements.groupDropdownMenu) {
    return;
  }

  const buttonRect = elements.groupDropdownBtn.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const margin = 12;
  const gap = 8;
  const maxWidth = Math.max(0, viewportWidth - margin * 2);
  const minWidth = Math.min(320, maxWidth);
  const width = Math.min(Math.max(buttonRect.width, minWidth), maxWidth);
  const leftLimit = Math.max(margin, viewportWidth - width - margin);
  const left = Math.min(Math.max(margin, buttonRect.right - width), leftLimit);
  const spaceBelow = Math.max(0, viewportHeight - buttonRect.bottom - gap - margin);
  const spaceAbove = Math.max(0, buttonRect.top - gap - margin);
  const shouldOpenAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
  const availableHeight = shouldOpenAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(380, Math.max(160, availableHeight || viewportHeight - margin * 2));
  const unclampedTop = shouldOpenAbove
    ? buttonRect.top - gap - maxHeight
    : buttonRect.bottom + gap;
  const topLimit = Math.max(margin, viewportHeight - maxHeight - margin);
  const top = Math.min(Math.max(margin, unclampedTop), topLimit);

  elements.groupDropdownMenu.style.left = `${left}px`;
  elements.groupDropdownMenu.style.top = `${top}px`;
  elements.groupDropdownMenu.style.width = `${width}px`;
  elements.groupDropdownMenu.style.maxHeight = `${maxHeight}px`;
  elements.groupDropdownMenu.style.setProperty('--group-list-max-height', `${Math.max(96, maxHeight - 64)}px`);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const CONTENT_COLUMN_HANDLE_WIDTH = 10;

function defaultContentColumnLeftWidth(contentColumn) {
  const availableWidth = Math.max(0, contentColumn.offsetWidth - CONTENT_COLUMN_HANDLE_WIDTH);
  return Math.round(availableWidth / 2);
}

function applySiteColumnWidth(siteColumn, width) {
  const consoleGrid = document.querySelector('.console-grid');
  const availableWidth = consoleGrid
    ? consoleGrid.getBoundingClientRect().width
    : (window.innerWidth || document.documentElement.clientWidth);
  const handleWidth = 12;
  const minContentWidth = 600;
  const maxWidth = Math.max(200, availableWidth - handleWidth - minContentWidth);
  const nextWidth = clampNumber(width, 200, maxWidth);
  siteColumn.style.width = `${nextWidth}px`;
  siteColumn.style.flexBasis = `${nextWidth}px`;
  siteColumn.style.flexGrow = '0';
  siteColumn.style.flexShrink = '0';
  return nextWidth;
}

function applyContentColumnSplit(contentColumn, leftWidth) {
  const contentWidth = contentColumn.offsetWidth;
  const handleWidth = CONTENT_COLUMN_HANDLE_WIDTH;
  const styles = getComputedStyle(contentColumn);
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  const availableWidth = Math.max(0, contentWidth - handleWidth - columnGap * 2);
  const minColumnWidth = Math.min(300, Math.max(220, Math.round(availableWidth * 0.35)));
  const maxLeft = availableWidth - minColumnWidth;
  if (maxLeft <= minColumnWidth) {
    contentColumn.style.gridTemplateColumns = '';
    return null;
  }
  const nextLeft = clampNumber(leftWidth, minColumnWidth, maxLeft);
  const rightWidth = availableWidth - nextLeft;
  contentColumn.style.gridTemplateColumns = `${nextLeft}px ${handleWidth}px ${rightWidth}px`;
  return nextLeft;
}

function resetDragState() {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

async function queryAll() {
  if (state.sites.length === 0) {
    setStatus('请先保存站点', 'bad');
    return;
  }

  setBusy(true);
  setStatus('正在批量查询...');
  state.results = await window.sub2api.queryAll();
  state.selectedComparisonKey = '';
  renderResults();
  await loadSites();
  setBusy(false);

  const failed = state.results.filter((result) => !result.ok).length;
  const firstError = state.results.find((result) => !result.ok && result.error && result.error.message);
  setStatus(failed ? `查询完成，${failed} 个站点失败${firstError ? `：${firstError.error.message}` : ''}` : '查询完成', failed ? 'bad' : 'ok');
}

function setBusy(isBusy) {
  elements.queryAllBtn.disabled = isBusy;
  elements.querySelectedBtn.disabled = isBusy;
  elements.browserLoginBtn.disabled = isBusy;
  elements.captureTokenBtn.disabled = isBusy;
  elements.saveSiteBtn.disabled = isBusy;
  elements.deleteSiteBtn.disabled = isBusy;
}

async function init() {
  elements.siteForm.addEventListener('submit', saveSite);
  elements.newSiteBtn.addEventListener('click', clearForm);
  elements.deleteSiteBtn.addEventListener('click', deleteSite);
  elements.browserLoginBtn.addEventListener('click', openBrowserLogin);
  elements.captureTokenBtn.addEventListener('click', captureLoginTokens);
  elements.querySelectedBtn.addEventListener('click', querySelected);
  elements.queryAllBtn.addEventListener('click', queryAll);
  if (elements.groupDropdownBtn) {
    elements.groupDropdownBtn.addEventListener('click', () => {
      if (elements.groupDropdownBtn.disabled) {
        return;
      }
      setGroupDropdownOpen(!state.groupDropdownOpen);
    });
  }
  document.addEventListener('click', (event) => {
    if (!state.groupDropdownOpen) {
      return;
    }
    const picker = event.target.closest('.group-picker');
    const menu = event.target.closest('.group-menu');
    if (!picker && !menu) {
      setGroupDropdownOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.groupDropdownOpen) {
      setGroupDropdownOpen(false);
    }
  });
  // Resize handle logic
  const resizeHandle = document.getElementById('resizeHandle');
  const siteColumn = document.querySelector('.site-column');
  const consoleGrid = document.querySelector('.console-grid');
  if (resizeHandle && siteColumn && consoleGrid) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = siteColumn.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const diff = e.clientX - startX;
      applySiteColumnWidth(siteColumn, startWidth + diff);
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resetDragState();
      }
    });
  }

  // Inner resize handle logic for content-column columns
  const innerResizeHandle = document.getElementById('innerResizeHandle');
  const contentColumn = document.querySelector('.content-column');
  if (innerResizeHandle && contentColumn) {
    let isInnerResizing = false;
    let innerStartX = 0;
    let innerStartLeftWidth = 0;

    innerResizeHandle.addEventListener('mousedown', (e) => {
      isInnerResizing = true;
      innerStartX = e.clientX;
      const cols = contentColumn.style.gridTemplateColumns;
      if (cols) {
        const parts = cols.split(' ');
        innerStartLeftWidth = parseInt(parts[0], 10) || defaultContentColumnLeftWidth(contentColumn);
      } else {
        innerStartLeftWidth = defaultContentColumnLeftWidth(contentColumn);
      }
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isInnerResizing) return;
      const diff = e.clientX - innerStartX;
      applyContentColumnSplit(contentColumn, innerStartLeftWidth + diff);
    });

    window.addEventListener('mouseup', () => {
      if (isInnerResizing) {
        isInnerResizing = false;
        resetDragState();
      }
    });
  }
  window.addEventListener('resize', () => {
    if (siteColumn && siteColumn.style.flexBasis) {
      applySiteColumnWidth(siteColumn, siteColumn.offsetWidth);
    }
    if (contentColumn && contentColumn.style.gridTemplateColumns) {
      const firstColumn = parseInt(contentColumn.style.gridTemplateColumns.split(' ')[0], 10);
      applyContentColumnSplit(contentColumn, firstColumn || defaultContentColumnLeftWidth(contentColumn));
    }
    if (state.groupDropdownOpen) {
      positionGroupDropdown();
    }
  });
  if (elements.groupSearch) {
    elements.groupSearch.addEventListener('input', () => {
      state.groupSearch = elements.groupSearch.value;
      renderGroupDirectory(selectedResult());
    });
  }
  window.sub2api.onLoginUpdate(async (payload) => {
    const type = payload && payload.type;
    const message = payload && payload.message ? payload.message : '登录窗口更新';
    const name = payload && payload.siteName ? payload.siteName : '';
    const statusType = type === 'captured' ? 'ok' : type === 'missing' ? 'bad' : '';
    setStatus(name ? `${name}: ${message}` : message, statusType);

    if (type === 'captured' && payload.siteId) {
      const selectId = state.selectedId === payload.siteId || !state.selectedId ? payload.siteId : state.selectedId;
      await loadSites({ selectId });
    }
  });

  try {
    elements.storagePath.textContent = await window.sub2api.storagePath();
  } catch {
    elements.storagePath.textContent = '';
  }

  await loadSites();
  renderResults();
}

const rendererTestHooks = {
  formatRate,
  formatRateValue,
  toFiniteNumber,
  toPositiveRate,
  buildPriceComparisonGroups,
  renderComparison,
  renderResults,
  __setTestState(partial) {
    Object.assign(state, partial || {});
  }
};

if (typeof window !== 'undefined') {
  window.__sub2apiRendererTestHooks = rendererTestHooks;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = rendererTestHooks;
}

if (hasDocument && typeof window !== 'undefined' && window.sub2api) {
  init().catch((error) => {
    setStatus(error.message || '初始化失败', 'bad');
  });
}
