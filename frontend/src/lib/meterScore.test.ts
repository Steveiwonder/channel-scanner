import { describe, expect, it } from 'vitest';
import { meterScore } from './meterScore';
import type { CandidateChannel } from './types';

function makeChannel(overrides: Partial<CandidateChannel> = {}): CandidateChannel {
  return {
    id: 1,
    center_hz: 868_300_000,
    bandwidth_hz: 25_000,
    current_power_db: -12,
    peak_power_db: -6,
    avg_power_db: -15,
    snr_db: 18,
    observation_count: 10,
    first_seen: '2026-07-14T10:00:00.000Z',
    last_seen: '2026-07-14T12:00:00.000Z',
    typical_burst_ms: 80,
    recurrence_interval_s: 300,
    confidence: 0.8,
    status: 'active',
    fingerprint: null,
    ...overrides,
  };
}

describe('meterScore', () => {
  it('rates a periodic narrowband channel as strong with all reasons', () => {
    const r = meterScore(
      makeChannel({
        recurrence_interval_s: 300,
        bandwidth_hz: 12_500,
        typical_burst_ms: 80,
        observation_count: 12,
      }),
    );
    expect(r.score).toBeCloseTo(1, 5);
    expect(r.label).toBe('strong');
    expect(r.reasons).toEqual([
      'regular cadence',
      'narrowband',
      'short bursts',
      'repeatedly seen',
    ]);
  });

  it('rates a wideband one-off channel as weak with no reasons', () => {
    const r = meterScore(
      makeChannel({
        recurrence_interval_s: null,
        bandwidth_hz: 2_000_000,
        typical_burst_ms: null,
        observation_count: 1,
      }),
    );
    expect(r.score).toBe(0);
    expect(r.label).toBe('weak');
    expect(r.reasons).toEqual([]);
  });

  it('lands in the moderate band for a partial match', () => {
    // narrowband + repeatedly seen only -> 0.25 + 0.20 = 0.45
    const r = meterScore(
      makeChannel({
        recurrence_interval_s: null,
        bandwidth_hz: 10_000,
        typical_burst_ms: 4000,
        observation_count: 8,
      }),
    );
    expect(r.score).toBeCloseTo(0.45, 5);
    expect(r.label).toBe('moderate');
    expect(r.reasons).toEqual(['narrowband', 'repeatedly seen']);
  });
});
