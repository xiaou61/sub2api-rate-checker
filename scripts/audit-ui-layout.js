'use strict';

const fs = require('node:fs');
const os = require('node:os');
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

const outputDir = path.join(__dirname, '..', 'layout-audit');
const tempDir = path.join(os.tmpdir(), 'sub2api-rate-checker-layout-audit');
const preloadPath = path.join(tempDir, 'audit-preload.cjs');

const viewports = [
  { name: 'default-1000x650', width: 1000, height: 650 },
  { name: 'minimum-900x600', width: 900, height: 600 },
  { name: 'wide-1280x760', width: 1280, height: 760 }
];

function preloadSource() {
  return `
    'use strict';

    const { contextBridge } = require('electron');

    const sites = [
      { id: 'site-1', name: 'renzo New API', baseUrl: 'https://api.renzo.dev', provider: 'newapi', authToken: 'token', newApiUserId: '1852568062' },
      { id: 'site-2', name: 'sub2api 备用', baseUrl: 'https://s2.example.com', provider: 'sub2api', authToken: 'token' },
      { id: 'site-3', name: 'Claude 中转', baseUrl: 'https://relay.example.net', provider: 'sub2api', authToken: 'token' },
      { id: 'site-4', name: '待修复站点', baseUrl: 'https://newapi.example.cn', provider: 'newapi' }
    ];

    const groupNames = [
      ['66api', 'new-api', 0.08],
      ['claude', 'anthropic', 0.2],
      ['gpt-4.1', 'openai', 0.4],
      ['gemini', 'google', 0.5],
      ['vision', 'openai', 0.7],
      ['azure-east', 'azure', 0.9],
      ['default', 'sub2api', 1],
      ['rerank', 'cohere', 1.1],
      ['deepseek', 'new-api', 1.3],
      ['moonshot', 'new-api', 1.5]
    ];

    const keyRows = ['sk-live...8Fa', 'sk-user...D21', 'sk-team...A09', 'sk-test...B72', 'sk-lab...C18'].map((key, index) => {
      const group = groupNames[index % groupNames.length];
      return {
        keyName: key,
        keyMasked: 'sk-****-' + index,
        keyStatus: 'active',
        groupId: group[0],
        groupName: group[0],
        platform: group[1],
        defaultRate: 1,
        customRate: group[2],
        effectiveRate: group[2],
        quota: 100,
        quotaUsed: 20 + index,
        lastUsedAt: new Date().toISOString()
      };
    });

    const monitorRows = ['Claude', 'OpenAI', 'Gemini', 'Azure'].map((name, index) => {
      const group = groupNames[(index + 1) % groupNames.length];
      return {
        name,
        monitorId: 120 + index,
        groupName: group[0],
        provider: group[1],
        primaryModel: ['claude-3.5', 'gpt-4.1', 'gemini-pro', 'gpt-4o'][index],
        primaryStatus: index === 3 ? 'failed' : 'healthy',
        primaryLatencyMs: 388 + index * 97,
        availability7d: 0.99 - index * 0.07,
        modelCount: 18 - index,
        models: [
          {
            model: '主模型',
            latest_status: index === 3 ? '失败' : '正常',
            latest_latency_ms: 388 + index * 97,
            availability_7d: 0.97 - index * 0.04
          }
        ]
      };
    });

    function successResult(site) {
      const siteOffset = Number(site.id.replace('site-', '')) || 1;
      const groups = groupNames.map(([name, platform, rate], index) => ({
        id: name,
        name,
        platform,
        rate_multiplier: Number((rate + siteOffset * 0.03 + index * 0.01).toFixed(4)),
        status: 'active'
      }));
      return {
        ok: true,
        siteId: site.id,
        siteName: site.name,
        baseUrl: site.baseUrl,
        provider: site.provider,
        summary: { groups: groups.length, keys: keyRows.length, monitors: monitorRows.length, keyRows: keyRows.length, monitorRows: monitorRows.length, rows: keyRows.length },
        groups,
        rates: Object.fromEntries(groups.map((group) => [group.id, group.rate_multiplier])),
        groupSource: site.provider === 'newapi' ? 'newapi-user-groups' : 'available',
        groupFetchFallbacks: [],
        keyRows,
        rows: keyRows,
        monitorRows
      };
    }

    const failedResult = {
      ok: false,
      siteId: 'site-4',
      siteName: '待修复站点',
      baseUrl: 'https://newapi.example.cn',
      provider: 'newapi',
      error: { message: 'New API pricing requires login; capture AccessToken with New API User ID.', needsToken: true },
      rows: [],
      keyRows: [],
      monitorRows: []
    };

    contextBridge.exposeInMainWorld('sub2api', {
      listSites: async () => sites,
      storagePath: async () => 'C:\\\\Users\\\\18525\\\\AppData\\\\Roaming\\\\sub2api-rate-checker\\\\sites.json',
      queryAll: async () => [successResult(sites[0]), successResult(sites[1]), successResult(sites[2]), failedResult],
      querySite: async (id) => successResult(sites.find((site) => site.id === id) || sites[0]),
      saveSite: async (site) => ({ ...sites[0], ...site, id: site.id || 'site-1' }),
      deleteSite: async () => true,
      openBrowserLogin: async () => true,
      captureLoginTokens: async () => sites[0],
      onLoginUpdate: () => {}
    });
  `;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSelector(win, selector) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const exists = await win.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (exists) {
      return;
    }
    await wait(100);
  }
  throw new Error(`等待元素超时: ${selector}`);
}

