// Biểu đồ SVG nhẹ cho bảng Tổng quan dự án: vòng chỉ số, đường cộng dồn, cột cặp, vòng chia phần, thanh xếp chồng.
// Màu đi qua CSS (currentColor / biến), chữ dùng màu chữ của giao diện, không dùng màu dữ liệu cho chữ.
import { useState } from 'react';
import type { ReactNode } from 'react';

/** Vòng chỉ số (0..1) với chữ ở giữa */
export function Ring({ value, color, big, small, label, size = 104 }: { value: number; color: string; big: ReactNode; small?: ReactNode; label: string; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <figure className="ring" aria-label={label}>
      <svg width={size} height={size} viewBox="0 0 104 104" role="img">
        <circle cx="52" cy="52" r={r} fill="none" className="ring-track" strokeWidth="10" />
        {v > 0 && (
          <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.max(0.5, v * c)} ${c}`} transform="rotate(-90 52 52)" />
        )}
        <text x="52" y={small ? 52 : 59} textAnchor="middle" className="ring-big">
          {big}
        </text>
        {small && (
          <text x="52" y="70" textAnchor="middle" className="ring-small">
            {small}
          </text>
        )}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

const W = 440;

/** Đường cộng dồn: thực tế (liền, có vùng tô) và kế hoạch (nét đứt), mốc hôm nay */
export function BurnChart({
  points,
  today,
  fmt,
  labels
}: {
  points: { day: string; actual: number | null; plan: number }[];
  today: string;
  fmt: (d: string) => string;
  labels: { actual: string; plan: string; today: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 170;
  const L = 30;
  const R = 10;
  const T = 14;
  const B = 140;
  const n = points.length;
  const maxV = Math.max(1, ...points.map((p) => Math.max(p.plan, p.actual ?? 0)));
  const nice = maxV <= 4 ? 4 : maxV <= 10 ? 10 : Math.ceil(maxV / 10) * 10;
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => B - (v / nice) * (B - T);
  const step = (key: 'plan' | 'actual') => {
    let d = '';
    let prev: number | null = null;
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) return;
      if (prev === null) d += `M${x(i)},${y(v)}`;
      else d += ` L${x(i)},${y(prev)} L${x(i)},${y(v)}`;
      prev = v;
    });
    return d;
  };
  const ti = points.findIndex((p) => p.day === today);
  const lastA = [...points].reverse().find((p) => p.actual !== null);
  const lastAi = lastA ? points.indexOf(lastA) : -1;
  const actualPath = step('actual');
  const area = lastAi >= 0 ? `${actualPath} L${x(lastAi)},${B} L${x(0)},${B}Z` : '';
  const ticks = [0, 0.5, 1].map((f) => Math.round(f * nice));
  const xt = n > 1 ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1] : [0];
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="chart-wrap">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        {ti >= 0 && <rect x={x(ti)} y={T} width={W - R - x(ti)} height={B - T} className="ch-future" />}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'ch-axis' : 'ch-grid'} />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" className="ch-tick">
              {v}
            </text>
          </g>
        ))}
        {xt.map((i, k) => (
          <text key={k} x={x(i)} y={B + 16} textAnchor={k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'} className="ch-tick">
            {fmt(points[i].day)}
          </text>
        ))}
        <path d={step('plan')} fill="none" className="ch-plan" />
        {area && <path d={area} className="ch-area" />}
        <path d={actualPath} fill="none" className="ch-actual" />
        {ti >= 0 && <line x1={x(ti)} x2={x(ti)} y1={T} y2={B} className="ch-today" />}
        {hp && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={B} className="ch-cross" />
            <circle cx={x(hover!)} cy={y(hp.plan)} r="4" className="ch-dot-plan" />
            {hp.actual !== null && <circle cx={x(hover!)} cy={y(hp.actual)} r="4.5" className="ch-dot-actual" />}
          </g>
        )}
      </svg>
      {hp && (
        <div className="ch-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <b>{hp.day === today ? `${labels.today} ${fmt(hp.day)}` : fmt(hp.day)}</b>
          <span>
            {labels.actual} {hp.actual ?? '—'} · {labels.plan} {hp.plan}
          </span>
        </div>
      )}
    </div>
  );
}

/** Cột cặp kế hoạch / thực tế (phút → giờ) */
export function PairBars({
  buckets,
  fmtH,
  labels
}: {
  buckets: { key: string; label: string; plan: number; actual: number; current: boolean }[];
  fmtH: (min: number) => string;
  labels: { plan: string; actual: string; over: string; now: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = 160;
  const L = 34;
  const R = 6;
  const T = 18;
  const B = 136;
  const maxM = Math.max(60, ...buckets.map((b) => Math.max(b.plan, b.actual)));
  const stepH = maxM <= 600 ? 2 : maxM <= 1800 ? 5 : 10;
  const top = Math.ceil(maxM / 60 / stepH) * stepH * 60;
  const y = (m: number) => B - (m / top) * (B - T);
  const n = buckets.length;
  const slot = (W - L - R) / Math.max(1, n);
  const bw = Math.max(3, Math.min(30, slot * 0.34));
  const showEvery = n > 16 ? Math.ceil(n / 8) : 1;
  const hb = hover !== null ? buckets[hover] : null;
  return (
    <div className="chart-wrap">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} className={f === 0 ? 'ch-axis' : 'ch-grid'} />
            <text x={L - 6} y={y(top * f) + 3} textAnchor="end" className="ch-tick">
              {Math.round((top * f) / 60)}h
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = L + slot * i + slot / 2;
          const over = b.actual > b.plan && b.plan > 0;
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)}>
              <rect x={L + slot * i} y={T} width={slot} height={B - T + 20} fill="transparent" />
              {b.plan > 0 && <rect x={cx - bw - 1} y={y(b.plan)} width={bw} height={B - y(b.plan)} rx="3" className="bar-plan" />}
              {b.actual > 0 && <rect x={cx + 1} y={y(b.actual)} width={bw} height={B - y(b.actual)} rx="3" className={over ? 'bar-over' : 'bar-actual'} />}
              {over && n <= 10 && (
                <text x={cx + 1 + bw / 2} y={y(b.actual) - 4} textAnchor="middle" className="ch-tick strong">
                  +{fmtH(b.actual - b.plan)}
                </text>
              )}
              {i % showEvery === 0 && (
                <text x={cx} y={B + 15} textAnchor="middle" className={b.current ? 'ch-tick strong' : 'ch-tick'}>
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hb && (
        <div className="ch-tip" style={{ left: `${((L + slot * hover! + slot / 2) / W) * 100}%` }}>
          <b>
            {hb.label}
            {hb.current ? ` · ${labels.now}` : ''}
          </b>
          <span>
            {labels.plan} {fmtH(hb.plan)} · {labels.actual} {fmtH(hb.actual)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Vòng chia phần + chú thích bên phải */
export function Donut({ items, center, total, fmt }: { items: { key: string; label: ReactNode; value: number; color: string }[]; center: string; total: number; fmt: (v: number) => string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const gap = items.length > 1 ? 2 : 0;
  return (
    <div className="donut">
      <svg width="78" height="78" viewBox="0 0 86 86" role="img" aria-label={center}>
        <circle cx="43" cy="43" r={r} fill="none" className="ring-track" strokeWidth="14" />
        <g transform="rotate(-90 43 43)">
          {items.map((it) => {
            const len = total ? (it.value / total) * c : 0;
            const el = (
              <circle key={it.key} cx="43" cy="43" r={r} fill="none" stroke={it.color} strokeWidth="14" strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-acc} />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="43" y="47" textAnchor="middle" className="ring-small">
          {center}
        </text>
      </svg>
      <ul className="donut-legend">
        {items.map((it) => (
          <li key={it.key} title={fmt(it.value)}>
            <span className="dot" style={{ background: it.color }} />
            <span className="dl-name">{it.label}</span>
            <b>{total ? Math.round((it.value / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thanh xếp chồng theo trạng thái */
export function StackBar({ parts }: { parts: { key: string; value: number; cls: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <>
      <div className="stackbar" role="img">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <b key={p.key} className={p.cls} style={{ flex: p.value }} title={`${p.label}: ${p.value}`} />
          ))}
        {total === 0 && <b className="sb-empty" style={{ flex: 1 }} />}
      </div>
      <div className="ch-legend">
        {parts.map((p) => (
          <span key={p.key}>
            <i className={p.cls} />
            {p.label} {p.value}
          </span>
        ))}
      </div>
    </>
  );
}
