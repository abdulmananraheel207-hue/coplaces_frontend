import { useState } from 'react';
import { money } from '../../lib/format';
import type { ColumnData } from '../../lib/financeCharts';
import { ChartFrame, Tooltip, useWidth, type Tip } from './Chart';
import { CHROME } from './palette';
import { niceTicks, tickFormatter } from './scale';

const PLOT_H = 200;
const AXIS_H = 26;
const TOP = 10;
const LEFT = 44;
const RIGHT = 8;
const GAP = 2;
const MAX_BAR = 24;

/** A bar from the baseline to its value, with its data end rounded and its baseline end square. */
function barPath(x: number, w: number, y0: number, y1: number, r = 4) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  if (y1 < y0) {
    // grows up: round the top
    return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  }
  // a negative value grows down: round the bottom
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}

/**
 * Columns per category, side by side or stacked, with an optional line on the same axis (never a second axis). Values
 * are cents; the axis is in whole units. Each category is one focusable hit area whose tooltip lists every series.
 */
export function ColumnChart({
  data,
  currency,
  stacked = false,
  label,
  categoryLabel,
  shortLabel,
  totalLabel,
}: {
  data: ColumnData;
  currency: string;
  stacked?: boolean;
  /** What the chart shows, for screen readers and the table caption. */
  label: string;
  /** The full name of a category, for the tooltip and the table ("November 2026"). */
  categoryLabel: (c: string, i: number) => string;
  /** The short name under a column ("Nov"). */
  shortLabel: (c: string, i: number) => string;
  /** A total row in the table and tooltip for stacked charts. */
  totalLabel?: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const n = data.categories.length;
  const all = [...data.series, ...(data.line ? [data.line] : [])];

  const sums = data.categories.map((_, i) => data.series.reduce((s, x) => s + Math.max(0, x.values[i] ?? 0), 0));
  const values = stacked ? [...sums, ...(data.line?.values ?? [])] : all.flatMap((s) => s.values);
  const { min, max, ticks } = niceTicks(Math.min(0, ...values) / 100, Math.max(0, ...values) / 100);
  const fmt = tickFormatter(ticks);
  const plotW = Math.max(0, width - LEFT - RIGHT);
  const y = (cents: number) => TOP + (PLOT_H * (max - cents / 100)) / (max - min);
  const y0 = y(0);
  const band = n ? plotW / n : 0;
  const k = stacked ? 1 : data.series.length;
  const barW = Math.max(2, Math.min(MAX_BAR, (band * 0.72 - GAP * (k - 1)) / Math.max(1, k)));
  const groupW = barW * k + GAP * (k - 1);
  const cx = (i: number) => LEFT + band * i + band / 2;
  const everyOther = band < 34;

  const tipFor = (i: number): Tip => ({
    x: cx(i),
    y: TOP,
    title: categoryLabel(data.categories[i]!, i),
    rows: [
      ...all.map((s) => ({ label: s.label, value: money(s.values[i] ?? 0, currency), color: s.color })),
      ...(stacked && totalLabel ? [{ label: totalLabel, value: money(sums[i]!, currency), color: 'transparent' }] : []),
    ],
  });
  const show = (i: number) => {
    setActive(i);
    setTip(tipFor(i));
  };
  const hide = () => {
    setActive(null);
    setTip(null);
  };

  const table = (
    <div className="surface-table">
      <table className="tbl">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th>Month</th>
            {all.map((s) => (
              <th key={s.key} className="r">
                {s.label}
              </th>
            ))}
            {stacked && totalLabel && <th className="r">{totalLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {data.categories.map((c, i) => (
            <tr key={c}>
              <td>{categoryLabel(c, i)}</td>
              {all.map((s) => (
                <td key={s.key} className="r">
                  {money(s.values[i] ?? 0, currency)}
                </td>
              ))}
              {stacked && totalLabel && <td className="r font-semibold">{money(sums[i]!, currency)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame label={label} legend={all.map((s) => ({ label: s.label, color: s.color, line: s === data.line }))} table={table}>
      <div ref={ref} className="relative" onPointerLeave={hide}>
        {width > 0 && n > 0 && (
          <svg width={width} height={TOP + PLOT_H + AXIS_H} role="group" aria-label={`${label}. Use Tab to read each month, or Show as table.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={width - RIGHT} y1={y(t * 100)} y2={y(t * 100)} stroke={t === 0 ? CHROME.baseline : CHROME.grid} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={LEFT - 6} y={y(t * 100) + 4} textAnchor="end" fontSize={11} fill={CHROME.muted}>
                  {fmt(t)}
                </text>
              </g>
            ))}

            {data.categories.map((c, i) => {
              const left = cx(i) - groupW / 2;
              let up = 0;
              return (
                <g key={c} opacity={active === null || active === i ? 1 : 0.55} className="transition-opacity">
                  {active === i && <rect x={LEFT + band * i} y={TOP} width={band} height={PLOT_H} fill={CHROME.grid} opacity={0.35} />}
                  {stacked
                    ? data.series.map((s, j) => {
                        const v = Math.max(0, s.values[i] ?? 0);
                        if (!v) return null;
                        const isTop = !data.series.slice(j + 1).some((t) => (t.values[i] ?? 0) > 0);
                        const from = y(up);
                        up += v;
                        // a 2px surface gap separates touching segments; only the top one is rounded
                        const to = y(up) + (isTop ? 0 : GAP);
                        return <path key={s.key} d={isTop ? barPath(left, barW, from, to) : `M${left},${from}H${left + barW}V${Math.min(from, to)}H${left}Z`} fill={s.color} />;
                      })
                    : data.series.map((s, j) => {
                        const d = barPath(left + j * (barW + GAP), barW, y0, y(s.values[i] ?? 0));
                        // a value of zero draws nothing, not an empty mark
                        return d ? <path key={s.key} d={d} fill={s.color} /> : null;
                      })}
                  <text x={cx(i)} y={TOP + PLOT_H + 17} textAnchor="middle" fontSize={11} fill={CHROME.muted}>
                    {everyOther && i % 2 === 1 ? '' : shortLabel(c, i)}
                  </text>
                </g>
              );
            })}

            {data.line && (
              <g>
                <polyline points={data.line.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={data.line.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {data.line.values.map((v, i) => (
                  <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill={data.line!.color} stroke={CHROME.surface} strokeWidth={2} />
                ))}
              </g>
            )}

            {/* Hit areas: a whole month, bigger than any mark, reachable by keyboard. */}
            {data.categories.map((c, i) => (
              <rect
                key={`hit-${c}`}
                x={LEFT + band * i}
                y={TOP}
                width={band}
                height={PLOT_H + AXIS_H}
                fill="transparent"
                tabIndex={0}
                aria-label={tipFor(i).title + ': ' + tipFor(i).rows.map((r) => `${r.label} ${r.value}`).join(', ')}
                onPointerMove={() => show(i)}
                onPointerDown={() => show(i)}
                onFocus={() => show(i)}
                onBlur={hide}
                className="outline-none focus-visible:stroke-ink focus-visible:[stroke-width:1.5]"
              />
            ))}
          </svg>
        )}
        <Tooltip tip={tip} width={width} />
      </div>
    </ChartFrame>
  );
}
