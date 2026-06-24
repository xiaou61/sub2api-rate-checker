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
  if (result.bodyWidth > result.windowWidth + 2) {
    throw new Error(`Renderer overflows horizontally: ${result.bodyWidth} > ${result.windowWidth}`);
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
