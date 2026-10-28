import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Layers, RotateCcw } from 'lucide-react';
import type { SpaceItem } from '../../lib/spaceState';
import { StatusMark, TONE_ORDER, TONE_WORD } from '../StatusMark';
import { ItemDetail } from '../ItemDetail';
import type { FloorObject } from '../../types';
import { floorLabel, floorMark, labelSpecs, layoutFloors, stackPlan } from './layout';
import { GLASS, LabelOverlay, STAGE_BG } from './Labels';

// The three.js code is a separate chunk so pages without a 3D view stay light.
const Scene = lazy(() => import('./Scene'));

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function SpaceViewer({
  items,
  objects,
  selectedId,
  onSelect,
  renderDetail,
  heightClass = 'h-[30rem] sm:h-[36rem]',
  heat,
}: {
  items: SpaceItem[];
  /** Kitchens, coffee machines and the like. */
  objects?: FloorObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetail?: (item: SpaceItem) => ReactNode;
  heightClass?: string;
  /** How busy each space has been, 0 to 1 by space id. */
  heat?: Record<string, number>;
}) {
  const floors = useMemo(() => layoutFloors(items, objects), [items, objects]);
  // Start on the lowest floor: an overview of a whole building is too small to read.
  const [only, setOnly] = useState<string | null | undefined>(undefined);
  const [resetKey, setResetKey] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const multi = floors.length > 1;
  const focus = only === undefined ? (floors[0]?.floor ?? null) : only;
  const plan = useMemo(() => stackPlan(floors, multi ? focus : null), [floors, focus, multi]);
  const labels = useMemo(() => labelSpecs(floors), [floors]);

  // A floor that disappears falls back to the default view.
  useEffect(() => {
    if (only != null && !floors.some((f) => f.floor === only)) setOnly(undefined);
  }, [floors, only]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const tones = TONE_ORDER.filter((t) => items.some((i) => i.tone === t));
  const mark = multi && focus !== null ? floorMark(focus) : '';
  const fallback = <div className="grid h-full place-items-center px-6 text-center text-sm text-white/80">The 3D view could not start in this browser. Use the list view instead.</div>;

  return (
    <div>
      <div role="group" aria-label="3D floor view" className={`on-ink relative isolate overflow-hidden rounded-2xl shadow-[var(--shadow-card)] ${heightClass}`} style={{ background: STAGE_BG }}>
        {mark && (
          <p aria-hidden className="display pointer-events-none absolute right-5 bottom-0 -z-10 text-[11rem] leading-[0.8] font-black tracking-tighter text-white/[0.06] select-none sm:text-[16rem]">
            {mark}
          </p>
        )}

        <div role="img" aria-label={`3D model of ${items.length} spaces. The list view has the same information.`} className="absolute inset-0">
          <Boundary fallback={fallback}>
            <Suspense fallback={<p role="status" className="grid h-full place-items-center text-sm text-white/70">Loading 3D view…</p>}>
              <Scene plan={plan} labels={labels} overlay={overlay} selectedId={selectedId} onSelect={onSelect} onHover={setHoverId} resetKey={resetKey} heat={heat} />
            </Suspense>
          </Boundary>
          <LabelOverlay labels={labels} selectedId={selectedId} hoverId={hoverId} overlay={overlay} />
        </div>

        {multi && (
          <div role="group" aria-label="Floor" className={`absolute top-3 left-3 flex flex-col gap-1 rounded-full p-1 ${GLASS}`}>
            {[{ key: null as string | null, mark: '', label: 'All floors' }, ...[...floors].reverse().map((f) => ({ key: f.floor as string | null, mark: floorMark(f.floor), label: f.label }))].map((f) => {
              const on = focus === f.key;
              return (
                <button
                  key={f.key ?? 'all'}
                  type="button"
                  aria-pressed={on}
                  aria-label={f.label}
                  title={f.label}
                  onClick={() => setOnly(f.key)}
                  className={`display grid size-9 place-items-center rounded-full text-[14px] transition-colors ${on ? 'bg-signal text-ink' : 'text-white/90 hover:bg-white/15'}`}
                >
                  {f.key === null ? <Layers size={17} aria-hidden /> : f.mark}
                </button>
              );
            })}
          </div>
        )}

        <button type="button" onClick={() => setResetKey((k) => k + 1)} className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold hover:bg-ink ${GLASS}`}>
          <RotateCcw size={14} aria-hidden /> Reset view
        </button>

        <ul className={`pointer-events-none absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-2xl px-3 py-1.5 text-[11px] font-semibold ${GLASS}`}>
          {tones.map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <StatusMark tone={t} size={12} />
              {TONE_WORD[t]}
            </li>
          ))}
        </ul>
      </div>

      {selected ? (
        <div className="mt-3">{renderDetail ? renderDetail(selected) : <ItemDetail item={selected} onClose={() => onSelect(null)} />}</div>
      ) : (
        <p className="mt-2 text-sm text-slate">Click a room, desk or office to see its details{multi ? ` (${floors.map((f) => floorLabel(f.floor)).join(', ')})` : ''}. Drag to turn the model and scroll to zoom.</p>
      )}
    </div>
  );
}
