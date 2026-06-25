'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const electron = require('electron');

if (!electron.app) {
  const executable = typeof electron === 'string' ? electron : process.execPath;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(executable, [__filename], {
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  process.exit(result.status || 0);
}

const { app, BrowserWindow } = electron;
const tempDir = path.join(os.tmpdir(), 'sub2api-rate-checker-smoke-ui');
const preloadPath = path.join(tempDir, 'smoke-preload.cjs');

function preloadSource() {
  return `
    'use strict';

    const { contextBridge } = require('electron');

    const sites = [
      { id: 'auto-a', name: 'Auto Alpha', baseUrl: 'https://auto-a.test', provider: 'sub2api' },
      { id: 'auto-b', name: 'Auto Beta', baseUrl: 'https://auto-b.test', provider: 'sub2api' }
    ];
    let queryAllCount = 0;

    const mkResult = (site, rate) => ({
      ok: true,
      siteId: site.id,
      siteName: site.name,
      baseUrl: site.baseUrl,
      provider: site.provider,
      groupSource: 'available',
      groups: [{ id: 'auto', name: 'auto', platform: 'openai', rate }],
      keyRows: [],
      monitorRows: [],
      summary: { groups: 1, keyRows: 0, monitorRows: 0 }
    });

    contextBridge.exposeInMainWorld('sub2api', {
      listSites: async () => sites,
      storagePath: async () => 'smoke-storage.json',
      queryAll: async () => {
        queryAllCount += 1;
        return [mkResult(sites[0], 0.2), mkResult(sites[1], 0.3)];
      },
      querySite: async (id) => mkResult(sites.find((site) => site.id === id) || sites[0], 0.2),
      saveSite: async (site) => ({ ...sites[0], ...site, id: site.id || 'auto-a' }),
      deleteSite: async () => true,
      openBrowserLogin: async () => true,
      captureLoginTokens: async () => sites[0],
      onLoginUpdate: () => {},
      __smokeQueryAllCount: () => queryAllCount
    });
  `;
}

async function run() {
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(preloadPath, preloadSource());
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1000,
    height: 650,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 400));

  const result = await win.webContents.executeJavaScript(`
    (() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
          x: Math.round(box.x),
          y: Math.round(box.y)
        };
      };
      const provider = document.getElementById('provider');
      const newApiUserId = document.getElementById('newApiUserId');
      const title = document.querySelector('h1');
      return {
        title: title ? title.textContent.trim() : '',
        hasProvider: Boolean(provider),
        providerOptions: provider ? [...provider.options].map((option) => option.value) : [],
        hasNewApiUserId: Boolean(newApiUserId),
        hasGroupDropdown: Boolean(document.getElementById('groupDropdownBtn')),
        hasComparisonRows: Boolean(document.getElementById('comparisonRows')),
        hasFilterOffer: Boolean(document.getElementById('filterOffer')),
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        topbar: rect('.topbar'),
        siteColumn: rect('.site-column'),
        contentColumn: rect('.content-column'),
        statusBar: rect('.status-bar'),
        statusText: document.getElementById('statusBar') ? document.getElementById('statusBar').textContent : '',
        queryAllCount: window.sub2api.__smokeQueryAllCount(),
        comparisonPanel: rect('.comparison-panel'),
        comparisonHead: rect('.comparison-head'),
        detailHead: rect('.detail-head'),
        bestOffer: rect('#bestOffer'),
        filterOffer: rect('#filterOffer'),
        summaryStrip: rect('.summary-strip'),
        resultsPanel: rect('.results-panel'),
        monitorPanel: rect('.monitor-panel'),
        hasFailuresPanel: Boolean(document.querySelector('.failures-panel'))
      };
    })()
  `);

  if (!result.hasProvider || !result.providerOptions.includes('sub2api') || !result.providerOptions.includes('newapi')) {
    throw new Error('Provider selector is missing or incomplete');
  }
  if (!result.hasNewApiUserId) {
    throw new Error('New API User ID input is missing');
  }
  if (!result.hasGroupDropdown) {
    throw new Error('Group dropdown is missing');
  }
  if (result.queryAllCount !== 1 || !result.statusText.includes('查询完成')) {
    throw new Error(`Renderer should query all sites automatically on startup: count=${result.queryAllCount}, status=${result.statusText}`);
  }
  if (!result.hasComparisonRows || !result.hasFilterOffer) {
    throw new Error('Comparison ranking or filter offer container is missing');
  }
  if (result.bodyWidth > result.windowWidth + 2) {
    throw new Error(`Renderer overflows horizontally: ${result.bodyWidth} > ${result.windowWidth}`);
  }
  if (result.bodyHeight > result.windowHeight + 2) {
    throw new Error(`Renderer overflows vertically: ${result.bodyHeight} > ${result.windowHeight}`);
  }
  if (result.hasFailuresPanel) {
    throw new Error('Failure panel should be removed; errors must render in the status bar');
  }
  for (const key of ['topbar', 'siteColumn', 'contentColumn', 'statusBar', 'comparisonPanel', 'detailHead', 'summaryStrip', 'resultsPanel', 'monitorPanel']) {
    if (!result[key] || result[key].width <= 0 || result[key].height <= 0) {
      throw new Error(`Layout region is missing or collapsed: ${key}`);
    }
  }
  if (result.topbar.height < 68 || result.topbar.height > 86) {
    throw new Error(`Unexpected topbar height: ${result.topbar.height}`);
  }
  if (result.siteColumn.width < 270 || result.siteColumn.width > 310) {
    throw new Error(`Unexpected site column width: ${result.siteColumn.width}`);
  }
  if (result.comparisonPanel.height < 150 || result.comparisonHead.height < 60) {
    throw new Error(`Comparison panel is too short: panel=${result.comparisonPanel.height}, head=${result.comparisonHead.height}`);
  }
  if (result.detailHead.height < 110 || result.bestOffer.height < 80 || result.filterOffer.height < 80) {
    throw new Error(`Top offer area is too short: detail=${result.detailHead.height}, best=${result.bestOffer.height}, filter=${result.filterOffer.height}`);
  }
  if (result.resultsPanel.height < 150 || result.monitorPanel.height < 150) {
    throw new Error(`Data panels are too short: results=${result.resultsPanel.height}, monitor=${result.monitorPanel.height}`);
  }
  const comparison = await win.webContents.executeJavaScript(`
    (() => {
      const hooks = window.__sub2apiRendererTestHooks;
      if (!hooks || typeof hooks.__setTestState !== 'function') {
        throw new Error('Renderer test hooks are missing');
      }
      const sites = [
        { id: 'a', name: 'Alpha Relay', baseUrl: 'https://a.test', provider: 'sub2api' },
        { id: 'b', name: 'Beta Relay', baseUrl: 'https://b.test', provider: 'sub2api' },
        { id: 'c', name: 'Gamma Relay', baseUrl: 'https://c.test', provider: 'sub2api' }
      ];
      const mkResult = (site, ccRate, fastRate, extraGroups = []) => ({
        ok: true,
        siteId: site.id,
        siteName: site.name,
        baseUrl: site.baseUrl,
        provider: site.provider,
        groupSource: 'admin',
        groups: [
          { id: 'cc-max', name: 'cc-max', platform: 'anthropic', rate: ccRate },
          { id: 'fast', name: 'fast', platform: 'openai', rate: fastRate },
          { id: 'zero', name: 'zero', platform: 'openai', rate: 0 },
          ...extraGroups
        ],
        keyRows: [],
        monitorRows: [
          {
            monitorId: site.id + '-m1',
            name: site.name + ' Monitor',
            groupName: 'cc-max',
            provider: 'anthropic',
            primaryModel: 'claude-test',
            primaryStatus: site.id === 'b' ? 'degraded' : site.id === 'c' ? 'operational' : 'healthy',
            primaryLatencyMs: 120,
            availability7d: 99.2,
            modelCount: 1,
            models: []
          }
        ],
        summary: { groups: 3, keyRows: 0, monitorRows: 0 }
      });

      hooks.__setTestState({
        sites,
        selectedId: 'a',
        results: [
          mkResult(sites[0], 0.4, 0.6),
          mkResult(sites[1], 0.4, 0.7),
          mkResult(sites[2], 0.45, 0.8, [
            { id: 'vision', name: 'vision', platform: 'gemini', rate: 0.5 }
          ])
        ],
        groupFilter: 'all',
        groupSearch: '',
        groupDropdownOpen: false,
        selectedComparisonKey: ''
      });
      hooks.renderResults();

      const bestText = document.getElementById('bestOffer').textContent;
      const filterText = document.getElementById('filterOffer').textContent;
      const bestOfferParentClass = document.getElementById('bestOffer').parentElement.className;
      const filterOfferParentClass = document.getElementById('filterOffer').parentElement.className;
      const rowsBeforeClick = document.querySelectorAll('.comparison-row').length;
      const hasOfferPanel = Boolean(document.getElementById('comparisonOffers'));
      const rankingText = document.getElementById('comparisonRows').textContent;
      const comparisonSiteText = document.querySelector('.comparison-site strong')?.textContent || '';
      const groupTotals = Array.from(document.querySelectorAll('.group-row')).map((row) => ({
        value: row.dataset.groupValue,
        label: row.querySelector('.group-name') ? row.querySelector('.group-name').textContent.trim() : '',
        meta: row.querySelector('.group-meta') ? row.querySelector('.group-meta').textContent.replace(/\\s+/g, ' ').trim() : '',
        total: row.querySelector('.group-total') ? row.querySelector('.group-total').textContent.trim() : '',
        counts: row.querySelector('.group-counts') ? row.querySelector('.group-counts').textContent.replace(/\\s+/g, ' ').trim() : ''
      }));
      const initialMonitorText = document.getElementById('monitorRows').textContent;
      const initialBadPills = document.querySelectorAll('#monitorRows .pill.bad').length;
      const initialWarnPills = document.querySelectorAll('#monitorRows .pill.warn').length;
      const ccRow = document.querySelector('.comparison-row[data-group-name="cc-max"]');
      if (!ccRow) {
        throw new Error('cc-max comparison row is missing');
      }
      ccRow.click();
      const bestAfterCcFilter = document.getElementById('bestOffer').textContent;
      const filterAfterCcFilter = document.getElementById('filterOffer').textContent;
      const titleAfterCcClick = document.getElementById('selectedSiteTitle').textContent;
      const selectedIdAfterCcClick = hooks.__getTestState().selectedId;
      const groupLabelAfterCcClick = document.getElementById('groupDropdownValue').textContent;
      const visionValue = groupLabelMapValue('vision');
      const visionRow = Array.from(document.querySelectorAll('.group-row')).find((row) => row.dataset.groupValue === visionValue);
      if (!visionRow) {
        throw new Error('vision group row is missing after cc click');
      }
      visionRow.click();
      const titleAfterVisionFilter = document.getElementById('selectedSiteTitle').textContent;
      const selectedIdAfterVisionFilter = hooks.__getTestState().selectedId;
      const bestAfterVisionFilter = document.getElementById('bestOffer').textContent;
      const filterAfterVisionFilter = document.getElementById('filterOffer').textContent;
      const groupLabelAfterVisionFilter = document.getElementById('groupDropdownValue').textContent;
      return {
        bestText,
        filterText,
        bestOfferParentClass,
        filterOfferParentClass,
        bestAfterCcFilter,
        filterAfterCcFilter,
        bestAfterVisionFilter,
        filterAfterVisionFilter,
        rankingText,
        comparisonSiteText,
        rowsBeforeClick,
        hasOfferPanel,
        groupTotals,
        initialMonitorText,
        initialBadPills,
        initialWarnPills,
        titleAfterCcClick,
        selectedIdAfterCcClick,
        groupLabelAfterCcClick,
        titleAfterVisionFilter,
        selectedIdAfterVisionFilter,
        groupLabelAfterVisionFilter,
        bodyWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth
      };

      function groupLabelMapValue(label) {
        const row = Array.from(document.querySelectorAll('.group-row')).find((item) => {
          const name = item.querySelector('.group-name');
          return name && name.textContent.trim() === label;
        });
        if (!row) {
          throw new Error('group row is missing: ' + label);
        }
        return row.dataset.groupValue;
      }
    })()
  `);

  if (!comparison.bestText.includes('全局最低') || !comparison.bestText.includes('并列 2 站')) {
    throw new Error('Tied best offer copy is missing');
  }
  if (!comparison.bestOfferParentClass.includes('detail-head') || !comparison.filterOfferParentClass.includes('detail-head')) {
    throw new Error('Global and filter offer cards should render in the top-right detail area');
  }
  if (!comparison.filterText.includes('全部模式') || !comparison.filterText.includes('3 个分组')) {
    throw new Error('All-group filter result copy is missing');
  }
  if (!comparison.bestAfterCcFilter.includes('cc-max') || !comparison.bestAfterCcFilter.includes('x0.4')) {
    throw new Error('Global best offer should stay on the absolute lowest group after filtering');
  }
  if (!comparison.filterAfterCcFilter.includes('当前分组最低') || !comparison.filterAfterCcFilter.includes('cc-max') || !comparison.filterAfterCcFilter.includes('x0.4')) {
    throw new Error('Filter best offer should follow the active group after comparison row click');
  }
  if (!comparison.bestAfterVisionFilter.includes('cc-max') || !comparison.bestAfterVisionFilter.includes('x0.4')) {
    throw new Error('Global best offer should not follow the selected group filter');
  }
  if (!comparison.filterAfterVisionFilter.includes('当前分组最低') || !comparison.filterAfterVisionFilter.includes('vision') || !comparison.filterAfterVisionFilter.includes('x0.5')) {
    throw new Error('Filter best offer should follow the selected group filter');
  }
  if (!comparison.rankingText.includes('次优 x0.45 · 差 x0.05')) {
    throw new Error('Runner-up delta is missing from ranking');
  }
  if (comparison.rankingText.includes('仅 1 家报价')) {
    throw new Error('Single-offer helper text should not render in the green rate area');
  }
  if (!comparison.comparisonSiteText.includes('Alpha Relay') || comparison.comparisonSiteText.includes('https://a.test')) {
    throw new Error(`Comparison site label should prefer site names: ${comparison.comparisonSiteText}`);
  }
  if (comparison.rowsBeforeClick < 2 || comparison.hasOfferPanel) {
    throw new Error('Comparison ranking should render without the removed offer detail panel');
  }
  const groupTotalMap = new Map(comparison.groupTotals.map((entry) => [entry.value, entry]));
  const groupLabelMap = new Map(comparison.groupTotals.map((entry) => [entry.label, entry]));
  if (
    groupTotalMap.get('all')?.total !== '3' ||
    groupLabelMap.get('cc-max')?.total !== '1' ||
    groupLabelMap.get('fast')?.total !== '1' ||
    groupLabelMap.get('vision')?.total !== '1' ||
    groupTotalMap.get('ungrouped')?.total !== '0'
  ) {
    throw new Error(`Group directory totals are incorrect: ${JSON.stringify(comparison.groupTotals)}`);
  }
  if (!groupLabelMap.get('vision')?.meta.includes('gemini') || !groupLabelMap.get('vision')?.meta.includes('x0.5')) {
    throw new Error(`All-site group directory should include other-site group rates: ${JSON.stringify(comparison.groupTotals)}`);
  }
  if (groupLabelMap.get('cc-max')?.counts !== 'Key 0 监控 0') {
    throw new Error('Group key/monitor counts should remain separate from group totals');
  }
  if (!comparison.initialMonitorText.includes('Alpha Relay') || !comparison.initialMonitorText.includes('Beta Relay') || !comparison.initialMonitorText.includes('Gamma Relay')) {
    throw new Error('All-group monitor summary should show site ownership for every monitor row');
  }
  if (comparison.initialBadPills !== 0) {
    throw new Error('Healthy, active, or operational monitor statuses should not render as bad pills');
  }
  if (comparison.initialWarnPills !== 1) {
    throw new Error('Degraded monitor status should render as a warning pill');
  }
  if (comparison.selectedIdAfterCcClick !== 'a' || comparison.groupLabelAfterCcClick !== 'cc-max') {
    throw new Error('Clicking a comparison row did not sync site and group selection');
  }
  if (comparison.selectedIdAfterVisionFilter !== 'c' || comparison.groupLabelAfterVisionFilter !== 'vision') {
    throw new Error('Selecting a group from the group filter should sync to that group best site');
  }
  if (comparison.bodyWidth > comparison.windowWidth + 2) {
    throw new Error(`Renderer overflows horizontally after mock render: ${comparison.bodyWidth} > ${comparison.windowWidth}`);
  }

  await win.webContents.executeJavaScript(`
    (() => {
      const hooks = window.__sub2apiRendererTestHooks;
      if (!hooks || typeof hooks.__setTestState !== 'function') {
        throw new Error('Renderer test hooks are missing');
      }
      const failedSite = { id: 'd', name: 'Delta Relay', baseUrl: 'https://d.test', provider: 'newapi' };
      const currentState = hooks.__getTestState();
      hooks.__setTestState({
        sites: [...currentState.sites, failedSite],
        selectedId: 'd',
        results: [
          ...currentState.results,
          {
            ok: false,
            siteId: failedSite.id,
            siteName: failedSite.name,
            baseUrl: failedSite.baseUrl,
            provider: failedSite.provider,
            error: { message: '未发现 New API token', needsToken: true },
            rows: [],
            keyRows: [],
            monitorRows: []
          }
        ]
      });
      hooks.renderResults();
      const failureStatusText = document.getElementById('statusBar').textContent;
      const hasFailurePanelAfterError = Boolean(document.querySelector('.failures-panel'));
      if (hasFailurePanelAfterError || !failureStatusText.includes('1 个站点失败') || !failureStatusText.includes('未发现 New API token')) {
        throw new Error('Failure state should be shown in the status bar without a failure panel');
      }
    })()
  `);
	
	  console.log('ui smoke check passed');
  await win.close();
  app.quit();
}

run().catch((error) => {
  console.error(error);
  app.quit();
  process.exit(1);
});
