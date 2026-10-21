// Giá trị từng ô (để lọc / sắp xếp theo cột): khóa gốc ổn định + chữ hiển thị theo ngôn ngữ
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CellVal, ValueFn } from '../core/colFilter.ts';
import { DISPLAYS, LOAI_LIST } from '../core/model.ts';
import { useApp } from '../store/app.ts';
import { fmtDate, hhmm } from './fmt.ts';
import { LOAI_KEY, STATUS_KEY } from './labels.ts';
import { optLabel, optMap, useOpts } from './opts.ts';
import type { Row } from './rows.ts';

const EMPTY = (blank: string): CellVal => ({ key: '', label: blank, sort: '' });

export function useColValue(): ValueFn<Row> {
  const { t } = useTranslation();
  const lang = useApp((s) => s.settings.language);
  const cats = useOpts('cats');
  const places = useOpts('places');
  return useMemo(() => {
    const cm = optMap(cats);
    const pm = optMap(places);
    const blank = t('colf.blank');
    const date = (d: string | null | undefined): CellVal => (d ? { key: d, label: fmtDate(d, lang), sort: d } : EMPTY(blank));
    const text = (s: string | null | undefined): CellVal => {
      const v = (s ?? '').trim();
      return v ? { key: v, label: v, sort: v } : EMPTY(blank);
    };
    return (row: Row, col: string): CellVal => {
      switch (col) {
        case 'ma':
          return { key: row.ma, label: row.ma, sort: row.ma };
        case 'loai':
          return row.level === 'thang'
            ? { key: row.item.loai, label: t(`loai.${LOAI_KEY[row.item.loai]}`), sort: LOAI_LIST.indexOf(row.item.loai) }
            : EMPTY(blank);
        case 'cat': {
          const o = row.item.cat ? cm.get(row.item.cat) : undefined;
          return o ? { key: o.id, label: optLabel(o), sort: optLabel(o) } : EMPTY(blank);
        }
        case 'place': {
          const o = row.level === 'ngay' && row.item.place ? pm.get(row.item.place) : undefined;
          return o ? { key: o.id, label: optLabel(o), sort: optLabel(o) } : EMPTY(blank);
        }
        case 'parent':
          return text(row.level === 'tuan' ? row.item.parentMa : row.level === 'ngay' ? row.parentMa : '');
        case 'task':
          return text(row.ten);
        case 'person':
          return row.person ? { key: row.person.id, label: row.person.name, sort: row.person.name } : { key: '', label: t('person.unassigned'), sort: '' };
        case 'bd':
          return date(row.level !== 'ngay' ? row.item.bd : null);
        case 'dl':
          return date(row.level !== 'ngay' ? row.item.dl : null);
        case 'as':
          return date(row.level !== 'ngay' ? row.actualStart : null);
        case 'ae':
          return date(row.level !== 'ngay' ? row.actualEnd : null);
        case 'st':
          return { key: row.display, label: t(`status.${STATUS_KEY[row.display]}`), sort: DISPLAYS.indexOf(row.display) };
        case 'pg': {
          if (row.progress === null) return EMPTY(blank);
          const p = Math.round(row.progress * 100);
          return { key: String(p), label: `${p}%`, sort: p };
        }
        case 'ck': {
          if (row.level !== 'ngay' || !row.item.ck?.length) return EMPTY(blank);
          const d = row.item.ck.filter((c) => c.done).length;
          const n = row.item.ck.length;
          return { key: `${d}/${n}`, label: `${d}/${n}`, sort: d / n + n / 1e4 };
        }
        case 'gc':
          return text(row.item.gc);
        case 'gdk': {
          if (row.level !== 'ngay' || !row.item.ngay) return EMPTY(blank);
          return { key: row.item.ngay, label: fmtDate(row.item.ngay, lang), sort: row.item.ngay + (row.item.g1 ?? '99') };
        }
        case 'gtt': {
          if (row.level !== 'ngay' || !row.item.a1) return EMPTY(blank);
          const v = `${hhmm(row.item.a1)}–${row.item.a2 ? hhmm(row.item.a2) : '…'}`;
          return { key: v, label: v, sort: row.item.a1 };
        }
        default:
          return EMPTY(blank);
      }
    };
  }, [t, lang, cats, places]);
}
