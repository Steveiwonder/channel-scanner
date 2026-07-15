import { useEffect, useRef, useState } from 'react';
import type { Metrics } from '../lib/types';
import { useStore } from '../store/store';

/** Fields we keep a rolling history for. */
export type MetricsHistoryField =
  | 'fft_rate_hz'
  | 'ws_clients'
  | 'queue_depth'
  | 'dropped_frames'
  | 'db_size_bytes'
  | 'recording_bytes';

export type MetricsHistory = Record<MetricsHistoryField, number[]>;

const FIELDS: readonly MetricsHistoryField[] = [
  'fft_rate_hz',
  'ws_clients',
  'queue_depth',
  'dropped_frames',
  'db_size_bytes',
  'recording_bytes',
];

const DEFAULT_MAX_SAMPLES = 120;

function emptyHistory(): MetricsHistory {
  return {
    fft_rate_hz: [],
    ws_clients: [],
    queue_depth: [],
    dropped_frames: [],
    db_size_bytes: [],
    recording_bytes: [],
  };
}

/**
 * Keeps a bounded rolling history of selected metrics fields. The backend
 * broadcasts a fresh `metrics` object roughly once per second; we append one
 * sample per distinct object. History lives entirely inside this hook (a ref
 * mirrored to state for rendering) and never touches the global store.
 */
export function useMetricsHistory(maxSamples: number = DEFAULT_MAX_SAMPLES): MetricsHistory {
  const metrics = useStore((s) => s.metrics);
  const historyRef = useRef<MetricsHistory>(emptyHistory());
  const lastSampleRef = useRef<Metrics | null>(null);
  const [history, setHistory] = useState<MetricsHistory>(historyRef.current);

  useEffect(() => {
    if (!metrics || metrics === lastSampleRef.current) return;
    lastSampleRef.current = metrics;

    const cap = Math.max(1, Math.floor(maxSamples));
    const prev = historyRef.current;
    const next = emptyHistory();
    for (const field of FIELDS) {
      const series = prev[field].concat(metrics[field]);
      if (series.length > cap) series.splice(0, series.length - cap);
      next[field] = series;
    }
    historyRef.current = next;
    setHistory(next);
  }, [metrics, maxSamples]);

  return history;
}
