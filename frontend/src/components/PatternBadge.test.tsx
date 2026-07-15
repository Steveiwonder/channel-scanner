import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PatternBadge } from './PatternBadge';
import type { CandidateChannel } from '../lib/types';

function makeChannel(overrides: Partial<CandidateChannel> = {}): CandidateChannel {
  return {
    id: 1,
    center_hz: 868_300_000,
    bandwidth_hz: 12_500,
    current_power_db: -12,
    peak_power_db: -6,
    avg_power_db: -15,
    snr_db: 18,
    observation_count: 12,
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

afterEach(cleanup);

describe('PatternBadge', () => {
  it('shows a strong label and a disclaimer tooltip for a periodic narrowband channel', () => {
    render(<PatternBadge channel={makeChannel()} />);
    const badge = screen.getByText('Strong');
    expect(badge).toHaveClass('patternbadge--strong');
    const title = badge.getAttribute('title') ?? '';
    expect(title).toContain('regular cadence');
    expect(title).toContain('not a claim that it is a meter or any specific device');
  });

  it('shows a weak label for a wideband one-off channel', () => {
    render(
      <PatternBadge
        channel={makeChannel({
          recurrence_interval_s: null,
          bandwidth_hz: 2_000_000,
          typical_burst_ms: null,
          observation_count: 1,
        })}
      />,
    );
    expect(screen.getByText('Weak')).toHaveClass('patternbadge--weak');
  });
});
