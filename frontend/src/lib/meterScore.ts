// Frontend-only heuristic that rates how closely a candidate channel resembles a
// periodic, narrowband transmission PATTERN (regular cadence + narrow bandwidth +
// short bursts + repeatedly seen). This is a pattern indicator ONLY — it is NOT a
// claim that the channel is a meter, or any specific device. Nothing here touches
// the backend; it is derived purely from fields already present on the channel.

import type { CandidateChannel } from './types';
import { clamp01 } from './format';

export type MeterScoreLabel = 'strong' | 'moderate' | 'weak';

export interface MeterScore {
  /** Combined heuristic score, 0..1. */
  score: number;
  /** Bucketed label derived from `score`. */
  label: MeterScoreLabel;
  /** Short, human-readable reasons for the factors that matched. */
  reasons: string[];
}

/** Bandwidth at or below this reads as "narrowband" for meter-like signalling. */
export const NARROWBAND_MAX_HZ = 40_000;
/** Typical burst at or below this reads as a "short burst". */
export const SHORT_BURST_MAX_MS = 500;
/** Observation count at or above this reads as "repeatedly seen". */
export const REPEAT_MIN_OBS = 4;

// Weights sum to 1 so a channel matching every factor scores 1.0.
const W_CADENCE = 0.35;
const W_NARROWBAND = 0.25;
const W_SHORT_BURST = 0.2;
const W_REPEAT = 0.2;

/**
 * Score how meter-like (periodic + narrowband) a candidate channel's pattern is.
 * Heuristic only — see the file header for the important caveat.
 */
export function meterScore(ch: CandidateChannel): MeterScore {
  let score = 0;
  const reasons: string[] = [];

  if (ch.recurrence_interval_s != null && Number.isFinite(ch.recurrence_interval_s)) {
    score += W_CADENCE;
    reasons.push('regular cadence');
  }

  if (Number.isFinite(ch.bandwidth_hz) && ch.bandwidth_hz > 0 && ch.bandwidth_hz < NARROWBAND_MAX_HZ) {
    score += W_NARROWBAND;
    reasons.push('narrowband');
  }

  if (
    ch.typical_burst_ms != null &&
    Number.isFinite(ch.typical_burst_ms) &&
    ch.typical_burst_ms < SHORT_BURST_MAX_MS
  ) {
    score += W_SHORT_BURST;
    reasons.push('short bursts');
  }

  if (ch.observation_count >= REPEAT_MIN_OBS) {
    score += W_REPEAT;
    reasons.push('repeatedly seen');
  }

  return { score: clamp01(score), label: labelFor(score), reasons };
}

function labelFor(score: number): MeterScoreLabel {
  if (score >= 0.7) return 'strong';
  if (score >= 0.4) return 'moderate';
  return 'weak';
}
