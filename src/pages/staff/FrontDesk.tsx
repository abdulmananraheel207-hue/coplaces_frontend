import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useFeature, useLocation } from '../../auth';
import { MemberSelect } from '../../components/MemberSelect';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Section, Select } from '../../components/ui';
import { useBookingsRange, usePresent, useRefresh, useResources, useVisitors } from '../../lib/queries';
import { fmtTime, todayIn } from '../../lib/time';
import { KIND_LABEL } from '../../lib/format';
import type { Visitor } from '../../types';

function CheckInForm() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const resources = useResources(loc.id);
  const [memberId, setMemberId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const today = todayIn(loc.timezone);
  const todays = useBookingsRange(loc.id, today, today);
  // Anywhere a person can be checked in: desks, offices and rooms. Rooms are for whoever booked them.
  const places = resources.data?.filter((r) => ['hot_desk', 'dedicated_desk', 'office', 'room', 'corporate_room'].includes(r.kind) && r.status === 'available') ?? [];
  const mine = memberId ? (todays.data ?? []).filter((b) => b.memberId === memberId && (b.status === 'confirmed' || b.status === 'completed')) : [];
  // A desk can be booked for part of a day, so there may be several. The one running now, or next, is the one that counts.
  const nowMs = Date.now();
  const bookedDesks = mine.filter((b) => b.resourceKind === 'hot_desk').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const bookedDesk = bookedDesks.find((b) => nowMs >= Date.parse(b.startsAt) - 30 * 60_000 && nowMs < Date.parse(b.endsAt)) ?? bookedDesks.find((b) => Date.parse(b.endsAt) > nowMs) ?? bookedDesks[0];
  const bookedDeskOut = bookedDesk ? !places.some((p) => p.id === bookedDesk.resourceId) : false;
  // Someone with bookings can only be checked in at what they booked. If their desk is out of service they can be moved to another hot desk.
  const desks = !memberId
    ? places.filter((p) => p.kind !== 'room' && p.kind !== 'corporate_room')
    : places.filter((p) => {
        if (p.kind === 'room' || p.kind === 'corporate_room') return mine.some((b) => b.resourceId === p.id);
        if (!bookedDesk) return true;
        return bookedDesks.some((b) => b.resourceId === p.id) || (bookedDeskOut && p.kind === 'hot_desk');
      });
  const deskId = resourceId || (bookedDesk && !bookedDeskOut ? bookedDesk.resourceId : '');
  const bookedNote = bookedDesk ? (bookedDeskOut ? `${bookedDesk.resourceName} is out of service today. Pick another hot desk and their booking moves with them.` : `Booked for today: ${bookedDesk.resourceName}.`) : mine.length ? 'Rooms they booked today are listed.' : '';

  const checkIn = useMutation({
    mutationFn: () => api.post('/attendance/check-in', { memberId, resourceId: deskId || null }),
    onSuccess: () => {
      toast.ok('Checked in');
      setMemberId('');
      setResourceId('');
      void refresh('attendance', 'dashboard', 'members');
    },
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        checkIn.mutate();
      }}
      className="surface space-y-3 p-5"
    >
      <Field label="Member arriving">
        <MemberSelect locationId={loc.id} value={memberId} onChange={setMemberId} required />
      </Field>
      <Field label="Where (optional)" hint={bookedNote || undefined}>
        <Select value={deskId} onChange={(e) => setResourceId(e.target.value)}>
          {!(bookedDesk && !bookedDeskOut) && <option value="">No space recorded</option>}
          {Object.entries(KIND_LABEL)
            .filter(([kind]) => desks.some((d) => d.kind === kind))
            .map(([kind, label]) => (
              <optgroup key={kind} label={label}>
                {desks
                  .filter((d) => d.kind === kind)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </optgroup>
            ))}
        </Select>
      </Field>
      {checkIn.error && <ErrorNote error={new Error(errorMessage(checkIn.error))} />}
      <Button type="submit" variant="primary" disabled={!memberId || checkIn.isPending}>
        Check in
      </Button>
    </form>
  );
}

