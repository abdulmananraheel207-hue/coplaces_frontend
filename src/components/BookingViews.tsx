import { closedReason, eachDay, monthGrid } from '../lib/calendar';
import { fmtDay, fmtTime, localDateOf } from '../lib/time';
import { Chip } from './ui';
import type { Booking, Holiday, Location } from '../types';

const live = (b: Booking) => b.status !== 'cancelled';

/** Where a booking stands, in a word: confirmed, checked in, did not check in, completed, no-show or cancelled. */
export const statusChip = (b: Booking) =>
  b.status === 'confirmed' && b.checkedInAt ? <Chip tone="mine">Checked in</Chip> : b.status === 'confirmed' && Date.parse(b.endsAt) < Date.now() ? <Chip tone="hold">Did not check in</Chip> : b.status === 'confirmed' ? <Chip tone="ok">Confirmed</Chip> : b.status === 'completed' ? <Chip tone="mine">Completed</Chip> : b.status === 'no_show' ? <Chip tone="hold">No-show</Chip> : <Chip tone="idle">Cancelled</Chip>;
const DAY_LETTER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Which bookings fall on which local date. */
function byDate(bookings: Booking[], tz: string) {
  const map = new Map<string, Booking[]>();
  for (const b of bookings.filter(live)) {
    const d = localDateOf(b.startsAt, tz);
    map.set(d, [...(map.get(d) ?? []), b]);
  }
  return map;
}

const barTone = (b: Booking) => (b.status === 'completed' ? 'bg-mine' : b.status === 'no_show' ? 'bg-hold' : 'bg-ink');

/** A month of days, each showing what is booked. Clicking a day opens it. */
export function BookingCalendar({
  month,
  today,
  loc,
  bookings,
  holidays,
  onPickDay,
}: {
  month: string;
  today: string;
  loc: Location;
  bookings: Booking[];
  holidays: Holiday[];
  onPickDay: (date: string) => void;
}) {
  const grid = monthGrid(`${month}-01`);
  const days = eachDay(grid.from, grid.to);
  const map = byDate(bookings, loc.timezone);

  return (
    <div className="surface-table">
      <div className="grid min-w-[44rem] grid-cols-7">
        {DAY_LETTER.map((d) => (
          <div key={d} className="border-b border-r border-line bg-plaster px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate">
            {d}
          </div>
        ))}
        {days.map((date) => {
          const inMonth = date.startsWith(month);
          const closed = closedReason(date, loc.closedWeekdays, holidays);
          const list = (map.get(date) ?? []).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPickDay(date)}
              aria-label={`${fmtDay(date)}, ${list.length} booking${list.length === 1 ? '' : 's'}${closed ? `, ${closed}` : ''}`}
              className={`flex min-h-24 flex-col items-stretch gap-0.5 border-b border-r border-line p-1.5 text-left hover:bg-plaster ${closed ? 'bg-plaster' : ''} ${inMonth ? '' : 'opacity-50'}`}
            >
              <span className={`num flex items-center justify-between text-xs font-semibold ${date === today ? 'text-ink' : 'text-slate'}`}>
                <span className={date === today ? 'rounded-md bg-signal px-1.5 py-0.5' : ''}>{Number(date.slice(8))}</span>
                {list.length > 0 && <span className="text-[11px] font-normal">{list.length}</span>}
              </span>
              {closed && <span className="truncate text-[11px] font-semibold text-ink">{closed}</span>}
              {list.slice(0, 3).map((b) => (
                <span key={b.id} className="flex items-center gap-1 truncate text-[11px] leading-tight">
                  <span className={`inline-block size-1.5 shrink-0 ${barTone(b)}`} aria-hidden />
                  <span className="truncate">
                    {b.allDay ? b.resourceName : `${fmtTime(b.startsAt, loc.timezone)} ${b.resourceName}`}
                  </span>
                </span>
              ))}
              {list.length > 3 && <span className="text-[11px] font-semibold text-slate">+{list.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
