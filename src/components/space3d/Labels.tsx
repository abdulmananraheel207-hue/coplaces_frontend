import { TONE_COLOR } from '../../lib/spaceState';
import type { LabelSpec } from './layout';

/** The navy spotlight the 3D model stands on. */
export const STAGE_BG = 'radial-gradient(120% 95% at 50% 36%, #2b4a74 0%, #1a2f50 42%, #0d1b2f 100%)';

/** Frosted navy, for anything floating over the 3D stage. */
export const GLASS = 'bg-ink/75 text-white ring-1 ring-white/20 backdrop-blur-md';

function LabelBody({ label, selected, hovered }: { label: LabelSpec; selected: boolean; hovered: boolean }) {
  const item = label.item;
  if (label.kind === 'floor') {
    return <span className={`display rounded-full px-3 py-1 text-[13px] whitespace-nowrap ${GLASS}`}>{label.text}</span>;
  }
  if (label.kind === 'note') {
    return <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] leading-tight font-bold whitespace-nowrap text-ink shadow-sm ring-1 ring-ink/15">{label.text}</span>;
  }
  if (!item) return null;
  const color = TONE_COLOR[item.tone];
  const open = selected || hovered;

  if (label.kind === 'desk') {
    // A small numbered disc whose ring carries the status. It opens into a tag when pointed at.
    return (
      <span
        className={`num flex items-center gap-1.5 rounded-full text-[10px] leading-none font-bold whitespace-nowrap ${selected ? 'bg-signal text-ink' : 'bg-ink/90 text-white'} ${open ? 'px-2.5 py-1.5 text-[11px]' : 'size-[19px] justify-center'}`}
        style={{ boxShadow: `0 0 0 1.5px ${selected ? '#f6c324' : color}` }}
      >
        {open ? (
          <>
            <span className="display">{item.name}</span>
            <span className="font-normal opacity-80">{item.status}</span>
          </>
        ) : (
          item.name.split(' ').pop()
        )}
      </span>
    );
  }

  // Room tag on a stem. Compact until pointed at or selected, so neighbouring rooms never cover each other.
  return (
    <span className="flex flex-col items-center">
      <span
        className={`flex items-center gap-1.5 rounded-full py-[3px] pr-2.5 pl-1.5 text-[12px] leading-tight whitespace-nowrap ring-1 backdrop-blur-sm ${selected ? 'bg-signal text-ink ring-signal' : 'bg-ink/90 text-white ring-white/25'}`}
      >
        <span className="inline-block size-2.5 shrink-0 rounded-full ring-[1.5px] ring-white" style={{ background: color }} />
        <span className="display-sm">{item.name}</span>
        {open && (
          <span className={`font-normal ${selected ? 'text-ink/80' : 'text-white/75'}`}>
            {item.status}
            {item.detail ? `, ${item.detail}` : ''}
          </span>
        )}
      </span>
      <span className={`w-px ${selected ? 'bg-signal' : 'bg-white/70'}`} style={{ height: label.tier ? 30 : 12 }} />
    </span>
  );
}


/** The tags that hang over rooms and desks. The scene moves them; this only draws them. */
export function LabelOverlay({
  labels,
  selectedId,
  hoverId,
  overlay,
}: {
  labels: LabelSpec[];
  selectedId: string | null;
  hoverId: string | null;
  overlay: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {labels.map((l) => (
        <div key={l.id} data-label={l.id} data-raise={l.id === selectedId || l.id === hoverId ? '1' : undefined} className="absolute top-0 left-0 will-change-transform" style={{ visibility: 'hidden' }}>
          <LabelBody label={l} selected={l.id === selectedId} hovered={l.id === hoverId} />
        </div>
      ))}
    </div>
  );
}
