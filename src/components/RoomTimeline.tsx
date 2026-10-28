import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import type { Resource, Schedule, ScheduleBooking } from '../types';
import { isRoomKind } from '../lib/catalogue';
import { STATUS_WORD } from '../lib/spaceState';
import { fmtTime, fromMinutes, minutesOfDay, todayIn, toMinutes } from '../lib/time';
import { Button } from './ui';

/** One row per room, hours across; booked time shows as bars. Click open space to start a booking. */
export function RoomTimeline({
  schedule,
  onPick,
  onOpen,
}: {
  schedule: Schedule;
  onPick: (room: Resource, startTime: string) => void;
  onOpen: (booking: ScheduleBooking, room: Resource) => void;
}) {
  // Meeting rooms first, then the corporate ones; each keeps the order it came in.
  const rooms = schedule.resources.filter((r) => isRoomKind(r.kind)).sort((a, b) => Number(a.kind === 'corporate_room') - Number(b.kind === 'corporate_room'));
  const tz = schedule.timezone;
  const openMin = toMinutes(schedule.openTime);
  const closeMin = toMinutes(schedule.closeTime);
  const span = closeMin - openMin;
  const pct = (m: number) => `${((m - openMin) / span) * 100}%`;

  // The weekday of the day shown, 0 being Sunday, for spaces that are shut on some days of the week.
  const weekday = new Date(`${schedule.date}T12:00:00Z`).getUTCDay();

  const hours: number[] = [];
  for (let h = Math.ceil(openMin / 60); h * 60 <= closeMin; h++) hours.push(h);

  const nowMin = schedule.date === todayIn(tz) ? minutesOfDay(new Date().toISOString(), tz) : null;
  const showNow = nowMin !== null && nowMin >= openMin && nowMin <= closeMin;

  const scroller = useRef<HTMLDivElement>(null);
  // On narrow screens, start the view around the current time.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !showNow || nowMin === null) return;
    el.scrollLeft = Math.max(0, ((nowMin - openMin) / span) * el.scrollWidth - el.clientWidth / 2);
  }, [showNow, nowMin, openMin, span, schedule.date]);

  if (rooms.length === 0) return null;

  return (
    <div ref={scroller} className="surface-table">
      <div className="min-w-[680px]">
        <div className="flex border-b border-line bg-mist">
          <div className="sticky left-0 z-20 w-36 shrink-0 border-r border-line bg-paper px-3 py-2 text-[13px] font-semibold text-slate sm:w-52">Room</div>
          <div className="relative mr-6 h-8 flex-1" aria-hidden>
            {hours.map((h) => (
              <span key={h} className="num absolute top-1.5 -translate-x-1/2 text-xs text-slate" style={{ left: pct(h * 60) }}>
                {String(h).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>

        {rooms.map((room) => {
          const mine = schedule.bookings.filter((b) => b.resourceId === room.id);
          const shutToday = !!room.closedWeekdays?.split(',').includes(String(weekday));
          const unavailable = room.status !== 'available' || shutToday;
          // A space with its own hours is shaded outside them and cannot be picked there.
          const ownOpen = room.openTime ? Math.max(openMin, toMinutes(room.openTime)) : openMin;
          const ownClose = room.closeTime ? Math.min(closeMin, toMinutes(room.closeTime)) : closeMin;
          return (
            <div key={room.id} className="flex border-b border-line last:border-b-0">
              <div className="sticky left-0 z-20 flex w-36 shrink-0 items-center justify-between gap-1 border-r border-line bg-paper px-2 py-2 sm:w-52 sm:px-3">
                <div className="min-w-0">
                  <p className="display-sm text-[15px] leading-tight break-words">{room.name}</p>
                  <p className="text-xs text-slate">
                    {shutToday && room.status === 'available' ? 'Closed today' : unavailable ? STATUS_WORD[room.status] : `${room.kind === 'corporate_room' ? 'Corporate, ' : ''}Floor ${room.floor || '–'}, ${room.capacity} seats`}
                  </p>
                </div>
                {!unavailable && (
                  <Button small variant="ghost" aria-label={`Book ${room.name}`} onClick={() => onPick(room, fromMinutes(Math.max(openMin, Math.ceil((nowMin ?? openMin) / 30) * 30)))}>
                    <Plus size={15} />
                  </Button>
                )}
              </div>
              <div
                className={`relative mr-6 h-14 flex-1 ${unavailable ? 'hatch' : 'cursor-cell'}`}
                onClick={(e) => {
                  if (unavailable) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mins = openMin + ((e.clientX - rect.left) / rect.width) * span;
                  if (mins < ownOpen || mins >= ownClose) return;
                  const start = Math.min(Math.max(Math.floor(mins / 30) * 30, ownOpen), ownClose - 30);
                  onPick(room, fromMinutes(start));
                }}
              >
                {hours.map((h) => (
                  <span key={h} className="absolute inset-y-0 w-px bg-line" style={{ left: pct(h * 60) }} aria-hidden />
                ))}
                {ownOpen > openMin && <span className="hatch pointer-events-none absolute inset-y-0 left-0 opacity-60" style={{ width: `${((ownOpen - openMin) / span) * 100}%` }} title={`Opens at ${room.openTime}`} aria-hidden />}
                {ownClose < closeMin && <span className="hatch pointer-events-none absolute inset-y-0 right-0 opacity-60" style={{ width: `${((closeMin - ownClose) / span) * 100}%` }} title={`Closes at ${room.closeTime}`} aria-hidden />}
                {mine.map((b) => {
                  const s = Math.max(minutesOfDay(b.startsAt, tz), openMin);
                  const e = Math.min(minutesOfDay(b.endsAt, tz), closeMin);
                  const time = `${fmtTime(b.startsAt, tz)}–${fmtTime(b.endsAt, tz)}`;
                  const label = b.memberName ?? (b.mine ? 'You' : 'Booked');
                  const clickable = b.mine || b.memberId;
                  const style = { left: pct(s), width: `${((e - s) / span) * 100}%` };
                  const cls = b.memberId
                    ? 'bg-ink text-white'
                    : b.mine
                      ? 'bg-mine text-white'
                      : 'hatch border border-ink/40 text-ink';
                  return (
                    <button
                      key={b.id}
                      type="button"
                      style={style}
                      title={`${label}, ${time}`}
                      aria-label={`${label}, ${room.name}, ${time}`}
                      disabled={!clickable}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (clickable) onOpen(b, room);
                      }}
                      className={`absolute inset-y-1.5 overflow-hidden rounded-lg px-1 text-left text-[11px] leading-tight font-semibold ${cls}`}
                    >
                      <span className="block truncate">{label}</span>
                      <span className="num block truncate font-normal opacity-85">{time}</span>
                    </button>
                  );
                })}
                {showNow && <span className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-signal-deep" style={{ left: pct(nowMin!) }} aria-hidden />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
