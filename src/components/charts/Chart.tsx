import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHROME } from './palette';

/** The width of an element in CSS pixels, kept up to date, so charts are drawn for the space they really have. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** One entry of a legend: a filled square for bars and parts, a short stroke for a line. */
export interface LegendItem {
  label: string;
  color: string;
  line?: boolean;
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5" style={{ color: CHROME.muted }}>
          {i.line ? (
            <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={{ background: i.color }} />
          ) : (
            <span aria-hidden className="inline-block size-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** What a tooltip shows: a heading and one value per series, the value first. */
export interface Tip {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color: string }[];
}

/** The floating readout over a chart. It only repeats values the table view also has. */
export function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.max(4, Math.min(tip.x + 12, width - 200));
  return (
    <div role="status" className="pointer-events-none absolute z-10 w-48 rounded-lg bg-paper px-3 py-2 text-xs shadow-[var(--shadow-lift)] ring-1 ring-line-strong backdrop-blur-md" style={{ left, top: Math.max(0, tip.y - 8) }}>
      <p className="mb-1 font-semibold" style={{ color: CHROME.text }}>
        {tip.title}
      </p>
      <ul className="space-y-0.5">
        {tip.rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {/* Tooltip rows are keyed with a short stroke, never a filled box. */}
            <span aria-hidden className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
            <strong className="num" style={{ color: CHROME.text }}>
              {r.value}
            </strong>
            <span className="truncate" style={{ color: CHROME.muted }}>
              {r.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A chart with its legend above and a switch to read the same figures as a table. Every value is reachable without
 * hovering: the table holds them all, and it is what prints.
 */
export function ChartFrame({ legend, table, children, label }: { legend?: LegendItem[]; table: ReactNode; children: ReactNode; label: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="space-y-3" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {legend ? <Legend items={legend} /> : <span />}
        <button type="button" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} className="no-print text-[13px] font-semibold underline underline-offset-2" style={{ color: CHROME.text }}>
          {asTable ? 'Show as chart' : 'Show as table'}
        </button>
      </div>
      <div className={asTable ? 'hidden' : 'print:hidden'}>{children}</div>
      <div className={asTable ? '' : 'hidden print:block'}>{table}</div>
    </figure>
  );
}
