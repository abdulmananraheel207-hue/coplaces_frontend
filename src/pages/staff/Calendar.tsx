import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api';
import { useLocation } from '../../auth';
import { BookingCalendar, statusChip } from '../../components/BookingViews';
import { Button, Empty, ErrorNote, Field, Loading, Modal, PageHeader, Section, Select } from '../../components/ui';
import { monthGrid } from '../../lib/calendar';
import { KIND_LABEL, money } from '../../lib/format';
import { useHolidays, useResources } from '../../lib/queries';
import { addMonths, fmtLongDay, fmtMonth, fmtTime, localDateOf, todayIn } from '../../lib/time';
import type { Booking } from '../../types';

/** A booking's whole story, for the box that opens when a day is clicked. */
function BookingDetail({ b }: { b: Booking }) {
  const loc = useLocation();
  const rows: [string, string][] = [
    ['Time', b.allDay ? 'All day' : `${fmtTime(b.startsAt, loc.timezone)} to ${fmtTime(b.endsAt, loc.timezone)}`],
    ['Member', b.memberName],
    ['Charge', b.priceCents > 0 ? money(b.priceCents, loc.currency) : 'Included in the plan'],
    ['Made by', b.source === 'plan' ? "The member's plan (its shifts)" : 'Booked by hand'],
    ['Checked in', b.checkedInAt ? fmtTime(b.checkedInAt, loc.timezone) : 'No'],
    ['Invoice', b.priceCents === 0 ? 'Nothing to invoice' : b.invoiceId ? 'Already invoiced' : 'Not invoiced yet'],
  ];
  return (
    <li className={`rounded-xl border border-line p-3 ${b.status === 'cancelled' ? 'text-slate' : ''}`}>
      <p className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {b.resourceName} <span className="font-normal text-slate">({KIND_LABEL[b.resourceKind]})</span>
        </span>
        {statusChip(b)}
      </p>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-1.5">
            <dt className="text-slate">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      {b.notes && <p className="mt-2 rounded-lg bg-plaster px-3 py-2 text-sm">{b.notes}</p>}
    </li>
  );
}

/** One space at a time, a month at a time. Click a day to see everything booked on it. */
export default function Calendar() {
  const loc = useLocation();
  const today = todayIn(loc.timezone);
  const spaces = useResources(loc.id);
  const all = useMemo(() => (spaces.data ?? []).filter((r) => r.status !== 'retired').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [spaces.data]);
  const [spaceId, setSpaceId] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);

  // The first space is chosen to begin with, so the calendar is never empty.
  useEffect(() => {
    if (!spaceId && all.length) setSpaceId(all[0]!.id);
  }, [all, spaceId]);

  const grid = monthGrid(`${month}-01`);
  const bookings = useQuery({
    queryKey: ['bookings', 'calendar', loc.id, spaceId, grid.from, grid.to],
    queryFn: () => api.get<Booking[]>('/bookings', { locationId: loc.id, resourceId: spaceId, from: grid.from, to: grid.to, limit: 5000 }),
    enabled: !!spaceId,
  });
  const holidays = useHolidays(loc.id, grid.from, grid.to);
  const space = all.find((r) => r.id === spaceId);
  const onDay = (bookings.data ?? []).filter((b) => localDateOf(b.startsAt, loc.timezone) === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const live = onDay.filter((b) => b.status !== 'cancelled');

  return (
    <>
      <PageHeader title="Calendar" sub={space ? `${space.name}, ${fmtMonth(month)}` : 'Choose a space to see its bookings'}>
        <div className="flex items-center gap-1">
          <Button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight size={16} />
          </Button>
          {month !== today.slice(0, 7) && <Button onClick={() => setMonth(today.slice(0, 7))}>This month</Button>}
        </div>
      </PageHeader>

      {spaces.isLoading ? (
        <Loading />
      ) : spaces.error ? (
        <ErrorNote error={spaces.error} />
      ) : all.length === 0 ? (
        <Empty title="No spaces yet" hint="Add rooms, desks and offices on the Spaces page. Each one gets a calendar here." />
      ) : (
        <>
          <div className="mb-4 max-w-sm">
            <Field label="Space">
              <Select aria-label="Space" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                {all.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({KIND_LABEL[r.kind]}
                    {r.floor ? `, floor ${r.floor}` : ''})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Section title={fmtMonth(month)} aside="Click a day to see its bookings">
            {bookings.isLoading ? <Loading /> : bookings.error ? <ErrorNote error={bookings.error} /> : <BookingCalendar month={month} today={today} loc={loc} bookings={bookings.data ?? []} holidays={holidays.data ?? []} onPickDay={setDay} />}
          </Section>
        </>
      )}

      <Modal open={day !== null} onClose={() => setDay(null)} title={day ? `${space?.name ?? ''}, ${fmtLongDay(day)}` : ''} wide>
        {day && (
          <div className="space-y-3">
            {onDay.length === 0 ? (
              <p className="text-sm text-slate">Nothing is booked for this space on this day.</p>
            ) : (
              <>
                <p className="text-sm text-slate">
                  {live.length} {live.length === 1 ? 'booking' : 'bookings'}
                  {onDay.length > live.length ? `, and ${onDay.length - live.length} cancelled` : ''}.
                </p>
                <ul className="space-y-3">
                  {[...live, ...onDay.filter((b) => b.status === 'cancelled')].map((b) => (
                    <BookingDetail key={b.id} b={b} />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
