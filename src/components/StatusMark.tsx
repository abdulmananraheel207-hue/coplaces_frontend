import { TONE_COLOR, type Tone } from '../lib/spaceState';

/** What each tone means, in the words the 3D legend and the list filters both use. */
export const TONE_WORD: Record<Tone, string> = {
  ok: 'Free',
  busy: 'In use or taken',
  mine: 'Yours',
  hold: 'Out of service',
  idle: 'Closed',
};

export const TONE_ORDER: Tone[] = ['ok', 'busy', 'mine', 'hold', 'idle'];

/**
 * The status shape shared by the 3D view and the list: an outline is free, solid is taken, blue is yours,
 * hatching is out of service. Colour is never the only signal.
 */
export function StatusMark({ tone, size = 14, title }: { tone: Tone; size?: number; title?: string }) {
  const c = TONE_COLOR[tone];
  const solid = tone === 'busy' || tone === 'mine';
  const style =
    solid
      ? { background: c }
      : tone === 'hold'
        ? { background: `repeating-linear-gradient(135deg, ${c} 0 2px, #14263f 2px 4px)` }
        : { border: `2px solid ${c}`, background: `${c}33` };
  return <span aria-hidden={title ? undefined : true} title={title} className="inline-block shrink-0 rounded-lg" style={{ width: size, height: size, ...style }} />;
}
