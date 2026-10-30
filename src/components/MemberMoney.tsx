import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { useToast } from './toast';
import { Button, Chip, ErrorNote, Field, Input, Modal, Section, Select } from './ui';
import { fromCents, METHOD_LABEL, money, toCents } from '../lib/format';
import { useRefresh } from '../lib/queries';
import { fmtDate } from '../lib/time';
import type { MemberDetail, PaymentMethod } from '../types';

export interface MoneyState {
  advance: string;
  deposit: string;
  method: PaymentMethod;
  reference: string;
}
export const emptyMoney: MoneyState = { advance: '', deposit: '', method: 'cash', reference: '' };

/** The amount typed as cents: empty is nothing, anything that is not a number is null. */
export const cents = (s: string) => (s.trim() === '' ? 0 : toCents(s));
export const moneyOk = (m: MoneyState) => cents(m.advance) !== null && cents(m.deposit) !== null;

/**
 * What a member pays when they join: an advance, which comes off the shift prices, and a security deposit, which is held and
 * settled at the end of the plan period. Either can be left empty. `locked` says what was already received and cannot be added again.
 */
export function MoneyFields({ value, onChange, locked }: { value: MoneyState; onChange: (m: MoneyState) => void; locked?: { advance?: boolean; deposit?: boolean } }) {
  const loc = useLocation();
  const set = <K extends keyof MoneyState>(k: K, v: MoneyState[K]) => onChange({ ...value, [k]: v });
  const any = (cents(value.advance) ?? 0) > 0 || (cents(value.deposit) ?? 0) > 0;
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-[13px] font-semibold">Money received</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Advance (${loc.currency})`} hint={locked?.advance ? 'Already received, so it cannot be added again.' : 'Taken off the shift price on their invoices until it is used up.'}>
          <Input inputMode="decimal" disabled={locked?.advance} value={value.advance} onChange={(e) => set('advance', e.target.value)} />
        </Field>
        <Field label={`Security deposit (${loc.currency})`} hint={locked?.deposit ? 'Already received, so it cannot be added again.' : 'Held for them and settled at the end of the plan period. It is not income.'}>
          <Input inputMode="decimal" disabled={locked?.deposit} value={value.deposit} onChange={(e) => set('deposit', e.target.value)} />
        </Field>
      </div>
      {any && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="How was it paid">
            <Select value={value.method} onChange={(e) => set('method', e.target.value as PaymentMethod)}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" hint="A transfer or cheque number, if there is one.">
            <Input value={value.reference} maxLength={100} onChange={(e) => set('reference', e.target.value)} />
          </Field>
        </div>
      )}
      {!moneyOk(value) && <p className="text-sm text-busy">Enter the amounts as numbers, like 5000.</p>}
    </fieldset>
  );
}

const ENTRY_WORD = { advance: 'Advance received', received: 'Security deposit received', refunded: 'Security deposit returned', kept: 'Security deposit kept by us' } as const;
const depositTone = { pending: 'hold', held: 'ok', refunded: 'idle', forfeited: 'busy' } as const;
const depositLabel = { pending: 'None', held: 'Held', refunded: 'Returned', forfeited: 'Kept' } as const;

function SettleForm({ m, onDone }: { m: MemberDetail; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [amount, setAmount] = useState(fromCents(m.depositCents));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const settle = useMutation({
    mutationFn: () => {
      const c = toCents(amount);
      if (c === null) throw new Error('Enter the amount as a number');
      return api.post(`/members/${m.id}/deposit`, c === 0 ? { action: 'forfeit' } : { action: 'refund', returnedCents: c, method, reference });
    },
    onSuccess: () => {
      toast.ok('Security deposit settled');
      void refresh('member', 'members', 'reports');
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
        {m.name} paid a security deposit of <strong>{money(m.depositCents, loc.currency)}</strong>. Enter how much goes back to them. Anything you keep, such as for damage, is counted as income. Enter 0 to keep all of it.
      </p>
      <Field label={`Amount returned (${loc.currency})`}>
        <Input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {toCents(amount) !== 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="How was it paid back">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference">
            <Input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>
      )}
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

/** A member's advance and security deposit on their page, with the record of every movement and a way to settle the deposit. */
export function MoneySection({ m, canSettle }: { m: MemberDetail; canSettle: boolean }) {
  const loc = useLocation();
  const [settling, setSettling] = useState(false);
  if (!m.advanceCents && !m.depositCents && !m.moneyEntries.length) return null;
  const left = m.advanceCents - m.advanceUsedCents;
  return (
    <Section title="Advance and security deposit">
      <div className="space-y-3 text-sm">
        {m.advanceCents > 0 && (
          <p>
            <strong>Advance {money(m.advanceCents, loc.currency)}.</strong> {money(m.advanceUsedCents, loc.currency)} has been taken off invoices
            {left > 0 ? `, ${money(left, loc.currency)} is left for the next one.` : ', so it is all used.'}
          </p>
        )}
        {m.depositCents > 0 && (
          <p className="flex flex-wrap items-center gap-2">
            <span>
              <strong>Security deposit {money(m.depositCents, loc.currency)}.</strong>
            </span>
            <Chip tone={depositTone[m.depositStatus]}>{depositLabel[m.depositStatus]}</Chip>
            {m.depositStatus === 'refunded' && <span className="text-slate">{money(m.depositReturnedCents, loc.currency)} returned</span>}
            {m.depositStatus === 'held' && canSettle && (
              <Button small onClick={() => setSettling(true)}>
                Settle at the end of the plan
              </Button>
            )}
          </p>
        )}
        {m.moneyEntries.length > 0 && (
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
                {m.moneyEntries.map((e) => (
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
        )}
      </div>
      <Modal open={settling} onClose={() => setSettling(false)} title="Settle the security deposit">
        {settling && <SettleForm m={m} onDone={() => setSettling(false)} />}
      </Modal>
    </Section>
  );
}
