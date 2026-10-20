// Windows: đọc loại mạng (Công cộng / Riêng tư), mô tả card mạng và tường lửa cho trạm đồng bộ; mở tường lửa khi cần.
// Lý do: mạng qua cáp USB / Bluetooth từ điện thoại hiện là "Unidentified network" → Windows xếp vào Công cộng,
// và quy tắc tường lửa tạo lúc bấm "Cho phép" lần đầu thường chỉ áp cho Riêng tư → điện thoại bị chặn im lặng.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FirewallState, SyncLink } from '../src/core/api.ts';

export interface WinNetSnapshot {
  adapters: Record<string, { desc?: string; profile?: SyncLink['profile'] }>;
  firewall: FirewallState;
}

export const RULE_NAME = 'HCN Work Manage Sync';
const psq = (s: string) => `'${s.replace(/'/g, "''")}'`;

function runPs(script: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    );
  });
}

/** Quy tắc của chương trình (tạo khi bấm Cho phép / Hủy ở hộp thoại Windows) so theo đường dẫn exe */
const appRules = (exe: string) =>
  `@(Get-NetFirewallApplicationFilter | Where-Object { $_.Program -and ([Environment]::ExpandEnvironmentVariables($_.Program) -ieq ${psq(exe)}) } | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' })`;

export function queryScript(exe: string): string {
  return `[Console]::OutputEncoding=[Text.Encoding]::UTF8
$ErrorActionPreference='SilentlyContinue'
$ad = @(Get-NetAdapter | ForEach-Object { @{ n=$_.Name; d=$_.InterfaceDescription } })
$pr = @(Get-NetConnectionProfile | ForEach-Object { @{ n=$_.InterfaceAlias; c=[string]$_.NetworkCategory } })
$rule = @(Get-NetFirewallRule -DisplayName ${psq(RULE_NAME)} | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' -and $_.Direction -eq 'Inbound' }).Count
$app = ${appRules(exe)}
$block = @($app | Where-Object { $_.Action -eq 'Block' }).Count
$allow = @($app | Where-Object { $_.Action -eq 'Allow' } | ForEach-Object { [string]$_.Profile })
$on = @(Get-NetFirewallProfile | Where-Object { $_.Enabled -eq 'True' }).Count
@{ ad=$ad; pr=$pr; rule=$rule; block=$block; allow=$allow; on=$on } | ConvertTo-Json -Depth 4 -Compress`;
}

interface RawQuery {
  ad?: { n: string; d?: string }[] | { n: string; d?: string };
  pr?: { n: string; c?: string }[] | { n: string; c?: string };
  rule?: number;
  block?: number;
  allow?: string[] | string;
  on?: number;
}
const arr = <T>(x: T[] | T | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** Đọc kết quả PowerShell (thuần, để test) */
export function parseQuery(json: string): WinNetSnapshot {
  const q = JSON.parse(json || '{}') as RawQuery;
  const adapters: WinNetSnapshot['adapters'] = {};
  for (const a of arr(q.ad)) if (a?.n) adapters[a.n] = { ...adapters[a.n], desc: a.d ?? '' };
  for (const p of arr(q.pr)) {
    if (!p?.n) continue;
    const c = (p.c ?? '').toLowerCase();
    adapters[p.n] = { ...adapters[p.n], profile: c.startsWith('public') ? 'public' : c.startsWith('private') ? 'private' : c.startsWith('domain') ? 'domain' : null };
  }
  const allowAll = arr(q.allow).some((p) => /any/i.test(p) || (/private/i.test(p) && /public/i.test(p)));
  let firewall: FirewallState;
  if (q.on === 0) firewall = 'ok';
  else if ((q.block ?? 0) > 0) firewall = 'blocked';
  else if ((q.rule ?? 0) > 0 || allowAll) firewall = 'ok';
  else firewall = 'missing';
  return { adapters, firewall };
}

export function fixScript(exe: string, ports: [number, number]): string {
  return `$ErrorActionPreference='SilentlyContinue'
${appRules(exe)} | Where-Object { $_.Action -eq 'Block' } | Remove-NetFirewallRule
Remove-NetFirewallRule -DisplayName ${psq(RULE_NAME)}
$ErrorActionPreference='Stop'
try {
  New-NetFirewallRule -DisplayName ${psq(RULE_NAME)} -Description 'HCN Work Manage - dong bo dien thoai' -Direction Inbound -Action Allow -Program ${psq(exe)} -Protocol TCP -LocalPort '${ports[0]}-${ports[1]}' -Profile Any | Out-Null
  exit 0
} catch { exit 3 }`;
}

export function createWinNet(exe: string, log?: { warn(m: string): void }) {
  let snap: WinNetSnapshot | null = null;
  let at = 0;
  let running: Promise<void> | null = null;
  const refresh = (): Promise<void> => {
    if (running) return running;
    running = runPs(queryScript(exe), 20000)
      .then((out) => {
        snap = parseQuery(out.trim());
      })
      .catch((e: Error) => {
        log?.warn(`Không đọc được thông tin mạng Windows: ${e.message}`);
        snap = { adapters: snap?.adapters ?? {}, firewall: 'unknown' };
      })
      .finally(() => {
        at = Date.now();
        running = null;
      });
    return running;
  };
  return {
    /** trả bản đã đọc (có thể cũ tối đa 30 giây); tự đọc lại ở nền */
    get(): WinNetSnapshot | null {
      if (Date.now() - at > 30_000) void refresh();
      return snap;
    },
    refresh,
    /** mở tường lửa: hiện hộp thoại quyền quản trị (UAC) của Windows */
    async fix(ports: [number, number]): Promise<boolean> {
      const ps1 = path.join(os.tmpdir(), `hcn-firewall-${process.pid}-${Date.now()}.ps1`);
      fs.writeFileSync(ps1, `﻿${fixScript(exe, ports)}`, 'utf8');
      let ok = false;
      try {
        await runPs(
          `$p=${psq(ps1)}; try { $r = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$p+'"')); exit $r.ExitCode } catch { exit 5 }`,
          180_000
        );
        ok = true;
      } catch (e) {
        log?.warn(`Không mở được tường lửa: ${(e as Error).message}`);
      } finally {
        fs.rmSync(ps1, { force: true });
      }
      await refresh();
      return ok || snap?.firewall === 'ok';
    }
  };
}
