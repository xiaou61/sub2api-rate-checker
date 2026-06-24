'use strict';

const path = require('node:path');
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

async function run() {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1000,
    height: 650,
    show: false,
    webPreferences: {
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
        hasComparisonOffers: Boolean(document.getElementById('comparisonOffers')),
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        topbar: rect('.topbar'),
        siteColumn: rect('.site-column'),
        contentColumn: rect('.content-column'),
        statusBar: rect('.status-bar'),
        comparisonPanel: rect('.comparison-panel'),
        detailHead: rect('.detail-head'),
        summaryStrip: rect('.summary-strip'),
        resultsPanel: rect('.results-panel'),
        monitorPanel: rect('.monitor-panel'),
        failuresPanel: rect('.failures-panel')
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
  if (!result.hasComparisonRows || !result.hasComparisonOffers) {
    throw new Error('Comparison ranking or offer detail container is missing');
  }
  if (result.bodyWidth > result.windowWidth + 2) {
    throw new Error(`Renderer overflows horizontally: ${result.bodyWidth} > ${result.windowWidth}`);
  }
  if (result.bodyHeight > result.windowHeight + 2) {
    throw new Error(`Renderer overflows vertically: ${result.bodyHeight} > ${result.windowHeight}`);
  }
  for (const key of ['topbar', 'siteColumn', 'contentColumn', 'statusBar', 'comparisonPanel', 'detailHead', 'summaryStrip', 'resultsPanel', 'monitorPanel', 'failuresPanel']) {
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
  if (result.resultsPanel.height < 180 || result.monitorPanel.height < 180) {
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
            primaryStatus: site.id === 'c' ? 'active' : 'healthy',
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
      const rowsBeforeClick = document.querySelectorAll('.comparison-row').length;
      const offerRows = document.querySelectorAll('.offer-row').length;
      const bestOfferRows = document.querySelectorAll('.offer-row.best').length;
      const detailText = document.getElementById('comparisonOffers').textContent;
      const rankingText = document.getElementById('comparisonRows').textContent;
      const groupTotals = Array.from(document.querySelectorAll('.group-row')).map((row) => ({
        value: row.dataset.groupValue,
        label: row.querySelector('.group-name') ? row.querySelector('.group-name').textContent.trim() : '',
        meta: row.querySelector('.group-meta') ? row.querySelector('.group-meta').textContent.replace(/\\s+/g, ' ').trim() : '',
        total: row.querySelector('.group-total') ? row.querySelector('.group-total').textContent.trim() : '',
        counts: row.querySelector('.group-counts') ? row.querySelector('.group-counts').textContent.replace(/\\s+/g, ' ').trim() : ''
      }));
      const initialMonitorText = document.getElementById('monitorRows').textContent;
      const initialBadPills = document.querySelectorAll('#monitorRows .pill.bad').length;
      const ccRow = document.querySelector('.comparison-row[data-group-name="cc-max"]');
      if (!ccRow) {
        throw new Error('cc-max comparison row is missing');
      }
      ccRow.click();
      const bestAfterCcFilter = document.getElementById('bestOffer').textContent;
      const titleAfterCcClick = document.getElementById('selectedSiteTitle').textContent;
      const groupLabelAfterCcClick = document.getElementById('groupDropdownValue').textContent;
      const visionValue = groupLabelMapValue('vision');
      const visionRow = Array.from(document.querySelectorAll('.group-row')).find((row) => row.dataset.groupValue === visionValue);
      if (!visionRow) {
        throw new Error('vision group row is missing after cc click');
      }
      visionRow.click();
      const titleAfterVisionFilter = document.getElementById('selectedSiteTitle').textContent;
      const bestAfterVisionFilter = document.getElementById('bestOffer').textContent;
      const groupLabelAfterVisionFilter = document.getElementById('groupDropdownValue').textContent;
      return {
        bestText,
        bestAfterCcFilter,
        bestAfterVisionFilter,
        rankingText,
        detailText,
        rowsBeforeClick,
        offerRows,
        bestOfferRows,
        groupTotals,
        initialMonitorText,
        initialBadPills,
        titleAfterCcClick,
        groupLabelAfterCcClick,
        titleAfterVisionFilter,
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

  if (!comparison.bestText.includes('并列最低 · 2 个站点')) {
    throw new Error('Tied best offer copy is missing');
  }
  if (!comparison.bestAfterCcFilter.includes('cc-max') || !comparison.bestAfterCcFilter.includes('x0.4')) {
    throw new Error('Global best offer should stay on the absolute lowest group after filtering');
  }
  if (!comparison.bestAfterVisionFilter.includes('cc-max') || !comparison.bestAfterVisionFilter.includes('x0.4')) {
    throw new Error('Global best offer should not follow the selected group filter');
  }
  if (!comparison.rankingText.includes('次优 x0.45 · 差 x0.05')) {
    throw new Error('Runner-up delta is missing from ranking');
  }
  if (comparison.rowsBeforeClick < 2 || comparison.offerRows !== 3 || comparison.bestOfferRows !== 2) {
    throw new Error('Comparison ranking or offer details did not render expected rows');
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
    throw new Error('Healthy or active monitor statuses should not render as bad pills');
  }
  if (!comparison.detailText.includes('https://a.test') || !comparison.detailText.includes('https://b.test')) {
    throw new Error('Tied site addresses are missing from offer details');
  }
  if (comparison.titleAfterCcClick !== 'Alpha Relay' || comparison.groupLabelAfterCcClick !== 'cc-max') {
    throw new Error('Clicking a comparison row did not sync site and group selection');
  }
  if (comparison.titleAfterVisionFilter !== 'Gamma Relay' || comparison.groupLabelAfterVisionFilter !== 'vision') {
    throw new Error('Selecting a group from the group filter should sync to that group best site');
  }
  if (comparison.bodyWidth > comparison.windowWidth + 2) {
    throw new Error(`Renderer overflows horizontally after mock render: ${comparison.bodyWidth} > ${comparison.windowWidth}`);
  }

  console.log('ui smoke check passed');
  await win.close();
  app.quit();
}

run().catch((error) => {
  console.error(error);
  app.quit();
  process.exit(1);
});
