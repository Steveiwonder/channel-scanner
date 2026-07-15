// Frontend-only similarity read-out for the A/B compare view. Compares two
// candidate channels by their center-frequency-INDEPENDENT physical
// characteristics (bandwidth, typical burst duration, recurrence interval, SNR).
// This compares measured characteristics — it does NOT prove the two channels
// are the same device/emitter.

import type { CandidateChannel } from './types';
import { clamp01 } from './format';

export interface Similarity {
  /** 0..1, where 1 means the compared characteristics are identical. */
  score: number;
  /** One-line human verdict. */
  verdict: string;
}

/** Symmetric relative difference in [0,1]; 0 when both values are equal. */
function relDiff(x: number, y: number): number {
  const denom = Math.max(Math.abs(x), Math.abs(y));
  if (denom === 0) return 0;
  return clamp01(Math.abs(x - y) / denom);
}

/**
 * Difference in [0,1] for a nullable feature. Both null -> null (skipped from the
 * average); exactly one null -> maximal difference; both present -> relDiff.
 */
function nullableDiff(x: number | null, y: number | null): number | null {
  if (x == null && y == null) return null;
  if (x == null || y == null) return 1;
  return relDiff(x, y);
}

/**
 * Similarity (0..1) of two channels' physical characteristics, deliberately
 * ignoring absolute center frequency.
 */
export function channelSimilarity(a: CandidateChannel, b: CandidateChannel): Similarity {
  const diffs: number[] = [relDiff(a.bandwidth_hz, b.bandwidth_hz), relDiff(a.snr_db, b.snr_db)];
  const burst = nullableDiff(a.typical_burst_ms, b.typical_burst_ms);
  const rec = nullableDiff(a.recurrence_interval_s, b.recurrence_interval_s);
  if (burst != null) diffs.push(burst);
  if (rec != null) diffs.push(rec);

  const mean = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
  const score = clamp01(1 - mean);
  const verdict =
    score >= 0.8
      ? 'very similar — could be the same emitter'
      : 'different physical characteristics';
  return { score, verdict };
}
