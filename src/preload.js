'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sub2api', {
  listSites: () => ipcRenderer.invoke('sites:list'),
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  savePreferences: (preferences) => ipcRenderer.invoke('preferences:save', preferences),
  getResultSnapshot: () => ipcRenderer.invoke('results:snapshot:get'),
  saveResultSnapshot: (snapshot) => ipcRenderer.invoke('results:snapshot:save', snapshot),
  saveSite: (site) => ipcRenderer.invoke('sites:save', site),
  deleteSite: (id) => ipcRenderer.invoke('sites:delete', id),
  querySite: (id) => ipcRenderer.invoke('sites:query', id),
  queryAll: () => ipcRenderer.invoke('sites:queryAll'),
  speedTestSite: (id) => ipcRenderer.invoke('sites:speedTest', id),
  openBrowserLogin: (id) => ipcRenderer.invoke('sites:openBrowserLogin', id),
  captureLoginTokens: (id) => ipcRenderer.invoke('sites:captureLoginTokens', id),
  onLoginUpdate: (callback) => {
    ipcRenderer.on('login:update', (_event, payload) => callback(payload));
  },
  storagePath: () => ipcRenderer.invoke('app:storagePath')
});
