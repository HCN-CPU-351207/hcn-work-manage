// Cầu nối contextBridge: chỉ expose các API cần thiết
import { contextBridge, ipcRenderer } from 'electron';
import type { HcnApi, UpdateEvent } from '../src/core/api.ts';
import type { Data } from '../src/core/model.ts';

const api: HcnApi = {
  platform: 'electron',
  loadAll: () => ipcRenderer.invoke('hcn:load'),
  saveData: (data, baseRev) => ipcRenderer.invoke('hcn:saveData', data, baseRev),
  saveSettings: (s) => ipcRenderer.invoke('hcn:saveSettings', s),
  backupJson: (data) => ipcRenderer.invoke('hcn:backupJson', data),
  pickRestore: () => ipcRenderer.invoke('hcn:pickRestore'),
  restore: (data) => ipcRenderer.invoke('hcn:restore', data),
  exportExcel: (args) => ipcRenderer.invoke('hcn:exportExcel', args),
  openDataFolder: () => ipcRenderer.invoke('hcn:openDataFolder'),
  openLog: () => ipcRenderer.invoke('hcn:openLog'),
  openExternal: (url) => ipcRenderer.invoke('hcn:openExternal', url),
  notify: (args) => ipcRenderer.invoke('hcn:notify', args),
  checkUpdates: () => ipcRenderer.invoke('hcn:checkUpdates'),
  installUpdate: () => ipcRenderer.invoke('hcn:installUpdate'),
  setAutoDownload: (v) => ipcRenderer.invoke('hcn:setAutoDownload', v),
  syncInfo: () => ipcRenderer.invoke('hcn:syncInfo'),
  syncAction: (a) => ipcRenderer.invoke('hcn:syncAction', a),
  onExternalData: (cb) => {
    const h = (_e: unknown, p: { data: Data; rev: number }) => cb(p.data, p.rev);
    ipcRenderer.on('hcn:external', h);
    return () => ipcRenderer.removeListener('hcn:external', h);
  },
  onBackButton: () => () => {},
  onUpdate: (cb) => {
    const h = (_e: unknown, payload: UpdateEvent) => cb(payload);
    ipcRenderer.on('hcn:update', h);
    return () => ipcRenderer.removeListener('hcn:update', h);
  },
  onFlush: (cb) => {
    const h = async () => {
      try {
        await cb();
      } finally {
        ipcRenderer.send('hcn:flushDone');
      }
    };
    ipcRenderer.on('hcn:flush', h);
    return () => ipcRenderer.removeListener('hcn:flush', h);
  }
};

contextBridge.exposeInMainWorld('hcn', api);
