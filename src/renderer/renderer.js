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
  selectedComparisonKey: '',
  favoriteGroups: [],
  favoriteOnly: false,
  speedResults: {},
  speedBusySiteIds: [],
  resultSnapshotUpdatedAt: '',
  hasResultSnapshot: false,
  startupMode: 'snapshot'
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
  speedTestModel: byId('speedTestModel'),
  email: byId('email'),
  password: byId('password'),
  turnstileToken: byId('turnstileToken'),
  authToken: byId('authToken'),
  refreshToken: byId('refreshToken'),
  groupAliases: byId('groupAliases'),
  notes: byId('notes'),
  siteModal: byId('siteModal'),
  siteModalTitle: byId('siteModalTitle'),
  closeSiteModalBtn: byId('closeSiteModalBtn'),
  newSiteBtn: byId('newSiteBtn'),
  editSiteBtn: byId('editSiteBtn'),
  browserLoginBtn: byId('browserLoginBtn'),
  captureTokenBtn: byId('captureTokenBtn'),
  startupMode: byId('startupMode'),
  loadSnapshotBtn: byId('loadSnapshotBtn'),
  saveSiteBtn: byId('saveSiteBtn'),
  deleteSiteBtn: byId('deleteSiteBtn'),
  querySelectedBtn: byId('querySelectedBtn'),
  queryAllBtn: byId('queryAllBtn'),
  statusBar: byId('statusBar'),
  resultRows: byId('resultRows'),
  summarySites: byId('summarySites'),
  summarySuccess: byId('summarySuccess'),
  summaryFailed: byId('summaryFailed'),
  summaryKeys: byId('summaryKeys'),
  summaryBalance: byId('summaryBalance'),
  summaryBalanceCard: byId('summaryBalanceCard'),
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
  filterOffer: byId('filterOffer'),
  comparisonRows: byId('comparisonRows'),
  comparisonCount: byId('comparisonCount'),
  favoriteOnlyBtn: byId('favoriteOnlyBtn'),
  favoriteCount: byId('favoriteCount'),
  siteOverviewRows: byId('siteOverviewRows'),
  speedTestAllBtn: byId('speedTestAllBtn'),
  speedTestSelectedBtn: byId('speedTestSelectedBtn'),
  siteCount: byId('siteCount'),
  selectedSiteBalance: byId('selectedSiteBalance'),
  selectedSiteSpeed: byId('selectedSiteSpeed'),
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

function setFailureStatusFromResults() {
  const failures = state.results.filter((result) => result && !result.ok);
  if (failures.length === 0) {
    return;
  }
  const firstError = failures.find((result) => result.error && result.error.message);
  const message = firstError && firstError.error && firstError.error.message
    ? `查询完成，${failures.length} 个站点失败：${firstError.error.message}`
    : `查询完成，${failures.length} 个站点失败`;
  setStatus(message, 'bad');
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

function formatBalanceValue(value) {
  const number = toFiniteNumber(value);
  if (number === null) {
    return '';
  }
  return formatRate(number);
}

function statusClassForValue(value) {
  const status = normalizeText(value);
  if (!status || status === '-') {
    return '';
  }
  const okStatuses = new Set([
    'active',
    'available',
    'enabled',
    'healthy',
    'normal',
    'ok',
    'online',
    'operational',
    'pass',
    'passed',
    'success',
    'succeeded',
    'up'
  ]);
  const warnStatuses = new Set([
    'degraded'
  ]);
  const badStatuses = new Set([
    'blocked',
    'closed',
    'disabled',
    'down',
    'error',
    'failed',
    'inactive',
    'offline',
    'timeout',
    'unavailable',
    'unhealthy'
  ]);
  if (okStatuses.has(status)) {
    return 'ok';
  }
  if (warnStatuses.has(status)) {
    return 'warn';
  }
  if (badStatuses.has(status)) {
    return 'bad';
  }
  return '';
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

function resetSiteForm() {
  if (!elements.siteForm) {
    return;
  }
  elements.siteForm.reset();
  elements.siteId.value = '';
  if (elements.provider) {
    elements.provider.value = 'sub2api';
  }
  if (elements.newApiUserId) {
    elements.newApiUserId.value = '';
  }
  if (elements.speedTestModel) {
    elements.speedTestModel.value = '';
  }
}

function openSiteModal(mode = 'edit') {
  if (!elements.siteModal) {
    return;
  }
  if (elements.siteModalTitle) {
    elements.siteModalTitle.textContent = mode === 'new' ? '新增站点' : '编辑站点';
  }
  if (elements.deleteSiteBtn) {
    elements.deleteSiteBtn.disabled = mode === 'new';
  }
  elements.siteModal.hidden = false;
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    const target = mode === 'new' ? elements.name || elements.baseUrl : elements.baseUrl || elements.name;
    if (target) {
      target.focus();
      target.select?.();
    }
  });
}

