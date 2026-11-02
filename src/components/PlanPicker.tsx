import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useLocation } from '../auth';
import { floorLabel } from './space3d/layout';
import { Loading } from './ui';
import { KIND_LABEL, money } from '../lib/format';
import { useShifts } from '../lib/queries';
import type { Plan, ResourceKind } from '../types';

interface FreeSpace {
  id: string;
  name: string;
  kind: ResourceKind;
  floor: string;
}

/**
 * Giving a member a plan: which of its shifts they take (the price is those shifts added up), and, for the start date,
 * which desks and offices are still free in those shift times. Taken ones are not shown.
 */
export function PlanPicker({
  plan,
  startDate,
  shiftIds,
  spaceIds,
  onShifts,
  onSpaces,
  memberId,
  advanceCents = 0,
}: {
  plan: Plan;
  startDate: string;
  shiftIds: string[];
  spaceIds: string[];
  onShifts: (ids: string[]) => void;
  onSpaces: (ids: string[]) => void;
  /** When changing an existing member: what they hold now still counts as free for them. */
  memberId?: string;
  /** The advance paid, shown taken off the total. */
  advanceCents?: number;
}) {
  const loc = useLocation();
  const shifts = useShifts(loc.id);
  const mine = (shifts.data ?? []).filter((s) => s.planId === plan.id && s.active);
  const chosen = mine.filter((s) => shiftIds.includes(s.id));
  const total = chosen.reduce((t, s) => t + (s.priceCents ?? 0), 0);
  const free = useQuery({
    queryKey: ['members', 'available-spaces', plan.id, shiftIds.join(','), startDate, memberId ?? ''],
    queryFn: () => api.get<{ end: string; spaces: FreeSpace[] }>('/members/available-spaces', { locationId: loc.id, planId: plan.id, shiftIds: shiftIds.join(','), startDate, memberId }),
    enabled: shiftIds.length > 0 && !!startDate,
    retry: false,
  });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const spaces = free.data?.spaces ?? [];
  const floors = [...new Set(spaces.map((s) => s.floor))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  if (shifts.isLoading) return <Loading />;
  if (!mine.length) return <p className="text-sm text-slate">This plan has no shifts yet, so it is given as it is. Add shifts to the plan in the Plans tab to give a member times and desks.</p>;

  return (
    <div className="space-y-4 rounded-lg border border-line p-3">
      <div>
        <p className="mb-1 text-[13px] font-semibold">Shifts (choose one or more)</p>
        <div className="space-y-1">
          {mine.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-ink"
                checked={shiftIds.includes(s.id)}
                onChange={() => {
                  onShifts(toggle(shiftIds, s.id));
                  onSpaces([]);
                }}
              />
              <span className="font-semibold">{s.name}</span>
              <span className="num text-slate">
                {s.startTime} to {s.endTime}
              </span>
              <span className="num ml-auto">{s.priceCents != null ? money(s.priceCents, loc.currency) : 'By the hour'}</span>
            </label>
          ))}
        </div>
        {chosen.length > 0 && (
          <p className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-semibold">
            <span>Total {plan.interval === 'month' ? 'per month' : 'per day'}</span>
            <span className="num">{money(total, loc.currency)}</span>
          </p>
        )}
        {chosen.length > 0 && advanceCents > 0 && (
          <p className="mt-1 flex justify-between text-sm">
            <span className="text-slate">Less advance paid ({money(Math.min(advanceCents, total), loc.currency)})</span>
            <span className="num font-semibold">{money(Math.max(0, total - advanceCents), loc.currency)} to pay</span>
          </p>
        )}
      </div>

      {shiftIds.length > 0 && (
        <div>
          <p className="mb-1 text-[13px] font-semibold">
            Desks and offices free from {startDate}
            {free.data ? ` to ${free.data.end}` : ''}
          </p>
          {free.isLoading ? (
            <Loading />
          ) : free.error ? (
            <p className="text-sm text-busy">{free.error instanceof Error ? free.error.message : 'Could not check what is free.'}</p>
          ) : !spaces.length ? (
            <p className="text-sm text-slate">Nothing is free in those shifts from that date. Try other shifts or another start date.</p>
          ) : (
            <div className="max-h-48 space-y-3 overflow-y-auto">
              {floors.map((f) => (
                <fieldset key={f}>
                  <legend className="mb-1 text-xs font-semibold tracking-wide text-slate uppercase">{floorLabel(f)}</legend>
                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {spaces
                      .filter((s) => s.floor === f)
                      .map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="size-4 accent-ink" checked={spaceIds.includes(s.id)} onChange={() => onSpaces(toggle(spaceIds, s.id))} />
                          <span>
                            {s.name} <span className="text-slate">({KIND_LABEL[s.kind]})</span>
                          </span>
                        </label>
                      ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-slate">{spaceIds.length ? `${spaceIds.length} chosen.` : 'Choose one or more. A member cannot check in without a booking.'}</p>
        </div>
      )}
    </div>
  );
}
