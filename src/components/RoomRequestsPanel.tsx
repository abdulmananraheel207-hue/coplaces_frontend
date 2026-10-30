import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { useRefresh } from '../lib/queries';
import { fmtDate } from '../lib/time';
import type { RoomRequest } from '../types';
import { Button, Chip, Field, Input, Section } from './ui';
import { useToast } from './toast';

/** Requests for rooms that are waiting for a decision. Approving one makes the booking; the other asks for that time are marked taken. */
export function RoomRequestsPanel() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ['requests', loc.id, 'pending'], queryFn: () => api.get<RoomRequest[]>('/requests', { locationId: loc.id, status: 'pending' }), refetchInterval: 30_000 });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const done = () => void refresh('requests', 'bookings', 'schedule', 'dashboard');
  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/requests/${id}/approve`),
    onSuccess: () => {
      toast.ok('Approved. The room is booked for them.');
      done();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.ok('Request rejected');
      setRejecting(null);
      setReason('');
      done();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <Section className="mb-9" title="Room requests" aside={`${rows.length} waiting for you`}>
      <ul className="surface divide-y divide-line px-4">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <span className="font-semibold">{r.memberName}</span>
                {r.company && <span className="text-slate">, {r.company}</span>} wants <span className="font-semibold">{r.resourceName}</span>
                <span className="num block text-slate">
                  {fmtDate(r.date)}, {r.startTime} to {r.endTime}
                  {r.notes ? `. ${r.notes}` : ''}
                </span>
                {r.ahead > 0 && (
                  <span className="mt-0.5 block">
                    <Chip tone="hold">{r.ahead === 1 ? '1 other person is' : `${r.ahead} others are`} also asking for this time</Chip>
                  </span>
                )}
              </span>
              <span className="flex gap-2">
                <Button small variant="primary" disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                  Approve
                </Button>
                <Button small onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>
                  Reject
                </Button>
              </span>
            </div>
            {rejecting === r.id && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Reason (optional, the member sees it)" className="min-w-64 flex-1">
                  <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <Button small disabled={reject.isPending} onClick={() => reject.mutate(r.id)}>
                  Reject request
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
