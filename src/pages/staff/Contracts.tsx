import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useAuth, useLocation } from '../../auth';
import { CompanyContractWizard } from '../../components/CompanyContractWizard';
import { CompanyEditForm, ContractPeople, ExtendForm } from '../../components/CompanyContractTools';
import { printContract } from '../../components/ContractPrint';
import { MemberSelect } from '../../components/MemberSelect';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '../../components/ui';
import { downloadCsv, fromCents, KIND_LABEL, METHOD_LABEL, money, titleCase, toCents } from '../../lib/format';
import { useRefresh, useResources } from '../../lib/queries';
import { fmtDate, todayIn } from '../../lib/time';
import type { Contract, DepositEntry, PaymentMethod } from '../../types';

const contractTone = { draft: 'hold', active: 'ok', ended: 'idle', cancelled: 'idle' } as const;
const depositLabel = { pending: 'Not received', held: 'Held', refunded: 'Refunded', forfeited: 'Kept' } as const;
const isReceived = (c: Contract) => c.advanceReceivedAt !== null;
/** The company on a company contract, otherwise the member. */
const who = (c: Contract) => c.companyName || c.memberName;
const depositTone = { pending: 'hold', held: 'ok', refunded: 'idle', forfeited: 'busy' } as const;

function ContractForm({ initial, onDone }: { initial?: Contract; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const resources = useResources(loc.id);
  const spaces = (resources.data ?? []).filter((r) => r.status !== 'retired');
  const [v, setV] = useState({
    memberId: initial?.memberId ?? '',
    resourceId: initial?.resourceId ?? '',
    startDate: initial?.startDate ?? todayIn(loc.timezone),
    endDate: initial?.endDate ?? '',
    rent: initial ? fromCents(initial.rentCents) : '',
    advance: initial ? fromCents(initial.advanceCents) : '',
    deposit: initial ? fromCents(initial.depositCents) : '',
    notes: initial?.notes ?? '',
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => {
      const rent = v.rent ? toCents(v.rent) : 0;
      const deposit = v.deposit ? toCents(v.deposit) : 0;
      const advance = v.advance ? toCents(v.advance) : 0;
      if (rent === null || deposit === null || advance === null) throw new Error('Enter rent, advance and security deposit as numbers, like 25000');
      const body = { memberId: v.memberId, resourceId: v.resourceId || null, startDate: v.startDate, endDate: v.endDate || null, rentCents: rent, advanceCents: advance, depositCents: deposit, notes: v.notes };
      return initial ? api.patch(`/contracts/${initial.id}`, body) : api.post('/contracts', { ...body, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(initial ? 'Contract updated' : 'Contract saved as a draft');
      void refresh('contracts');
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
      <Field label="Member">
        <MemberSelect locationId={loc.id} value={v.memberId} onChange={(id) => set('memberId', id)} required />
      </Field>
      <Field label="Space rented" hint="Any desk, office, room, locker or bay. It is handed to the member when the contract starts. A room or hot desk that is rented cannot be booked by anyone else.">
        <Select value={v.resourceId} onChange={(e) => set('resourceId', e.target.value)}>
          <option value="">No particular space</option>
          {Object.entries(KIND_LABEL)
            .filter(([kind]) => spaces.some((r) => r.kind === kind))
            .map(([kind, label]) => (
              <optgroup key={kind} label={label}>
                {spaces
                  .filter((r) => r.kind === kind)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </optgroup>
            ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts">
          <Input type="date" required value={v.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Ends" hint="Leave empty for no end date.">
          <Input type="date" min={v.startDate} value={v.endDate} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
        <Field label={`Rent per month (${loc.currency})`}>
          <Input inputMode="decimal" value={v.rent} onChange={(e) => set('rent', e.target.value)} />
        </Field>
        <Field label={`Advance (${loc.currency})`} hint={initial && isReceived(initial) ? 'Already received, so it cannot change.' : 'Rent taken up front. It counts as income when you receive it.'}>
          <Input inputMode="decimal" value={v.advance} disabled={!!initial && isReceived(initial)} onChange={(e) => set('advance', e.target.value)} />
        </Field>
        <Field label={`Security deposit (${loc.currency})`} hint={initial && initial.depositStatus !== 'pending' ? 'Already received, so it cannot change.' : 'Held for the member and given back at the end. It is not income.'}>
          <Input inputMode="decimal" value={v.deposit} disabled={!!initial && initial.depositStatus !== 'pending'} onChange={(e) => set('deposit', e.target.value)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={v.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!v.memberId || save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

const ENTRY_WORD = { received: 'Security deposit received', refunded: 'Security deposit returned', kept: 'Security deposit kept by us', advance: 'Advance received' } as const;

/** How the money moved, so it can be matched against the till or the bank. */
function MovementFields({ method, setMethod, reference, setReference, noMoney }: { method: PaymentMethod; setMethod: (m: PaymentMethod) => void; reference: string; setReference: (r: string) => void; noMoney?: boolean }) {
  if (noMoney) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="How was it paid">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {Object.entries(METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reference" hint="A transfer or cheque number, if there is one.">
        <Input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
      </Field>
    </div>
  );
}

function ReceiveForm({ contract, what, onDone }: { contract: Contract; what: 'advance' | 'deposit'; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const receive = useMutation({
    mutationFn: () => (what === 'advance' ? api.post(`/contracts/${contract.id}/advance`, { method, reference }) : api.post(`/contracts/${contract.id}/deposit`, { action: 'receive', method, reference })),
    onSuccess: () => {
      toast.ok(what === 'advance' ? 'Advance received' : 'Security deposit received');
      void refresh('contracts', 'reports');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        receive.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-sm">
        {what === 'advance' ? (
          <>
            {who(contract)} pays an advance of <strong>{money(contract.advanceCents, loc.currency)}</strong>. It is rent paid ahead, so it counts as income from today.
          </>
        ) : (
          <>
            {who(contract)} hands over a security deposit of <strong>{money(contract.depositCents, loc.currency)}</strong>. It is held for them and does not count as income.
          </>
        )}
      </p>
      <MovementFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} />
      {receive.error && <ErrorNote error={new Error(errorMessage(receive.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={receive.isPending}>
          {what === 'advance' ? 'Record advance' : 'Record security deposit'}
        </Button>
      </div>
    </form>
  );
}

/** Every movement of money on one contract: the advance and the security deposit. */
function DepositHistory({ contract }: { contract: Contract }) {
  const loc = useLocation();
  const q = useQuery({ queryKey: ['contracts', loc.id, 'deposit', contract.id, contract.depositStatus, contract.advanceReceivedAt], queryFn: () => api.get<DepositEntry[]>(`/contracts/${contract.id}/deposit-entries`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data?.length) return <p className="text-sm text-slate">No money has been recorded for this contract yet.</p>;
  const held = q.data.reduce((s, e) => (e.kind === 'advance' ? s : s + (e.kind === 'received' ? e.amountCents : -e.amountCents)), 0);
  return (
    <div className="space-y-3">
      <div className="surface-table">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>What happened</th>
              <th>How</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((e) => (
              <tr key={e.id}>
                <td className="num whitespace-nowrap">{fmtDate(e.occurredAt.slice(0, 10))}</td>
                <td>{ENTRY_WORD[e.kind]}</td>
                <td>{[e.method ? METHOD_LABEL[e.method] : '', e.reference].filter(Boolean).join(', ') || '—'}</td>
                <td className="r font-semibold">{money(e.amountCents, loc.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate">
        Security deposit still held for {who(contract)}: <strong className="num text-ink">{money(held, loc.currency)}</strong>. An advance is income when received, and a security deposit you keep is income on the day you keep it.
      </p>
    </div>
  );
}

function RefundForm({ contract, onDone }: { contract: Contract; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [amount, setAmount] = useState(fromCents(contract.depositCents));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const settle = useMutation({
    mutationFn: () => {
      const cents = toCents(amount);
      if (cents === null) throw new Error('Enter the amount as a number');
      return api.post(`/contracts/${contract.id}/deposit`, cents === 0 ? { action: 'forfeit' } : { action: 'refund', returnedCents: cents, method, reference });
    },
    onSuccess: () => {
      toast.ok('Security deposit settled');
      void refresh('contracts', 'reports');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        settle.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-sm">
        {who(contract)} paid a security deposit of <strong>{money(contract.depositCents, loc.currency)}</strong>. Enter how much goes back to them. Anything you keep, such as for damage or unpaid rent, is counted as income. Enter 0 to keep all of it.
      </p>
      <Field label={`Amount returned (${loc.currency})`}>
        <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <MovementFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} noMoney={toCents(amount) === 0} />
      {settle.error && <ErrorNote error={new Error(errorMessage(settle.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={settle.isPending}>
          Settle security deposit
        </Button>
      </div>
    </form>
  );
}

function Contracts() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ['contracts', loc.id], queryFn: () => api.get<Contract[]>('/contracts', { locationId: loc.id }) });
  const [editing, setEditing] = useState<Contract | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Contract | null>(null);
  const [peopleOf, setPeopleOf] = useState<string | null>(null);
  const [extending, setExtending] = useState<Contract | null>(null);
  const [refunding, setRefunding] = useState<Contract | null>(null);
  const [receiving, setReceiving] = useState<{ c: Contract; what: 'advance' | 'deposit' } | null>(null);
  const [history, setHistory] = useState<Contract | null>(null);
  const { org } = useAuth();
  const act = useMutation({
    mutationFn: (v: { id: string; path: 'activate' | 'end' | 'cancel' | 'deposit'; body?: object; ok: string }) => api.post(`/contracts/${v.id}/${v.path}`, v.body),
    onSuccess: (_d, v) => {
      toast.ok(v.ok);
      void refresh('contracts', 'assignments', 'resources', 'members', 'dashboard');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-slate">A contract rents space to a company and its people. Starting it gives the employees their logins and hands over the spaces and desks, and ending it frees them again.</p>
        <span className="flex gap-2">
          <Button
            onClick={() =>
              downloadCsv('contracts.csv', [
                ['Member', 'Company', 'Space', 'Starts', 'Ends', 'Rent per month', 'Advance', 'Advance received', 'Security deposit', 'Security deposit status', 'Returned', 'Status'],
                ...(q.data ?? []).map((c) => [who(c), c.company, c.companyName ? c.spaces.map((s) => s.name).join(' + ') : (c.resourceName ?? ''), c.startDate, c.endDate ?? '', fromCents(c.rentCents), fromCents(c.advanceCents), c.advanceReceivedAt ? 'Yes' : c.advanceCents ? 'No' : '', fromCents(c.depositCents), depositLabel[c.depositStatus], fromCents(c.depositReturnedCents), titleCase(c.status)]),
              ])
            }
            disabled={!q.data?.length}
          >
            Export
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            New contract
          </Button>
        </span>
      </div>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !q.data?.length ? (
        <Empty title="No contracts yet" hint="Add one when a company takes a room, an office or desks for its people." action={<Button variant="primary" onClick={() => setCreating(true)}>New contract</Button>} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Company or member</th>
                <th>Space</th>
                <th>Period</th>
                <th className="r">Rent / month</th>
                <th>Advance</th>
                <th>Security deposit</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => {
                const finished = c.status === 'ended' || c.status === 'cancelled';
                return (
                  <tr key={c.id} className={finished ? 'text-slate' : ''}>
                    <td>
                      <span className="font-semibold">{who(c)}</span>
                      {c.companyName ? (
                        <span className="block text-xs text-slate">
                          {c.people.filter((p) => !p.leaveDate).length} people{c.extraPeople > 0 ? `, ${c.extraPeople} extra` : ''}
                        </span>
                      ) : (
                        c.company && <span className="block text-xs text-slate">{c.company}</span>
                      )}
                    </td>
                    <td>
                      {c.companyName ? (
                        <>
                          {c.spaces.map((s) => s.name).join(', ') || 'Desks only'}
                          {c.people.some((p) => p.deskName && !p.leaveDate) && <span className="block text-xs text-slate">{c.people.filter((p) => p.deskName && !p.leaveDate).length} own desks</span>}
                        </>
                      ) : (
                        (c.resourceName ?? 'None')
                      )}
                    </td>
                    <td className="num whitespace-nowrap">
                      {fmtDate(c.startDate)} to {c.endDate ? fmtDate(c.endDate) : 'open'}
                    </td>
                    <td className="r">{c.rentCents ? money(c.rentCents, loc.currency) : '—'}</td>
                    <td>
                      {c.advanceCents > 0 ? (
                        <>
                          <span className="num block">{money(c.advanceCents, loc.currency)}</span>
                          <Chip tone={isReceived(c) ? 'ok' : 'hold'}>{isReceived(c) ? 'Received' : 'Not received'}</Chip>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {c.depositCents > 0 ? (
                        <>
                          <span className="num block">{money(c.depositCents, loc.currency)}</span>
                          <Chip tone={depositTone[c.depositStatus]}>{depositLabel[c.depositStatus]}</Chip>
                          {c.depositStatus === 'refunded' && <span className="num block text-xs text-slate">{money(c.depositReturnedCents, loc.currency)} returned</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <Chip tone={contractTone[c.status]}>{titleCase(c.status)}</Chip>
                    </td>
                    <td className="r whitespace-nowrap">
                      {c.status === 'draft' && (
                        <>
                          <Button small variant="primary" disabled={act.isPending} onClick={() => act.mutate({ id: c.id, path: 'activate', ok: 'Contract is active' })}>
                            Start
                          </Button>{' '}
                          <Button small variant="ghost" onClick={() => (c.companyName ? setEditingCompany(c) : setEditing(c))}>
                            Edit
                          </Button>{' '}
                          <Button small variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: c.id, path: 'cancel', ok: 'Contract cancelled' })}>
                            Cancel
                          </Button>
                        </>
                      )}
                      {c.companyName && !finished && (
                        <>
                          {' '}
                          <Button small variant="ghost" onClick={() => setPeopleOf(c.id)}>
                            People
                          </Button>
                        </>
                      )}
                      {c.companyName && c.status === 'active' && (
                        <>
                          {' '}
                          <Button small variant="ghost" onClick={() => setEditingCompany(c)}>
                            Prices
                          </Button>
                          {c.endDate && (
                            <>
                              {' '}
                              <Button small variant="ghost" onClick={() => setExtending(c)}>
                                Extend
                              </Button>
                            </>
                          )}
                        </>
                      )}
                      {c.status === 'active' && (
                        <>
                          {' '}
                          <Button small disabled={act.isPending} onClick={() => act.mutate({ id: c.id, path: 'end', body: {}, ok: 'Contract ended' })}>
                            End today
                          </Button>
                        </>
                      )}
                      {c.advanceCents > 0 && !isReceived(c) && !finished && (
                        <>
                          {' '}
                          <Button small variant="ghost" onClick={() => setReceiving({ c, what: 'advance' })}>
                            Advance received
                          </Button>
                        </>
                      )}
                      {c.depositStatus === 'pending' && c.depositCents > 0 && !finished && (
                        <>
                          {' '}
                          <Button small variant="ghost" onClick={() => setReceiving({ c, what: 'deposit' })}>
                            Security deposit received
                          </Button>
                        </>
                      )}
                      {c.depositStatus === 'held' && finished && (
                        <>
                          {' '}
                          <Button small onClick={() => setRefunding(c)}>
                            Settle security deposit
                          </Button>
                        </>
                      )}
                      {(isReceived(c) || (c.depositStatus !== 'pending' && c.depositCents > 0)) && (
                        <>
                          {' '}
                          <Button small variant="ghost" onClick={() => setHistory(c)}>
                            Money record
                          </Button>
                        </>
                      )}{' '}
                      {!c.companyName && (
                        <Button small variant="ghost" onClick={() => void printContract(c, loc, org?.name ?? loc.name)}>
                          Print
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New company contract" wide>
        {creating && <CompanyContractWizard onDone={() => setCreating(false)} />}
      </Modal>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit contract" wide>
        {editing && <ContractForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={editingCompany !== null} onClose={() => setEditingCompany(null)} title={editingCompany ? `Edit ${editingCompany.companyName}` : 'Edit contract'} wide>
        {editingCompany && <CompanyEditForm contract={editingCompany} onDone={() => setEditingCompany(null)} />}
      </Modal>
      <Modal open={peopleOf !== null} onClose={() => setPeopleOf(null)} title={`People at ${q.data?.find((c) => c.id === peopleOf)?.companyName ?? ''}`} wide>
        {q.data?.find((c) => c.id === peopleOf) && <ContractPeople contract={q.data.find((c) => c.id === peopleOf)!} />}
      </Modal>
      <Modal open={extending !== null} onClose={() => setExtending(null)} title="Extend the contract">
        {extending && <ExtendForm contract={extending} onDone={() => setExtending(null)} />}
      </Modal>
      <Modal open={receiving !== null} onClose={() => setReceiving(null)} title={receiving?.what === 'advance' ? 'Record the advance' : 'Record the security deposit'}>
        {receiving && <ReceiveForm contract={receiving.c} what={receiving.what} onDone={() => setReceiving(null)} />}
      </Modal>
      <Modal open={history !== null} onClose={() => setHistory(null)} title={history ? `Money record of ${who(history)}` : 'Money record'} wide>
        {history && <DepositHistory contract={history} />}
      </Modal>
      <Modal open={refunding !== null} onClose={() => setRefunding(null)} title="Settle the security deposit">
        {refunding && <RefundForm contract={refunding} onDone={() => setRefunding(null)} />}
      </Modal>
    </>
  );
}

export default function ContractsPage() {
  return (
    <>
      <PageHeader title="Contracts" />
      <Contracts />
    </>
  );
}
