import { useMemo, useState, type ReactNode } from 'react';
import { Archive, Building2, ChevronDown, Landmark, Monitor, Presentation, Search, UserRoundCheck, type LucideIcon } from 'lucide-react';
import { useFeature, useLocation } from '../auth';
import { isRoomKind, OBJECTS, resourceLabel } from '../lib/catalogue';
import { useFloorObjects } from '../lib/queries';
import { plural } from '../lib/format';
import type { ResourceKind } from '../types';
import type { SpaceItem, Tone } from '../lib/spaceState';
import { floorLabel, floorMark } from './space3d/layout';
import { StatusMark, TONE_ORDER, TONE_WORD } from './StatusMark';
import { Button, Input, Segmented, Select } from './ui';

const KIND_ORDER: ResourceKind[] = ['room', 'corporate_room', 'office', 'hot_desk', 'dedicated_desk', 'storage'];
const KIND_PLURAL: Record<ResourceKind, string> = {
  room: 'Meeting rooms',
  corporate_room: 'Corporate rooms',
  office: 'Private offices',
  hot_desk: 'Hot desks',
  dedicated_desk: 'Dedicated desks',
  storage: 'Lockers, mailboxes and parking',
};
const KIND_ICON: Record<ResourceKind, LucideIcon> = { room: Presentation, corporate_room: Landmark, office: Building2, hot_desk: Monitor, dedicated_desk: UserRoundCheck, storage: Archive };

const collator = new Intl.Collator('en', { numeric: true });
const byName = (a: SpaceItem, b: SpaceItem) => collator.compare(a.name, b.name);
const byFloor = (a: string, b: string) => collator.compare(a || '0', b || '0');
const kindRank = (k: ResourceKind) => KIND_ORDER.indexOf(k);

interface Filters {
  query: string;
  kind: ResourceKind | 'all';
  floor: string | 'all';
  tones: Tone[];
}

/** Whether an item passes the filters. `skip` leaves one filter out, so its own chips can show what choosing them would give. */
function passes(i: SpaceItem, f: Filters, skip?: 'kind' | 'floor' | 'tones') {
  if (skip !== 'kind' && f.kind !== 'all' && i.kind !== f.kind) return false;
  if (skip !== 'floor' && f.floor !== 'all' && i.floor !== f.floor) return false;
  if (skip !== 'tones' && f.tones.length && !f.tones.includes(i.tone)) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  return [i.name, resourceLabel(i.kind, i.style), i.amenities, i.status, i.detail ?? '', i.floor ? `floor ${i.floor}` : 'ground floor'].join(' ').toLowerCase().includes(q);
}

const GRID = 'grid-cols-[1.5rem_minmax(0,1fr)_1.25rem] @xl:grid-cols-[1.5rem_minmax(0,1.15fr)_minmax(0,1.3fr)_1.25rem] @2xl:grid-cols-[1.5rem_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_8.5rem_1.25rem]';

function Row({ item, grouped, selected, onSelect, detail }: { item: SpaceItem; grouped: 'floor' | 'type'; selected: boolean; onSelect: () => void; detail: ReactNode }) {
  const seats = isRoomKind(item.kind) || item.kind === 'office' ? plural(item.capacity, 'seat') : '';
  // Under a floor heading the floor is already known; under a type heading the type is.
  const sub = (grouped === 'type' ? [floorLabel(item.floor), seats] : [resourceLabel(item.kind, item.style), seats]).filter(Boolean).join(', ');
  return (
    <li className={`relative ${selected ? 'bg-paper before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-signal' : ''}`}>
      <button
        type="button"
        aria-expanded={selected}
        onClick={onSelect}
        className={`grid w-full items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-left transition-colors ${GRID} ${selected ? '' : 'hover:bg-paper/70'}`}
      >
        <span className="col-start-1 row-span-2 row-start-1 @xl:col-start-auto @xl:row-span-1 @xl:row-start-auto">
          <StatusMark tone={item.tone} size={18} />
        </span>
        <span className="col-start-2 row-start-1 min-w-0 @xl:col-start-auto @xl:row-start-auto">
          <span className="display block truncate text-[1.02rem]">{item.name}</span>
          <span className="block text-[13px] leading-snug text-slate">{sub}</span>
        </span>
        <span className="col-start-2 row-start-2 min-w-0 @xl:col-start-auto @xl:row-start-auto">
          <span className="block truncate text-sm font-semibold">
            <span className="sr-only">{`Status: `}</span>
            {item.status}
          </span>
          {item.detail && <span className="block truncate text-[13px] text-slate">{item.detail}</span>}
        </span>
        <span className="hidden min-w-0 truncate text-[13px] text-slate @2xl:block">{item.amenities || '–'}</span>
        <span className="num hidden text-right text-[13px] whitespace-nowrap @2xl:block">{item.rate ?? <span className="text-slate">–</span>}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`col-start-3 row-span-2 row-start-1 justify-self-end text-slate transition-transform @xl:col-start-auto @xl:row-span-1 @xl:row-start-auto ${selected ? 'rotate-180' : ''}`}
        />
      </button>
      {selected && <div className="px-3 pb-3">{detail}</div>}
    </li>
  );
}

