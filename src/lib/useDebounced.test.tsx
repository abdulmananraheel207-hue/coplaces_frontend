// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounced } from './useDebounced';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useDebounced', () => {
  it('starts with the value it is given', () => {
    const { result } = renderHook(() => useDebounced('INV', 300));
    expect(result.current).toBe('INV');
  });

  it('waits until typing pauses, then takes only the last value', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), { initialProps: { v: '' } });
    for (const v of ['H', 'Ha', 'Ham', 'Hamz', 'Hamza']) {
      rerender({ v });
      act(() => vi.advanceTimersByTime(100));
      expect(result.current).toBe('');
    }
    // 100 ms have passed since the last key; the value settles 300 ms after it.
    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('Hamza');
  });
});
