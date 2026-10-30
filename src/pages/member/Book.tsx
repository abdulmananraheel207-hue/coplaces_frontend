import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { MyRequests, RoomRequestModal, type RequestDraft } from '../../components/RoomRequest';
import { AmenityFilter, amenitiesAmong, withAmenities } from '../../components/AmenityFilter';
import { ItemDetail } from '../../components/ItemDetail';
import { ReportProblem } from '../../components/ReportProblem';
import { RoomTimeline } from '../../components/RoomTimeline';
import { isRoomKind } from '../../lib/catalogue';
import { SpaceBoard, use3d } from '../../components/SpaceBoard';
import { defaultViewTime, ViewAtTime } from '../../components/ViewAtTime';
import { useToast } from '../../components/toast';
import { Button, Empty, Input, Loading, Modal, PageHeader, Section } from '../../components/ui';
import { KIND_LABEL, money } from '../../lib/format';
import { useRefresh, useResources, useSchedule } from '../../lib/queries';
import { buildSpaceItems } from '../../lib/spaceState';
import { addDays, fmtLongDay, fmtTime, todayIn, zonedToUtc } from '../../lib/time';
import type { Booking } from '../../types';

export default function Book() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [mineId, setMineId] = useState<string | null>(null);

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
  const mine = useQuery({
    queryKey: ['bookings', 'mine', loc.id, date],
    queryFn: () => api.get<Booking[]>('/bookings', { locationId: loc.id, from: date, to: date }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/bookings/${id}/cancel`),
    onSuccess: () => {
      toast.ok('Booking cancelled');
      setMineId(null);
      void refresh('schedule', 'bookings', 'summary');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const resources = schedule.data?.resources ?? [];
  const [needs, setNeeds] = useState<string[]>([]);
  const [reporting, setReporting] = useState<string | null>(null);
  const roomSchedule = withAmenities(schedule.data, needs);
  const myBookings = (mine.data ?? []).filter((b) => b.status === 'confirmed');
  const selected = myBookings.find((b) => b.id === mineId) ?? null;

  return (
    <>
      <PageHeader title="Request a room" sub={`${fmtLongDay(date)}. Rooms are approved by the owner. Desks and offices come with your plan.`}>
        <div className="flex items-center gap-1">
          <Button aria-label="Previous day" disabled={date <= today} onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <Input type="date" aria-label="Date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="!w-auto" />
          <Button aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </PageHeader>

      {schedule.data?.closed && (
        <p role="status" className="mb-6 rounded-xl border border-signal-deep/30 bg-hold-wash px-4 py-2.5 text-sm">
          <strong>{schedule.data.closed}.</strong> Rooms cannot be requested on this day, pick another.
        </p>
      )}

      {show3d && (
        <Section className="mb-9" title="Floor view" aside="Pick a room to ask for it">
          <SpaceBoard
            items={items}
            selectedId={spaceId}
            onSelect={setSpaceId}
            aside={<ViewAtTime openTime={loc.openTime} closeTime={loc.closeTime} value={viewTime} onChange={setViewTime} />}
            renderDetail={(item) => (
              <ItemDetail item={item} onClose={() => setSpaceId(null)}>
                {isRoomKind(item.kind) && item.bookable && item.tone === 'ok' && !schedule.data?.closed && (
                  <Button variant="primary" onClick={() => setDraft({ resourceId: item.id, date, startTime: viewTime })}>
                    Request at {viewTime}
                  </Button>
                )}
                {item.tone === 'mine' && item.bookingId && <Button onClick={() => setMineId(item.bookingId!)}>Manage my booking</Button>}
                <Button variant="ghost" onClick={() => setReporting(item.id)}>
                  Report a problem
                </Button>
              </ItemDetail>
            )}
          />
        </Section>
      )}

      {schedule.isLoading ? (
        <Loading />
      ) : (
        <Section title="Meeting, board and training rooms" aside="Click an open time to ask for it">
          {schedule.data && resources.some((r) => isRoomKind(r.kind)) ? (
            <>
              <AmenityFilter options={amenitiesAmong(resources)} value={needs} onChange={setNeeds} />
              <RoomTimeline
                schedule={roomSchedule!}
                onPick={(room, startTime) => !schedule.data?.closed && setDraft({ resourceId: room.id, date, startTime })}
                onOpen={(b) => b.mine && setMineId(b.id)}
              />
              <p className="mt-2 flex flex-wrap gap-x-5 text-xs text-slate">
                <span className="flex items-center gap-1.5"><span className="inline-block size-3 bg-mine" /> Your booking</span>
                <span className="flex items-center gap-1.5"><span className="hatch inline-block size-3 border border-ink/40" /> Already booked</span>
              </p>
              <p className="mt-3 text-sm text-slate">
                Rates: {resources.filter((r) => isRoomKind(r.kind) && r.status === 'available').map((r) => `${r.name} ${money(r.hourlyRateCents, loc.currency)}/hour`).join(', ')}.
              </p>
            </>
          ) : (
            <Empty title="No meeting rooms to ask for" />
          )}
        </Section>
      )}

      <Section className="mt-9" title="Your requests" aside="Waiting for the owner, or decided">
        <MyRequests />
        <p className="mt-2 text-sm text-slate">Ask for a room above. The owner approves or rejects it, and you see the answer here.</p>
      </Section>

      {myBookings.length > 0 && (
        <Section className="mt-9" title="Your bookings this day" aside="Your plan's desk, and rooms the owner approved">
          <ul className="surface divide-y divide-line px-4">
            {myBookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{b.resourceName}</span>{' '}
                  <span className="num text-slate">{b.allDay ? 'all day' : `${fmtTime(b.startsAt, loc.timezone)}–${fmtTime(b.endsAt, loc.timezone)}`}</span>
                </span>
                <Button small variant="ghost" onClick={() => setMineId(b.id)}>
                  Manage
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ReportProblem open={reporting !== null} onClose={() => setReporting(null)} resourceId={reporting ?? undefined} />
      <RoomRequestModal open={draft !== null} onClose={() => setDraft(null)} resources={resources} draft={draft ?? {}} />

      <Modal open={selected !== null} onClose={() => setMineId(null)} title="Your booking">
        {selected && (
          <div className="space-y-4">
            <p className="text-sm">
              <strong>{selected.resourceName}</strong> ({KIND_LABEL[selected.resourceKind].toLowerCase()}),{' '}
              {selected.allDay ? 'all day' : `${fmtTime(selected.startsAt, loc.timezone)} to ${fmtTime(selected.endsAt, loc.timezone)}`}.{' '}
              {selected.priceCents > 0 ? `${money(selected.priceCents, loc.currency)} will be added to your next invoice.` : 'Included in your plan.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setMineId(null)}>Keep it</Button>
              {!selected.invoiceId && (
                <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate(selected.id)}>
                  Cancel booking
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
