import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { BookingModal, type BookingDraft } from '../../components/BookingModal';
import { AmenityFilter, amenitiesAmong, withAmenities } from '../../components/AmenityFilter';
import { BookingCalendar, BookingTimeline } from '../../components/BookingViews';
import { ItemDetail } from '../../components/ItemDetail';
import { isRoomKind } from '../../lib/catalogue';
import { SpaceBoard, use3d } from '../../components/SpaceBoard';
import { defaultViewTime, ViewAtTime } from '../../components/ViewAtTime';
import { DeskTile } from '../../components/Plaque';
import { RoomTimeline } from '../../components/RoomTimeline';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Section, Segmented, Select } from '../../components/ui';
import { mondayOf, monthFirst, monthGrid, monthLast } from '../../lib/calendar';
import { downloadCsv, fromCents, KIND_LABEL, money, titleCase } from '../../lib/format';
import { useBookingsRange, useHolidays, useRefresh, useResources, useSchedule } from '../../lib/queries';
import { buildSpaceItems, deskState } from '../../lib/spaceState';
import { addDays, addMonths, fmtDay, fmtLongDay, fmtMonth, fmtTime, localDateOf, todayIn, zonedToUtc } from '../../lib/time';
import type { Booking } from '../../types';

const statusChip = (b: Booking) =>
  b.status === 'confirmed' && b.checkedInAt ? <Chip tone="mine">Checked in</Chip> : b.status === 'confirmed' && Date.parse(b.endsAt) < Date.now() ? <Chip tone="hold">Did not check in</Chip> : b.status === 'confirmed' ? <Chip tone="ok">Confirmed</Chip> : b.status === 'completed' ? <Chip tone="mine">Completed</Chip> : b.status === 'no_show' ? <Chip tone="hold">No-show</Chip> : <Chip tone="idle">Cancelled</Chip>;

type View = 'day' | 'calendar' | 'timeline';

