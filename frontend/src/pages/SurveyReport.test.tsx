import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CandidateChannel, DecodeFrame, Session } from '../lib/types';

const getSessions = vi.fn<() => Promise<{ sessions: Session[] }>>();
const getDecodes = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    getSessions: () => getSessions(),
    getDecodes: () => getDecodes(),
  },
  ApiError: class ApiError extends Error {},
}));

// Imported after vi.mock so the mocked api is wired up.
import { SurveyReport } from './SurveyReport';
import { buildMarkdown } from '../lib/surveyReport';
import { useStore } from '../store/store';

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

const DECODE: DecodeFrame = {
  id: 1,
  timestamp: '2026-07-15T10:30:00.000Z',
  decoder: 'rtl_433',
  protocol: 'Acurite-Tower',
  freq_hz: 433_920_000,
  known: true,
  fields: {},
  session_id: 1,
};

function renderReport(): void {
  render(
    <MemoryRouter>
      <SurveyReport />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getSessions.mockReset();
  getDecodes.mockReset();
  getSessions.mockResolvedValue({ sessions: [] });
  getDecodes.mockResolvedValue({ decodes: [], decoder_available: true });
  useStore.getState().setChannels([]);
  useStore.getState().setDecodes([]);
});

afterEach(() => {
  cleanup();
  useStore.getState().setChannels([]);
  useStore.getState().setDecodes([]);
});

describe('SurveyReport page', () => {
  it('renders the empty state when there are no channels', async () => {
    renderReport();
    expect(await screen.findByText(/No candidate channels detected yet/i)).toBeInTheDocument();
  });

  it('renders a channel row', async () => {
    useStore.getState().setChannels([makeChannel()]);
    renderReport();
    expect(await screen.findByText('868.3000')).toBeInTheDocument();
    expect(screen.getByText('strong')).toBeInTheDocument();
  });
});

describe('buildMarkdown', () => {
  it('returns a non-empty report with a channel row and decoded protocol', () => {
    const md = buildMarkdown({
      channels: [makeChannel()],
      sessions: [],
      decodes: [DECODE],
      generatedAt: '2026-07-15T12:00:00.000Z',
    });
    expect(md).toContain('# Channel survey report');
    expect(md).toContain('_Generated 2026-07-15T12:00:00.000Z_');
    expect(md).toContain('Total candidate channels: 1');
    expect(md).toContain('| 868.3000 |');
    expect(md).toContain('Acurite-Tower');
    expect(md.length).toBeGreaterThan(0);
  });

  it('notes the empty case when there are no channels or decodes', () => {
    const md = buildMarkdown({
      channels: [],
      sessions: [],
      decodes: [],
      generatedAt: '2026-07-15T12:00:00.000Z',
    });
    expect(md).toContain('Total candidate channels: 0');
    expect(md).toContain('_No candidate channels detected._');
    expect(md).toContain('No known protocols decoded');
  });
});
