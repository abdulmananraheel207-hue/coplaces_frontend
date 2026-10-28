import { useMemo } from 'react';
import { fromMinutes, minutesOfDay, todayIn, toMinutes } from '../lib/time';
import { Select } from './ui';

/** The half-hour slot to start from: the current one on today's date, otherwise opening time. */
export function defaultViewTime(date: string, tz: string, openTime: string, closeTime: string) {
  if (date !== todayIn(tz)) return openTime;
  const now = minutesOfDay(new Date().toISOString(), tz);
  const m = Math.floor(now / 30) * 30;
  return m < toMinutes(openTime) || m >= toMinutes(closeTime) ? openTime : fromMinutes(m);
}

/** Picks the time of day the 3D view shows room availability for. */
export function ViewAtTime({ openTime, closeTime, value, onChange }: { openTime: string; closeTime: string; value: string; onChange: (t: string) => void }) {
  const options = useMemo(() => {
    const out: string[] = [];
    for (let m = toMinutes(openTime); m < toMinutes(closeTime); m += 30) out.push(fromMinutes(m));
    return out;
  }, [openTime, closeTime]);
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      Show at
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="!w-auto">
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
    </label>
  );
}
