import { useEffect } from 'react';

/** Soft pools of light in muted blues, and one faint touch of the brand yellow: colour, position, size, drift time. */
const POOLS = [
  { c: '#ffffff', o: 0.95, size: 760, x: '-8vw', y: '-12vh', depth: 10, t: 40 },
  { c: '#7f9bd4', o: 0.55, size: 820, x: '55vw', y: '-22vh', depth: -12, t: 46 },
  { c: '#3d5fae', o: 0.3, size: 700, x: '62vw', y: '50vh', depth: 14, t: 52 },
  { c: '#a9bfe6', o: 0.6, size: 640, x: '-10vw', y: '56vh', depth: -10, t: 44 },
  { c: '#f6c324', o: 0.16, size: 420, x: '80vw', y: '72vh', depth: 8, t: 38 },
];

/**
 * Mounted once at the root. It draws the backdrop the glass sits on: a calm steel-blue field with soft light pools and
 * a fine blueprint grid. The grid lights up under the pointer, and each panel gets a soft light that follows it.
 */
export default function GlassFX() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.style.setProperty('--px', String((e.clientX / window.innerWidth - 0.5) * 2));
        root.style.setProperty('--py', String((e.clientY / window.innerHeight - 0.5) * 2));
        root.style.setProperty('--sx', `${e.clientX}px`);
        root.style.setProperty('--sy', `${e.clientY}px`);
        const panel = (e.target as Element | null)?.closest?.<HTMLElement>('.surface, .surface-table');
        if (panel) {
          const r = panel.getBoundingClientRect();
          panel.style.setProperty('--mx', `${e.clientX - r.left}px`);
          panel.style.setProperty('--my', `${e.clientY - r.top}px`);
        }
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="glass-fx" aria-hidden>
      {POOLS.map((p, i) => (
        <div key={i} className="glass-orb-wrap" style={{ left: p.x, top: p.y, ['--depth' as string]: p.depth }}>
          <div className="glass-orb" style={{ ['--c' as string]: p.c, ['--size' as string]: `${p.size}px`, ['--o' as string]: p.o, ['--t' as string]: `${p.t}s`, animationDelay: `${-i * 7}s` }} />
        </div>
      ))}
      <div className="glass-grid" />
      <div className="glass-grid glass-grid-lit" />
    </div>
  );
}
