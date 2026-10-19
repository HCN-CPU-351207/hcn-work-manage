// Dựng dữ liệu cho file Excel (mục 9.2). Tiêu đề cột theo ngôn ngữ đang chọn. Không có sheet tài chính.
import type { TFunction } from 'i18next';
import type { SheetSpec } from '../core/api.ts';
import type { Data, Level } from '../core/model.ts';
import type { Derived } from '../core/status.ts';
import { countAssigned } from '../core/ops.ts';
import { LOAI_KEY, STATUS_KEY } from './labels.ts';
import { hhmm } from './fmt.ts';

export function buildSheet(level: Level, data: Data, d: Derived, t: TFunction, ids?: Set<string>): SheetSpec {
  const pn = new Map(data.people.map((p) => [p.id, p.name]));
  const person = (id: string | null) => (id ? pn.get(id) ?? '' : t('person.unassigned'));
  const st = (k: keyof typeof STATUS_KEY) => t(`status.${STATUS_KEY[k]}`);
  const keep = <T extends { id: string }>(arr: T[]) => (ids ? arr.filter((x) => ids.has(x.id)) : arr);

  if (level === 'thang') {
    return {
      name: t('excel.sheetThang'),
      columns: [t('col.ma'), t('col.loai'), t('col.task'), t('col.person'), t('col.planStart'), t('col.planDeadline'), t('col.actualStart'), t('col.actualEnd'), t('col.status'), t('col.progress'), t('col.note')],
      rows: keep(data.thang).map((x) => {
        const i = d.thang.get(x.id)!;
        return [x.ma, t(`loai.${LOAI_KEY[x.loai]}`), x.ten, person(x.personId), x.bd, x.dl, i.actual.start, i.actual.end, st(i.display), Math.round(i.progress * 100), x.gc];
      })
    };
  }
  if (level === 'tuan') {
    return {
      name: t('excel.sheetTuan'),
      columns: [t('col.ma'), t('col.parentThang'), t('col.task'), t('col.person'), t('col.planStart'), t('col.planDeadline'), t('col.actualStart'), t('col.actualEnd'), t('col.status'), t('col.progress'), t('col.note')],
      rows: keep(data.tuan).map((x) => {
        const i = d.tuan.get(x.id)!;
        return [x.ma, x.parentMa, x.ten, person(x.personId), x.bd, x.dl, i.actual.start, i.actual.end, st(i.display), Math.round(i.progress * 100), x.gc];
      })
    };
  }
  const wMa = new Map(data.tuan.map((w) => [w.id, w.ma]));
  return {
    name: t('excel.sheetNgay'),
    columns: [t('col.ma'), t('col.parentTuan'), t('col.date'), t('col.content'), t('col.person'), t('excel.planFrom'), t('excel.planTo'), t('excel.actualFrom'), t('excel.actualTo'), t('col.status'), t('col.note')],
    rows: keep(data.ngay).map((x) => [x.ma, wMa.get(x.parentId) ?? '', x.ngay, x.ten, person(x.personId), x.g1, x.g2, hhmm(x.a1), hhmm(x.a2), st(x.tt), x.gc])
  };
}

export function buildAll(data: Data, d: Derived, t: TFunction): SheetSpec[] {
  return [
    buildSheet('thang', data, d, t),
    buildSheet('tuan', data, d, t),
    buildSheet('ngay', data, d, t),
    {
      name: t('excel.sheetPeople'),
      columns: [t('excel.personName'), t('excel.personColor'), t('excel.personTasks')],
      rows: data.people.map((p) => [p.name, p.color, countAssigned(data, p.id)])
    }
  ];
}
