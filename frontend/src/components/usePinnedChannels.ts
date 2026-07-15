// Pin / watch + annotate for candidate channels, persisted to localStorage only
// (NO backend). Pins/labels are keyed by channel id, so they survive reloads and
// reattach to the same channel when it reappears in the live map.

import { useCallback, useEffect, useState } from 'react';

export interface PinEntry {
  pinned: boolean;
  label: string;
}

/** channelId -> pin state. Stored under STORAGE_KEY as JSON. */
export type PinMap = Record<number, PinEntry>;

export const STORAGE_KEY = 'rtlsdr.pins';

/** Read and validate the persisted pin map. Returns {} on any problem. */
export function loadPins(): PinMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object') return {};
    const out: PinMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number(key);
      if (!Number.isFinite(id) || value == null || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const pinned = v.pinned === true;
      const label = typeof v.label === 'string' ? v.label : '';
      // Drop empty, unpinned entries so the store does not accumulate noise.
      if (!pinned && label === '') continue;
      out[id] = { pinned, label };
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist the pin map, pruning empty/unpinned entries. */
export function savePins(map: PinMap): void {
  try {
    const pruned: PinMap = {};
    for (const [key, entry] of Object.entries(map)) {
      if (entry.pinned || entry.label !== '') pruned[Number(key)] = entry;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore quota / unavailable storage — pins simply won't persist.
  }
}

export interface PinnedChannelsApi {
  pins: PinMap;
  isPinned: (id: number) => boolean;
  getLabel: (id: number) => string;
  togglePin: (id: number) => void;
  setLabel: (id: number, label: string) => void;
}

/**
 * Hook exposing the persisted pin/label map plus get/set helpers. Every mutation
 * writes through to localStorage so state survives reloads.
 */
export function usePinnedChannels(): PinnedChannelsApi {
  const [pins, setPins] = useState<PinMap>(() => loadPins());

  useEffect(() => {
    savePins(pins);
  }, [pins]);

  const isPinned = useCallback((id: number): boolean => pins[id]?.pinned === true, [pins]);
  const getLabel = useCallback((id: number): string => pins[id]?.label ?? '', [pins]);

  const togglePin = useCallback((id: number): void => {
    setPins((prev) => {
      const cur = prev[id] ?? { pinned: false, label: '' };
      return { ...prev, [id]: { ...cur, pinned: !cur.pinned } };
    });
  }, []);

  const setLabel = useCallback((id: number, label: string): void => {
    setPins((prev) => {
      const cur = prev[id] ?? { pinned: false, label: '' };
      return { ...prev, [id]: { ...cur, label } };
    });
  }, []);

  return { pins, isPinned, getLabel, togglePin, setLabel };
}
