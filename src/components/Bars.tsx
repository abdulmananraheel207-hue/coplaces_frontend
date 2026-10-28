import { money } from '../lib/format';

/** A ruled list where each row has a label, an amount and a proportional bar. */
export function Bars({ rows, currency }: { rows: { label: string; cents: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.cents));
  if (!rows.length) return <p className="text-sm text-slate">Nothing recorded in this period.</p>;
  return (
    <ul className="surface space-y-3 p-4">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="mb-0.5 flex justify-between gap-3">
            <span>{r.label}</span>
            <span className="num font-semibold">{money(r.cents, currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-plaster" aria-hidden>
            <div className="bar-fill h-full rounded-full bg-ink" style={{ width: `${(r.cents / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Counts rather than money: same look, plain numbers. */
export function CountBars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="surface space-y-3 p-4">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="mb-0.5 flex justify-between gap-3">
            <span>{r.label}</span>
            <span className="num font-semibold">{r.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-plaster" aria-hidden>
            <div className="bar-fill h-full rounded-full bg-ink" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