function closeSiteModal() {
  if (!elements.siteModal) {
    return;
  }
  elements.siteModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function prepareNewSite() {
  resetSiteForm();
  openSiteModal('new');
}

function editSelectedSite() {
  const site = selectedSite();
  if (!site) {
    setStatus('请选择站点', 'bad');
    return;
  }
  fillForm(site, { preserveView: true, render: false });
  openSiteModal('edit');
}

function clearForm() {
  state.selectedId = '';
  state.groupFilter = 'all';
  state.groupSearch = '';
  state.selectedComparisonKey = '';
  if (elements.groupSearch) {
    elements.groupSearch.value = '';
  }
  resetSiteForm();
  renderSites();
  renderResults();
}

function fillForm(site, options = {}) {
  state.selectedId = site.id;
  if (!options.preserveView) {
    state.groupFilter = 'all';
    state.groupSearch = '';
    state.selectedComparisonKey = '';
    if (elements.groupSearch) {
      elements.groupSearch.value = '';
    }
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
  if (elements.speedTestModel) {
    elements.speedTestModel.value = site.speedTestModel || '';
  }
  elements.email.value = site.email || '';
  elements.password.value = site.password || '';
  elements.turnstileToken.value = site.turnstileToken || '';
  elements.authToken.value = site.authToken || '';
  elements.refreshToken.value = site.refreshToken || '';
  if (elements.groupAliases) {
    elements.groupAliases.value = site.groupAliases || '';
  }
  elements.notes.value = site.notes || '';
  renderSites();
  if (options.render !== false) {
    renderResults();
  }
}

function readForm() {
  const current = state.sites.find((site) => site.id === elements.siteId.value) || null;
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
    speedTestModel: elements.speedTestModel ? elements.speedTestModel.value.trim() : '',
    email: elements.email.value,
    password: password || (current ? undefined : ''),
    turnstileToken: turnstileToken || (current ? undefined : ''),
    authToken: authToken || (current ? undefined : ''),
    refreshToken: refreshToken || (current ? undefined : ''),
    groupAliases: elements.groupAliases ? elements.groupAliases.value : '',
    notes: elements.notes.value
  };
}

function renderSites() {
  if (elements.siteCount) {
    elements.siteCount.textContent = String(state.sites.length);
  }
  if (elements.editSiteBtn) {
    elements.editSiteBtn.disabled = !state.selectedId;
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
      const result = state.results.find((item) => item.siteId === site.id);
      const keyRows = result ? (Array.isArray(result.keyRows) ? result.keyRows : result.rows || []) : [];
      const balance = result && result.ok && keyRows.length > 0 ? balanceSummaryText(buildBalanceSummary(keyRows)) : '';
      const entries = result && result.ok
        ? buildComparisonEntriesForResults([result], { applyFilter: false })
          .filter((entry) => toPositiveRate(entry.rate) !== null && formatRateValue(entry.rate))
        : [];
      const best = entries.length > 0 ? `最低 x${formatRateValue(entries[0].rate)}` : result ? result.ok ? '暂无倍率' : '查询失败' : '未查询';
      const meta = [best, balance].filter(Boolean).join(' · ');
      return `
        <button class="site-row${active}" data-site-id="${escapeHtml(site.id)}" type="button">
          <span class="site-name">${escapeHtml(site.name || site.baseUrl)}</span>
          <span class="site-badges">
            <span class="site-badge provider ${site.provider === 'newapi' ? 'alt' : ''}">${escapeHtml(provider)}</span>
            ${hasToken}
          </span>
          <span class="site-url">${escapeHtml(site.baseUrl)}</span>
          <span class="site-row-meta">${escapeHtml(meta)}</span>
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
  const balance = buildBalanceSummary(rows);
  elements.summarySites.textContent = String(results.length);
  elements.summarySuccess.textContent = String(success.length);
  elements.summaryFailed.textContent = String(failed.length);
  elements.summaryKeys.textContent = String(rows.length);
  if (elements.summaryBalance) {
    elements.summaryBalance.textContent = balance.healthText;
  }
  if (elements.summaryBalanceCard) {
    elements.summaryBalanceCard.className = `summary-balance ${balanceHealthClass(balance)}`;
    elements.summaryBalanceCard.title = balanceSummaryText(balance);
  }
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

function parseGroupAliasRules(value) {
  const rules = new Map();
  const lines = String(value || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }
    const match = line.match(/^(.*?)\s*(?:=>|=)\s*(.*?)$/);
    if (!match) {
      continue;
    }
    const target = match[2].trim();
    if (!target) {
      continue;
    }
    const sources = match[1]
      .split(/[,\|]/)
      .map((source) => source.trim())
      .filter(Boolean);
    for (const source of sources) {
      const key = normalizeText(source);
      if (key) {
        rules.set(key, target);
      }
    }
  }
  return rules;
}

function siteForResult(result) {
  if (!result) {
    return null;
  }
  return state.sites.find((site) => site.id === result.siteId) ||
    state.sites.find((site) => normalizeText(site.baseUrl) === normalizeText(result.baseUrl)) ||
    null;
}

function aliasRulesForResult(result) {
  const site = siteForResult(result);
  return parseGroupAliasRules(site ? site.groupAliases : '');
}

function canonicalizeGroupOption(option, result) {
  const rawLabel = option.label || option.value || '';
  const rules = aliasRulesForResult(result);
  const canonicalLabel = rules.get(normalizeText(rawLabel)) || rules.get(normalizeText(option.value)) || rawLabel;
  const canonicalKey = normalizeText(canonicalLabel);
  const aliases = new Set([rawLabel, canonicalLabel, option.value, ...(option.aliases || [])]);
  for (const [source, target] of rules.entries()) {
    if (normalizeText(target) === canonicalKey) {
      aliases.add(source);
    }
  }
  return {
    ...option,
    label: canonicalLabel,
    sourceLabel: rawLabel,
    aliases: [...aliases].filter(Boolean)
  };
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

function firstDefinedValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
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

function rowBalance(row) {
  const quota = toFiniteNumber(row && firstDefinedValue(
    row.quota,
    row.totalQuota,
    row.total_quota,
    row.total,
    row.quotaLimit,
    row.quota_limit,
    row.limit,
    row.amount,
    row.totalAmount,
    row.total_amount
  ));
  const used = toFiniteNumber(row && firstDefinedValue(
    row.quotaUsed,
    row.usedQuota,
    row.used_quota,
    row.usedAmount,
    row.used_amount,
    row.usedTokens,
    row.used_tokens,
    row.consumedQuota,
    row.consumed_quota,
    row.used
  ));
  const remaining = toFiniteNumber(row && (
    row.quotaRemaining ??
    row.remainingQuota ??
    row.remainQuota ??
    row.remaining_quota ??
    row.remain_quota ??
    row.quota_remaining ??
    row.remaining ??
    row.remain ??
    row.availableQuota ??
    row.available_quota ??
    row.available ??
    row.leftQuota ??
    row.left_quota ??
    row.quotaLeft ??
    row.quota_left ??
    row.balance
  ));
  const hasQuota = quota !== null && quota > 0;
  const hasUsed = used !== null && used >= 0;
  const hasRemaining = remaining !== null && remaining >= 0;
  const unlimited = row && (
    toBooleanFlag(firstDefinedValue(
      row.unlimitedQuota,
      row.unlimited_quota,
      row.isUnlimited,
      row.is_unlimited,
      row.unlimited
    )) ||
    (quota !== null && quota < 0) ||
    ['unlimited', 'infinite', 'inf'].includes(String(firstDefinedValue(row.quota, row.totalQuota, row.total_quota) || '').trim().toLowerCase())
  );
  if (unlimited) {
    return {
      known: true,
      unlimited: true,
      quota: null,
      used: hasUsed ? used : 0,
      remaining: null,
      quotaKnown: false,
      remainingKnown: false
    };
  }
  if (hasQuota) {
    const usedValue = hasUsed ? used : 0;
    return {
      known: true,
      unlimited: false,
      quota,
      used: usedValue,
      remaining: hasRemaining ? remaining : Math.max(quota - usedValue, 0),
      quotaKnown: true,
      remainingKnown: true
    };
  }
  if (hasRemaining) {
    const derivedQuota = hasUsed ? used + remaining : null;
    return {
      known: true,
      unlimited: false,
      quota: derivedQuota,
      used: hasUsed ? used : null,
      remaining,
      quotaKnown: derivedQuota !== null,
      remainingKnown: true
    };
  }
  return {
    known: false,
    unlimited: false,
    quota: null,
    used: hasUsed ? used : null,
    remaining: null,
    quotaKnown: false,
    remainingKnown: false
  };
}

function buildBalanceSummary(rows) {
  const summary = {
    keyCount: 0,
    knownCount: 0,
    unlimitedCount: 0,
    unknownCount: 0,
    quotaKnownCount: 0,
    remainingKnownCount: 0,
    quota: 0,
    used: 0,
    remaining: 0
  };

  for (const row of rows || []) {
    summary.keyCount += 1;
    const balance = rowBalance(row);
    if (balance.unlimited) {
      summary.unlimitedCount += 1;
      if (balance.used !== null) {
        summary.used += balance.used;
      }
      continue;
    }
    if (balance.known) {
      summary.knownCount += 1;
      if (balance.quotaKnown && balance.quota !== null) {
        summary.quotaKnownCount += 1;
        summary.quota += balance.quota;
      }
      if (balance.used !== null) {
        summary.used += balance.used;
      }
      if (balance.remainingKnown && balance.remaining !== null) {
        summary.remainingKnownCount += 1;
        summary.remaining += balance.remaining;
      }
      continue;
    }
    summary.unknownCount += 1;
  }

  summary.healthLevel = balanceHealthLevel(summary);
  summary.healthText = balanceHealthText(summary);
  return summary;
}

function balanceHealthLevel(summary) {
  if (!summary || summary.keyCount === 0) {
    return 'empty';
  }
  if (summary.quotaKnownCount > 0 && summary.quota > 0) {
    const remainingRatio = summary.remaining / summary.quota;
    if (remainingRatio <= 0.05) {
      return 'danger';
    }
    if (remainingRatio <= 0.2) {
      return 'warn';
    }
  }
  if (summary.remainingKnownCount > 0 && summary.quotaKnownCount === 0 && summary.remaining <= 10) {
    return 'warn';
  }
  if (summary.knownCount === 0 && summary.unlimitedCount === 0 && summary.unknownCount > 0) {
    return 'unknown';
  }
  if (summary.unknownCount > 0) {
    return 'unknown';
  }
  if (summary.knownCount === 0 && summary.unlimitedCount > 0) {
    return 'unlimited';
  }
  return 'good';
}

function balanceHealthText(summary) {
  const level = summary && summary.healthLevel ? summary.healthLevel : balanceHealthLevel(summary);
  if (level === 'danger') {
    return '余额紧张';
  }
  if (level === 'warn') {
    return '余额偏低';
  }
  if (level === 'unknown') {
    return '余额未知';
  }
  if (level === 'unlimited') {
    return '不限量';
  }
  if (level === 'empty') {
    return '无 Key';
  }
  return '余额正常';
}

function balanceHealthClass(summary) {
  return `balance-${summary && summary.healthLevel ? summary.healthLevel : balanceHealthLevel(summary)}`;
}

function balanceSummaryText(summary) {
  if (!summary || summary.keyCount === 0) {
    return '无 Key';
  }
  const parts = [];
  if (summary.knownCount > 0) {
    if (summary.quotaKnownCount > 0) {
      parts.push(`剩 ${formatBalanceValue(summary.remaining)} / 总 ${formatBalanceValue(summary.quota)}`);
    } else if (summary.remainingKnownCount > 0) {
      parts.push(`剩 ${formatBalanceValue(summary.remaining)}`);
    }
  }
  if (summary.unlimitedCount > 0) {
    parts.push(`不限量 ${summary.unlimitedCount}`);
  }
  if (summary.unknownCount > 0) {
    parts.push(`未知 ${summary.unknownCount}`);
  }
  return parts.join(' · ') || '余额未知';
}

function rowBalanceText(row) {
  const balance = rowBalance(row);
  if (balance.unlimited) {
    return balance.used !== null ? `不限量 · 已用 ${formatBalanceValue(balance.used)}` : '不限量';
  }
  if (!balance.known) {
    return balance.used !== null ? `已用 ${formatBalanceValue(balance.used)} · 余额未知` : '';
  }
  if (balance.quotaKnown && balance.quota !== null) {
    const used = balance.used !== null ? formatBalanceValue(balance.used) : '0';
    return `剩 ${formatBalanceValue(balance.remaining)} / 总 ${formatBalanceValue(balance.quota)} · 已用 ${used}`;
  }
  return `剩 ${formatBalanceValue(balance.remaining)}`;
}

function buildSiteOverviewRows(results = state.results) {
  return (results || [])
    .map((result) => {
      const keyRows = Array.isArray(result.keyRows) ? result.keyRows : result.rows || [];
      const entries = result && result.ok
        ? buildComparisonEntriesForResults([result], { applyFilter: false })
          .filter((entry) => toPositiveRate(entry.rate) !== null && formatRateValue(entry.rate))
        : [];
      const bestOffer = entries.length > 0 ? entries[0] : null;
      const balance = buildBalanceSummary(keyRows);
      const speed = state.speedResults[result.siteId] || null;
      const busy = state.speedBusySiteIds.includes(result.siteId);
      return {
        siteId: result.siteId,
        siteName: result.siteName || result.baseUrl,
        baseUrl: result.baseUrl,
        provider: result.provider || 'sub2api',
        ok: Boolean(result.ok),
        groupCount: result.summary && result.summary.groups !== undefined ? result.summary.groups : (result.groups || []).length,
        keyCount: keyRows.length,
        monitorCount: result.summary && result.summary.monitorRows !== undefined ? result.summary.monitorRows : (result.monitorRows || []).length,
        bestOffer,
        balance,
        error: result.error || null,
        speed,
        busy
      };
    })
    .sort((a, b) => {
      if (a.ok !== b.ok) {
        return a.ok ? -1 : 1;
      }
      const rateA = a.bestOffer ? a.bestOffer.rate : Number.POSITIVE_INFINITY;
      const rateB = b.bestOffer ? b.bestOffer.rate : Number.POSITIVE_INFINITY;
      if (rateA !== rateB) {
        return rateA - rateB;
      }
      if (a.keyCount !== b.keyCount) {
        return b.keyCount - a.keyCount;
      }
      return String(a.siteName || '').localeCompare(String(b.siteName || ''), 'zh-Hans-CN');
    });
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
    upsertGroupOption(groupMap, labelIndex, canonicalizeGroupOption({
      value: group.id !== undefined && group.id !== null ? String(group.id) : label,
      label,
      platform: group.platform || '',
      rate: resolveGroupRate(group, result),
      status: group.status || '',
      aliases: [group.name, group.group_name, group.groupName]
    }, result));
  }

  for (const row of keyRows) {
    if (row.groupId === null || row.groupId === undefined) {
      continue;
    }
    const label = row.groupName || `#${row.groupId}`;
    upsertGroupOption(groupMap, labelIndex, canonicalizeGroupOption({
      value: String(row.groupId),
      label,
      platform: row.platform || '',
      rate: toPositiveRate(row.customRate ?? row.defaultRate ?? row.effectiveRate),
      status: row.keyStatus || '',
      aliases: [row.groupName]
    }, result));
  }

  for (const row of monitorRows) {
    if (!row.groupName) {
      continue;
    }
    upsertGroupOption(groupMap, labelIndex, canonicalizeGroupOption({
      value: `name:${row.groupName}`,
      label: row.groupName,
      platform: row.provider || '',
      rate: toPositiveRate(row.rate ?? row.defaultRate ?? row.primaryRate ?? row.primary_rate),
      status: row.primaryStatus || row.status || '',
      aliases: [row.groupName]
    }, result));
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

function comparisonGroupFilterValueFromParts(groupName, platform) {
  return `compare:${comparisonGroupKey(groupName, platform || '-')}`;
}

function comparisonGroupFilterValue(option) {
  return comparisonGroupFilterValueFromParts(option.label, option.platform || '-');
}

function favoriteGroupKey(groupName, platform) {
  return comparisonGroupKey(groupName, platform || '-');
}

function isFavoriteGroup(group) {
  return state.favoriteGroups.includes(favoriteGroupKey(group.groupName, group.platform));
}

function normalizeStartupMode(value) {
  return ['snapshot', 'refresh', 'blank'].includes(value) ? value : 'snapshot';
}

function startupModeLabel(mode) {
  if (mode === 'refresh') {
    return '自动刷新';
  }
  if (mode === 'blank') {
    return '保持空白';
  }
  return '看上次结果';
}

async function saveFavoriteGroups() {
  if (!window.sub2api || typeof window.sub2api.savePreferences !== 'function') {
    return;
  }
  try {
    const preferences = await window.sub2api.savePreferences({
      favoriteGroups: state.favoriteGroups,
      startupMode: state.startupMode
    });
    if (preferences && Array.isArray(preferences.favoriteGroups)) {
      state.favoriteGroups = preferences.favoriteGroups;
    }
    state.startupMode = normalizeStartupMode(preferences && preferences.startupMode);
  } catch (error) {
    setStatus(error.message || '保存关注分组失败', 'bad');
  }
}

async function saveStartupMode() {
  if (!window.sub2api || typeof window.sub2api.savePreferences !== 'function') {
    return;
  }
  try {
    const preferences = await window.sub2api.savePreferences({
      favoriteGroups: state.favoriteGroups,
      startupMode: state.startupMode
    });
    state.startupMode = normalizeStartupMode(preferences && preferences.startupMode);
    if (elements.startupMode) {
      elements.startupMode.value = state.startupMode;
    }
    setStatus(`已设置启动时${startupModeLabel(state.startupMode)}`, 'ok');
  } catch (error) {
    setStatus(error.message || '启动方式保存失败', 'bad');
  }
}

async function toggleFavoriteGroup(groupName, platform) {
  const key = favoriteGroupKey(groupName, platform);
  const next = new Set(state.favoriteGroups);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  state.favoriteGroups = [...next];
  if (state.favoriteOnly && state.favoriteGroups.length === 0) {
    state.favoriteOnly = false;
  }
  renderResults();
  await saveFavoriteGroups();
}

function groupOptionsFromResults(results) {
  const optionMap = new Map();
  for (const result of results || []) {
    if (!result || !result.ok) {
      continue;
    }
    for (const option of groupOptionsFromResult(result)) {
      const value = comparisonGroupFilterValue(option);
      const rate = toPositiveRate(option.rate);
      const existing = optionMap.get(value);
      const siteNames = new Set(existing ? existing.siteNames || [] : []);
      siteNames.add(result.siteName || result.baseUrl || result.siteId);
      const aliases = new Set([
        ...(existing ? existing.aliases || [] : []),
        ...(option.aliases || []),
        normalizeText(option.label)
      ]);
      const rates = [
        ...(existing ? existing.rates || [] : []),
        ...(rate === null ? [] : [rate])
      ];

      optionMap.set(value, {
        value,
        label: option.label,
        platform: option.platform || '',
        rate: rates.length ? Math.min(...rates) : null,
        status: `${siteNames.size} 家报价`,
        aliases: [...aliases].filter(Boolean),
        siteNames: [...siteNames],
        rates
      });
    }
  }

  return [...optionMap.values()].sort((a, b) => {
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
  const optionPlatform = normalizeText(option.platform);
  const rowPlatform = normalizeText(row.platform || row.provider);
  if (optionPlatform && optionPlatform !== '-' && rowPlatform && optionPlatform !== rowPlatform) {
    return false;
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
  const activeOption = activeFilterOption();
  if (activeOption && optionMatchesRow(activeOption, row)) {
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

function countRowsForResults(results, groupFilter) {
  return (results || []).reduce((total, result) => {
    const counts = countRowsForFilter(result, groupFilter);
    return {
      keys: total.keys + counts.keys,
      monitors: total.monitors + counts.monitors,
      total: total.total + counts.total
    };
  }, { keys: 0, monitors: 0, total: 0 });
}

function groupTotalForEntry(entry, options) {
  if (entry.kind === 'all') {
    return options.length;
  }
  if (entry.kind === 'group') {
    return 1;
  }
  return entry.counts.total;
}

function groupEntryMatchesSearch(entry, query) {
  if (!query) {
    return true;
  }
  const haystack = [
    entry.label,
    entry.platform,
    entry.status,
    ...(entry.siteNames || []),
    ...(entry.aliases || []),
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

function currentGroupEntry(result, options = groupOptionsFromResult(result), countForFilter = (value) => countRowsForFilter(result, value)) {
  if (state.groupFilter === 'all') {
    return {
      value: 'all',
      label: '全部分组',
      platform: '全站比价',
      rate: null,
      status: '',
      kind: 'all',
      counts: countForFilter('all')
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
      counts: countForFilter('ungrouped')
    };
  }
  const option = options.find((item) => String(item.value) === String(state.groupFilter));
  if (option) {
    return {
      ...option,
      kind: 'group',
      counts: countForFilter(option.value)
    };
  }
  return null;
}

function renderGroupDirectory(result) {
  if (elements.groupFilterLabel) {
    elements.groupFilterLabel.textContent = '分组筛选';
  }

  const site = selectedSite();
  const successResults = successfulResults();
  const useAllSiteGroups = successResults.length > 1;
  const directoryResults = useAllSiteGroups ? successResults : result && result.ok ? [result] : [];
  if (elements.groupSourceText) {
    elements.groupSourceText.textContent = result && result.ok ? groupSourceLabel(result) : '未查询';
  }
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
  if (!result && directoryResults.length === 0) {
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
  if (result && !result.ok && directoryResults.length === 0) {
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

  const countForFilter = (value) => useAllSiteGroups
    ? countRowsForResults(directoryResults, value)
    : countRowsForFilter(result, value);
  const options = useAllSiteGroups
    ? groupOptionsFromResults(directoryResults)
    : groupOptionsFromResult(result);
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
      platform: useAllSiteGroups ? `${directoryResults.length} 个站点` : '全站比价',
      rate: null,
      status: '',
      kind: 'all'
    },
    {
      value: 'ungrouped',
      label: '未绑定',
      platform: useAllSiteGroups ? '全站未绑定 Key / 监控' : '无分组 Key / 监控',
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
    counts: countForFilter(entry.value)
  }));

  const currentEntry = currentGroupEntry(result, options, countForFilter) || entries[0];
  if (elements.groupDropdownValue) {
    elements.groupDropdownValue.textContent = currentEntry.label;
  }
  if (elements.groupDropdownMeta) {
    const currentRate = toPositiveRate(currentEntry.rate);
    elements.groupDropdownMeta.textContent = currentRate === null
      ? `${options.length} 个分组 · ${useAllSiteGroups ? `${directoryResults.length} 个站点` : '按倍率排序'}`
      : [currentEntry.platform || '分组', `x${formatRateValue(currentRate)}`, currentEntry.status].filter(Boolean).join(' · ');
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
      const groupTotal = groupTotalForEntry(entry, options);
      const empty = groupTotal === 0 && entry.kind !== 'all' ? ' is-empty' : '';
      const rate = toPositiveRate(entry.rate) !== null ? `x${formatRateValue(entry.rate)}` : '';
      const status = entry.status && entry.status !== 'active' ? entry.status : '';
      const meta = [entry.platform, status].filter(Boolean);
      const totalLabel = String(groupTotal);

      return `
        <button class="group-row${active}${empty}" type="button" data-group-value="${escapeHtml(entry.value)}" aria-pressed="${entry.value === state.groupFilter ? 'true' : 'false'}">
          <span class="group-line">
            <span class="group-name">${escapeHtml(entry.label)}</span>
            <span class="group-total">${escapeHtml(totalLabel)}</span>
          </span>
          <span class="group-meta">
            ${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
            ${rate ? `<strong class="group-rate-chip">${escapeHtml(rate)}</strong>` : ''}
          </span>
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
      syncSelectedSiteToBestOfferForActiveFilter();
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
  const aggregateOption = groupOptionsFromResults(successfulResults()).find((option) => String(option.value) === String(state.groupFilter));
  if (aggregateOption) {
    return aggregateOption;
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

function buildComparisonEntriesForResults(results, options = {}) {
  const entries = [];
  const seen = new Map();
  const applyFilter = options.applyFilter !== false;

  for (const result of results || []) {
    for (const option of groupOptionsFromResult(result)) {
      if (applyFilter && !optionMatchesActiveFilter(option)) {
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

function buildComparisonEntries(options = {}) {
  return buildComparisonEntriesForResults(successfulResults(), options);
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

function filteredComparisonGroups() {
  const entries = buildComparisonEntries().filter((entry) => toPositiveRate(entry.rate) !== null && formatRateValue(entry.rate));
  const groups = buildPriceComparisonGroups(entries);
  return state.favoriteOnly ? groups.filter(isFavoriteGroup) : groups;
}

function globalComparisonGroups() {
  const entries = buildComparisonEntries({ applyFilter: false }).filter((entry) => toPositiveRate(entry.rate) !== null && formatRateValue(entry.rate));
  return buildPriceComparisonGroups(entries);
}

function offerSitesText(offers, limit = 3) {
  const names = offers.map((offer) => offer.siteName || offer.baseUrl).filter(Boolean);
  const visible = names.slice(0, limit).join(' / ');
  const extra = names.length > limit ? ` / +${names.length - limit}` : '';
  return `${visible}${extra}`;
}

function runnerUpText(group) {
  if (!group || group.offerCount <= 1) {
    return '';
  }
  if (group.runnerUpRate === null) {
    return '无次优报价';
  }
  const delta = group.deltaToRunnerUp === null ? '' : ` · 差 x${formatRateValue(group.deltaToRunnerUp)}`;
  return `次优 x${formatRateValue(group.runnerUpRate)}${delta}`;
}

function renderGlobalBestOffer(group) {
  if (!elements.bestOffer) {
    return;
  }
  if (!group) {
    elements.bestOffer.innerHTML = '<div class="empty-state compact"><strong>没有拿到有效倍率</strong><span>检查 Token 或站点分组接口。</span></div>';
    return;
  }

  const bestLabel = group.bestSites.length > 1
    ? `全局最低 · 并列 ${group.bestSites.length} 站`
    : '全局最低';
  const bestSite = group.bestSites[0];
  elements.bestOffer.innerHTML = `
    <button class="best-offer-card" type="button" data-comparison-key="${escapeHtml(group.key)}" data-site-id="${escapeHtml(bestSite.siteId)}" data-group-name="${escapeHtml(group.groupName)}" data-platform="${escapeHtml(group.platform)}">
      <span class="best-kicker">${escapeHtml(bestLabel)}</span>
      <strong>${escapeHtml(group.groupName)}</strong>
      <span class="best-rate">x${escapeHtml(formatRateValue(group.bestRate))}</span>
      <span class="best-site">${escapeHtml(offerSitesText(group.bestSites, 4))}</span>
    </button>
  `;
}

function renderFilterOffer(selectedGroup, groups) {
  if (!elements.filterOffer) {
    return;
  }

  if (state.groupFilter === 'all') {
    elements.filterOffer.innerHTML = `
      <div class="filter-offer-card all-mode">
        <span class="filter-kicker">当前筛选结果</span>
        <strong>全部模式</strong>
        <span class="filter-rate">${escapeHtml(String(groups.length))} 个分组</span>
        <small>下方展示所有分组的最低排行</small>
      </div>
    `;
    return;
  }

  if (state.groupFilter === 'ungrouped') {
    elements.filterOffer.innerHTML = `
      <div class="filter-offer-card muted-mode">
        <span class="filter-kicker">当前筛选结果</span>
        <strong>未绑定</strong>
        <span class="filter-rate">无倍率</span>
        <small>未绑定 Key / 监控不参与倍率比价</small>
      </div>
    `;
    return;
  }

  if (!selectedGroup) {
    elements.filterOffer.innerHTML = `
      <div class="filter-offer-card muted-mode">
        <span class="filter-kicker">当前筛选结果</span>
        <strong>无报价</strong>
        <span class="filter-rate">-</span>
        <small>当前分组没有可用倍率</small>
      </div>
    `;
    return;
  }

  const bestSite = selectedGroup.bestSites[0];
  const tied = selectedGroup.bestSites.length > 1 ? ` · 并列 ${selectedGroup.bestSites.length} 站` : '';
  elements.filterOffer.innerHTML = `
    <button class="filter-offer-card" type="button" data-comparison-key="${escapeHtml(selectedGroup.key)}" data-site-id="${escapeHtml(bestSite.siteId)}" data-group-name="${escapeHtml(selectedGroup.groupName)}" data-platform="${escapeHtml(selectedGroup.platform)}">
      <span class="filter-kicker">当前分组最低${escapeHtml(tied)}</span>
      <strong>${escapeHtml(selectedGroup.groupName)}</strong>
      <span class="filter-rate">x${escapeHtml(formatRateValue(selectedGroup.bestRate))}</span>
      <small>${escapeHtml(offerSitesText(selectedGroup.bestSites, 3))}</small>
    </button>
  `;
}

function renderComparison() {
  if (!elements.bestOffer || !elements.comparisonRows) {
    return;
  }

  const allGroups = globalComparisonGroups();
  const groups = filteredComparisonGroups();
  if (elements.comparisonCount) {
    elements.comparisonCount.textContent = String(groups.length);
  }
  if (elements.favoriteCount) {
    elements.favoriteCount.textContent = String(state.favoriteGroups.length);
  }
  if (elements.favoriteOnlyBtn) {
    elements.favoriteOnlyBtn.classList.toggle('active', state.favoriteOnly);
    elements.favoriteOnlyBtn.disabled = state.favoriteGroups.length === 0;
    elements.favoriteOnlyBtn.setAttribute('aria-pressed', state.favoriteOnly ? 'true' : 'false');
  }

  if (successfulResults().length === 0) {
    elements.bestOffer.innerHTML = '<div class="empty-state compact"><strong>暂无比价数据</strong><span>查询全部后会汇总每个站点的分组倍率。</span></div>';
    if (elements.filterOffer) {
      elements.filterOffer.innerHTML = '<div class="empty-state compact"><strong>暂无筛选结果</strong><span>查询后显示当前分组最低。</span></div>';
    }
    elements.comparisonRows.innerHTML = '';
    return;
  }

  if (allGroups.length === 0) {
    elements.bestOffer.innerHTML = '<div class="empty-state compact"><strong>没有拿到有效倍率</strong><span>检查 Token 或站点分组接口。</span></div>';
    if (elements.filterOffer) {
      elements.filterOffer.innerHTML = '<div class="empty-state compact"><strong>没有筛选报价</strong><span>当前没有可用于比价的分组。</span></div>';
    }
    elements.comparisonRows.innerHTML = '';
    return;
  }

  const globalBestGroup = allGroups[0];
  renderGlobalBestOffer(globalBestGroup);

  if (groups.length === 0) {
    renderFilterOffer(null, groups);
    elements.comparisonRows.innerHTML = state.favoriteOnly
      ? '<div class="empty-state compact"><strong>关注分组暂无报价</strong><span>取消「仅看关注」或给排行榜分组点星标。</span></div>'
      : '<div class="empty-state compact"><strong>当前筛选无报价</strong><span>切回全部分组查看完整比价。</span></div>';
    return;
  }

  const selectedGroup = selectedComparisonGroup(groups);
  state.selectedComparisonKey = selectedGroup.key;
  renderFilterOffer(selectedGroup, groups);

  elements.comparisonRows.innerHTML = groups
    .map((group, index) => {
      const active = group.key === selectedGroup.key ? ' active' : '';
      const tieText = group.bestSites.length > 1 ? `并列 ${group.bestSites.length} 家` : '最低 1 家';
      const runnerText = runnerUpText(group);
      const favorite = isFavoriteGroup(group);
      return `
        <button class="comparison-row ${index === 0 ? 'winner' : ''}${active}" type="button" aria-pressed="${group.key === selectedGroup.key ? 'true' : 'false'}" data-comparison-key="${escapeHtml(group.key)}" data-site-id="${escapeHtml(group.bestSites[0].siteId)}" data-group-name="${escapeHtml(group.groupName)}" data-platform="${escapeHtml(group.platform)}">
          <span class="favorite-cell">
            <span class="favorite-toggle ${favorite ? 'active' : ''}" role="button" tabindex="0" aria-pressed="${favorite ? 'true' : 'false'}" title="${favorite ? '取消关注' : '关注分组'}" data-group-name="${escapeHtml(group.groupName)}" data-platform="${escapeHtml(group.platform)}">${favorite ? '★' : '☆'}</span>
          </span>
          <span class="rank">${index + 1}</span>
          <span class="comparison-main">
            <strong>${escapeHtml(group.groupName)}</strong>
            <span class="comparison-meta-line">
              <span>${escapeHtml(group.platform)} · ${escapeHtml(tieText)}</span>
              <strong class="comparison-offer-count">${escapeHtml(group.offerCount)} 家报价</strong>
            </span>
          </span>
          <span class="comparison-rate">
            <strong>x${escapeHtml(formatRateValue(group.bestRate))}</strong>
            ${runnerText ? `<small>${escapeHtml(runnerText)}</small>` : ''}
          </span>
          <span class="comparison-site">
            <strong>${escapeHtml(offerSitesText(group.bestSites, 2))}</strong>
            <span>${escapeHtml(group.bestSites.length > 1 ? '全部为并列最低' : '点击查看全部报价')}</span>
          </span>
        </button>
      `;
    })
    .join('');

  for (const button of document.querySelectorAll('.best-offer-card, .comparison-row')) {
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

  for (const toggle of document.querySelectorAll('.favorite-toggle')) {
    const onToggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavoriteGroup(toggle.dataset.groupName, toggle.dataset.platform);
    };
    toggle.addEventListener('click', onToggle);
    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        onToggle(event);
      }
    });
  }
}

function speedSummaryText(speed) {
  if (!speed) {
    return '未测速';
  }
  if (speed.summary && toFiniteNumber(speed.summary.fastestLatencyMs) !== null) {
    return `最快 ${formatLatency(speed.summary.fastestLatencyMs)}`;
  }
  if (speed.error && speed.error.message) {
    return speed.error.message;
  }
  return speed.ok ? '可用' : '测速失败';
}

function speedDetailText(speed) {
  if (!speed) {
    return '未测速';
  }
  const fastest = speed.summary && toFiniteNumber(speed.summary.fastestLatencyMs) !== null
    ? formatLatency(speed.summary.fastestLatencyMs)
    : '';
  const okCount = speed.summary ? `${speed.summary.ok || 0}/${speed.summary.total || 0}` : '';
  const bestRow = Array.isArray(speed.rows)
    ? speed.rows.filter((row) => row && row.ok).sort((a, b) => (a.latencyMs || 0) - (b.latencyMs || 0))[0]
    : null;
  const model = bestRow && bestRow.model ? ` · ${bestRow.model}` : '';
  if (fastest) {
    return `${fastest}${okCount ? ` · ${okCount}` : ''}${model}`;
  }
  if (speed.error && speed.error.message) {
    return speed.error.message;
  }
  return speed.ok ? `可用${model}` : '测速失败';
}

function selectedSiteBalanceText(result) {
  if (!result || !result.ok) {
    return '-';
  }
  const rows = Array.isArray(result.keyRows) ? result.keyRows : result.rows || [];
  return balanceSummaryText(buildBalanceSummary(rows));
}

function selectedSiteBalanceSummary(result) {
  if (!result || !result.ok) {
    return buildBalanceSummary([]);
  }
  const rows = Array.isArray(result.keyRows) ? result.keyRows : result.rows || [];
  return buildBalanceSummary(rows);
}

function selectGroupFromSelectedSite(option) {
  if (!option) {
    return;
  }
  const aggregateValue = comparisonGroupFilterValueFromParts(option.label, option.platform);
  const hasAggregateValue = groupOptionsFromResults(successfulResults()).some((item) => item.value === aggregateValue);
  state.groupFilter = hasAggregateValue ? aggregateValue : option.value;
  state.selectedComparisonKey = comparisonGroupKey(option.label, option.platform);
  setGroupDropdownOpen(false);
  renderResults();
}

function renderSiteOverview() {
  if (!elements.siteOverviewRows) {
    return;
  }

  const site = selectedSite();
  const result = selectedResult();
  const speed = site ? state.speedResults[site.id] || null : null;
  const busy = site ? state.speedBusySiteIds.includes(site.id) : false;
  if (elements.speedTestAllBtn) {
    elements.speedTestAllBtn.disabled = buildSiteOverviewRows().length === 0 || state.speedBusySiteIds.length > 0;
  }
  if (elements.speedTestSelectedBtn) {
    const keyRows = result ? (Array.isArray(result.keyRows) ? result.keyRows : result.rows || []) : [];
    elements.speedTestSelectedBtn.disabled = !site || !result || !result.ok || keyRows.length === 0 || busy;
    elements.speedTestSelectedBtn.textContent = busy ? '测速中' : '模型测速';
  }
  if (elements.selectedSiteBalance) {
    const balance = selectedSiteBalanceSummary(result);
    elements.selectedSiteBalance.textContent = result && result.ok ? balanceSummaryText(balance) : '-';
    const metric = elements.selectedSiteBalance.closest('span');
    if (metric) {
      metric.className = `balance-metric ${balanceHealthClass(balance)}`;
      metric.title = result && result.ok ? `${balance.healthText} · ${balanceSummaryText(balance)}` : '尚未查询余额';
    }
  }
  if (elements.selectedSiteSpeed) {
    elements.selectedSiteSpeed.textContent = busy ? '测速中...' : speedDetailText(speed);
  }

  if (!site) {
    elements.siteOverviewRows.innerHTML = '<div class="empty-state compact"><strong>请选择站点</strong><span>左侧选中站点后，这里展示该站点所有分组。</span></div>';
    return;
  }
  if (!result) {
    elements.siteOverviewRows.innerHTML = '<div class="empty-state compact"><strong>尚未查询</strong><span>点击查询当前或查询全部后加载分组。</span></div>';
    return;
  }
  if (!result.ok) {
    const message = result.error && result.error.message ? result.error.message : '查询失败';
    elements.siteOverviewRows.innerHTML = `<div class="empty-state danger"><strong>查询失败</strong><span>${escapeHtml(message)}</span></div>`;
    return;
  }

  const options = groupOptionsFromResult(result).slice().sort((a, b) => {
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
    return String(a.label || '').localeCompare(String(b.label || ''), 'zh-Hans-CN');
  });

  if (options.length === 0) {
    elements.siteOverviewRows.innerHTML = '<div class="empty-state compact"><strong>没有分组</strong><span>没有拿到该站点的有效分组数据。</span></div>';
    return;
  }

  elements.siteOverviewRows.innerHTML = options
    .map((option) => {
      const counts = countRowsForFilter(result, option.value);
      const active = optionMatchesActiveFilter(option) && state.groupFilter !== 'all' ? ' active' : '';
      const rate = toPositiveRate(option.rate);
      const rateText = rate === null ? '无倍率' : `x${formatRateValue(rate)}`;
      const status = option.status && option.status !== 'active' ? option.status : '';
      const meta = [option.platform || '分组', status].filter(Boolean).join(' · ');
      return `
        <button class="selected-site-group-row${active}" type="button" data-group-value="${escapeHtml(option.value)}">
          <span class="site-group-main">
            <strong>${escapeHtml(option.label)}</strong>
            <small>${escapeHtml(meta || '分组')}</small>
          </span>
          <span class="site-group-rate">${escapeHtml(rateText)}</span>
          <span class="site-group-counts">
            <strong>${escapeHtml(counts.keys)} Key</strong>
            <small>${escapeHtml(counts.monitors)} 监控</small>
          </span>
          <span class="site-group-action">筛选</span>
        </button>
      `;
    })
    .join('');

  for (const button of elements.siteOverviewRows.querySelectorAll('.selected-site-group-row')) {
    button.addEventListener('click', () => {
      const option = options.find((item) => String(item.value) === String(button.dataset.groupValue));
      selectGroupFromSelectedSite(option);
    });
  }
}

async function speedTestSite(siteId) {
  if (!siteId || !window.sub2api || typeof window.sub2api.speedTestSite !== 'function') {
    return;
  }
  if (state.speedBusySiteIds.includes(siteId)) {
    return;
  }
  state.speedBusySiteIds = [...state.speedBusySiteIds, siteId];
  renderSiteOverview();
  const site = state.sites.find((item) => item.id === siteId);
  setStatus(`${site ? site.name || site.baseUrl : siteId}: 正在测速...`);
  try {
    const result = await window.sub2api.speedTestSite(siteId);
    state.speedResults = {
      ...state.speedResults,
      [siteId]: result
    };
    const fastest = result && result.summary && toFiniteNumber(result.summary.fastestLatencyMs) !== null
      ? `，最快 ${formatLatency(result.summary.fastestLatencyMs)}`
      : '';
    setStatus(`${result.siteName || siteId}: 测速完成${fastest}`, result.ok ? 'ok' : 'bad');
  } catch (error) {
    state.speedResults = {
      ...state.speedResults,
      [siteId]: {
        ok: false,
        siteId,
        error: { message: error && error.message ? error.message : '测速失败' },
        summary: { total: 0, ok: 0, failed: 0, fastestLatencyMs: null, averageLatencyMs: null },
        rows: []
      }
    };
    setStatus(`${site ? site.name || site.baseUrl : siteId}: 测速失败`, 'bad');
  } finally {
    state.speedBusySiteIds = state.speedBusySiteIds.filter((id) => id !== siteId);
    renderSiteOverview();
  }
}

async function speedTestAllSites() {
  const rows = buildSiteOverviewRows().filter((row) => row.keyCount > 0);
  for (const row of rows) {
    await speedTestSite(row.siteId);
  }
}

async function speedTestSelectedSite() {
  const site = selectedSite();
  if (!site) {
    setStatus('请选择站点', 'bad');
    return;
  }
  await speedTestSite(site.id);
}

function selectComparisonTarget(siteId, groupName, platform, comparisonKey = '') {
  const site = state.sites.find((item) => item.id === siteId);
  if (!site) {
    return;
  }
  fillForm(site, { preserveView: true, render: false });
  state.selectedComparisonKey = comparisonKey || comparisonGroupKey(groupName, platform);
  const result = selectedResult();
  const option = groupOptionsFromResult(result).find((item) => {
    const sameLabel = normalizeText(item.label) === normalizeText(groupName);
    const samePlatform = !platform || platform === '-' || !item.platform || normalizeText(item.platform) === normalizeText(platform);
    return sameLabel && samePlatform;
  });
  const aggregateValue = comparisonGroupFilterValueFromParts(groupName, platform);
  const hasAggregateValue = groupOptionsFromResults(successfulResults()).some((item) => item.value === aggregateValue);
  state.groupFilter = hasAggregateValue ? aggregateValue : option ? option.value : 'all';
  renderResults();
}

function syncSelectedSiteToBestOfferForActiveFilter() {
  if (state.groupFilter === 'all' || state.groupFilter === 'ungrouped') {
    return;
  }
  const groups = filteredComparisonGroups();
  const selectedGroup = selectedComparisonGroup(groups);
  const bestSiteId = selectedGroup && selectedGroup.bestSites[0] ? selectedGroup.bestSites[0].siteId : '';
  if (!bestSiteId || bestSiteId === state.selectedId) {
    return;
  }
  const site = state.sites.find((item) => item.id === bestSiteId);
  if (site) {
    fillForm(site, { preserveView: true, render: false });
  }
}

function filteredKeyRows() {
  const result = selectedResult();
  const rows = result ? result.keyRows || result.rows || [] : [];
  return rows.filter((row) => rowMatchesGroup(row));
}

function filteredMonitorRows() {
  if (state.groupFilter === 'all' && successfulResults().length > 1) {
    return successfulResults().flatMap((result) =>
      (result.monitorRows || []).map((row) => ({
        ...row,
        siteId: result.siteId,
        siteName: row.siteName || result.siteName,
        baseUrl: row.baseUrl || result.baseUrl
      }))
    );
  }
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
  renderSiteOverview();

  if (rows.length === 0) {
    elements.resultRows.innerHTML = '<tr><td class="empty-row" colspan="9">当前站点暂无 API Key 结果</td></tr>';
  } else {
    elements.resultRows.innerHTML = rows
      .map((row) => {
        const defaultRate = toPositiveRate(row.defaultRate) === null ? '' : formatRateValue(row.defaultRate);
        const custom = toPositiveRate(row.customRate) === null ? '' : formatRateValue(row.customRate);
        const effective = toPositiveRate(row.effectiveRate) === null ? '' : formatRateValue(row.effectiveRate);
        const statusClass = statusClassForValue(row.keyStatus);
        const quota = rowBalanceText(row);
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
        const statusClass = statusClassForValue(row.primaryStatus);
        const siteMeta = row.siteName
          ? `<div class="mono">${escapeHtml(row.siteName)}${row.baseUrl ? ` · ${escapeHtml(row.baseUrl)}` : ''}</div>`
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
            <td><div>${escapeHtml(row.name)}</div><div class="mono">#${escapeHtml(row.monitorId)}</div>${siteMeta}</td>
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

  setFailureStatusFromResults();
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
    closeSiteModal();
    setStatus('已保存', 'ok');
  } catch (error) {
    setStatus(error.message || '保存失败', 'bad');
  }
}

async function deleteSite() {
  const targetId = elements.siteId && elements.siteId.value ? elements.siteId.value : state.selectedId;
  if (!targetId) {
    return;
  }

  await window.sub2api.deleteSite(targetId);
  closeSiteModal();
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
  await saveCurrentSnapshot();
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

async function loadPreferences() {
  if (!window.sub2api || typeof window.sub2api.getPreferences !== 'function') {
    return;
  }
  try {
    const preferences = await window.sub2api.getPreferences();
    state.favoriteGroups = Array.isArray(preferences && preferences.favoriteGroups)
      ? preferences.favoriteGroups
      : [];
    state.startupMode = normalizeStartupMode(preferences && preferences.startupMode);
  } catch {
    state.favoriteGroups = [];
    state.startupMode = 'snapshot';
  }
  if (elements.startupMode) {
    elements.startupMode.value = state.startupMode;
  }
}

function updateSnapshotButton(snapshot = null) {
  if (!elements.loadSnapshotBtn) {
    return;
  }
  const hasSnapshot = Boolean(snapshot || state.hasResultSnapshot);
  elements.loadSnapshotBtn.disabled = !hasSnapshot;
  elements.loadSnapshotBtn.textContent = hasSnapshot ? '上次结果' : '无上次结果';
  const updatedAt = snapshot && snapshot.updatedAt ? snapshot.updatedAt : state.resultSnapshotUpdatedAt;
  elements.loadSnapshotBtn.title = updatedAt ? `加载 ${formatDate(updatedAt)} 的本地快照` : '暂无本地快照';
}

async function saveCurrentSnapshot() {
  if (!window.sub2api || typeof window.sub2api.saveResultSnapshot !== 'function') {
    return null;
  }
  if (!Array.isArray(state.results) || state.results.length === 0) {
    return null;
  }
  try {
    const snapshot = await window.sub2api.saveResultSnapshot({
      selectedId: state.selectedId,
      results: state.results
    });
    state.hasResultSnapshot = Boolean(snapshot);
    state.resultSnapshotUpdatedAt = snapshot && snapshot.updatedAt ? snapshot.updatedAt : '';
    updateSnapshotButton(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

async function loadResultSnapshot(options = {}) {
  if (!window.sub2api || typeof window.sub2api.getResultSnapshot !== 'function') {
    updateSnapshotButton(null);
    return null;
  }
  let snapshot = null;
  try {
    snapshot = await window.sub2api.getResultSnapshot();
  } catch {
    snapshot = null;
  }

  state.hasResultSnapshot = Boolean(snapshot && Array.isArray(snapshot.results) && snapshot.results.length > 0);
  state.resultSnapshotUpdatedAt = state.hasResultSnapshot && snapshot.updatedAt ? snapshot.updatedAt : '';
  updateSnapshotButton(snapshot);

  if (!state.hasResultSnapshot) {
    if (!options.silent) {
      renderResults();
      setStatus(state.sites.length > 0 ? '本地暂无上次结果，点击查询全部获取最新数据。' : '请先保存站点');
    }
    return null;
  }

  if (options.apply === false) {
    return snapshot;
  }

  state.results = snapshot.results;
  if (snapshot.selectedId && state.sites.some((site) => site.id === snapshot.selectedId)) {
    const site = state.sites.find((item) => item.id === snapshot.selectedId);
    fillForm(site, { render: false });
  }
  renderResults();
  if (!options.silent) {
    setStatus(`已加载上次结果 ${formatDate(snapshot.updatedAt)}，可点击查询全部刷新。`, 'ok');
  }
  return snapshot;
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
let contentColumnSplitRatio = 0.5;

function contentColumnAvailableWidth(contentColumn) {
  const availableWidth = Math.max(0, contentColumn.offsetWidth - CONTENT_COLUMN_HANDLE_WIDTH);
  const styles = getComputedStyle(contentColumn);
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  return Math.max(0, availableWidth - columnGap * 2);
}

function defaultContentColumnLeftWidth(contentColumn) {
  return Math.round(contentColumnAvailableWidth(contentColumn) * contentColumnSplitRatio);
}

function rememberContentColumnSplit(contentColumn, leftWidth) {
  const availableWidth = contentColumnAvailableWidth(contentColumn);
  if (availableWidth <= 0 || leftWidth === null || leftWidth === undefined) {
    return;
  }
  contentColumnSplitRatio = clampNumber(leftWidth / availableWidth, 0.35, 0.65);
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
  const handleWidth = CONTENT_COLUMN_HANDLE_WIDTH;
  const availableWidth = contentColumnAvailableWidth(contentColumn);
  const minColumnWidth = Math.min(300, Math.max(220, Math.round(availableWidth * 0.35)));
  const maxLeft = availableWidth - minColumnWidth;
  if (maxLeft <= minColumnWidth) {
    contentColumn.style.gridTemplateColumns = '';
    return null;
  }
  const nextLeft = clampNumber(leftWidth, minColumnWidth, maxLeft);
  const rightWidth = availableWidth - nextLeft;
  contentColumn.style.gridTemplateColumns = `${nextLeft}px ${handleWidth}px ${rightWidth}px`;
  rememberContentColumnSplit(contentColumn, nextLeft);
  return nextLeft;
}

function resyncContentColumnSplit(contentColumn) {
  if (!contentColumn || !contentColumn.style.gridTemplateColumns) {
    return;
  }
  applyContentColumnSplit(contentColumn, defaultContentColumnLeftWidth(contentColumn));
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
  try {
    state.results = await window.sub2api.queryAll();
    state.selectedComparisonKey = '';
    renderResults();
    await saveCurrentSnapshot();
    await loadSites();

    const failed = state.results.filter((result) => !result.ok).length;
    if (failed) {
      setFailureStatusFromResults();
    } else {
      setStatus('查询完成', 'ok');
    }
  } catch (error) {
    setStatus(error.message || '批量查询失败', 'bad');
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  elements.queryAllBtn.disabled = isBusy;
  elements.querySelectedBtn.disabled = isBusy;
  if (elements.loadSnapshotBtn) {
    elements.loadSnapshotBtn.disabled = isBusy || !state.hasResultSnapshot;
  }
  if (elements.startupMode) {
    elements.startupMode.disabled = isBusy;
  }
  elements.browserLoginBtn.disabled = isBusy;
  elements.captureTokenBtn.disabled = isBusy;
  if (elements.editSiteBtn) {
    elements.editSiteBtn.disabled = isBusy || !state.selectedId;
  }
  if (elements.speedTestSelectedBtn) {
    elements.speedTestSelectedBtn.disabled = isBusy || elements.speedTestSelectedBtn.disabled;
  }
  elements.saveSiteBtn.disabled = isBusy;
  elements.deleteSiteBtn.disabled = isBusy;
}

async function init() {
  elements.siteForm.addEventListener('submit', saveSite);
  elements.newSiteBtn.addEventListener('click', prepareNewSite);
  if (elements.editSiteBtn) {
    elements.editSiteBtn.addEventListener('click', editSelectedSite);
  }
  if (elements.closeSiteModalBtn) {
    elements.closeSiteModalBtn.addEventListener('click', closeSiteModal);
  }
  if (elements.siteModal) {
    elements.siteModal.addEventListener('click', (event) => {
      if (event.target === elements.siteModal) {
        closeSiteModal();
      }
    });
  }
  elements.deleteSiteBtn.addEventListener('click', deleteSite);
  elements.browserLoginBtn.addEventListener('click', openBrowserLogin);
  elements.captureTokenBtn.addEventListener('click', captureLoginTokens);
  if (elements.loadSnapshotBtn) {
    elements.loadSnapshotBtn.addEventListener('click', () => {
      loadResultSnapshot();
    });
  }
  if (elements.startupMode) {
    elements.startupMode.addEventListener('change', () => {
      state.startupMode = normalizeStartupMode(elements.startupMode.value);
      saveStartupMode();
    });
  }
  elements.querySelectedBtn.addEventListener('click', querySelected);
  elements.queryAllBtn.addEventListener('click', queryAll);
  if (elements.favoriteOnlyBtn) {
    elements.favoriteOnlyBtn.addEventListener('click', () => {
      state.favoriteOnly = !state.favoriteOnly;
      state.selectedComparisonKey = '';
      renderResults();
    });
  }
  if (elements.speedTestAllBtn) {
    elements.speedTestAllBtn.addEventListener('click', speedTestAllSites);
  }
  if (elements.speedTestSelectedBtn) {
    elements.speedTestSelectedBtn.addEventListener('click', speedTestSelectedSite);
  }
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
    if (event.key === 'Escape') {
      if (state.groupDropdownOpen) {
        setGroupDropdownOpen(false);
      } else if (elements.siteModal && !elements.siteModal.hidden) {
        closeSiteModal();
      }
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
      resyncContentColumnSplit(contentColumn);
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
      const nextLeft = applyContentColumnSplit(contentColumn, innerStartLeftWidth + diff);
      rememberContentColumnSplit(contentColumn, nextLeft);
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
    resyncContentColumnSplit(contentColumn);
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

  await loadPreferences();
  await loadSites();

  if (state.startupMode === 'refresh') {
    await loadResultSnapshot({ silent: true, apply: false });
    if (state.sites.length > 0) {
      await queryAll();
    } else {
      renderResults();
      updateSnapshotButton(null);
      setStatus('请先保存站点');
    }
    return;
  }

  if (state.startupMode === 'blank') {
    await loadResultSnapshot({ silent: true, apply: false });
    renderResults();
    setStatus(state.sites.length > 0 ? '启动为空白模式，可点击上次结果或查询全部。' : '请先保存站点');
    return;
  }

  const snapshot = await loadResultSnapshot({ silent: true });
  if (snapshot) {
    setStatus(`已加载上次结果 ${formatDate(snapshot.updatedAt)}，可点击查询全部刷新。`, 'ok');
  } else {
    renderResults();
    updateSnapshotButton(null);
    setStatus(state.sites.length > 0 ? '本地暂无上次结果，点击查询全部获取最新数据。' : '请先保存站点');
  }
}

const rendererTestHooks = {
  formatRate,
  formatRateValue,
  toFiniteNumber,
  toPositiveRate,
  parseGroupAliasRules,
  buildBalanceSummary,
  balanceSummaryText,
  balanceHealthLevel,
  balanceHealthText,
  balanceHealthClass,
  rowBalanceText,
  buildSiteOverviewRows,
  buildPriceComparisonGroups,
  renderComparison,
  renderSiteOverview,
  renderResults,
  __getTestState() {
    return { ...state };
  },
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
