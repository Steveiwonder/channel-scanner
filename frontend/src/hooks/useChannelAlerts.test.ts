import { describe, expect, it } from 'vitest';
import type { CandidateChannel } from '../lib/types';
import { firstMatchingRule, matchesRule, type AlertRule } from './useChannelAlerts';

function channel(overrides: Partial<CandidateChannel> = {}): CandidateChannel {
  return {
    id: 1,
    center_hz: 148_600_000, // 148.6 MHz
    bandwidth_hz: 12_500,
    current_power_db: -40,
    peak_power_db: -35,
    avg_power_db: -42,
    snr_db: 14,
    observation_count: 6,
    first_seen: '2026-07-15T00:00:00Z',
    last_seen: '2026-07-15T00:05:00Z',
    typical_burst_ms: 40,
    recurrence_interval_s: 30,
    confidence: 0.8,
    status: 'active',
    fingerprint: null,
    ...overrides,
  };
}

function rule(overrides: Partial<AlertRule> = {}): AlertRule {
  return { id: 'r1', enabled: true, ...overrides };
}

describe('matchesRule', () => {
  it('matches an enabled rule with no criteria (any channel)', () => {
    expect(matchesRule(channel(), rule())).toBe(true);
  });

  it('never matches a disabled rule', () => {
    expect(matchesRule(channel(), rule({ enabled: false }))).toBe(false);
  });

  it('respects the inclusive frequency window in MHz', () => {
    const r = rule({ freqLoMhz: 148, freqHiMhz: 149 });
    expect(matchesRule(channel({ center_hz: 148_600_000 }), r)).toBe(true);
    expect(matchesRule(channel({ center_hz: 148_000_000 }), r)).toBe(true); // lower edge inclusive
    expect(matchesRule(channel({ center_hz: 149_000_000 }), r)).toBe(true); // upper edge inclusive
    expect(matchesRule(channel({ center_hz: 147_900_000 }), r)).toBe(false);
    expect(matchesRule(channel({ center_hz: 149_100_000 }), r)).toBe(false);
  });

  it('enforces minimum SNR', () => {
    const r = rule({ minSnr: 15 });
    expect(matchesRule(channel({ snr_db: 15 }), r)).toBe(true);
    expect(matchesRule(channel({ snr_db: 14.9 }), r)).toBe(false);
  });

  it('enforces minimum confidence as a 0..1 fraction', () => {
    const r = rule({ minConfidence: 0.75 });
    expect(matchesRule(channel({ confidence: 0.75 }), r)).toBe(true);
    expect(matchesRule(channel({ confidence: 0.5 }), r)).toBe(false);
  });

  it('requires a regular cadence when requested', () => {
    const r = rule({ requireRegularCadence: true });
    expect(matchesRule(channel({ recurrence_interval_s: 30, observation_count: 4 }), r)).toBe(true);
    expect(matchesRule(channel({ recurrence_interval_s: null, observation_count: 9 }), r)).toBe(
      false,
    );
    expect(matchesRule(channel({ recurrence_interval_s: 30, observation_count: 3 }), r)).toBe(false);
  });

  it('combines criteria with AND semantics', () => {
    const r = rule({ freqLoMhz: 148, freqHiMhz: 149, minSnr: 10, minConfidence: 0.7 });
    expect(matchesRule(channel(), r)).toBe(true);
    expect(matchesRule(channel({ snr_db: 5 }), r)).toBe(false);
  });
});

describe('firstMatchingRule', () => {
  it('returns the first enabled rule that matches, skipping disabled ones', () => {
    const disabled = rule({ id: 'a', enabled: false });
    const wrongBand = rule({ id: 'b', freqLoMhz: 400, freqHiMhz: 500 });
    const good = rule({ id: 'c', minSnr: 10 });
    expect(firstMatchingRule(channel(), [disabled, wrongBand, good])?.id).toBe('c');
  });

  it('returns null when nothing matches', () => {
    expect(firstMatchingRule(channel(), [rule({ minSnr: 100 })])).toBeNull();
  });
});