const DESK_KINDS: ResourceKind[] = ['hot_desk', 'dedicated_desk', 'storage'];
const deskLabel = (name: string) => name.split(' ').pop() ?? name;
const TONE_WASH: Record<Tone, string> = { ok: 'bg-paper', busy: 'bg-busy-wash', mine: 'bg-mine-wash', hold: 'bg-hold-wash', idle: 'bg-plaster' };

/** The one value every item shares, or undefined when they differ. */
function shared(items: SpaceItem[], pick: (i: SpaceItem) => string | undefined) {
  const first = pick(items[0]!);
  return first && items.every((i) => pick(i) === first) ? first : undefined;
}

/** Desks are many and alike, so they sit in a grid of numbered cells with the person's name, not a row each. */
function DeskGrid({
  kind,
  items,
  universe,
  titled,
  showFloor,
  selectedId,
  onSelect,
  renderDetail,
}: {
  kind: ResourceKind;
  items: SpaceItem[];
  /** Every desk of this kind in the group, before filtering, so the counts stay true while filtering. */
  universe: SpaceItem[];
  /** Whether to name the kind; a "by type" group heading already does. */
  titled: boolean;
  showFloor: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetail: (item: SpaceItem) => ReactNode;
}) {
  const taken = universe.filter((i) => i.tone === 'busy' || i.tone === 'mine').length;
  const note = [shared(universe, (i) => i.rate), shared(universe, (i) => i.amenities)].filter(Boolean).join(', ');
  const selected = items.find((i) => i.id === selectedId);
  return (
    <div className="mt-4 first:mt-0">
      {(titled || note) && (
        <p className="mb-2 flex flex-wrap items-baseline gap-x-2 px-3 text-sm">
          {titled && <span className="display-sm">{KIND_PLURAL[kind]}</span>}
          {titled && (
            <span className="num text-slate">
              {taken} of {universe.length} {kind === 'hot_desk' ? 'booked' : 'assigned'}
            </span>
          )}
          {note && <span className="text-[13px] text-slate">{note}</span>}
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 px-3">
        {items.map((i) => {
          const on = i.id === selectedId;
          const who = i.detail ?? i.status;
          return (
            <li key={i.id}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${i.name}: ${i.status}${i.detail ? `, ${i.detail}` : ''}`}
                title={`${i.name}: ${i.status}${i.detail ? `, ${i.detail}` : ''}`}
                onClick={() => onSelect(on ? null : i.id)}
                className={`block h-full w-full rounded-xl border px-3 py-2.5 text-left transition-[border-color,box-shadow] ${TONE_WASH[i.tone]} ${on ? 'border-ink ring-2 ring-signal' : 'border-line hover:border-ink/40 hover:shadow-[var(--shadow-card)]'}`}
              >
                <span className="flex items-center gap-2">
                  <StatusMark tone={i.tone} size={14} />
                  <span className="display text-base">{deskLabel(i.name)}</span>
                  {showFloor && <span className="num ml-auto text-[11px] text-slate">{i.floor ? `F${i.floor}` : 'G'}</span>}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-slate">{who}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {selected && <div className="mt-2 px-3">{renderDetail(selected)}</div>}
    </div>
  );
}

/** What else is on a floor that is not booked: kitchens, coffee machines, lounges. Lifts and plants are left out. */
function Amenities({ objects }: { objects: { type: keyof typeof OBJECTS; label: string }[] }) {
  const counted = new Map<string, number>();
  for (const o of objects) {
    if (o.type === 'core' || o.type === 'plant') continue;
    const name = o.label ? `${OBJECTS[o.type].label} (${o.label})` : OBJECTS[o.type].label;
    counted.set(name, (counted.get(name) ?? 0) + 1);
  }
  if (!counted.size) return null;
  return (
    <p className="mt-3 px-3 text-[13px] text-slate">
      <span className="font-semibold text-ink">Also on this floor</span>{' '}
      {[...counted].map(([name, n]) => (n > 1 ? `${name} (${n})` : name)).join(', ')}
    </p>
  );
}

function GroupHeader({ mark, title, items }: { mark: ReactNode; title: string; items: SpaceItem[] }) {
  const free = items.filter((i) => i.tone === 'ok').length;
  return (
    <div className="flex items-center gap-3 border-b border-line pb-2.5">
      {mark}
      <div className="min-w-0">
        <h3 className="display-sm text-[1.05rem]">{title}</h3>
        <p className="num text-[13px] text-slate">
          {free} free of {items.length}
        </p>
      </div>
      <span className="ml-auto hidden max-w-[45%] flex-wrap justify-end gap-[3px] @xl:flex" aria-hidden>
        {items.map((i) => (
          <StatusMark key={i.id} tone={i.tone} size={11} title={`${i.name}: ${i.status}`} />
        ))}
      </span>
    </div>
  );
}

const chip = (on: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-paper hover:border-ink/50'} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line-strong disabled:hover:bg-paper`;

/**
 * Every room, desk and office as a building directory: grouped by floor or type, scannable by the status
 * mark on the left, searchable and filterable, and opening its details and actions in place.
 */
export function SpaceList({
  items,
  selectedId,
  onSelect,
  renderDetail,
  empty,
}: {
  items: SpaceItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetail: (item: SpaceItem) => ReactNode;
  /** Shown when there is nothing at all, before any filtering. */
  empty?: ReactNode;
}) {
  const loc = useLocation();
  const objects = useFloorObjects(loc.id, useFeature('floor_3d')).data;
  const [filters, setFilters] = useState<Filters>({ query: '', kind: 'all', floor: 'all', tones: [] });
  const [group, setGroup] = useState<'floor' | 'type'>('floor');
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const floors = useMemo(() => [...new Set(items.map((i) => i.floor))].sort(byFloor), [items]);
  const kinds = KIND_ORDER.filter((k) => items.some((i) => i.kind === k));
  const shown = useMemo(() => items.filter((i) => passes(i, filters)), [items, filters]);
  const filtered = shown.length !== items.length;

  const groups = useMemo(() => {
    if (group === 'floor') {
      return floors
        .map((f) => ({
          key: `floor:${f}`,
          title: floorLabel(f),
          mark: (
            <span className="display grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-lg text-signal" aria-hidden>
              {floorMark(f)}
            </span>
          ),
          all: items.filter((i) => i.floor === f),
          floor: f,
          items: shown.filter((i) => i.floor === f).sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || byName(a, b)),
        }))
        .filter((g) => g.items.length);
    }
    return kinds
      .map((k) => {
        const Icon = KIND_ICON[k];
        return {
          key: `kind:${k}`,
          title: KIND_PLURAL[k],
          mark: (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-signal" aria-hidden>
              <Icon size={20} />
            </span>
          ),
          all: items.filter((i) => i.kind === k),
          floor: null as string | null,
          items: shown.filter((i) => i.kind === k).sort((a, b) => byFloor(a.floor, b.floor) || byName(a, b)),
        };
      })
      .filter((g) => g.items.length);
  }, [group, floors, kinds, shown, items]);

  if (items.length === 0) return <>{empty ?? null}</>;

  const toneCount = (t: Tone) => items.filter((i) => i.tone === t && passes(i, filters, 'tones')).length;
  const kindCount = (k: ResourceKind | 'all') => items.filter((i) => (k === 'all' || i.kind === k) && passes(i, filters, 'kind')).length;
  const toggleTone = (t: Tone) => set({ tones: filters.tones.includes(t) ? filters.tones.filter((x) => x !== t) : [...filters.tones, t] });
  const clear = () => setFilters({ query: '', kind: 'all', floor: 'all', tones: [] });

  return (
    <div className="@container">
      <div className="mb-4 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-52 flex-1">
            <span className="sr-only">Search spaces</span>
            <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate" />
            <Input type="search" value={filters.query} onChange={(e) => set({ query: e.target.value })} placeholder="Search spaces or people" className="!pl-9" />
          </label>
          {floors.length > 1 && (
            <Select aria-label="Floor" value={filters.floor} onChange={(e) => set({ floor: e.target.value })} className="!w-auto">
              <option value="all">All floors</option>
              {floors.map((f) => (
                <option key={f || 'ground'} value={f}>
                  {floorLabel(f)}
                </option>
              ))}
            </Select>
          )}
          {(floors.length > 1 || kinds.length > 1) && (
            <Segmented
              label="Group by"
              value={group}
              onChange={setGroup}
              options={[
                { value: 'floor', label: 'By floor' },
                { value: 'type', label: 'By type' },
              ]}
            />
          )}
        </div>

        {kinds.length > 1 && (
          <div role="group" aria-label="Type of space" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {(['all', ...kinds] as const).map((k) => (
              <button key={k} type="button" aria-pressed={filters.kind === k} disabled={filters.kind !== k && kindCount(k) === 0} onClick={() => set({ kind: k })} className={chip(filters.kind === k)}>
                {k === 'all' ? 'Everything' : KIND_PLURAL[k]}
                <span className={`num font-normal ${filters.kind === k ? 'text-white/75' : 'text-slate'}`}>{kindCount(k)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="group" aria-label="Status" className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {TONE_ORDER.filter((t) => items.some((i) => i.tone === t)).map((t) => {
              const on = filters.tones.includes(t);
              const n = toneCount(t);
              return (
                <button key={t} type="button" aria-pressed={on} disabled={!on && n === 0} onClick={() => toggleTone(t)} className={chip(on)}>
                  <StatusMark tone={t} size={12} />
                  {TONE_WORD[t]}
                  <span className={`num font-normal ${on ? 'text-white/75' : 'text-slate'}`}>{n}</span>
                </button>
              );
            })}
          </div>
          <p className="num ml-auto text-[13px] text-slate" role="status">
            {filtered ? `Showing ${shown.length} of ${items.length}` : plural(items.length, 'space')}
            {filtered && (
              <>
                {' '}
                <button type="button" onClick={clear} className="font-semibold text-ink underline underline-offset-2">
                  Clear filters
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-paper/60 px-6 py-12 text-center">
          <p className="display-sm text-base">Nothing matches</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate">Try a different search, or remove a filter to see more.</p>
          <div className="mt-4">
            <Button onClick={clear}>Clear filters</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title} className="surface p-4 sm:p-5">
              <GroupHeader mark={g.mark} title={g.title} items={g.all} />
              {g.items.some((i) => !DESK_KINDS.includes(i.kind)) && (
                <>
                  <div aria-hidden className={`hidden gap-x-3 px-3 py-1.5 text-[13px] text-slate @xl:grid ${GRID}`}>
                    <span />
                    <span>Space</span>
                    <span>Status now</span>
                    <span className="hidden @2xl:block">Features</span>
                    <span className="hidden text-right @2xl:block">Rate</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-line @xl:border-t @xl:border-line">
                    {g.items
                      .filter((i) => !DESK_KINDS.includes(i.kind))
                      .map((i) => (
                        <Row key={i.id} item={i} grouped={group} selected={i.id === selectedId} onSelect={() => onSelect(i.id === selectedId ? null : i.id)} detail={i.id === selectedId ? renderDetail(i) : null} />
                      ))}
                  </ul>
                </>
              )}
              <div className="mt-4 empty:hidden">
                {DESK_KINDS.map((k) => {
                  const desks = g.items.filter((i) => i.kind === k);
                  return desks.length ? <DeskGrid key={k} kind={k} items={desks} universe={g.all.filter((i) => i.kind === k)} titled={group === 'floor'} showFloor={group === 'type' && floors.length > 1} selectedId={selectedId} onSelect={onSelect} renderDetail={renderDetail} /> : null;
                })}
              </div>
              {g.floor !== null && <Amenities objects={objects?.filter((o) => o.floor === g.floor) ?? []} />}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
