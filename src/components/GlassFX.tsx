/** Soft pools of light in muted blues, and one faint touch of the brand yellow: colour, opacity, size, position. */
const POOLS = [
  { c: '#ffffff', o: 0.95, size: 760, x: '-8vw', y: '-12vh' },
  { c: '#7f9bd4', o: 0.55, size: 820, x: '55vw', y: '-22vh' },
  { c: '#3d5fae', o: 0.3, size: 700, x: '62vw', y: '50vh' },
  { c: '#a9bfe6', o: 0.6, size: 640, x: '-10vw', y: '56vh' },
  { c: '#f6c324', o: 0.16, size: 420, x: '80vw', y: '72vh' },
];

/**
 * Mounted once at the root. It draws the backdrop the glass sits on: a calm steel-blue field with soft light pools and
 * a fine blueprint grid.
 *
 * It is still on purpose. Every panel blurs what is behind it, so anything that moves back here (drifting pools, a
 * light following the pointer, parallax) makes the browser re-blur every visible panel on every frame. That constant
 * work, and the whole-page restyle each mouse move used to cause, made the app feel slow.
 */
export default function GlassFX() {
  return (
    <div className="glass-fx" aria-hidden>
      {POOLS.map((p, i) => (
        <div key={i} className="glass-orb-wrap" style={{ left: p.x, top: p.y }}>
          <div className="glass-orb" style={{ ['--c' as string]: p.c, ['--size' as string]: `${p.size}px`, ['--o' as string]: p.o }} />
        </div>
      ))}
      <div className="glass-grid" />
    </div>
  );
}
