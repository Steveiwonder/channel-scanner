import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CompareChannels } from './CompareChannels';
import { channelSimilarity } from '../lib/channelSimilarity';
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

describe('channelSimilarity', () => {
  it('scores identical characteristics (bar center freq) as very similar', () => {
    const a = makeChannel({ id: 1, center_hz: 868_000_000 });
    const b = makeChannel({ id: 2, center_hz: 869_500_000 });
    const sim = channelSimilarity(a, b);
    expect(sim.score).toBeCloseTo(1, 5);
    expect(sim.verdict).toContain('same emitter');
  });

  it('scores very different characteristics as different', () => {
    const a = makeChannel({ bandwidth_hz: 12_500, snr_db: 20, typical_burst_ms: 80, recurrence_interval_s: 300 });
    const b = makeChannel({
      id: 2,
      bandwidth_hz: 2_000_000,
      snr_db: 3,
      typical_burst_ms: 5000,
      recurrence_interval_s: null,
    });
    const sim = channelSimilarity(a, b);
    expect(sim.score).toBeLessThan(0.5);
    expect(sim.verdict).toContain('different');
  });
});

describe('CompareChannels', () => {
  it('renders both channels and the similarity read-out', () => {
    render(
      <CompareChannels a={makeChannel({ id: 3 })} b={makeChannel({ id: 4 })} onClose={() => {}} />,
    );
    expect(screen.getByText(/A · #3/)).toBeInTheDocument();
    expect(screen.getByText(/B · #4/)).toBeInTheDocument();
    expect(screen.getByText('Similarity')).toBeInTheDocument();
    expect(screen.getByText(/does not identify a device/)).toBeInTheDocument();
  });

  it('closes via the modal close button', () => {
    const onClose = vi.fn();
    render(<CompareChannels a={makeChannel({ id: 3 })} b={makeChannel({ id: 4 })} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
