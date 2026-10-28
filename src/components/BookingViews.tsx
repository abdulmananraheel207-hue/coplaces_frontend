import { closedReason, eachDay, monthGrid, weekdayOf } from '../lib/calendar';
import { fmtDay, fmtTime, localDateOf, minutesOfDay, toMinutes } from '../lib/time';
import type { Booking, Holiday, Location, Resource } from '../types';

const live = (b: Booking) => b.status !== 'cancelled';
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

/** One row per room or desk, one column per day, with bars placed where the booking falls in the opening hours. */
export function BookingTimeline({
  from,
  to,
  today,
  loc,
  resources,
  bookings,
  holidays,
  onOpen,
  onPick,
}: {
  from: string;
  to: string;
  today: string;
  loc: Location;
  resources: Resource[];
  bookings: Booking[];
  holidays: Holiday[];
  onOpen: (id: string) => void;
  onPick: (resourceId: string, date: string) => void;
}) {
  const days = eachDay(from, to);
  const wide = days.length <= 7;
  const open = toMinutes(loc.openTime);
  const span = Math.max(1, toMinutes(loc.closeTime) - open);
  const rows = resources.filter((r) => r.kind !== 'dedicated_desk' && r.kind !== 'office' && r.status !== 'retired');
  const map = new Map<string, Booking[]>();
  for (const b of bookings.filter(live)) {
    const key = `${b.resourceId}|${localDateOf(b.startsAt, loc.timezone)}`;
    map.set(key, [...(map.get(key) ?? []), b]);
  }
  const cell = wide ? 'min-w-28' : 'min-w-7';

  return (
    <div className="surface-table">
      <table className="w-full border-collapse text-sm" aria-label="Bookings by space and day">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-36 border-b border-r border-line bg-plaster px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate">Space</th>
            {days.map((d) => {
              const closed = closedReason(d, loc.closedWeekdays, holidays);
              return (
                <th key={d} title={closed ?? undefined} className={`${cell} border-b border-r border-line px-1 py-1.5 text-center text-xs font-semibold ${closed ? 'bg-plaster text-slate' : d === today ? 'bg-signal text-ink' : 'bg-plaster'}`}>
                  {wide ? fmtDay(d) : <><span className="block text-[10px] font-normal uppercase text-slate">{DAY_LETTER[(weekdayOf(d) + 6) % 7]!.slice(0, 1)}</span>{Number(d.slice(8))}</>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-paper px-2 py-1 text-left font-semibold">
                {r.name}
              </th>
              {days.map((d) => {
                const closed = closedReason(d, loc.closedWeekdays, holidays);
                const list = map.get(`${r.id}|${d}`) ?? [];
                const past = d < today;
                return (
                  <td key={d} className={`relative h-9 border-b border-r border-line p-0 ${closed ? 'bg-plaster' : ''}`}>
                    {list.length === 0 && !closed && !past ? (
                      <button type="button" aria-label={`Book ${r.name} on ${fmtDay(d)}`} onClick={() => onPick(r.id, d)} className="absolute inset-0 hover:bg-ok-wash" />
                    ) : null}
                    {list.map((b) => {
                      const full = b.allDay;
                      const left = full ? 0 : Math.max(0, ((minutesOfDay(b.startsAt, loc.timezone) - open) / span) * 100);
                      const width = full ? 100 : Math.min(100 - left, (Math.max(15, (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60_000) / span) * 100);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => onOpen(b.id)}
                          title={`${b.memberName}, ${full ? 'all day' : `${fmtTime(b.startsAt, loc.timezone)} to ${fmtTime(b.endsAt, loc.timezone)}`}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          className={`absolute inset-y-1 min-w-1.5 truncate px-1 text-left text-[11px] font-semibold text-white ${barTone(b)} hover:opacity-80`}
                        >
                          {wide ? b.memberName : ''}
                        </button>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
