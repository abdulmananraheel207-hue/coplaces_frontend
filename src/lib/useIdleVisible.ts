import { useEffect, useState, type RefObject } from 'react';

/**
 * True once the element is on screen (or nearly) and the browser has had an idle moment after that. Used to hold back
 * expensive work, such as building the 3D scene, until the rest of the page has drawn and can be used.
 */
export function useIdleVisible(ref: RefObject<Element | null>, { margin = '200px', timeout = 1200 } = {}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const el = ref.current;
    let idleId: number | undefined;
    let timer: number | undefined;
    const go = () => {
      if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(() => setReady(true), { timeout });
      else timer = window.setTimeout(() => setReady(true), 50);
    };
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io?.disconnect();
            go();
          }
        },
        { rootMargin: margin },
      );
      io.observe(el);
    } else go();
    return () => {
      io?.disconnect();
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [ref, margin, timeout, ready]);
  return ready;
}
