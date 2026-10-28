import type { FinanceReport } from '../types';
import { fmtMonth } from '../lib/time';

function niceCeil(n: number) {
  const pow = 10 ** Math.floor(Math.log10(n));
  const f = n / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/** Grouped monthly bars: money collected vs money spent. Drawn in SVG so it scales to any width. */
export function MoneyChart({ data, currency }: { data: FinanceReport['monthly']; currency: string }) {
  const W = 760;
  const H = 260;
  const pad = { l: 56, r: 8, t: 12, b: 30 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = niceCeil(Math.max(100, ...data.flatMap((d) => [d.collectedCents, d.expensesCents])));
  const locale = currency === 'PKR' ? 'en-PK' : 'en-US';
  const compact = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  const full = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const group = innerW / Math.max(1, data.length);
  const barW = Math.min(26, group * 0.3);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Money in and out per month. The profit and loss table has the same figures.">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="#e1e6ed" strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={pad.l - 8} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="#556579">
              {compact.format((max * t) / 100)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + group * i + group / 2;
          return (
            <g key={d.month}>
              <rect x={cx - barW - 2} y={y(d.collectedCents)} width={barW} height={Math.max(0, pad.t + innerH - y(d.collectedCents))} rx={4} fill="#14263f" className="bar-rise" style={{ animationDelay: `${i * 70}ms` }}>
                <title>{`${fmtMonth(d.month)} collected ${full.format(d.collectedCents / 100)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(d.expensesCents)} width={barW} height={Math.max(0, pad.t + innerH - y(d.expensesCents))} rx={4} fill="#f6c324" className="bar-rise" style={{ animationDelay: `${i * 70 + 40}ms` }}>
                <title>{`${fmtMonth(d.month)} expenses ${full.format(d.expensesCents / 100)}`}</title>
              </rect>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="12" fill="#5b6a7e">
                {fmtMonth(d.month).split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex gap-5 text-sm">
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded bg-ink" aria-hidden /> Money in
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 rounded bg-signal" aria-hidden /> Money out
        </span>
      </figcaption>
    </figure>
  );
}
