'use strict';

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

async function run() {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1365,
    height: 768,
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
        windowWidth: window.innerWidth
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
      const mkResult = (site, ccRate, fastRate) => ({
        ok: true,
        siteId: site.id,
        siteName: site.name,
        baseUrl: site.baseUrl,
        provider: site.provider,
        groupSource: 'admin',
        groups: [
          { id: 'cc-max', name: 'cc-max', platform: 'anthropic', rate: ccRate },
          { id: 'fast', name: 'fast', platform: 'openai', rate: fastRate },
          { id: 'zero', name: 'zero', platform: 'openai', rate: 0 }
        ],
        keyRows: [],
        monitorRows: [],
        summary: { groups: 3, keyRows: 0, monitorRows: 0 }
      });

      hooks.__setTestState({
        sites,
        selectedId: 'a',
        results: [
          mkResult(sites[0], 0.4, 0.6),
          mkResult(sites[1], 0.4, 0.7),
          mkResult(sites[2], 0.45, 0.8)
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
      const ccRow = document.querySelector('.comparison-row[data-group-name="cc-max"]');
      if (!ccRow) {
        throw new Error('cc-max comparison row is missing');
      }
      ccRow.click();
      return {
        bestText,
        rankingText,
        detailText,
        rowsBeforeClick,
        offerRows,
        bestOfferRows,
        selectedSiteTitle: document.getElementById('selectedSiteTitle').textContent,
        selectedGroupLabel: document.getElementById('groupDropdownValue').textContent,
        bodyWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth
      };
    })()
  `);

  if (!comparison.bestText.includes('并列最低 · 2 个站点')) {
    throw new Error('Tied best offer copy is missing');
  }
  if (!comparison.rankingText.includes('次优 x0.45 · 差 x0.05')) {
    throw new Error('Runner-up delta is missing from ranking');
  }
  if (comparison.rowsBeforeClick < 2 || comparison.offerRows !== 3 || comparison.bestOfferRows !== 2) {
    throw new Error('Comparison ranking or offer details did not render expected rows');
  }
  if (!comparison.detailText.includes('https://a.test') || !comparison.detailText.includes('https://b.test')) {
    throw new Error('Tied site addresses are missing from offer details');
  }
  if (comparison.selectedSiteTitle !== 'Alpha Relay' || comparison.selectedGroupLabel !== 'cc-max') {
    throw new Error('Clicking a comparison row did not sync site and group selection');
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
