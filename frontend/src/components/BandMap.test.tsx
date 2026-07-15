import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BandMap } from './BandMap';
import type { CandidateChannel } from '../lib/types';

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

afterEach(cleanup);

describe('BandMap', () => {
  const START = 868_000_000;
  const END = 870_000_000;

  it('renders one marker per channel', () => {
    render(
      <BandMap
        channels={[makeChannel({ id: 1 }), makeChannel({ id: 2, center_hz: 869_500_000 })]}
        startHz={START}
        endHz={END}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Channel #1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Channel #2/ })).toBeInTheDocument();
  });

  it('calls onSelect when a marker is clicked', () => {
    const onSelect = vi.fn();
    render(<BandMap channels={[makeChannel({ id: 5 })]} startHz={START} endHz={END} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Channel #5/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: 5 });
  });

  it('shows an empty state with no channels', () => {
    render(<BandMap channels={[]} startHz={START} endHz={END} />);
    expect(screen.getByText(/No channels yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
