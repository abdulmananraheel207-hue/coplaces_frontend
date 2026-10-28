import { lazy, Suspense, useMemo, useRef } from 'react';
import type { SpaceItem, Tone } from '../../lib/spaceState';
import type { ResourceKind } from '../../types';
import { Boundary } from './SpaceViewer';
import { LabelOverlay, STAGE_BG } from './Labels';
import { labelSpecs, layoutFloors, stackPlan } from './layout';

const Scene = lazy(() => import('./Scene'));

const noop = () => {};

let n = 0;
function space(kind: ResourceKind, style: string, name: string, floor: string, capacity: number, tone: Tone, status: string): SpaceItem {
  return {
    id: `showcase-${++n}`,
    kind,
    style,
    name,
    floor,
    capacity,
    amenities: '',
    plan: null,
    tone,
    status,
    bookable: false,
  };
}

/** A made-up building, so a visitor sees what the app shows before they have an account. */
function sampleBuilding(): SpaceItem[] {
  n = 0;
  const out: SpaceItem[] = [
    space('corporate_room', 'boardroom', 'Boardroom', '1', 16, 'ok', 'Free until 14:00'),
    space('office', 'executive', 'Executive Office', '1', 6, 'busy', 'Taken by Orbit Labs'),
    space('office', 'standard', 'Office 101', '1', 4, 'busy', 'Taken by Lumen Studio'),
    space('office', 'standard', 'Office 102', '1', 4, 'ok', 'Available'),
    space('room', 'training', 'Training Room', '1', 12, 'ok', 'Free all day'),
    space('room', 'meeting', 'Meeting Room A', '', 6, 'busy', 'In use until 11:30'),
    space('room', 'meeting', 'Meeting Room B', '', 8, 'ok', 'Free until 15:00'),
    space('room', 'huddle', 'Huddle Room', '', 4, 'ok', 'Free all day'),
    space('room', 'phone_booth', 'Phone Booth 1', '', 1, 'busy', 'In use until 10:15'),
    space('room', 'phone_booth', 'Phone Booth 2', '', 1, 'ok', 'Free all day'),
  ];
  for (let i = 1; i <= 8; i++)
    out.push(space('hot_desk', 'standard', `Hot Desk ${i}`, '', 1, i % 3 === 0 ? 'busy' : 'ok', i % 3 === 0 ? 'Taken today' : 'Free today'));
  for (let i = 1; i <= 4; i++) out.push(space('dedicated_desk', 'standard', `Desk D${i}`, '1', 1, 'mine', 'Assigned'));
  return out;
}

/** What the sign-in page says about each space as the tour reaches it. */
export const TOUR = [
  { name: 'Boardroom', title: 'Book a room in a click', text: 'The boardroom is free until 14:00. Members and the front desk see the same live picture.' },
  { name: 'Executive Office', title: 'Know who has what', text: 'Offices and desks show who has taken them, and when their next invoice is due.' },
  { name: 'Meeting Room A', title: 'See the day as it happens', text: 'In use, free, or free from 11:30. The floor plan is the booking calendar.' },
  { name: 'Training Room', title: 'Run every floor from one screen', text: 'Members, visitors, invoices and profit, for each space you manage.' },
] as const;

/**
 * A slowly turning 3D model of a sample coworking space. Nothing in it can be selected; `step` opens one tag at a time.
 * `quiet` shows only the floor names, for small screens where room tags would cover the model. `bare` leaves out the
 * navy stage, for a page that draws its own.
 */
export function Showcase({
  className = '',
  canvasClass = 'inset-0',
  step = 0,
  quiet = false,
  bare = false,
}: {
  className?: string;
  canvasClass?: string;
  step?: number;
  quiet?: boolean;
  bare?: boolean;
}) {
  const items = useMemo(sampleBuilding, []);
  const floors = useMemo(() => layoutFloors(items), [items]);
  const plan = useMemo(() => stackPlan(floors, null), [floors]);
  const labels = useMemo(() => labelSpecs(floors).filter((l) => (quiet ? l.kind === 'floor' : l.kind !== 'desk')), [floors, quiet]);
  const hoverId = quiet ? null : (items.find((i) => i.name === TOUR[step % TOUR.length]!.name)?.id ?? null);
  // Fill more of the frame than the app's own view does.
  const fit = useMemo(() => ({ ...plan.bounds, radius: plan.bounds.radius * 0.9 }), [plan]);
  const overlay = useRef<HTMLDivElement>(null);

  return (
    <div className={`on-ink isolate overflow-hidden ${className}`} style={bare ? undefined : { background: STAGE_BG }} aria-hidden>
      <div className={`absolute ${canvasClass}`}>
        <Boundary fallback={null}>
          <Suspense fallback={null}>
            <Scene plan={plan} labels={labels} overlay={overlay} selectedId={null} onSelect={noop} onHover={noop} resetKey={0} fit={fit} dpr={[2, 3]} spin />
          </Suspense>
        </Boundary>
        <LabelOverlay labels={labels} selectedId={null} hoverId={hoverId} overlay={overlay} />
      </div>
    </div>
  );
}
