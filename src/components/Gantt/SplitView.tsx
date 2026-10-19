// Split-View (mục 8.5.4): bấm header ngày → chia đôi 50/50 (300 ms); panel phải là Timeline ngày.
// Màn hình < 768 px: Timeline thay Gantt toàn màn hình, có nút [← Quay lại tháng].
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../store/app.ts';
import { useIsMobile, useIsTablet } from '../../lib/hooks.ts';
import { fmtDate } from '../../lib/fmt.ts';
import { cx } from '../../lib/labels.ts';
import type { NgayRow } from '../../lib/rows.ts';
import { IBack, IX } from '../Common/Icons.tsx';
import { DayTimeline } from './DayTimeline.tsx';

export function SplitView({
  renderLeft,
  ngayRows,
  today,
  backLabel
}: {
  renderLeft: (compact: boolean) => ReactNode;
  ngayRows: NgayRow[];
  today: string;
  backLabel: string;
}) {
  const { t } = useTranslation();
  const day = useApp((s) => s.splitDay);
  const setSplitDay = useApp((s) => s.setSplitDay);
  const lang = useApp((s) => s.settings.language);
  const mobile = useIsMobile();
  const tablet = useIsTablet();
  const rowsOfDay = useMemo(() => (day ? ngayRows.filter((r) => r.item.ngay === day) : []), [ngayRows, day]);

  if (mobile && day) {
    return (
      <div className="split-mobile">
        <DayTimeline
          day={day}
          rows={rowsOfDay}
          today={today}
          header={
            <button className="btn btn-sm" onClick={() => setSplitDay(null)}>
              <IBack size={14} />
              {backLabel}
              <span className="tl-date-inline">{fmtDate(day, lang)}</span>
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className={cx('split', day && 'split-open', tablet && 'split-tablet')}>
      <div className="split-left">{renderLeft(!!day)}</div>
      {day && (
        <div className="split-right" role="region" aria-label={t('timeline.title', { date: fmtDate(day, lang) })}>
          <DayTimeline
            key={day}
            day={day}
            rows={rowsOfDay}
            today={today}
            header={
              <span className="tl-head-left">
                <strong className="tl-date">{fmtDate(day, lang)}</strong>
                <button className="icon-btn sm split-close" onClick={() => setSplitDay(null)} aria-label={t('common.close')} title={t('common.close')}>
                  <IX size={16} />
                </button>
              </span>
            }
          />
        </div>
      )}
    </div>
  );
}
