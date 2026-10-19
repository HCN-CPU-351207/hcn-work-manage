// Nhãn Phân loại / Vị trí dùng trong bảng, thẻ điện thoại, khung chi tiết
import type { Opt } from '../../core/model.ts';
import { optLabel, placeIcon } from '../../lib/opts.ts';

export function CatChip({ opt }: { opt: Opt | undefined }) {
  if (!opt) return <span className="dim">—</span>;
  return (
    <span className="opt-chip" style={{ ['--oc' as string]: opt.color }}>
      <span className="opt-dot" />
      {optLabel(opt)}
    </span>
  );
}

export function PlaceChip({ opt, note }: { opt: Opt | undefined; note?: string }) {
  if (!opt && !note) return <span className="dim">—</span>;
  const Icon = opt ? placeIcon(opt.id) : placeIcon('');
  return (
    <span className="place-cell" title={note || undefined}>
      <span className="opt-chip place" style={{ ['--oc' as string]: opt?.color ?? '#94A3B8' }}>
        <Icon size={13} />
        {opt ? optLabel(opt) : note}
      </span>
      {opt && note && <span className="place-note">{note}</span>}
    </span>
  );
}
