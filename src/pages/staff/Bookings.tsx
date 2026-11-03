import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { BookingModal, type BookingDraft } from '../../components/BookingModal';
import { RoomRequestsPanel } from '../../components/RoomRequestsPanel';
import { statusChip } from '../../components/BookingViews';
import { ItemDetail } from '../../components/ItemDetail';
import { isRoomKind } from '../../lib/catalogue';
import { SpaceBoard, use3d } from '../../components/SpaceBoard';
import { defaultViewTime, ViewAtTime } from '../../components/ViewAtTime';
import { useToast } from '../../components/toast';
import { Button, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Section, Select } from '../../components/ui';
import { csvAmount, downloadCsv, KIND_LABEL, money, titleCase } from '../../lib/format';
import { useBookingsRange, useRefresh, useResources, useSchedule } from '../../lib/queries';
import { buildSpaceItems } from '../../lib/spaceState';
import { addDays, fmtDay, fmtLongDay, fmtTime, localDateOf, todayIn, zonedToUtc } from '../../lib/time';
import type { Booking } from '../../types';

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
          csvAmount(b.priceCents),
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
  // The day the floor view shows. The list further down has its own From and Until.
  const [date, setDate] = useState(today);
  // The list starts at today and looks a month ahead; the owner moves either end to see further, or to look back.
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(addDays(today, 30));
  const [exporting, setExporting] = useState(false);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  const list = useBookingsRange(loc.id, from, until);

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
  const rows = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [list.data]);
  const selected = rows.find((b) => b.id === selectedId) ?? null;
  const closed = schedule.data?.closed ?? null;
  const selectBooking = (id: string) => setSelectedId(id);

  return (
    <>
      <PageHeader title="Bookings" sub={`${fmtDay(from)} to ${fmtDay(until)}`}>
        <Button onClick={() => setExporting(true)}>
          <Download size={15} aria-hidden /> Export
        </Button>
        <Button variant="primary" disabled={closed !== null} title={closed ?? undefined} onClick={() => setDraft({ date })}>
          New booking
        </Button>
      </PageHeader>

      <RoomRequestsPanel />

      <div className="space-y-9">
        {closed && (
          <p role="status" className="rounded-xl border border-signal-deep/30 bg-hold-wash px-4 py-2.5 text-sm">
            <strong>{closed}.</strong> Nothing can be booked on {fmtLongDay(date)}.
          </p>
        )}
        {show3d && (
          <Section
            title="Floor view"
            aside={
              <div className="flex flex-wrap items-center gap-1">
                <Button aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
                  <ChevronLeft size={16} />
                </Button>
                <Input type="date" aria-label="Floor view date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!w-auto" />
                <Button aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
                  <ChevronRight size={16} />
                </Button>
                {date !== today && <Button onClick={() => setDate(today)}>Today</Button>}
              </div>
            }
          >
            <p className="mb-3 text-sm text-slate">
              {fmtLongDay(date)}. Rooms and desks show who has them at the chosen time.
            </p>
            <SpaceBoard
              items={items}
              selectedId={spaceId}
              onSelect={setSpaceId}
              aside={<ViewAtTime openTime={loc.openTime} closeTime={loc.closeTime} value={viewTime} onChange={setViewTime} />}
              renderDetail={(item) => (
                <ItemDetail item={item} onClose={() => setSpaceId(null)}>
                  {item.bookable && !item.bookingId && item.tone === 'ok' && !closed && (
                    <Button variant="primary" onClick={() => setDraft({ resourceId: item.id, date, startTime: viewTime })}>
                      Book at {viewTime}
                    </Button>
                  )}
                  {item.bookingId && <Button onClick={() => selectBooking(item.bookingId!)}>Manage booking</Button>}
                </ItemDetail>
              )}
            />
          </Section>
        )}

        <Section title="Bookings" aside={list.data ? `${rows.length} ${rows.length === 1 ? 'booking' : 'bookings'}` : undefined}>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="From">
              <Input type="date" aria-label="From" value={from} max={until} onChange={(e) => e.target.value && setFrom(e.target.value)} className="!w-auto" />
            </Field>
            <Field label="Until">
              <Input type="date" aria-label="Until" value={until} min={from} onChange={(e) => e.target.value && setUntil(e.target.value)} className="!w-auto" />
            </Field>
            <Button
              onClick={() => {
                setFrom(today);
                setUntil(addDays(today, 30));
              }}
              disabled={from === today && until === addDays(today, 30)}
            >
              Today and the next 30 days
            </Button>
          </div>
          {list.isLoading ? (
            <Loading />
          ) : list.error ? (
            <ErrorNote error={list.error} />
          ) : rows.length === 0 ? (
            <Empty title="No bookings in these dates" hint="Move the From and Until dates to look at other days." />
          ) : (
            <div className="surface-table">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
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
                  {rows.map((b) => (
                    <tr key={b.id} className={b.status === 'cancelled' ? 'text-slate' : ''}>
                      <td className="num whitespace-nowrap">{fmtDay(localDateOf(b.startsAt, loc.timezone))}</td>
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

      <BookingModal open={draft !== null} onClose={() => setDraft(null)} resources={resources.length ? resources : (resourceList.data ?? [])} draft={draft ?? {}} staff />
      <ExportModal open={exporting} onClose={() => setExporting(false)} from={from} to={until} />

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