async function click(win, selector) {
  await waitForSelector(win, selector);
  await win.webContents.executeJavaScript(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('missing selector: ${selector}');
      element.click();
    })();
  `);
}

async function drag(win, selector, deltaX) {
  await waitForSelector(win, selector);
  await win.webContents.executeJavaScript(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('missing selector: ${selector}');
      const box = element.getBoundingClientRect();
      const x = Math.round(box.left + box.width / 2);
      const y = Math.round(box.top + box.height / 2);
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + ${Number(deltaX)}, clientY: y }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + ${Number(deltaX)}, clientY: y }));
    })();
  `);
}

async function collectMetrics(win) {
  const windowMetrics = {
    bounds: win.getBounds(),
    contentBounds: win.getContentBounds()
  };
  const domMetrics = await win.webContents.executeJavaScript(`
    (() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom)
        };
      };
      const style = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const computed = getComputedStyle(element);
        return {
          display: computed.display,
          width: computed.width,
          height: computed.height,
          flexBasis: computed.flexBasis,
          gridTemplateColumns: computed.gridTemplateColumns,
          gridTemplateRows: computed.gridTemplateRows,
          overflow: computed.overflow
        };
      };
      const regions = {
        html: rect('html'),
        body: rect('body'),
        appShell: rect('.app-shell'),
        topbar: rect('.topbar'),
        consoleGrid: rect('.console-grid'),
        siteColumn: rect('.site-column'),
        contentColumn: rect('.content-column'),
        statusBar: rect('.status-bar'),
        comparisonPanel: rect('.comparison-panel'),
        comparisonHead: rect('.comparison-head'),
        groupPicker: rect('.group-picker'),
        groupMenu: rect('.group-menu:not([hidden])'),
        detailHead: rect('.detail-head'),
        summaryStrip: rect('.summary-strip'),
        resultsPanel: rect('.results-panel'),
        monitorPanel: rect('.monitor-panel'),
        failuresPanel: rect('.failures-panel')
      };
      const problems = [];
      for (const [name, box] of Object.entries(regions)) {
        if (name === 'groupMenu' && !box) continue;
        if (!box || box.width <= 0 || box.height <= 0) problems.push(name + ': collapsed');
        if (box && (box.right > window.innerWidth + 1 || box.bottom > window.innerHeight + 1)) problems.push(name + ': outside viewport');
      }
      if (regions.contentColumn && regions.contentColumn.width < 600 && window.innerWidth >= 900) {
        problems.push('content column too narrow ' + regions.contentColumn.width);
      }
      if (regions.comparisonPanel && regions.comparisonPanel.width < 300 && window.innerWidth >= 900) {
        problems.push('comparison panel too narrow ' + regions.comparisonPanel.width);
      }
      if (regions.groupPicker && regions.groupPicker.width < 120 && window.innerWidth >= 900) {
        problems.push('group picker too narrow ' + regions.groupPicker.width);
      }
      if (regions.detailHead && regions.detailHead.width < 200 && window.innerWidth >= 900) {
        problems.push('detail column too narrow ' + regions.detailHead.width);
      }
      const groupMenu = document.querySelector('.group-menu:not([hidden])');
      if (groupMenu && getComputedStyle(groupMenu).position !== 'fixed') {
        problems.push('group menu is not fixed');
      }
      const bodyOverflowX = document.body.scrollWidth - window.innerWidth;
      const bodyOverflowY = document.body.scrollHeight - window.innerHeight;
      const appShell = document.querySelector('.app-shell');
      const appShellBox = appShell ? appShell.getBoundingClientRect() : null;
      if (bodyOverflowX > 1) problems.push('body horizontal overflow ' + bodyOverflowX);
      if (bodyOverflowY > 1) problems.push('body vertical overflow ' + bodyOverflowY);
      if (appShellBox && Math.abs(appShellBox.height - window.innerHeight) > 1) {
        problems.push('app shell height mismatch ' + Math.round(appShellBox.height) + ' vs viewport ' + window.innerHeight);
      }
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        body: { width: document.body.scrollWidth, height: document.body.scrollHeight },
        regions,
        styles: {
          appShell: style('.app-shell'),
          consoleGrid: style('.console-grid'),
          siteColumn: style('.site-column'),
          contentColumn: style('.content-column')
        },
        problems
      };
    })();
  `);
  return { ...domMetrics, window: windowMetrics };
}

