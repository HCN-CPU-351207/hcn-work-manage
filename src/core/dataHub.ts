// Giữ bản dữ liệu mới nhất + dấu đồng bộ + số phiên bản (rev), dùng chung cho PC và Android.
// Giao diện lưu kèm baseRev; nếu trong lúc đó dữ liệu đã đổi do đồng bộ, chỉ áp phần giao diện thực sự sửa.
import type { Data } from './model.ts';
import { applyEdit, mergeData, sameData, stampChanges } from './sync.ts';
import type { SyncMeta } from './sync.ts';

const KEEP = 40;

export interface HubState {
  data: Data;
  meta: SyncMeta;
  rev: number;
}

export function createDataHub(initial: { data: Data; meta: SyncMeta }) {
  let data = initial.data;
  let meta = initial.meta;
  let rev = 1;
  const snaps = new Map<number, Data>([[rev, data]]);

  const commit = (d: Data, m: SyncMeta): number => {
    data = d;
    meta = m;
    rev += 1;
    snaps.set(rev, d);
    for (const k of snaps.keys()) if (snaps.size > KEEP && k < rev - KEEP) snaps.delete(k);
    return rev;
  };

  return {
    get state(): HubState {
      return { data, meta, rev };
    },
    /** Lưu từ giao diện. Trả `data` khi đã phải gộp (giao diện nên dùng bản này). */
    save(edited: Data, baseRev: number | undefined, now: number): { rev: number; data: Data; patched: boolean } {
      const base = (baseRev !== undefined && snaps.get(baseRev)) || data;
      const r = applyEdit(base, edited, data, meta, now);
      const nr = commit(r.data, r.meta);
      return { rev: nr, data: r.data, patched: r.patched };
    },
    /** Thay toàn bộ (khôi phục từ file) */
    replace(next: Data, now: number): number {
      return commit(next, stampChanges(data, next, meta, now));
    },
    /** Trạm: gộp dữ liệu máy con gửi lên */
    mergeRemote(remote: Data, remoteMeta: SyncMeta, now: number): { changed: boolean; rev: number } & HubState {
      const r = mergeData(data, meta, remote, remoteMeta, now);
      const changed = !sameData(r.data, data);
      const nr = changed ? commit(r.data, r.meta) : ((meta = r.meta), rev);
      return { changed, rev: nr, data, meta };
    },
    /** Máy con: nhận kết quả từ trạm, gộp với thay đổi cục bộ phát sinh trong lúc chờ */
    adoptFromHub(hubData: Data, hubMeta: SyncMeta, now: number): { changed: boolean; needsResync: boolean; rev: number } & HubState {
      const r = mergeData(hubData, hubMeta, data, meta, now);
      const needsResync = !sameData(r.data, hubData);
      const changed = !sameData(r.data, data);
      const nr = changed ? commit(r.data, r.meta) : ((meta = r.meta), rev);
      return { changed, needsResync, rev: nr, data, meta };
    }
  };
}
export type DataHub = ReturnType<typeof createDataHub>;