/** Downloads bookings between two dates as a spreadsheet file. */
function ExportModal({ open, onClose, from, to }: { open: boolean; onClose: () => void; from: string; to: string }) {
  const loc = useLocation();
  const [range, setRange] = useState({ from, to });
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (open) setRange({ from, to });
  }, [open, from, to]);
  const download = useMutation({
    mutationFn: async () => {
      const rows = await api.get<Booking[]>('/bookings', { locationId: loc.id, from: range.from, to: range.to, status, limit: 5000 });
      downloadCsv(`bookings-${range.from}-to-${range.to}.csv`, [
        ['Date', 'Start', 'End', 'Space', 'Type', 'Member', 'Status', 'Charge', 'Invoiced', 'Notes'],
        ...rows.map((b) => [
          localDateOf(b.startsAt, loc.timezone),
          b.allDay ? 'All day' : fmtTime(b.startsAt, loc.timezone),
          b.allDay ? '' : fmtTime(b.endsAt, loc.timezone),
          b.resourceName,
          KIND_LABEL[b.resourceKind],
          b.memberName,
          titleCase(b.status),
          fromCents(b.priceCents),
          b.invoiceId ? 'Yes' : 'No',
          b.notes,
        ]),
      ]);
      return rows.length;
    },
    onSuccess: onClose,
  });
  return (
    <Modal open={open} onClose={onClose} title="Export bookings">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          download.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Input type="date" required value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" required value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </Field>
        </div>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All bookings</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        {download.error && <ErrorNote error={download.error} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={download.isPending || !range.from || !range.to}>
            <Download size={15} aria-hidden /> Download CSV
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Bookings() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [date, setDate] = useState(today);
  const [view, setView] = useState<View>('day');
  const [span, setSpan] = useState<'week' | 'month'>('week');
  const [exporting, setExporting] = useState(false);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const month = date.slice(0, 7);
  const range =
    view === 'day'
      ? { from: date, to: date }
      : view === 'calendar'
        ? monthGrid(date)
        : span === 'week'
          ? { from: mondayOf(date), to: addDays(mondayOf(date), 6) }
          : { from: monthFirst(date), to: monthLast(date) };
  const monthly = view === 'calendar' || (view === 'timeline' && span === 'month');
  const step = (dir: 1 | -1) => setDate(view === 'day' ? addDays(date, dir) : monthly ? `${addMonths(month, dir)}-01` : addDays(date, 7 * dir));

  const schedule = useSchedule(loc.id, date);
  const resourceList = useResources(loc.id);
  const show3d = use3d();
  const [viewTime, setViewTime] = useState(() => defaultViewTime(date, loc.timezone, loc.openTime, loc.closeTime));
  const [spaceId, setSpaceId] = useState<string | null>(null);
  useEffect(() => {
    setViewTime(defaultViewTime(date, loc.timezone, loc.openTime, loc.closeTime));
    setSpaceId(null);
  }, [date, loc.timezone, loc.openTime, loc.closeTime]);
  const items = useMemo(
    () => buildSpaceItems(resourceList.data ?? [], schedule.data, zonedToUtc(date, viewTime, loc.timezone)),
    [resourceList.data, schedule.data, date, viewTime, loc.timezone],
  );
  const list = useBookingsRange(loc.id, range.from, range.to);
  const holidays = useHolidays(loc.id, range.from, range.to);

  const act = useMutation({
    mutationFn: (v: { id: string; action: 'cancel' | 'completed' | 'no_show' }) =>
      v.action === 'cancel' ? api.post(`/bookings/${v.id}/cancel`) : api.patch(`/bookings/${v.id}`, { status: v.action }),
    onSuccess: (_d, v) => {
      toast.ok(v.action === 'cancel' ? 'Booking cancelled' : v.action === 'completed' ? 'Marked as completed' : 'Marked as no-show');
      void refresh('schedule', 'bookings', 'dashboard');
      setSelectedId(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const resources = schedule.data?.resources ?? [];
  const hotDesks = resources.filter((r) => r.kind === 'hot_desk');
  const selected = list.data?.find((b) => b.id === selectedId) ?? null;
  const [needs, setNeeds] = useState<string[]>([]);
  const closed = schedule.data?.closed ?? null;

  const selectBooking = (id: string) => setSelectedId(id);
  const openDay = (d: string) => {
    setDate(d);
    setView('day');
  };

  const sub = view === 'day' ? fmtLongDay(date) : view === 'calendar' ? fmtMonth(month) : `${fmtDay(range.from)} to ${fmtDay(range.to)}`;

  return (
    <>
      <PageHeader title="Bookings" sub={sub}>
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'timeline', label: 'Timeline' },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button aria-label={view === 'day' ? 'Previous day' : monthly ? 'Previous month' : 'Previous week'} onClick={() => step(-1)}>
            <ChevronLeft size={16} />
          </Button>
          {view === 'day' && <Input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!w-auto" />}
          <Button aria-label={view === 'day' ? 'Next day' : monthly ? 'Next month' : 'Next week'} onClick={() => step(1)}>
            <ChevronRight size={16} />
          </Button>
          {date !== today && <Button onClick={() => setDate(today)}>Today</Button>}
        </div>
        {view === 'timeline' && (
          <Segmented<'week' | 'month'>
            label="Timeline length"
            value={span}
            onChange={setSpan}
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        )}
        <Button onClick={() => setExporting(true)}>
          <Download size={15} aria-hidden /> Export
        </Button>
        <Button variant="primary" disabled={view === 'day' && closed !== null} title={view === 'day' && closed ? closed : undefined} onClick={() => setDraft({ date: view === 'day' ? date : date < today ? today : date })}>
          New booking
        </Button>
      </PageHeader>

      {view === 'calendar' && (
        <Section title="Month" aside="Click a day to open it">
          {list.isLoading ? <Loading /> : <BookingCalendar month={month} today={today} loc={loc} bookings={list.data ?? []} holidays={holidays.data ?? []} onPickDay={openDay} />}
        </Section>
      )}

      {view === 'timeline' && (
        <Section title="Rooms and desks" aside="Bars sit where the booking falls in opening hours. Click an empty cell to book, a bar to manage.">
          {list.isLoading || resourceList.isLoading ? (
            <Loading />
          ) : (
            <BookingTimeline
              from={range.from}
              to={range.to}
              today={today}
              loc={loc}
              resources={resourceList.data ?? []}
              bookings={list.data ?? []}
              holidays={holidays.data ?? []}
              onOpen={selectBooking}
              onPick={(resourceId, d) => setDraft({ resourceId, date: d })}
            />
          )}
        </Section>
      )}

      {view === 'day' && (
        <div className="space-y-9">
          {closed && (
            <p role="status" className="rounded-xl border border-signal-deep/30 bg-hold-wash px-4 py-2.5 text-sm">
              <strong>{closed}.</strong> Nothing can be booked on this day.
            </p>
          )}
          {show3d && (
            <Section title="Floor view" aside="Rooms and desks show who has them at the chosen time.">
              <SpaceBoard
                items={items}
                selectedId={spaceId}
                onSelect={setSpaceId}
                aside={<ViewAtTime openTime={loc.openTime} closeTime={loc.closeTime} value={viewTime} onChange={setViewTime} />}
                renderDetail={(item) => (
                  <ItemDetail item={item} onClose={() => setSpaceId(null)}>
                    {item.bookable && !item.bookingId && item.tone === 'ok' && !closed && (
                      <Button variant="primary" onClick={() => setDraft({ resourceId: item.id, date, startTime: isRoomKind(item.kind) ? viewTime : undefined })}>
                        {isRoomKind(item.kind) ? `Book at ${viewTime}` : 'Book this desk'}
                      </Button>
                    )}
                    {item.bookingId && <Button onClick={() => selectBooking(item.bookingId!)}>Manage booking</Button>}
                  </ItemDetail>
                )}
              />
            </Section>
          )}

          <Section title="Meeting and corporate rooms" aside="Click open time to book">
            {schedule.isLoading ? (
              <Loading />
            ) : schedule.data && resources.some((r) => isRoomKind(r.kind)) ? (
              <>
                <AmenityFilter options={amenitiesAmong(resources)} value={needs} onChange={setNeeds} />
                <RoomTimeline
                  schedule={withAmenities(schedule.data, needs)!}
                  onPick={(room, startTime) => !closed && setDraft({ resourceId: room.id, date, startTime })}
                  onOpen={(b) => selectBooking(b.id)}
                />
              </>
            ) : (
              <Empty title="No meeting rooms" hint="Add rooms under Spaces to start taking bookings." />
            )}
          </Section>

          {hotDesks.length > 0 && schedule.data && (
            <Section title="Hot desks" aside={`${hotDesks.filter((d) => schedule.data!.bookings.some((b) => b.resourceId === d.id) || schedule.data!.inUse.some((u) => u.resourceId === d.id)).length} of ${hotDesks.length} booked or in use`}>
              <div className="mb-3">
                <ViewAtTime openTime={loc.openTime} closeTime={loc.closeTime} value={viewTime} onChange={setViewTime} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hotDesks.map((d) => {
                  const st = deskState(d, schedule.data!, zonedToUtc(date, viewTime, loc.timezone));
                  const out = d.status !== 'available';
                  const taken = st.tone === 'busy' || st.tone === 'mine';
                  const later = schedule.data!.bookings.filter((x) => x.resourceId === d.id);
                  return (
                    <DeskTile
                      key={d.id}
                      label={d.name.split(' ').pop() ?? d.name}
                      tone={out ? 'out' : taken ? 'taken' : 'free'}
                      title={
                        out
                          ? `${d.name}, ${d.status}`
                          : `${d.name}, ${st.label.toLowerCase()}${st.detail ? ` (${st.detail})` : ''}${!taken && later.length ? `. Booked ${later.map((x) => (x.allDay ? 'all day' : `${fmtTime(x.startsAt, loc.timezone)}–${fmtTime(x.endsAt, loc.timezone)}`)).join(', ')}` : ''}${taken ? '' : '. Click to book'}`
                      }
                      onClick={out || (taken && !st.bookingId) ? undefined : st.bookingId ? () => selectBooking(st.bookingId!) : closed ? undefined : () => setDraft({ resourceId: d.id, date })}
                    />
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="All bookings this day">
            {list.isLoading ? (
              <Loading />
            ) : !list.data?.length ? (
              <Empty title="No bookings on this day" />
            ) : (
              <div className="surface-table">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Space</th>
                      <th>Member</th>
                      <th>Status</th>
                      <th className="r">Charge</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((b) => (
                      <tr key={b.id} className={b.status === 'cancelled' ? 'text-slate' : ''}>
                        <td className="num whitespace-nowrap">{b.allDay ? 'All day' : `${fmtTime(b.startsAt, loc.timezone)}–${fmtTime(b.endsAt, loc.timezone)}`}</td>
                        <td>{b.resourceName}</td>
                        <td>{b.memberName}</td>
                        <td>{statusChip(b)}</td>
                        <td className="r">{b.priceCents > 0 ? money(b.priceCents, loc.currency) : 'Included'}</td>
                        <td className="r">
                          <Button small variant="ghost" onClick={() => selectBooking(b.id)}>
                            Manage
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      <BookingModal open={draft !== null} onClose={() => setDraft(null)} resources={resources.length ? resources : (resourceList.data ?? [])} draft={draft ?? {}} staff />
      <ExportModal open={exporting} onClose={() => setExporting(false)} from={range.from} to={range.to} />

      <Modal open={selected !== null} onClose={() => setSelectedId(null)} title="Booking">
        {selected && (
          <div className="space-y-4">
            <dl className="divide-y divide-line rounded-xl border border-line px-3 text-sm">
              {[
                ['Space', `${selected.resourceName} (${KIND_LABEL[selected.resourceKind]})`],
                ['Member', selected.memberName],
                [
                  'When',
                  selected.allDay
                    ? `${fmtLongDay(localDateOf(selected.startsAt, loc.timezone))}, all day`
                    : `${fmtLongDay(localDateOf(selected.startsAt, loc.timezone))}, ${fmtTime(selected.startsAt, loc.timezone)} to ${fmtTime(selected.endsAt, loc.timezone)}`,
                ],
                ['Charge', selected.priceCents > 0 ? money(selected.priceCents, loc.currency) : 'Included in plan'],
                ['Invoice', selected.invoiceId ? 'Already invoiced' : 'Not invoiced yet'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="text-slate">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {selected.notes && <p className="rounded-lg bg-plaster px-3 py-2 text-sm">{selected.notes}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {selected.status === 'confirmed' && (
                <>
                  <Button onClick={() => act.mutate({ id: selected.id, action: 'completed' })}>Mark completed</Button>
                  <Button onClick={() => act.mutate({ id: selected.id, action: 'no_show' })}>Mark no-show</Button>
                  {!selected.invoiceId && (
                    <Button variant="danger" onClick={() => act.mutate({ id: selected.id, action: 'cancel' })}>
                      Cancel booking
                    </Button>
                  )}
                </>
              )}
              {selected.status !== 'confirmed' && selected.status !== 'cancelled' && (
                <Button onClick={() => act.mutate({ id: selected.id, action: 'completed' })} disabled={selected.status === 'completed'}>
                  {selected.status === 'completed' ? 'Completed' : 'Mark completed'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
