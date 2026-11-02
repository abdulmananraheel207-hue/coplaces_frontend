/** Axis maths for the charts: round tick values and how to write them. Everything is in whole currency units. */

/** A step of 1, 2 or 5 times a power of ten that splits `span` into about `count` pieces. */
export function niceStep(span: number, count = 4) {
  if (!(span > 0)) return 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/**
 * Round ticks covering min..max, always including zero, so bars grow from a zero baseline and a loss sits below it.
 * With nothing to show, the axis runs 0 to 1.
 */
export function niceTicks(min: number, max: number, count = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (lo === 0 && hi === 0) return { min: 0, max: 1, ticks: [0, 1] };
  const step = niceStep(hi - lo, count);
  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Math.round(v / step) * step || 0);
  return { min: first, max: last, ticks };
}

/**
 * A tick label: in full under 10,000 ("2,500"); compact on an axis that reaches 10,000 ("25K", "2.5M"). One style per
 * axis, decided by the largest tick, so the labels never mix.
 */
export function tickFormatter(ticks: number[]) {
  const top = Math.max(...ticks.map(Math.abs));
  const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  return (v: number) => (v === 0 ? '0' : top >= 10_000 ? compact.format(v) : full.format(v));
}
