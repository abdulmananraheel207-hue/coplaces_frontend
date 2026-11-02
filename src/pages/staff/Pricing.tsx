import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Input, Loading, PageHeader, Select } from '../../components/ui';
import { fromCents, KIND_LABEL, toCents } from '../../lib/format';
import { useRefresh, useResources } from '../../lib/queries';
import type { ResourceKind } from '../../types';

/** One row: whether the space can be booked by the hour, and the price typed for it. */
interface Row {
  on: boolean;
  price: string;
}

/**
 * The owner's list of every space, to tick the ones that can be booked by the hour and give each an hourly price.
 * A space with no price is only used through plans and contracts; a space with one is bookable on the Bookings page and can be
 * asked for by members.
 */
export default function Pricing() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const resources = useResources(loc.id);
  const spaces = useMemo(() => (resources.data ?? []).filter((r) => r.status !== 'retired').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [resources.data]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [kind, setKind] = useState<'' | ResourceKind>('');
  const [q, setQ] = useState('');
  const [bulk, setBulk] = useState('');

  // What is saved, as the starting point; saving or reloading starts over from it.
  const saved = useMemo(() => Object.fromEntries(spaces.map((r) => [r.id, { on: r.hourlyRateCents > 0, price: r.hourlyRateCents > 0 ? fromCents(r.hourlyRateCents) : '' } satisfies Row])), [spaces]);
  useEffect(() => setRows(saved), [saved]);

  const shown = spaces.filter((r) => (!kind || r.kind === kind) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const set = (id: string, patch: Partial<Row>) => setRows((x) => ({ ...x, [id]: { ...x[id]!, ...patch } }));

  // The price each row means, in cents: nothing when it is not ticked, and null when it is ticked with something that is not a price.
  const centsOf = (id: string) => {
    const r = rows[id];
    if (!r || !r.on) return 0;
    const c = toCents(r.price);
    return c !== null && c > 0 ? c : null;
  };
  const invalid = spaces.filter((r) => centsOf(r.id) === null);
  const changed = spaces.filter((r) => centsOf(r.id) !== null && centsOf(r.id) !== r.hourlyRateCents);
  const pricedCount = spaces.filter((r) => (rows[r.id]?.on ?? false)).length;

  const save = useMutation({
    mutationFn: () => api.put<{ changed: number }>('/resources/pricing', { locationId: loc.id, prices: changed.map((r) => ({ resourceId: r.id, hourlyRateCents: centsOf(r.id)! })) }),
    onSuccess: (r) => {
      toast.ok(`${r.changed} ${r.changed === 1 ? 'space' : 'spaces'} updated`);
      void refresh('resources', 'schedule', 'dashboard', 'bookings');
    },
  });

  const allShownOn = shown.length > 0 && shown.every((r) => rows[r.id]?.on);
  const tickShown = (on: boolean) => setRows((x) => ({ ...x, ...Object.fromEntries(shown.map((r) => [r.id, { on, price: x[r.id]?.price ?? '' }])) }));
  const applyBulk = () => {
    if (toCents(bulk) === null) return;
    setRows((x) => ({ ...x, ...Object.fromEntries(shown.filter((r) => x[r.id]?.on).map((r) => [r.id, { on: true, price: bulk.trim() }])) }));
  };
  const kinds = [...new Set(spaces.map((r) => r.kind))];

  return (
    <>
      <PageHeader title="Pricing" sub="Tick the spaces that can be booked by the hour and give each an hourly price. Everything else is used through plans and contracts." />
      {resources.isLoading ? (
        <Loading />
      ) : resources.error ? (
        <ErrorNote error={resources.error} />
      ) : spaces.length === 0 ? (
        <Empty title="No spaces yet" hint="Add your rooms, desks and offices first, on the Spaces page. They will be listed here." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Input type="search" aria-label="Search spaces" placeholder="Find a space" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select aria-label="Kind of space" value={kind} onChange={(e) => setKind(e.target.value as '' | ResourceKind)} className="!w-auto">
              <option value="">All kinds</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Same price for ticked ({loc.currency})</span>
              <Input aria-label="Price for all ticked spaces" inputMode="decimal" className="!w-28" value={bulk} onChange={(e) => setBulk(e.target.value)} />
              <Button small disabled={toCents(bulk) === null || !bulk.trim()} onClick={applyBulk}>
                Apply
              </Button>
            </label>
          </div>

          <div className="surface-table">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-10">
                    <input type="checkbox" className="size-4 accent-ink" aria-label="Tick every space shown" checked={allShownOn} onChange={(e) => tickShown(e.target.checked)} />
                  </th>
                  <th>Space</th>
                  <th>Kind</th>
                  <th className="r">Hourly price ({loc.currency})</th>
                  <th>Used for</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const row = rows[r.id] ?? { on: false, price: '' };
                  const bad = centsOf(r.id) === null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <input type="checkbox" className="size-4 accent-ink" aria-label={`${r.name} can be booked by the hour`} checked={row.on} onChange={(e) => set(r.id, { on: e.target.checked })} />
                      </td>
                      <td>
                        <span className="font-semibold">{r.name}</span>
                        {r.floor && <span className="block text-xs text-slate">Floor {r.floor}</span>}
                      </td>
                      <td>{KIND_LABEL[r.kind]}</td>
                      <td className="r">
                        <Input
                          inputMode="decimal"
                          aria-label={`Hourly price for ${r.name}`}
                          aria-invalid={bad}
                          className={`!w-28 text-right ${bad ? 'border-busy' : ''}`}
                          disabled={!row.on}
                          placeholder={row.on ? '0' : ''}
                          value={row.on ? row.price : ''}
                          onChange={(e) => set(r.id, { price: e.target.value })}
                        />
                      </td>
                      <td>{row.on ? <Chip tone="ok">Booked by the hour</Chip> : <Chip tone="idle">Plans and contracts</Chip>}</td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-slate">
                      No spaces match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {invalid.length > 0 && <p className="mt-3 text-sm text-busy">Give every ticked space a price above zero, like 500 or 12.50. {invalid.length === 1 ? 'One space needs one.' : `${invalid.length} spaces need one.`}</p>}
          {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
          <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper py-3">
            <p className="text-sm text-slate">
              {pricedCount} of {spaces.length} spaces can be booked by the hour. Bookings already made keep their price.
            </p>
            <div className="flex gap-2">
              <Button disabled={save.isPending || (changed.length === 0 && invalid.length === 0)} onClick={() => setRows(saved)}>
                Undo changes
              </Button>
              <Button variant="primary" disabled={save.isPending || invalid.length > 0 || changed.length === 0} onClick={() => save.mutate()}>
                {save.isPending ? 'Saving…' : changed.length ? `Save ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}` : 'Save prices'}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
