// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleVisible } from './useIdleVisible';

let seen: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
const idle: (() => void)[] = [];

beforeEach(() => {
  seen = null;
  idle.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        seen = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => idle.push(fn));
  vi.stubGlobal('cancelIdleCallback', () => undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useIdleVisible(ref);
  return <div ref={ref}>{ready ? 'built' : 'waiting'}</div>;
}

describe('holding heavy work back until it is seen and the browser is idle', () => {
  it('waits while the element is off screen', () => {
    render(<Probe />);
    act(() => seen!([{ isIntersecting: false }]));
    expect(idle).toHaveLength(0);
    expect(screen.getByText('waiting')).toBeTruthy();
  });

  it('starts at the first idle moment after it comes on screen', () => {
    render(<Probe />);
    act(() => seen!([{ isIntersecting: true }]));
    expect(screen.getByText('waiting')).toBeTruthy();
    expect(idle).toHaveLength(1);
    act(() => idle[0]!());
    expect(screen.getByText('built')).toBeTruthy();
  });
});

describe('asking whether WebGL works', () => {
  it('asks the browser once per visit, however many views ask', async () => {
    vi.resetModules();
    const made = vi.spyOn(document, 'createElement');
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
    const { webglAvailable } = await import('../components/space3d/SpaceViewer');
    const first = webglAvailable();
    const second = webglAvailable();
    const third = webglAvailable();
    expect([first, second, third]).toEqual([false, false, false]);
    expect(made.mock.calls.filter(([tag]) => tag === 'canvas')).toHaveLength(1);
  });
});
