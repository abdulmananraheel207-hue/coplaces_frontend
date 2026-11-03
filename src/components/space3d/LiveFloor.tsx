import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Layers, RotateCcw } from 'lucide-react';
import type { Presence } from '../../lib/live';
import { TONE_WORD } from '../StatusMark';
import { StatusMark } from '../StatusMark';
import { Boundary } from './SpaceViewer';
import { Crowd } from './Crowd';
import { GLASS, LabelOverlay, STAGE_BG } from './Labels';
import { floorKey, floorMark, labelSpecs, stackPlan, type FloorLayout } from './layout';

const Scene = lazy(() => import('./Scene'));

/** A place for the camera to fly to, in a floor's own coordinates. `key` changes every time so choosing the same area again still flies. */
export interface Focus {
  key: number;
  floor: string;
  x: number;
  z: number;
  r: number;
}

/** The 3D floor with the people who are in the building walking about on it. */
export function LiveFloor({
  floors,
  people,
  selectedPerson,
  onPerson,
  selectedSpace,
  onSpace,
  focus,
  onClearFocus,
  heightClass = 'h-[30rem] lg:h-[42rem]',
}: {
  floors: FloorLayout[];
  people: Presence[];
  selectedPerson: string | null;
  onPerson: (id: string | null) => void;
  selectedSpace: string | null;
  onSpace: (id: string | null) => void;
  focus: Focus | null;
  onClearFocus: () => void;
  heightClass?: string;
}) {
  const [only, setOnly] = useState<string | null | undefined>(undefined);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const overlay = useRef<HTMLDivElement>(null);
  const multi = floors.length > 1;
  const current = only === undefined ? (floors[0]?.floor ?? null) : only;
  const plan = useMemo(() => stackPlan(floors, multi ? current : null), [floors, current, multi]);
  const labels = useMemo(() => labelSpecs(floors), [floors]);

  // Choosing an area on another floor brings that floor into view.
  useEffect(() => {
    if (focus && multi) setOnly(focus.floor);
  }, [focus, multi]);
  useEffect(() => {
    if (only != null && !floors.some((f) => f.floor === only)) setOnly(undefined);
  }, [floors, only]);

  const fit = useMemo(() => {
    if (!focus) return undefined;
    const y = plan.slots.find((s) => s.floor.floor === focus.floor)?.y ?? 0;
    return { cx: focus.x, cy: y + 0.9, cz: focus.z, radius: focus.r };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, plan]);

  // Each person goes on the floor of the space they checked in at; someone with no space comes in at the first floor's door.
  const byFloor = useMemo(() => {
    const home = new Map<string, string>();
    for (const f of floors) for (const p of f.placed) home.set(p.item.id, f.floor);
    const out = new Map<string, Presence[]>();
    for (const p of people) {
      const key = (p.resourceId && home.get(p.resourceId)) ?? floors[0]?.floor ?? '';
      out.set(key, [...(out.get(key) ?? []), p]);
    }
    return out;
  }, [floors, people]);

  const crowd = useMemo(
    () => (f: FloorLayout) => <Crowd key={floorKey(f.floor)} floor={f} people={byFloor.get(f.floor) ?? []} selectedId={selectedPerson} onPick={onPerson} />,
    [byFloor, selectedPerson, onPerson],
  );

  const mark = multi && current !== null ? floorMark(current) : '';
  const fallback = <div className="grid h-full place-items-center px-6 text-center text-sm text-white/80">The 3D view could not start in this browser.</div>;
  const legend = (['ok', 'hold', 'mine', 'busy'] as const).map((t) => ({ t, word: t === 'hold' ? 'Booked, not here yet' : t === 'mine' ? 'Checked in' : TONE_WORD[t] }));

  return (
    <div role="group" aria-label="Live 3D floor" className={`on-ink relative isolate overflow-hidden rounded-2xl shadow-[var(--shadow-card)] ${heightClass}`} style={{ background: STAGE_BG }}>
      {mark && (
        <p aria-hidden className="display pointer-events-none absolute right-5 bottom-0 -z-10 text-[11rem] leading-[0.8] font-black tracking-tighter text-white/[0.06] select-none sm:text-[16rem]">
          {mark}
        </p>
      )}
      <div className="absolute inset-0">
        <Boundary fallback={fallback}>
          <Suspense fallback={<p role="status" className="grid h-full place-items-center text-sm text-white/70">Loading 3D view…</p>}>
            <Scene plan={plan} labels={labels} overlay={overlay} selectedId={selectedSpace} onSelect={onSpace} onHover={setHoverId} resetKey={resetKey} fit={fit} crowd={crowd} />
          </Suspense>
        </Boundary>
        <LabelOverlay labels={labels} selectedId={selectedSpace} hoverId={hoverId} overlay={overlay} />
      </div>

      {multi && (
        <div role="group" aria-label="Floor" className={`absolute top-3 left-3 flex flex-col gap-1 rounded-full p-1 ${GLASS}`}>
          {[{ key: null as string | null, mark: '', label: 'All floors' }, ...[...floors].reverse().map((f) => ({ key: f.floor as string | null, mark: floorMark(f.floor), label: f.label }))].map((f) => {
            const on = current === f.key;
            return (
              <button
                key={f.key ?? 'all'}
                type="button"
                aria-pressed={on}
                aria-label={f.label}
                title={f.label}
                onClick={() => {
                  setOnly(f.key);
                  onClearFocus();
                }}
                className={`display grid size-9 place-items-center rounded-full text-[14px] transition-colors ${on ? 'bg-signal text-ink' : 'text-white/90 hover:bg-white/15'}`}
              >
                {f.key === null ? <Layers size={17} aria-hidden /> : f.mark}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          onClearFocus();
          setResetKey((k) => k + 1);
        }}
        className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold hover:bg-ink ${GLASS}`}
      >
        <RotateCcw size={14} aria-hidden /> {focus ? 'Whole floor' : 'Reset view'}
      </button>

      <ul className={`pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-2xl px-3 py-1.5 text-[11px] font-semibold ${GLASS}`}>
        {legend.map((l) => (
          <li key={l.t} className="flex items-center gap-1.5">
            <StatusMark tone={l.t} size={12} />
            {l.word}
          </li>
        ))}
      </ul>
    </div>
  );
}
