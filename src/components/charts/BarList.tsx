import { money } from '../../lib/format';
import { shareText, type Ranked } from '../../lib/financeCharts';
import { ChartFrame } from './Chart';
import { CHROME, SERIES } from './palette';

/**
 * One series ranked as horizontal bars: label, amount and share of the whole on each row, the bar beside it. Every
 * number is printed, so nothing hides in a tooltip; the table view repeats them for screen readers and printing.
 */
export function BarList({
  rows,
  currency,
  label,
  color = SERIES[0],
  others,
  empty = 'Nothing recorded in this period.',
  wholeCents,
}: {
  rows: Ranked[];
  currency: string;
  label: string;
  color?: string;
  /** Everything not listed, in one line. */
  others?: { label: string; cents: number } | null;
  empty?: string;
  /** What the shares are of; defaults to the rows (and others) added up. */
  wholeCents?: number;
}) {
  if (!rows.length) return <p className="text-sm text-slate">{empty}</p>;
  const whole = wholeCents ?? rows.reduce((s, r) => s + r.cents, 0) + (others?.cents ?? 0);
  const max = Math.max(1, ...rows.map((r) => r.cents), others?.cents ?? 0);
  const all = [...rows, ...(others ? [{ key: '__others', label: others.label, cents: others.cents }] : [])];

  const table = (
    <div className="surface-table">
      <table className="tbl">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th>Name</th>
            <th className="r">Amount</th>
            <th className="r">Share</th>
          </tr>
        </thead>
        <tbody>
          {all.map((r) => (
            <tr key={r.key}>
              <td>
                {r.label}
                {'sub' in r && r.sub && <span className="block text-xs text-slate">{r.sub}</span>}
              </td>
              <td className="r">{money(r.cents, currency)}</td>
              <td className="r">{shareText(r.cents, whole)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartFrame label={label} table={table}>
      <ul className="surface space-y-3 p-4" aria-label={label}>
        {all.map((r) => (
          <li key={r.key} className="text-sm">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0" style={{ color: CHROME.text }}>
                <span className="block truncate">{r.label}</span>
                {'sub' in r && r.sub && <span className="block truncate text-xs" style={{ color: CHROME.muted }}>{r.sub}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="num font-semibold" style={{ color: CHROME.text }}>
                  {money(r.cents, currency)}
                </span>
                <span className="num ml-2 inline-block w-10 text-xs" style={{ color: CHROME.muted }}>
                  {shareText(r.cents, whole)}
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: CHROME.grid }} aria-hidden>
              <div className="bar-fill h-full rounded-full" style={{ width: `${(Math.max(0, r.cents) / max) * 100}%`, background: r.key === '__others' ? CHROME.baseline : color }} />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
