import { amenityList, isRoomKind } from '../lib/catalogue';
import type { Resource, Schedule } from '../types';

/** Every feature at least one room offers, for a row of chips to filter by. */
export function amenitiesAmong(resources: Resource[]) {
  const seen = new Map<string, string>();
  for (const r of resources.filter((x) => isRoomKind(x.kind) && x.status !== 'retired')) for (const a of amenityList(r.amenities)) seen.set(a.toLowerCase(), a);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The schedule with only the rooms that offer everything asked for. Desks and other spaces are left as they are. */
export function withAmenities(schedule: Schedule | undefined, needs: string[]): Schedule | undefined {
  if (!schedule || !needs.length) return schedule;
  const want = needs.map((n) => n.toLowerCase());
  return {
    ...schedule,
    resources: schedule.resources.filter((r) => {
      if (!isRoomKind(r.kind)) return true;
      const has = amenityList(r.amenities).map((a) => a.toLowerCase());
      return want.every((w) => has.includes(w));
    }),
  };
}

/** "Rooms with a projector": tick what is needed and only rooms that have it are shown. */
export function AmenityFilter({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return null;
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show only rooms with">
      <span className="mr-1 text-[13px] font-semibold">Rooms with</span>
      {options.map((a) => {
        const on = value.includes(a);
        return (
          <button key={a} type="button" aria-pressed={on} onClick={() => toggle(a)} className={`rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-paper text-ink hover:border-ink/50'}`}>
            {a}
          </button>
        );
      })}
      {value.length > 0 && (
        <button type="button" onClick={() => onChange([])} className="text-[13px] font-semibold underline underline-offset-2">
          Clear
        </button>
      )}
    </div>
  );
}
