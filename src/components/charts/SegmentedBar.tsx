import { useState } from 'react';
import { money } from '../../lib/format';
import { shareText, type Part } from '../../lib/financeCharts';
import { ChartFrame, Tooltip, useWidth, type Tip } from './Chart';
import { CHROME } from './palette';

const HEIGHT = 28;
const GAP = 2;

/**
 * One whole split into parts (the tall segmented bar): widths in proportion, each part's share printed inside when it
 * fits, a legend naming the parts in order, and every part's name, amount and share on hover, keyboard focus and in
 * the table. A part at zero draws nothing.
 */
export function SegmentedBar({ parts, currency, label, countWord = 'invoice' }: { parts: Part[]; currency: string; label: string; countWord?: string }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const total = parts.reduce((s, p) => s + Math.max(0, p.cents), 0);
  const shown = parts.filter((p) => p.cents > 0);
  const usable = Math.max(0, width - GAP * Math.max(0, shown.length - 1));
  const counted = (p: Part) => (p.count === undefined ? '' : `, ${p.count} ${p.count === 1 ? countWord : `${countWord}s`}`);

  let x = 0;
  const blocks = shown.map((p) => {
    const w = total > 0 ? (p.cents / total) * usable : 0;
    const b = { p, x, w };
    x += w + GAP;
    return b;
  });

  const table = (
    <div className="surface-table">
      <table className="tbl">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th>Part</th>
            {parts.some((p) => p.count !== undefined) && <th className="r">Count</th>}
            <th className="r">Amount</th>
            <th className="r">Share</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.key}>
              <td>{p.label}</td>
              {parts.some((q) => q.count !== undefined) && <td className="r">{p.count ?? ''}</td>}
              <td className="r">{money(p.cents, currency)}</td>
              <td className="r">{shareText(p.cents, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame label={label} legend={parts.map((p) => ({ label: p.label, color: p.color }))} table={table}>
      <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
        {total === 0 ? (
          <p className="text-sm text-slate">Nothing to show.</p>
        ) : (
          width > 0 && (
            <svg width={width} height={HEIGHT} role="group" aria-label={`${label}: ${parts.map((p) => `${p.label} ${money(p.cents, currency)} (${shareText(p.cents, total)})`).join(', ')}`}>
              {blocks.map(({ p, x: bx, w }) => {
                const text = shareText(p.cents, total);
                const fits = w >= text.length * 7 + 12;
                const dark = p.color.toLowerCase() === '#5598e7' || p.color.toLowerCase() === '#0ca30c';
                const readout: Tip = { x: bx + w / 2, y: HEIGHT + 4, title: p.label, rows: [{ label: `${text} of ${money(total, currency)}${counted(p)}`, value: money(p.cents, currency), color: p.color }] };
                return (
                  <g key={p.key}>
                    <rect x={bx} y={0} width={Math.max(1, w)} height={HEIGHT} rx={4} fill={p.color} />
                    {fits && (
                      <text x={bx + 8} y={HEIGHT / 2 + 4} fontSize={12} fontWeight={600} fill={dark ? '#0b0b0b' : '#ffffff'}>
                        {text}
                      </text>
                    )}
                    <rect
                      x={bx}
                      y={0}
                      width={Math.max(24, w)}
                      height={HEIGHT}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={`${p.label}: ${money(p.cents, currency)}, ${text}${counted(p)}`}
                      onPointerMove={() => setTip(readout)}
                      onPointerDown={() => setTip(readout)}
                      onFocus={() => setTip(readout)}
                      onBlur={() => setTip(null)}
                      className="outline-none focus-visible:stroke-ink focus-visible:[stroke-width:1.5]"
                    />
                  </g>
                );
              })}
            </svg>
          )
        )}
        <Tooltip tip={tip} width={width} />
      </div>
    </ChartFrame>
  );
}
