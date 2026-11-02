import { useLocation } from '../auth';
import { Button } from './ui';
import { plural } from '../lib/format';
import { fmtTime } from '../lib/time';
import type { Overstay } from '../types';

/** The members still in the building after their booking or shift ended, so someone can ask them to leave or extend their time. */
export function OverstayAlert({ list, onCheckOut, busy }: { list: Overstay[]; onCheckOut?: (attendanceId: string) => void; busy?: boolean }) {
  const loc = useLocation();
  if (list.length === 0) return null;
  return (
    <section role="alert" aria-label="Members past their time" className="mb-8 rounded-xl border border-busy bg-busy-wash px-4 py-3">
      <p className="text-sm font-semibold text-busy">
        {plural(list.length, 'member')} still in the building past {list.length === 1 ? 'their' : 'their'} time
      </p>
      <ul className="mt-2 divide-y divide-busy/20">
        {list.map((o) => (
          <li key={o.attendanceId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-semibold">{o.memberName}</span>, {o.resourceName}. Their time ended at <span className="num">{fmtTime(o.endedAt, loc.timezone)}</span>, <strong>{plural(o.minutesOver, 'minute')} ago</strong>.
            </span>
            {onCheckOut && (
              <Button small disabled={busy} onClick={() => onCheckOut(o.attendanceId)}>
                Check out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