function VisitorForm({ onDone }: { onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [hostMemberId, setHostMemberId] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [walkIn, setWalkIn] = useState(true);
  const [date, setDate] = useState(todayIn(loc.timezone));
  const [time, setTime] = useState('10:00');

  const save = useMutation({
    mutationFn: () =>
      api.post('/visitors', {
        hostMemberId,
        name,
        company,
        email,
        purpose,
        checkInNow: walkIn,
        expectedDate: walkIn ? undefined : date,
        expectedTime: walkIn ? undefined : time,
      }),
    onSuccess: () => {
      toast.ok(walkIn ? `${name} is checked in` : `${name} is expected`);
      void refresh('visitors', 'dashboard');
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <Field label="Visiting">
        <MemberSelect locationId={loc.id} value={hostMemberId} onChange={setHostMemberId} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Visitor name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Reason for visit">
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={300} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} className="size-4 accent-ink" />
        They are here now, check them in
      </label>
      {!walkIn && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Arrival time">
            <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!hostMemberId || save.isPending}>
          {walkIn ? 'Check in visitor' : 'Add visitor'}
        </Button>
      </div>
    </form>
  );
}

export default function FrontDesk() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const present = usePresent(loc.id);
  const hasVisitors = useFeature('visitors');
  const todays = useVisitors(loc.id, { date: today }, hasVisitors);
  const inside = useVisitors(loc.id, { status: 'checked_in' }, hasVisitors);
  const [adding, setAdding] = useState(false);

  const checkOut = useMutation({
    mutationFn: (id: string) => api.post(`/attendance/${id}/check-out`),
    onSuccess: () => {
      toast.ok('Checked out');
      void refresh('attendance', 'dashboard', 'members');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const visitorAction = useMutation({
    mutationFn: (v: { id: string; action: 'check-in' | 'check-out' | 'cancel' }) => api.post(`/visitors/${v.id}/${v.action}`),
    onSuccess: (_d, v) => {
      toast.ok(v.action === 'check-in' ? 'Visitor checked in' : v.action === 'check-out' ? 'Visitor checked out' : 'Visit cancelled');
      void refresh('visitors', 'dashboard');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Today's visits plus anyone still inside from an earlier day.
  const visitors: Visitor[] = [...(todays.data ?? [])];
  for (const v of inside.data ?? []) if (!visitors.some((x) => x.id === v.id)) visitors.unshift(v);

  return (
    <>
      <PageHeader title="Front desk" sub="Check members in and out, and look after visitors.">
        {hasVisitors && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add visitor
          </Button>
        )}
      </PageHeader>

      <div className={`grid gap-10 ${hasVisitors ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'max-w-2xl'}`}>
        <div className="space-y-8">
          <Section title="Check a member in">
            <CheckInForm />
          </Section>
          <Section title="In the building" aside={present.data ? `${present.data.length} members` : undefined}>
            {present.isLoading ? (
              <Loading />
            ) : !present.data?.length ? (
              <Empty title="Nobody is checked in" hint="Members who check in show up here until they check out." />
            ) : (
              <div className="surface-table">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Since</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {present.data.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="font-semibold">{a.memberName}</span>
                          {(a.resourceName || a.company) && <span className="block text-xs text-slate">{[a.resourceName, a.company].filter(Boolean).join(', ')}</span>}
                        </td>
                        <td className="num">{fmtTime(a.checkInAt, loc.timezone)}</td>
                        <td className="r">
                          <Button small onClick={() => checkOut.mutate(a.id)} disabled={checkOut.isPending}>
                            Check out
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

        {hasVisitors && (
        <Section title="Visitors" aside="Today and anyone still inside">
          {todays.isLoading ? (
            <Loading />
          ) : visitors.length === 0 ? (
            <Empty title="No visitors today" hint="Members can add their own guests, or you can add a walk-in." action={<Button onClick={() => setAdding(true)}>Add visitor</Button>} />
          ) : (
            <div className="surface-table">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Expected</th>
                    <th>Visitor</th>
                    <th>Visiting</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visitors.map((v) => (
                    <tr key={v.id}>
                      <td className="num">{fmtTime(v.expectedAt, loc.timezone)}</td>
                      <td>
                        <span className="font-semibold">{v.name}</span>
                        {(v.company || v.purpose) && <span className="block text-xs text-slate">{[v.company, v.purpose].filter(Boolean).join(', ')}</span>}
                      </td>
                      <td>{v.hostName}</td>
                      <td>
                        <Chip tone={v.status === 'checked_in' ? 'ok' : v.status === 'expected' ? 'hold' : 'idle'}>
                          {v.status === 'checked_in' ? 'Inside' : v.status === 'expected' ? 'Expected' : v.status === 'checked_out' ? 'Left' : 'Cancelled'}
                        </Chip>
                      </td>
                      <td className="r whitespace-nowrap">
                        {v.status === 'expected' && (
                          <>
                            <Button small variant="primary" onClick={() => visitorAction.mutate({ id: v.id, action: 'check-in' })}>
                              Check in
                            </Button>{' '}
                            <Button small variant="ghost" onClick={() => visitorAction.mutate({ id: v.id, action: 'cancel' })}>
                              Cancel
                            </Button>
                          </>
                        )}
                        {v.status === 'checked_in' && (
                          <Button small onClick={() => visitorAction.mutate({ id: v.id, action: 'check-out' })}>
                            Check out
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        )}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a visitor">
        <VisitorForm onDone={() => setAdding(false)} />
      </Modal>
    </>
  );
}
