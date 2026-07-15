import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CandidateChannel, Detection } from '../lib/types';

const getChannelObservations = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    getChannelObservations: (...args: unknown[]) => getChannelObservations(...args),
  },
}));

// Imported after vi.mock so the mocked api is wired up.
import { ChannelDetail } from './ChannelDetail';

const CHANNEL: CandidateChannel = {
  id: 7,
  center_hz: 868_300_000,
  bandwidth_hz: 25_000,
  current_power_db: -12.4,
  peak_power_db: -6.1,
  avg_power_db: -15.2,
  snr_db: 18.3,
  observation_count: 42,
  first_seen: '2026-07-14T10:00:00.000Z',
  last_seen: '2026-07-14T12:00:00.000Z',
  typical_burst_ms: 85,
  recurrence_interval_s: 300,
  confidence: 0.87,
  status: 'active',
  fingerprint: null,
};

function detection(id: number, iso: string, peak: number): Detection {
  return {
    id,
    channel_id: 7,
    session_id: 1,
    timestamp: iso,
    center_hz: 868_300_000,
    bandwidth_hz: 25_000,
    peak_power_db: peak,
    avg_power_db: peak - 4,
    snr_db: 18,
    duration_ms: 80,
  };
}

beforeEach(() => {
  getChannelObservations.mockReset();
  getChannelObservations.mockResolvedValue({
    observations: [
      detection(1, '2026-07-14T10:00:00.000Z', -8),
      detection(2, '2026-07-14T10:05:00.000Z', -6),
      detection(3, '2026-07-14T10:10:00.000Z', -7),
    ],
  });
});

afterEach(cleanup);

describe('ChannelDetail', () => {
  it('renders the header with id and center MHz', () => {
    render(<ChannelDetail channel={CHANNEL} onClose={() => {}} />);
    expect(screen.getByText('Channel #7')).toBeInTheDocument();
    expect(screen.getAllByText(/868\.3000 MHz/).length).toBeGreaterThan(0);
  });

  it('shows the receive-only framing and an Open in Scope action', () => {
    render(<ChannelDetail channel={CHANNEL} onClose={() => {}} onFocus={() => {}} />);
    expect(screen.getByText(/not a confirmed device/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open in Scope/i })).toBeInTheDocument();
  });

  it('fetches observations for the channel on mount', () => {
    render(<ChannelDetail channel={CHANNEL} onClose={() => {}} />);
    expect(getChannelObservations).toHaveBeenCalledWith(7, 300);
  });

  it('renders the power sparkline after observations load', async () => {
    render(<ChannelDetail channel={CHANNEL} onClose={() => {}} />);
    expect(await screen.findByLabelText(/Peak power over time/i)).toBeInTheDocument();
  });
});
