import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useAuth, useLocation } from '../../auth';
import { AmenitySection, FreeFields, freeBody, freeFrom, freeOk, type FreeState } from '../../components/Amenities';
import { CredentialsModal } from '../../components/Credentials';
import { PlanPicker } from '../../components/PlanPicker';
import { cents, emptyMoney, MoneyFields, MoneySection, moneyOk, type MoneyState } from '../../components/MemberMoney';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Ledger, Loading, Modal, PageHeader, Section, Select, Textarea, buttonClass } from '../../components/ui';
import { KIND_LABEL, money, titleCase } from '../../lib/format';
import { can } from '../../lib/permissions';
import { planPeriodState, planPeriodWords } from '../../lib/planPeriod';
import { useAmenities, usePlans, useRefresh } from '../../lib/queries';
import { fmtDate, fmtDay, fmtTime, localDateOf, todayIn } from '../../lib/time';
import type { Booking, InvoiceRow, MemberDetail as Detail, MemberStatus } from '../../types';
import { statusTone } from './Members';

function EditForm({ m, onDone }: { m: Detail; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const plans = usePlans(loc.id);
  const [v, setV] = useState({
    name: m.name,
    email: m.email,
    phone: m.phone,
    company: m.company,
    planId: m.planId ?? '',
    status: m.status as MemberStatus,
    startDate: m.startDate,
    notes: m.notes,
  });
  const [received, setReceived] = useState<MoneyState>(emptyMoney);
  const [free, setFree] = useState<FreeState>(() => freeFrom(m));
  const amenities = useAmenities(loc.id);
  const [shiftIds, setShiftIds] = useState<string[]>(m.shifts.map((s) => s.id));
  const [spaceIds, setSpaceIds] = useState<string[]>(m.desks.map((d) => d.id));
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const plan = plans.data?.find((p) => p.id === v.planId);
  // What they had, to see whether the plan, shifts or desks were changed at all.
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const planChanged = v.planId !== (m.planId ?? '') || !same(shiftIds, m.shifts.map((s) => s.id)) || !same(spaceIds, m.desks.map((d) => d.id));
  const today = todayIn(loc.timezone);
  // The end of a plan period is decided by the plan, so there is no end date here. Changes are booked from today, or from the start if later.
  const from = m.planStart && m.planStart > today && v.planId === (m.planId ?? '') ? m.planStart : today;
  const save = useMutation({
    mutationFn: async () => {
      const { planId, ...rest } = v;
      void planId;
      await api.patch(`/members/${m.id}`, { ...rest, ...freeBody(free, amenities.data) });
      const adv = cents(received.advance) ?? 0;
      const dep = cents(received.deposit) ?? 0;
      if (adv > 0 || dep > 0) await api.post(`/members/${m.id}/money`, { ...(adv > 0 ? { advanceCents: adv } : {}), ...(dep > 0 ? { depositCents: dep } : {}), method: received.method, reference: received.reference });
      if (planChanged && v.status === 'active') await api.put(`/members/${m.id}/plan`, { planId: v.planId || null, shiftIds, deskIds: spaceIds });
    },
    onSuccess: () => {
      toast.ok('Member updated');
      void refresh('member', 'members', 'bookings', 'invoices', 'dashboard');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input required value={v.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Company">
          <Input value={v.company} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={v.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Plan">
          <Select
            value={v.planId}
            onChange={(e) => {
              set('planId', e.target.value);
              setShiftIds([]);
              setSpaceIds([]);
            }}
          >
            <option value="">No plan</option>
            {plans.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? '' : ' (inactive)'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" hint="Cancelled members can no longer sign in.">
          <Select value={v.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="lead">Lead</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" required value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
      </div>
      {plan && v.status === 'active' && (
        <div className="space-y-2">
          <PlanPicker plan={plan} startDate={from} shiftIds={shiftIds} spaceIds={spaceIds} onShifts={setShiftIds} onSpaces={setSpaceIds} memberId={m.id} advanceCents={Math.max(m.advanceCents, cents(received.advance) ?? 0)} />
          {planChanged && <p className="text-xs text-slate">Saving re-books the shifts and desks from {from}. Days that have already passed stay as they were, and an unpaid invoice for this period is replaced with the new total.</p>}
        </div>
      )}
      <Field label="Notes">
        <Textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </Field>
      <MoneyFields value={received} onChange={setReceived} locked={{ advance: m.advanceReceivedAt !== null, deposit: m.depositStatus !== 'pending' }} />
      <FreeFields value={free} onChange={setFree} />
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || !moneyOk(received) || !freeOk(free, amenities.data)}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export default function MemberDetail() {
  const { id = '' } = useParams();
  const loc = useLocation();
  const { user } = useAuth();
  const mayInvoice = can(user, 'invoices');
  const toast = useToast();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);

  const member = useQuery({ queryKey: ['member', id], queryFn: () => api.get<Detail>(`/members/${id}`) });
  const bookings = useQuery({
    queryKey: ['bookings', 'member', id],
    queryFn: () => api.get<Booking[]>('/bookings', { locationId: loc.id, memberId: id }),
  });
  const invoices = useQuery({
    queryKey: ['invoices', 'member', id],
    queryFn: () => api.get<InvoiceRow[]>('/invoices', { locationId: loc.id, memberId: id }),
    enabled: mayInvoice,
  });
  const renew = useMutation({
    mutationFn: () => api.post<{ start: string; end: string }>(`/members/${id}/renew`, {}),
    onSuccess: (r) => {
      toast.ok(`Renewed from ${fmtDate(r.start)} to ${fmtDate(r.end)}`);
      void refresh('member', 'members', 'bookings', 'invoices', 'dashboard');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/members/${id}`),
    onSuccess: () => {
      toast.ok('Member deleted');
      void refresh('members', 'bookings', 'invoices', 'dashboard', 'attendance');
      navigate('/members');
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleting(false);
    },
  });
  const reset = useMutation({
    mutationFn: () => api.post<{ tempPassword: string }>(`/members/${id}/reset-password`),
    onSuccess: (r) => setCreds({ name: member.data!.name, email: member.data!.email, password: r.tempPassword }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (member.isLoading) return <Loading />;
  if (member.error || !member.data) return <ErrorNote error={member.error ?? new Error('Member not found')} />;
  const m = member.data;
  if (m.locationId !== loc.id) {
    return (
      <Empty
        title="This member belongs to another location"
        hint="Switch location in the sidebar to see them."
        action={<Link to="/members" className="font-semibold underline">Back to members</Link>}
      />
    );
  }

  const upcoming = (bookings.data ?? []).filter((b) => b.status === 'confirmed' && b.endsAt > new Date().toISOString());
  const past = (bookings.data ?? []).filter((b) => !upcoming.includes(b)).reverse().slice(0, 8);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link to="/members" className="font-semibold underline underline-offset-2">
          Members
        </Link>
      </p>
      <PageHeader title={m.name} sub={m.company || undefined}>
        <Chip tone={statusTone(m.status)}>{titleCase(m.status)}</Chip>
        <Button onClick={() => setEditing(true)}>Edit</Button>
        <Button onClick={() => reset.mutate()} disabled={reset.isPending}>
          Reset password
        </Button>
        {mayInvoice && (
          <Link to={`/finance/invoices?new=${m.id}`} className={buttonClass('primary')}>
            New invoice
          </Link>
        )}
        {can(user, 'members') &&
          (deleting ? (
            <span className="flex items-center gap-1.5 text-sm">
              Delete {m.name} for good?
              <Button small variant="ghost" onClick={() => setDeleting(false)}>
                Keep
              </Button>
              <Button small variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                Yes, delete
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          ))}
      </PageHeader>

      {m.shifts.length > 0 && m.planEnd && (
        <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm ${planPeriodState(m.planEnd, todayIn(loc.timezone)) ? 'bg-hold/15' : 'bg-plaster'}`}>
          <span>
            {m.plan?.name}: {m.shifts.map((s) => `${s.name} ${s.startTime}–${s.endTime}`).join(', ')}
            {m.desks.length ? `, on ${m.desks.map((d) => d.name).join(', ')}` : ''}. This period {m.planStart ? `${fmtDate(m.planStart)} to ` : 'until '}
            {fmtDate(m.planEnd)}
            {planPeriodState(m.planEnd, todayIn(loc.timezone)) && <strong>, and it {planPeriodWords(m.planEnd, todayIn(loc.timezone))}.</strong>}
          </span>
          {m.status === 'active' && planPeriodState(m.planEnd, todayIn(loc.timezone)) && (
            <Button variant="primary" disabled={renew.isPending} onClick={() => renew.mutate()}>
              Renew plan
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-9">
          <MoneySection m={m} canSettle={m.status !== 'active' || !m.planEnd || !!planPeriodState(m.planEnd, todayIn(loc.timezone))} />
          <AmenitySection m={m} canCollect={can(user, 'front_desk') || mayInvoice} />
          <Section title="Upcoming bookings">
            {bookings.isLoading ? (
              <Loading />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-slate">Nothing booked.</p>
            ) : (
              <div className="surface-table">
                <table className="tbl">
                  <tbody>
                    {upcoming.map((b) => (
                      <tr key={b.id}>
                        <td className="num whitespace-nowrap">{fmtDay(localDateOf(b.startsAt, loc.timezone))}</td>
                        <td className="num whitespace-nowrap">{b.allDay ? 'All day' : `${fmtTime(b.startsAt, loc.timezone)}–${fmtTime(b.endsAt, loc.timezone)}`}</td>
                        <td>{b.resourceName}</td>
                        <td className="r">{b.priceCents > 0 ? money(b.priceCents, loc.currency) : 'Included'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {mayInvoice && (
            <Section title="Invoices">
              {invoices.isLoading ? (
                <Loading />
              ) : !invoices.data?.length ? (
                <p className="text-sm text-slate">No invoices yet.</p>
              ) : (
                <div className="surface-table">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Issued</th>
                        <th>Status</th>
                        <th className="r">Total</th>
                        <th className="r">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.data.slice(0, 10).map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link to={`/finance/invoices/${i.id}`} className="font-semibold underline-offset-2 hover:underline">
                              {i.number}
                            </Link>
                          </td>
                          <td className="num">{fmtDate(i.issueDate)}</td>
                          <td>
                            <Chip tone={i.status === 'paid' ? 'ok' : i.status === 'void' ? 'idle' : i.overdue ? 'busy' : 'hold'}>{i.status === 'open' && i.overdue ? 'Overdue' : titleCase(i.status)}</Chip>
                          </td>
                          <td className="r">{money(i.totalCents, loc.currency)}</td>
                          <td className="r">{money(i.balanceCents, loc.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {past.length > 0 && (
            <Section title="Recent bookings">
              <div className="surface-table">
                <table className="tbl">
                  <tbody>
                    {past.map((b) => (
                      <tr key={b.id} className={b.status === 'cancelled' ? 'text-slate' : ''}>
                        <td className="num whitespace-nowrap">{fmtDay(localDateOf(b.startsAt, loc.timezone))}</td>
                        <td>{b.resourceName}</td>
                        <td>{titleCase(b.status)}</td>
                        <td className="r">{b.priceCents > 0 ? money(b.priceCents, loc.currency) : 'Included'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>

        <aside className="space-y-9">
          <Section title="Details">
            <Ledger
              rows={[
                { label: 'Email', value: <span className="break-all text-sm">{m.email}</span> },
                { label: 'Phone', value: m.phone || '—' },
                { label: m.contractCompany ? 'Contract' : 'Plan', value: m.contractCompany ? `Through ${m.contractCompany}` : m.plan ? `${m.plan.name}, ${m.plan.interval === 'month' ? 'monthly' : 'day pass'}` : 'No plan' },
                { label: 'Member since', value: fmtDate(m.startDate) },
              ]}
            />
            {m.notes && <p className="mt-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm">{m.notes}</p>}
          </Section>
          <Section title="Account balance">
            <Ledger
              rows={[
                { label: 'Balance due', value: money(m.balanceDueCents, loc.currency) },
                { label: 'Overdue', value: money(m.overdueCents, loc.currency), tone: m.overdueCents > 0 ? 'busy' : undefined },
              ]}
            />
          </Section>
          <Section title="Assigned spaces">
            {m.assignments.length === 0 ? (
              <p className="text-sm text-slate">No desk or office assigned.</p>
            ) : (
              <ul className="surface divide-y divide-line px-4 text-sm">
                {m.assignments.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span>
                      <span className="font-semibold">{a.resourceName}</span>
                      <span className="block text-xs text-slate">
                        {KIND_LABEL[a.resourceKind]}, from {fmtDate(a.startDate)}
                        {a.endDate ? ` to ${fmtDate(a.endDate)}` : ''}
                      </span>
                    </span>
                    <Chip tone={a.active ? 'ok' : 'idle'}>{a.active ? 'Current' : 'Ended'}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit member" wide>
        <EditForm m={m} onDone={() => setEditing(false)} />
      </Modal>
      <CredentialsModal info={creds} onClose={() => setCreds(null)} />
    </>
  );
}