async function screenshot(win, filePath) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(filePath, image.toPNG());
}

async function captureViewport(viewport) {
  const win = new BrowserWindow({
    width: viewport.width,
    height: viewport.height,
    useContentSize: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await waitForSelector(win, '#queryAllBtn');
  await wait(250);
  await click(win, '#queryAllBtn');
  await wait(450);

  const closedMetrics = await collectMetrics(win);
  await screenshot(win, path.join(outputDir, `${viewport.name}-closed.png`));

  await drag(win, '#resizeHandle', 1200);
  await drag(win, '#innerResizeHandle', 1200);
  await wait(100);
  const draggedMetrics = await collectMetrics(win);
  await screenshot(win, path.join(outputDir, `${viewport.name}-dragged.png`));

  await click(win, '#groupDropdownBtn');
  await wait(180);
  const openMetrics = await collectMetrics(win);
  await screenshot(win, path.join(outputDir, `${viewport.name}-open.png`));

  const closedCompare = closedMetrics.regions.comparisonPanel;
  const closedDetail = closedMetrics.regions.detailHead;
  const openCompare = openMetrics.regions.comparisonPanel;
  if (closedCompare && closedDetail) {
    const splitDiff = Math.abs(closedCompare.width - closedDetail.width);
    const splitTolerance = Math.max(2, Math.round(closedMetrics.regions.contentColumn.width * 0.02));
    if (splitDiff > splitTolerance) {
      closedMetrics.problems.push(`content columns not even ${closedCompare.width} vs ${closedDetail.width}`);
    }
  }
  if (closedCompare && openCompare && Math.abs(closedCompare.height - openCompare.height) > 1) {
    openMetrics.problems.push(`comparison panel height changed ${closedCompare.height} -> ${openCompare.height}`);
  }
  if (draggedMetrics.problems.length > 0) {
    openMetrics.problems.push(...draggedMetrics.problems.map((problem) => `after drag: ${problem}`));
  }

  await win.close();
  return {
    ...viewport,
    closedScreenshot: path.join(outputDir, `${viewport.name}-closed.png`),
    openScreenshot: path.join(outputDir, `${viewport.name}-open.png`),
    draggedScreenshot: path.join(outputDir, `${viewport.name}-dragged.png`),
    closedMetrics,
    draggedMetrics,
    openMetrics
  };
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(preloadPath, preloadSource());
  app.setPath('userData', path.join(tempDir, 'electron-user-data'));
  await app.whenReady();

  const results = [];
  for (const viewport of viewports) {
    results.push(await captureViewport(viewport));
  }

  const reportPath = path.join(outputDir, 'layout-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ outputDir, reportPath, results }, null, 2));

  const problems = results.flatMap((result) => [
    ...result.closedMetrics.problems.map((problem) => `${result.name} closed: ${problem}`),
    ...result.draggedMetrics.problems.map((problem) => `${result.name} dragged: ${problem}`),
    ...result.openMetrics.problems.map((problem) => `${result.name} open: ${problem}`)
  ]);
  if (problems.length > 0) {
    throw new Error(`Layout audit failed:\\n${problems.join('\\n')}`);
  }
}

run()
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.quit();
    process.exit(1);
  });
