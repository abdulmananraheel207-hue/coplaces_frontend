import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { isRoomKind } from '../lib/catalogue';
import { money } from '../lib/format';
import { useRefresh } from '../lib/queries';
import { addDays, fmtDate, fromMinutes, todayIn, toMinutes } from '../lib/time';
import type { Resource, RoomRequest } from '../types';
import { Button, Chip, ErrorNote, Field, Input, Modal, Select, Textarea } from './ui';
import { useToast } from './toast';

export interface RequestDraft {
  resourceId?: string;
  date?: string;
  startTime?: string;
}

/** The one-line answer to "how many others are waiting", in plain words. */
export const queueWords = (n: number) => (n === 0 ? 'Nobody else has asked for this room at that time.' : n === 1 ? '1 person has already asked for this room at that time.' : `${n} people have already asked for this room at that time.`);

function RequestForm({ resources, draft, onDone }: { resources: Resource[]; draft: RequestDraft; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const rooms = resources.filter((r) => isRoomKind(r.kind) && r.status === 'available');
  const today = todayIn(loc.timezone);
  const [resourceId, setResourceId] = useState(draft.resourceId ?? rooms[0]?.id ?? '');
  const [date, setDate] = useState(draft.date ?? today);
  const [startTime, setStartTime] = useState(draft.startTime ?? loc.openTime);
  const [endTime, setEndTime] = useState(() => fromMinutes(Math.min(toMinutes(draft.startTime ?? loc.openTime) + 60, toMinutes(loc.closeTime))));
  const [notes, setNotes] = useState('');
  const room = rooms.find((r) => r.id === resourceId);
  const openTime = room?.openTime ?? loc.openTime;
  const closeTime = room?.closeTime ?? loc.closeTime;
  const ready = !!resourceId && !!date && !!startTime && !!endTime && toMinutes(endTime) > toMinutes(startTime);

  // How many others are waiting, and what it would cost: both worked out by the server, before anything is sent.
  const queue = useQuery({ queryKey: ['requests', 'queue', resourceId, date, startTime, endTime], queryFn: () => api.get<{ ahead: number }>('/requests/queue', { resourceId, date, startTime, endTime }), enabled: ready, staleTime: 5_000 });
  const quote = useQuery({
    queryKey: ['quote', 'request', resourceId, date, startTime, endTime],
    queryFn: () => api.post<{ priceCents: number }>('/bookings/quote', { resourceId, date, startTime, endTime }),
    enabled: ready,
    retry: false,
    staleTime: 10_000,
  });

  const send = useMutation({
    mutationFn: () => api.post<{ ahead: number }>('/requests', { resourceId, date, startTime, endTime, notes }),
    onSuccess: () => {
      toast.ok('Request sent. The owner will approve or reject it.');
      void refresh('requests');
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        send.mutate();
      }}
      className="space-y-4"
    >
      <p className="rounded-lg bg-plaster px-3 py-2 text-sm">Rooms are not booked straight away. You ask, and the owner approves or rejects it.</p>
      <Field label="Room">
        <Select value={resourceId} onChange={(e) => setResourceId(e.target.value)} required>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" required min={today} max={addDays(today, 180)} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" hint={`Open ${openTime} to ${closeTime}`}>
          <Input type="time" step={900} required min={openTime} max={closeTime} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Until">
          <Input type="time" step={900} required min={openTime} max={closeTime} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </div>
      <Field label="What is it for? (optional)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </Field>
      {ready && queue.data && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${queue.data.ahead > 0 ? 'bg-hold/15 font-semibold' : 'bg-plaster'}`}>
          {queueWords(queue.data.ahead)}
          {queue.data.ahead > 0 && <span className="block text-xs font-normal text-slate">You can still ask. The owner chooses who gets it.</span>}
        </p>
      )}
      {ready && quote.data && (
        <p className="flex items-baseline justify-between gap-3 rounded-lg bg-plaster px-3 py-2 text-sm">
          <span className="text-slate">If approved</span>
          <strong className="num">{quote.data.priceCents > 0 ? money(quote.data.priceCents, loc.currency) : 'Included in your plan'}</strong>
        </p>
      )}
      {ready && quote.error && !send.error && (
        <p role="status" className="rounded-lg border border-signal-deep/30 bg-hold-wash px-3 py-2 text-sm">
          {errorMessage(quote.error)}
        </p>
      )}
      {send.error && <ErrorNote error={new Error(errorMessage(send.error))} />}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={send.isPending || !ready || !rooms.length}>
          {send.isPending ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </form>
  );
}

export function RoomRequestModal({ open, onClose, resources, draft = {} }: { open: boolean; onClose: () => void; resources: Resource[]; draft?: RequestDraft }) {
  return (
    <Modal open={open} onClose={onClose} title="Request a room">
      {open && <RequestForm resources={resources} draft={draft} onDone={onClose} />}
    </Modal>
  );
}

export const requestTone = { pending: 'hold', approved: 'ok', rejected: 'busy', cancelled: 'idle', taken: 'idle' } as const;
export const requestWord = { pending: 'Waiting for the owner', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', taken: 'Slot taken' } as const;

/** A member's own requests, with what happened to each. They can take back one that is still waiting. */
export function MyRequests() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ['requests', loc.id, 'mine'], queryFn: () => api.get<RoomRequest[]>('/requests', { locationId: loc.id }), refetchInterval: 60_000 });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/requests/${id}/cancel`),
    onSuccess: () => {
      toast.ok('Request cancelled');
      void refresh('requests');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const today = todayIn(loc.timezone);
  const rows = (q.data ?? []).filter((r) => r.date >= today || r.status === 'pending');
  if (!rows.length) return null;
  return (
    <ul className="surface divide-y divide-line px-4">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
          <span>
            <span className="font-semibold">{r.resourceName}</span>{' '}
            <span className="num text-slate">
              {fmtDate(r.date)}, {r.startTime} to {r.endTime}
            </span>
            {r.status === 'pending' && r.ahead > 0 && <span className="block text-xs text-slate">{r.ahead === 1 ? '1 other person is' : `${r.ahead} others are`} also waiting for this time.</span>}
            {r.reason && (r.status === 'rejected' || r.status === 'taken') && <span className="block text-xs text-slate">{r.reason}</span>}
          </span>
          <span className="flex items-center gap-2">
            <Chip tone={requestTone[r.status]}>{requestWord[r.status]}</Chip>
            {r.status === 'pending' && (
              <Button small variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                Cancel
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
