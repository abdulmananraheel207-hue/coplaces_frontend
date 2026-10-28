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
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

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
