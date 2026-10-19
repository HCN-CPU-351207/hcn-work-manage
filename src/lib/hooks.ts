import { useEffect, useMemo, useState } from 'react';
import { todayStr } from '../core/dates.ts';
import { derive } from '../core/status.ts';
import { useApp } from '../store/app.ts';

/** Thời gian hiện tại, cập nhật theo chu kỳ (ms) */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMedia(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return m;
}

export const useIsMobile = () => useMedia('(max-width: 767px)');
export const useIsTablet = () => useMedia('(min-width: 768px) and (max-width: 1023px)');

/** "today" lấy lại mỗi phút (mục 6) */
export function useToday(): string {
  const now = useNow(60_000);
  return useMemo(() => todayStr(new Date(now)), [now]);
}

/** Trạng thái/tiến độ/ngày thực tế tính một lần cho toàn bộ dữ liệu */
export function useDerived() {
  const data = useApp((s) => s.data);
  const today = useToday();
  const derived = useMemo(() => derive(data, today), [data, today]);
  return { data, derived, today };
}

export function usePeopleMap() {
  const people = useApp((s) => s.data.people);
  return useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
}

/** true nếu đang gõ trong ô nhập liệu */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
