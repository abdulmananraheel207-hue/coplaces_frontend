import type { ReactNode } from 'react';
import type { Resource } from '../types';
import { isRoomKind } from '../lib/catalogue';
import { plural } from '../lib/format';

export type PlaqueState = { tone: 'ok' | 'busy' | 'hold' | 'mine' | 'idle'; label: string; detail?: string };

const dot = { ok: 'bg-ok', busy: 'bg-busy', hold: 'bg-hold', mine: 'bg-mine', idle: 'bg-slate' } as const;

/** A door-sign tile for a room, desk or office: floor block, name, and live status. */
export function Plaque({
  resource,
  state,
  onClick,
  children,
}: {
  resource: Pick<Resource, 'name' | 'floor' | 'capacity' | 'amenities' | 'kind'>;
  state: PlaqueState;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`surface flex w-full overflow-hidden text-left ${onClick ? 'transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[var(--shadow-lift)]' : ''}`}
    >
      <div className="display grid w-12 shrink-0 place-items-center bg-ink text-lg text-signal" role="img" aria-label={resource.floor ? `Floor ${resource.floor}` : 'No floor set'}>
        {resource.floor || '–'}
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="display truncate text-[1.05rem]">{resource.name}</p>
        <p className="truncate text-xs text-slate">
          {[isRoomKind(resource.kind) || resource.kind === 'office' ? plural(resource.capacity, 'seat') : '', resource.amenities].filter(Boolean).join(', ') || ' '}
        </p>
        <p className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-sm font-semibold">
          <span className={`inline-block size-2 shrink-0 rounded-full ${dot[state.tone]}`} aria-hidden />
          <span className="shrink-0">{state.label}</span>
          {state.detail && <span className="min-w-0 truncate font-normal text-slate">{state.detail}</span>}
        </p>
        {children}
      </div>
    </Tag>
  );
}

/** Compact square for desk grids. */
export function DeskTile({ label, tone, title, onClick }: { label: string; tone: 'free' | 'taken' | 'out' | 'mine'; title: string; onClick?: () => void }) {
  const cls = {
    free: 'border-line-strong bg-paper text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:border-ink/50',
    taken: 'border-ink bg-ink text-white',
    out: 'hatch border-line-strong text-slate',
    mine: 'border-mine bg-mine text-white',
  }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={title}
      aria-label={title}
      className={`num grid size-11 place-items-center rounded-lg border text-sm font-bold transition-colors ${cls}`}
    >
      {label}
    </Tag>
  );
}
