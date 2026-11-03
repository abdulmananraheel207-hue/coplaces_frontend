import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { MONEY_STATUS_LABEL } from '../lib/format';
import { FINANCE_KEYS, useRefresh } from '../lib/queries';
import { todayIn } from '../lib/time';
import type { MoneyStatus } from '../types';
import { useToast } from './toast';
import { Button, Chip, Input } from './ui';

/** A cheque's state as a chip: waiting (amber), cleared (green), bounced (red). */
export function ChequeChip({ status }: { status: MoneyStatus }) {
  return <Chip tone={status === 'cleared' ? 'ok' : status === 'bounced' ? 'busy' : 'hold'}>{MONEY_STATUS_LABEL[status]}</Chip>;
}

/**
 * The two things that can happen to a cheque waiting to clear. "Cleared" asks for the day the bank cleared it (today by default):
 * from then it pays the invoice, or the advance or deposit is taken, and it counts in the bank. "Bounced" leaves everything as if
 * it never came, so the member still owes it.
 */
export function ChequeActions({ source, id }: { source: 'payment' | 'entry'; id: string }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [mode, setMode] = useState<'idle' | 'clear' | 'bounce'>('idle');
  const [day, setDay] = useState(today);
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: () => (mode === 'clear' ? api.post(`/cheques/${source}/${id}/clear`, day === today ? {} : { clearedOn: day }) : api.post(`/cheques/${source}/${id}/bounce`, { reason })),
    onSuccess: () => {
      toast.ok(mode === 'clear' ? 'Cheque cleared' : 'Cheque marked as bounced');
      setMode('idle');
      void refresh(...FINANCE_KEYS);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (mode === 'idle')
    return (
      <span className="inline-flex gap-1.5">
        <Button small onClick={() => setMode('clear')}>
          Cleared
        </Button>
        <Button small variant="ghost" onClick={() => setMode('bounce')}>
          Bounced
        </Button>
      </span>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label={mode === 'clear' ? 'Mark the cheque cleared' : 'Mark the cheque bounced'}>
      {mode === 'clear' ? (
        <label className="inline-flex items-center gap-1.5">
          <span className="text-slate">Cleared on</span>
          <Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="!w-auto !py-1" />
        </label>
      ) : (
        <Input aria-label="Why it bounced (optional)" placeholder="Why (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="!w-40 !py-1" />
      )}
      <Button small variant="ghost" onClick={() => setMode('idle')}>
        Cancel
      </Button>
      <Button small variant={mode === 'clear' ? 'primary' : 'danger'} disabled={act.isPending || !day} onClick={() => act.mutate()}>
        {mode === 'clear' ? 'Confirm' : 'Bounced'}
      </Button>
    </span>
  );
}
