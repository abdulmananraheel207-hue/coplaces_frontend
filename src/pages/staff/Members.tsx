import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { emptyFree, FreeFields, freeBody, freeOk, type FreeState } from '../../components/Amenities';
import { PlanPicker } from '../../components/PlanPicker';
import { cents, emptyMoney, MoneyFields, moneyOk, type MoneyState } from '../../components/MemberMoney';
import { api, errorMessage } from '../../api';
import { useAuth, useLocation } from '../../auth';
import { CredentialsModal } from '../../components/Credentials';
import { useToast } from '../../components/toast';
import { Avatar, Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '../../components/ui';
import { useMembers } from '../../components/MemberSelect';
import { titleCase } from '../../lib/format';
import { useAmenities, usePlans, useRefresh } from '../../lib/queries';
import { planPeriodState, planPeriodWords } from '../../lib/planPeriod';
import { fmtDate, todayIn } from '../../lib/time';
import type { MemberStatus } from '../../types';

export const statusTone = (s: MemberStatus) => (s === 'active' ? 'ok' : s === 'paused' ? 'hold' : s === 'lead' ? 'mine' : 'idle') as 'ok' | 'hold' | 'mine' | 'idle';

function NewMemberForm({ onCreated, onCancel }: { onCreated: (c: { name: string; email: string; password?: string }) => void; onCancel: () => void }) {
  const loc = useLocation();
  const refresh = useRefresh();
  const plans = usePlans(loc.id);
  const [v, setV] = useState({ name: '', email: '', phone: '', company: '', planId: '', status: 'active', startDate: todayIn(loc.timezone), notes: '' });
  const [shiftIds, setShiftIds] = useState<string[]>([]);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const [money, setMoney] = useState<MoneyState>(emptyMoney);
  const [free, setFree] = useState<FreeState>(emptyFree);
  const amenities = useAmenities(loc.id);
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const plan = plans.data?.find((p) => p.id === v.planId);
  const create = useMutation({
    mutationFn: () => api.post<{ name: string; email: string; tempPassword?: string }>('/members', { ...v, planId: v.planId || null, locationId: loc.id, shiftIds, deskIds: spaceIds, advanceCents: cents(money.advance) ?? 0, depositCents: cents(money.deposit) ?? 0, method: money.method, reference: money.reference, ...freeBody(free, amenities.data) }),
    onSuccess: (m) => {
      void refresh('members', 'dashboard');
      onCreated({ name: m.name, email: m.email, password: m.tempPassword });
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input required value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />
        </Field>
        <Field label="Company">
          <Input value={v.company} onChange={(e) => set('company', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Email" hint="They sign in with this.">
          <Input type="email" required value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={v.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} />
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
            <option value="">No plan yet</option>
            {plans.data?.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={v.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="lead">Lead (not started)</option>
          </Select>
        </Field>
        <Field label="Start date">
          <Input
            type="date"
            required
            value={v.startDate}
            onChange={(e) => {
              set('startDate', e.target.value);
              setSpaceIds([]);
            }}
          />
        </Field>
      </div>
      {plan && v.status === 'active' && <PlanPicker plan={plan} startDate={v.startDate} shiftIds={shiftIds} spaceIds={spaceIds} onShifts={setShiftIds} onSpaces={setSpaceIds} advanceCents={cents(money.advance) ?? 0} />}
      <MoneyFields value={money} onChange={setMoney} />
      <FreeFields value={free} onChange={setFree} />
      <Field label="Notes">
        <Textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={2000} />
      </Field>
      {create.error && <ErrorNote error={new Error(errorMessage(create.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={create.isPending || !moneyOk(money) || !freeOk(free, amenities.data)}>
          {create.isPending ? 'Adding…' : 'Add member'}
        </Button>
      </div>
    </form>
  );
}

export default function Members() {
  const loc = useLocation();
  const { org } = useAuth();
  const toast = useToast();
  const members = useMembers(loc.id);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);

  const today = todayIn(loc.timezone);
  const ending = (members.data ?? []).filter((m) => m.status === 'active' && planPeriodState(m.planEnd, today));
  const term = q.trim().toLowerCase();
  const rows = (members.data ?? []).filter(
    (m) => (!status || m.status === status) && (!term || [m.name, m.email, m.company].some((x) => x.toLowerCase().includes(term))),
  );

  return (
    <>
      <PageHeader
        title="Members"
        sub={
          members.data
            ? `${members.data.filter((m) => m.status === 'active').length} active at ${loc.name}${org?.maxMembers != null ? `. Your ${org.packageName} package allows up to ${org.maxMembers} members in total.` : ''}`
            : undefined
        }
      >
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add member
        </Button>
      </PageHeader>

      {ending.length > 0 && (
        <div role="status" className="mb-4 rounded-lg bg-hold/15 px-4 py-3 text-sm">
          <p className="font-semibold">{ending.length === 1 ? 'A plan is ending soon' : `${ending.length} plans are ending soon`}</p>
          <ul className="mt-1 space-y-0.5">
            {ending.map((m) => (
              <li key={m.id}>
                <Link to={`/members/${m.id}`} className="font-semibold underline underline-offset-2">
                  {m.name}
                </Link>
                : {m.planName ?? 'plan'} {planPeriodWords(m.planEnd!, today)}. Open them to renew.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-56 flex-1">
          <Input type="search" aria-label="Search members" placeholder="Search by name, email or company" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="lead">Leads</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {members.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          title={members.data?.length ? 'No members match' : 'No members yet'}
          hint={members.data?.length ? 'Try a different search or status.' : 'Add your first member to start booking and billing.'}
          action={!members.data?.length && <Button variant="primary" onClick={() => setAdding(true)}>Add member</Button>}
        />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Today</th>
                <th>Member since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} size={34} />
                      <div className="min-w-0">
                        <Link to={`/members/${m.id}`} className="font-semibold underline-offset-2 hover:underline">
                          {m.name}
                        </Link>
                        <span className="block text-xs text-slate">{[m.company, m.email].filter(Boolean).join(', ')}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {m.contractCompany ? <Chip tone="hold">Contract: {m.contractCompany}</Chip> : (m.planName ?? <span className="text-slate">No plan</span>)}
                    {m.status === 'active' && planPeriodState(m.planEnd, today) && (
                      <span className="mt-0.5 block">
                        <Chip tone={planPeriodState(m.planEnd, today) === 'ended' ? 'busy' : 'hold'}>Plan {planPeriodWords(m.planEnd!, today)}</Chip>
                      </span>
                    )}
                  </td>
                  <td>
                    <Chip tone={statusTone(m.status)}>{titleCase(m.status)}</Chip>
                  </td>
                  <td>{m.checkedIn ? <Chip tone="ok">In the building</Chip> : <span className="text-slate">Not in</span>}</td>
                  <td className="num">{fmtDate(m.startDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a member" wide>
        <NewMemberForm
          onCancel={() => setAdding(false)}
          onCreated={(c) => {
            setAdding(false);
            toast.ok(`${c.name} added`);
            if (c.password) setCreds({ name: c.name, email: c.email, password: c.password });
          }}
        />
      </Modal>
      <CredentialsModal info={creds} onClose={() => setCreds(null)} />
    </>
  );
}
