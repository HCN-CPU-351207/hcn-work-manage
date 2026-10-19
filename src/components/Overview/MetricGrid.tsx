// Module 1: 4 thẻ 3D - Tổng CV, Đang làm, Quá hạn, Hoàn thành (tính trên CV Tháng)
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { metrics } from '../../core/status.ts';
import { useApp } from '../../store/app.ts';
import { useDerived } from '../../lib/hooks.ts';
import { cx } from '../../lib/labels.ts';
import type { Quick } from '../../core/model.ts';

export function MetricGrid() {
  const { t } = useTranslation();
  const { data, derived } = useDerived();
  const m = useMemo(() => metrics(data, derived), [data, derived]);
  const pctOf = (n: number) => (m.total ? Math.round((n / m.total) * 100) : 0);
  const go = (status: 'Đang làm' | 'Quá hạn' | 'Hoàn thành' | '', quick: Quick | null = null) => {
    const st = useApp.getState();
    useApp.setState({
      tab: 'thang',
      query: '',
      filters: { ...st.filters, thang: status ? { status, quick } : {} },
      modes: { ...st.modes, thang: 'table' }
    });
  };
  const cards = [
    { key: 'total', value: m.total, sub: t('metric.subTotal'), cls: '', onClick: () => go('') },
    { key: 'doing', value: m.doing, sub: t('metric.subPct', { p: pctOf(m.doing) }), cls: '', onClick: () => go('Đang làm') },
    { key: 'overdue', value: m.overdue, sub: t('metric.subPct', { p: pctOf(m.overdue) }), cls: 'is-over', onClick: () => go('Quá hạn') },
    { key: 'done', value: m.done, sub: t('metric.subPct', { p: pctOf(m.done) }), cls: 'is-done', onClick: () => go('Hoàn thành') }
  ];
  return (
    <section className="metrics" aria-label={t('tabs.overview')}>
      {cards.map((c) => (
        <button key={c.key} className={cx('metric-card', c.cls)} onClick={c.onClick} title={t('metric.open')}>
          <span className="metric-title">{t(`metric.${c.key}`)}</span>
          <span className="metric-value">{c.value}</span>
          <span className="metric-sub">{c.sub}</span>
        </button>
      ))}
    </section>
  );
}
