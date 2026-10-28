import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth, useFeature, useLocation } from '../../auth';
import { can } from '../../lib/permissions';
import { BookingModal, type BookingDraft } from '../../components/BookingModal';
import { ItemDetail } from '../../components/ItemDetail';
import { SpaceBoard } from '../../components/SpaceBoard';
import { SpaceList } from '../../components/SpaceList';
import { Avatar, Button, Chip, Empty, Ledger, Loading, PageHeader, Section, buttonClass } from '../../components/ui';
import { isRoomKind } from '../../lib/catalogue';
import { moneyWhole } from '../../lib/format';
import { usePresent, useResources, useSchedule, useDashboard, useVisitors } from '../../lib/queries';
import { buildSpaceItems, nextSlot, type SpaceItem } from '../../lib/spaceState';
import { fmtLongDay, fmtTime, todayIn } from '../../lib/time';

export default function Dashboard() {
  const loc = useLocation();
  const { user } = useAuth();
  const today = todayIn(loc.timezone);
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dash = useDashboard(loc.id);
  const schedule = useSchedule(loc.id, today);
  const resources = useResources(loc.id);
  const present = usePresent(loc.id);
  const hasVisitors = useFeature('visitors');
  const hasExpenses = useFeature('expenses');
  const hasReports = useFeature('reports');
  const visitors = useVisitors(loc.id, { date: today }, hasVisitors);
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60_000);
  // Stable between renders so the 3D camera does not re-frame when unrelated state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => buildSpaceItems(resources.data ?? [], schedule.data, new Date(), { currency: loc.currency }), [resources.data, schedule.data, minute, loc.currency]);

  const ops = dash.data?.ops;
  const fin = dash.data?.finance;
  const cur = loc.currency;

  const detail = (item: SpaceItem) => (
        <ItemDetail item={item} onClose={() => setSelectedId(null)}>
          {item.bookable && can(user, 'bookings') && (
            <Button
              variant="primary"
              onClick={() => setDraft({ resourceId: item.id, date: today, startTime: isRoomKind(item.kind) ? nextSlot(schedule.data, new Date()) : undefined })}
            >
              Book {isRoomKind(item.kind) ? 'this room' : 'this desk'}
            </Button>
          )}
          {item.bookingId && can(user, 'bookings') && (
            <Link to="/bookings" className={buttonClass()}>
              See bookings
            </Link>
          )}
          {(item.kind === 'dedicated_desk' || item.kind === 'office') && (
            <Link to="/spaces" className={buttonClass()}>
              Manage in Spaces
            </Link>
          )}
        </ItemDetail>
  );

  return (
    <>
      <PageHeader title="Today" sub={`${fmtLongDay(today)} at ${loc.name}`}>
        {can(user, 'bookings') && (
          <Button variant="primary" onClick={() => setDraft({ date: today })}>
            New booking
          </Button>
        )}
        {can(user, 'front_desk') && (
          <Link to="/front-desk" className={buttonClass()}>
            Open front desk
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-9">
          {resources.data && resources.data.length === 0 ? (
            <Section title="Set up your space">
              <Empty
                title="Nothing here yet"
                hint="Add your rooms, desks and offices, create the membership plans you sell, then add your first members. This board fills in as you go."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link to="/spaces" className={buttonClass('primary')}>
                      Add rooms and desks
                    </Link>
                    <Link to="/plans" className={buttonClass()}>
                      Create plans
                    </Link>
                    <Link to="/members" className={buttonClass()}>
                      Add members
                    </Link>
                  </div>
                }
              />
            </Section>
          ) : (
          <Section title="Rooms, desks and offices" aside={ops ? `${ops.rooms.inUseNow} of ${ops.rooms.total} rooms in use now` : undefined}>
            <SpaceBoard
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              renderDetail={detail}
              list={<SpaceList items={items} selectedId={selectedId} onSelect={setSelectedId} renderDetail={detail} empty={resources.isLoading ? <Loading /> : undefined} />}
            />
          </Section>
          )}
        </div>

        <aside className="space-y-9">
          <Section title="In the building" aside={<Link to="/front-desk" className="font-semibold text-ink underline underline-offset-2">Check in</Link>}>
            {present.isLoading ? (
              <Loading />
            ) : present.data && present.data.length > 0 ? (
              <>
                <p className="num mb-2 text-sm text-slate">
                  {present.data.length} {present.data.length === 1 ? 'member' : 'members'}
                  {ops && ops.visitorsInside > 0 ? ` and ${ops.visitorsInside} ${ops.visitorsInside === 1 ? 'visitor' : 'visitors'}` : ''}
                </p>
                <ul className="surface divide-y divide-line px-4">
                  {present.data.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={a.memberName} size={28} />
                        <span className="truncate font-semibold">{a.memberName}</span>
                      </span>
                      <span className="num shrink-0 text-slate">since {fmtTime(a.checkInAt, loc.timezone)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-slate">Nobody has checked in yet.</p>
            )}
          </Section>

          {hasVisitors && (
          <Section title="Visitors today" aside={ops ? `${ops.visitorsExpectedToday} still to arrive` : undefined}>
            {visitors.isLoading ? (
              <Loading />
            ) : visitors.data && visitors.data.length > 0 ? (
              <ul className="surface divide-y divide-line px-4">
                {visitors.data.map((v) => (
                  <li key={v.id} className="py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{v.name}</span>
                      <span className="num shrink-0 text-slate">{fmtTime(v.expectedAt, loc.timezone)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-slate">for {v.hostName}</span>
                      <Chip tone={v.status === 'checked_in' ? 'ok' : v.status === 'expected' ? 'hold' : 'idle'}>
                        {v.status === 'checked_in' ? 'Inside' : v.status === 'expected' ? 'Expected' : v.status === 'checked_out' ? 'Left' : 'Cancelled'}
                      </Chip>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate">No visitors booked for today.</p>
            )}
          </Section>
          )}

          {fin && (
            <Section title="This month" aside={hasReports ? <Link to="/finance/overview" className="font-semibold text-ink underline underline-offset-2">Finance overview</Link> : undefined}>
              <Ledger
                rows={[
                  { label: 'Collected', value: moneyWhole(fin.collectedThisMonthCents, cur) },
                  { label: 'Invoiced', value: moneyWhole(fin.invoicedThisMonthCents, cur) },
                  ...(hasExpenses ? [{ label: 'Expenses', value: moneyWhole(fin.expensesThisMonthCents, cur) }] : []),
                  { label: 'Monthly recurring', value: moneyWhole(fin.mrrCents, cur), note: 'Plan fees from active members' },
                  { label: 'Outstanding', value: moneyWhole(fin.outstandingCents, cur) },
                  {
                    label: 'Overdue',
                    value: moneyWhole(fin.overdueCents, cur),
                    tone: fin.overdueCents > 0 ? 'busy' : undefined,
                    note: fin.overdueCount > 0 ? `${fin.overdueCount} ${fin.overdueCount === 1 ? 'invoice' : 'invoices'}` : undefined,
                  },
                ]}
              />
            </Section>
          )}
        </aside>
      </div>

      <BookingModal open={draft !== null} onClose={() => setDraft(null)} resources={schedule.data?.resources ?? []} draft={draft ?? {}} staff />
    </>
  );
}
