import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { loadPins, savePins, STORAGE_KEY, usePinnedChannels } from './usePinnedChannels';

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('loadPins / savePins', () => {
  it('round-trips pinned + labelled entries and prunes empty ones', () => {
    savePins({
      1: { pinned: true, label: 'water meter?' },
      2: { pinned: false, label: '' }, // pruned
      3: { pinned: false, label: 'note' },
    });
    const loaded = loadPins();
    expect(loaded[1]).toEqual({ pinned: true, label: 'water meter?' });
    expect(loaded[3]).toEqual({ pinned: false, label: 'note' });
    expect(loaded[2]).toBeUndefined();
  });

  it('returns {} on malformed storage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json');
    expect(loadPins()).toEqual({});
  });
});

describe('usePinnedChannels', () => {
  it('toggles pins and persists labels across a reload', () => {
    const { result, unmount } = renderHook(() => usePinnedChannels());

    act(() => result.current.togglePin(7));
    act(() => result.current.setLabel(7, 'gas meter?'));

    expect(result.current.isPinned(7)).toBe(true);
    expect(result.current.getLabel(7)).toBe('gas meter?');
    unmount();

    // Fresh hook instance reads back from localStorage.
    const { result: reloaded } = renderHook(() => usePinnedChannels());
    expect(reloaded.current.isPinned(7)).toBe(true);
    expect(reloaded.current.getLabel(7)).toBe('gas meter?');
  });

  it('reports unknown channels as unpinned with an empty label', () => {
    const { result } = renderHook(() => usePinnedChannels());
    expect(result.current.isPinned(999)).toBe(false);
    expect(result.current.getLabel(999)).toBe('');
  });
});
