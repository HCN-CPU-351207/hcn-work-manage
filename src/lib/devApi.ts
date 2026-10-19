// Chọn nền tảng: PC (Electron, window.hcn) · Android (Capacitor) · trình duyệt khi phát triển (chỉ giữ trong bộ nhớ)
import { Capacitor } from '@capacitor/core';
import type { HcnApi, LoadResult } from '../core/api.ts';
import { emptySyncInfo } from '../core/api.ts';
import { defaultSettings, emptyData } from '../core/model.ts';
import type { Data, Settings } from '../core/model.ts';
import { createCapacitorApi } from '../platform/capacitor.ts';

export function createDevApi(seed?: Partial<LoadResult>): HcnApi {
  let data: Data = seed?.data ?? emptyData();
  let settings: Settings = seed?.settings ?? defaultSettings();
  let rev = 1;
  const ok = { ok: true };
  return {
    platform: 'web',
    async loadAll() {
      return {
        data,
        settings,
        rev,
        notice: seed?.notice ?? { kind: 'ok' },
        info: seed?.info ?? { dataPath: '%APPDATA%\\HCN', logPath: '%APPDATA%\\HCN\\logs\\app.log', version: '1.0.0', packaged: false }
      };
    },
    async saveData(d) {
      data = d;
      return { ok: true, rev: ++rev };
    },
    async saveSettings(s) {
      settings = s;
      return ok;
    },
    async backupJson() {
      return { ok: false, canceled: true };
    },
    async pickRestore() {
      return { canceled: true };
    },
    async restore(d) {
      data = d;
      return { ok: true, rev: ++rev };
    },
    async exportExcel() {
      return { ok: false, canceled: true };
    },
    async openDataFolder() {},
    async openLog() {},
    async openExternal(url) {
      window.open(url, '_blank');
    },
    async notify() {},
    async scheduleReminders() {},
    onOpenTask: () => () => {},
    async checkUpdates() {},
    async installUpdate() {},
    async setAutoDownload() {},
    onUpdate: () => () => {},
    onFlush: () => () => {},
    async syncInfo() {
      return emptySyncInfo('none');
    },
    async syncAction() {
      return emptySyncInfo('none');
    },
    onExternalData: () => () => {},
    onBackButton: () => () => {}
  };
}

let cached: HcnApi | null = null;
export function api(): HcnApi {
  if (typeof window !== 'undefined' && window.hcn) return window.hcn;
  if (!cached) cached = Capacitor.isNativePlatform() ? createCapacitorApi() : createDevApi();
  return cached;
}
