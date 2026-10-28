import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { useFloors, useRefresh } from '../lib/queries';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input } from './ui';
import { floorLabel } from './space3d/layout';

/** Suggests "Ground Floor", "Floor 1", "Floor 2"... skipping names that are taken. */
function suggest(taken: string[], n: number) {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) {
    const name = i === 0 ? 'Ground Floor' : `Floor ${i}`;
    if (!used.has(name.toLowerCase())) out.push(name);
  }
  return out;
}

/** Adds floors to a location. What goes on them is added later in Edit floor plan. */
export function FloorsForm({ onDone }: { onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const q = useFloors(loc.id);
  const existing = q.data?.floors ?? [];
  const limit = q.data?.limit ?? null;
  const room = limit === null ? 50 : Math.max(0, limit - existing.length);
  const [names, setNames] = useState<string[] | null>(null);
  const list = names ?? suggest(existing, Math.min(1, room));

  const setCount = (raw: string) => {
    const n = Math.max(0, Math.min(room, Math.floor(Number(raw) || 0)));
    setNames((cur) => {
      const have = cur ?? list;
      return n <= have.length ? have.slice(0, n) : [...have, ...suggest([...existing, ...have], n - have.length)];
    });
  };
  const clean = list.map((n) => n.trim());
  const dup = new Set(clean.map((n) => n.toLowerCase())).size !== clean.length || clean.some((n) => existing.some((e) => e.toLowerCase() === n.toLowerCase()));
  const save = useMutation({
    mutationFn: () => api.post('/floors', { locationId: loc.id, names: clean }),
    onSuccess: () => {
      toast.ok(clean.length === 1 ? 'Floor added' : `${clean.length} floors added`);
      void refresh('floors');
      onDone();
    },
  });

  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (name: string) => api.del(`/floors?${new URLSearchParams({ locationId: loc.id, name })}`),
    onSuccess: () => {
      toast.ok('Floor removed');
      setConfirming(null);
      void refresh('floors');
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirming(null);
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
      {existing.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {existing.map((f) => (
            <li key={f} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span>{floorLabel(f)}</span>
              {f &&
                (confirming === f ? (
                  <span className="flex items-center gap-1">
                    <Button small variant="ghost" onClick={() => setConfirming(null)}>Keep</Button>
                    <Button small onClick={() => remove.mutate(f)} disabled={remove.isPending}>Yes, remove</Button>
                  </span>
                ) : (
                  <Button small variant="ghost" onClick={() => setConfirming(f)} aria-label={`Remove ${floorLabel(f)}`}>Remove</Button>
                ))}
            </li>
          ))}
        </ul>
      )}
      {limit !== null && (
        <p className="text-sm text-slate">
          Your package allows {limit} floor{limit === 1 ? '' : 's'} per location. {room === 0 ? 'You have used them all.' : `You can add ${room} more.`}
        </p>
      )}
      {room > 0 && (
        <>
          <Field label="How many floors?">
            <Input type="number" min={1} max={room} value={list.length || ''} onChange={(e) => setCount(e.target.value)} className="max-w-32" />
          </Field>
          <div className="space-y-2">
            {list.map((n, i) => (
              <Field key={i} label={`Floor ${i + 1} name`}>
                <Input required maxLength={50} value={n} onChange={(e) => setNames(list.map((x, j) => (j === i ? e.target.value : x)))} />
              </Field>
            ))}
          </div>
          {dup && <p className="text-sm text-red-700">Each floor needs its own name, different from the ones already here.</p>}
          <p className="text-xs text-slate">Add rooms, desks and the rest to these floors afterwards, in Edit floor plan. A floor can be removed once it is empty.</p>
        </>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending || room === 0 || list.length === 0 || dup || clean.some((n) => !n)}>
          Add {list.length === 1 ? 'floor' : 'floors'}
        </Button>
      </div>
    </form>
  );
}
