// Display helpers. All calendar logic follows the location's timezone, never the browser's.

const cache = new Map<string, Intl.DateTimeFormat>();

function parts(instant: Date | string, tz: string) {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    cache.set(tz, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(instant))) o[p.type] = p.value;
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour!, min: o.minute! };
}

export const todayIn = (tz: string, now = new Date()) => {
  const p = parts(now, tz);
  return `${p.y}-${p.m}-${p.d}`;
};

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export const fromMinutes = (mins: number) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** A business that closes at or before the time it opens (18:00 to 04:00) stays open past midnight. */
export const crossesMidnight = (open: string, close: string) => toMinutes(close) <= toMinutes(open);
/** The closing time in minutes from midnight, past 24:00 when the business closes after midnight (04:00 is 28:00). */
export const closeMinutes = (open: string, close: string) => (crossesMidnight(open, close) ? toMinutes(close) + 1440 : toMinutes(close));
/** A minute of the day on a business day that opens at `openMin`: the small hours count as after midnight (01:00 is 25:00). */
export const onBusinessDay = (m: number, openMin: number) => (m < openMin ? m + 1440 : m);
/** How long something from `start` to `end` lasts, going past midnight when it has to. */
export const spanMinutes = (start: string, end: string) => {
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? d : d + 1440;
};

export const fmtTime = (iso: string, tz: string) => {
  const p = parts(iso, tz);
  return `${p.h}:${p.min}`;
};

export const minutesOfDay = (iso: string, tz: string) => {
  const p = parts(iso, tz);
  return Number(p.h) * 60 + Number(p.min);
};

export const localDateOf = (iso: string, tz: string) => {
  const p = parts(iso, tz);
  return `${p.y}-${p.m}-${p.d}`;
};

const dateObj = (date: string) => new Date(`${date}T12:00:00Z`);

/** "Wed 21 Oct" */
export const fmtDay = (date: string) =>
  dateObj(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "21 Oct 2026" */
export const fmtDate = (date: string) =>
  dateObj(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Wednesday 21 October" */
export const fmtLongDay = (date: string) =>
  dateObj(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export const fmtMonth = (month: string) =>
  dateObj(`${month}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "21 Oct, 14:30" in the location's timezone */
export const fmtDateTime = (iso: string, tz: string) => `${fmtDay(localDateOf(iso, tz))}, ${fmtTime(iso, tz)}`;

export const fmtDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function offsetMs(utcMs: number, tz: string) {
  const f = cache.get(tz) ?? (parts(new Date(utcMs), tz), cache.get(tz)!);
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(utcMs))) o[p.type] = p.value;
  const asUtc = Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour), Number(o.minute), Number(o.second ?? 0));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant at which the given wall-clock time occurs in `tz`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall - offsetMs(wall, tz);
  guess = wall - offsetMs(guess, tz);
  return new Date(guess);
}

/** A day plus whole calendar months, keeping the day of the month (31 Jan + 1 month = 28 or 29 Feb). */
function addMonthsToDay(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * How long a period lasts, both days included: "1 month", "2 months and 5 days", "20 days", with the total days alongside when it
 * runs past a month ("3 months (92 days)"). Null when the end is before the start.
 */
export function spanText(start: string, end: string) {
  const after = addDays(end, 1);
  const days = daysBetween(start, after);
  if (days <= 0) return null;
  let months = 0;
  while (addMonthsToDay(start, months + 1) <= after) months++;
  const rest = daysBetween(addMonthsToDay(start, months), after);
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const m = months % 12;
  const words = [years ? part(years, 'year') : '', m ? part(m, 'month') : '', rest ? part(rest, 'day') : ''].filter(Boolean);
  const text = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]!;
  return months ? `${text} (${part(days, 'day')})` : text;
}
