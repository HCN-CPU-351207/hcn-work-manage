// Danh mục Phân loại / Vị trí: tên hiển thị theo ngôn ngữ, màu, biểu tượng vị trí
import { useMemo } from 'react';
import i18n from '../i18n/index.ts';
import { optsOf } from '../core/model.ts';
import type { Opt, OptKind } from '../core/model.ts';
import { useApp } from '../store/app.ts';
import { IBuilding, IFactory, IHardHat, IHome, IPin } from '../components/Common/Icons.tsx';

/** tên mục: đã đổi tên thì dùng tên mới, chưa thì dùng tên mặc định theo ngôn ngữ */
export const optLabel = (o: Opt): string => o.name || (i18n.t(`opt.${o.id}`, { defaultValue: o.id }) as string);

export function useOpts(kind: OptKind): Opt[] {
  const list = useApp((s) => s.data[kind]);
  return list ?? optsOf({}, kind);
}

/** tra nhanh id → mục */
export function optMap(list: Opt[]): Map<string, Opt> {
  return new Map(list.map((o) => [o.id, o]));
}

export const PLACE_ICON: Record<string, typeof IPin> = {
  'pl-congty': IBuilding,
  'pl-nha': IHome,
  'pl-congtruong': IHardHat,
  'pl-nhamay': IFactory
};
export const placeIcon = (id: string) => PLACE_ICON[id] ?? IPin;

export const OPT_COLORS = ['#60A5FA', '#34D399', '#F87171', '#A78BFA', '#F59E0B', '#2DD4BF', '#F472B6', '#FB923C', '#94A3B8'];

/** hàm tra tên (để tìm kiếm theo tên phân loại / vị trí) */
export function useOptName(): (k: OptKind, id: string | null | undefined) => string {
  const cats = useOpts('cats');
  const places = useOpts('places');
  const lang = useApp((s) => s.settings.language);
  return useMemo(() => {
    const m = { cats: optMap(cats), places: optMap(places) };
    void lang;
    return (k: OptKind, id: string | null | undefined) => {
      const o = id ? m[k].get(id) : undefined;
      return o ? optLabel(o) : '';
    };
  }, [cats, places, lang]);
}
