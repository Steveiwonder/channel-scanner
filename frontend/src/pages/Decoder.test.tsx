import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DecodeFrame, DecodesResponse } from '../lib/types';

const getDecodes = vi.fn<() => Promise<DecodesResponse>>();
const runDecoder = vi.fn();

vi.mock('../lib/api', () => ({
  api: {
    getDecodes: () => getDecodes(),
    runDecoder: () => runDecoder(),
  },
  ApiError: class ApiError extends Error {},
}));

// Imported after vi.mock so the mocked api is wired up.
import { Decoder } from './Decoder';
import { useStore } from '../store/store';

const DECODE: DecodeFrame = {
  id: 1,
  timestamp: '2026-07-15T10:30:00.000Z',
  decoder: 'rtl_433',
  protocol: 'Acurite-Tower',
  freq_hz: 433_920_000,
  known: true,
  fields: { id: 42, temperature_C: 21.3 },
  session_id: 1,
};

function renderDecoder(): void {
  render(
    <MemoryRouter>
      <Decoder />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getDecodes.mockReset();
  runDecoder.mockReset();
  useStore.getState().setDecodes([]);
});

afterEach(() => {
  cleanup();
  useStore.getState().setDecodes([]);
});

describe('Decoder page', () => {
  it('shows the empty state when there are no decodes', async () => {
    getDecodes.mockResolvedValue({ decodes: [], decoder_available: true });
    renderDecoder();
    expect(await screen.findByText(/No decodes yet/i)).toBeInTheDocument();
  });

  it('warns when the decoder is unavailable (simulated)', async () => {
    getDecodes.mockResolvedValue({ decodes: [], decoder_available: false });
    renderDecoder();
    expect(await screen.findByText(/rtl_433 not detected/i)).toBeInTheDocument();
  });

  it('renders a decode row with formatted values', async () => {
    getDecodes.mockResolvedValue({ decodes: [DECODE], decoder_available: true });
    renderDecoder();
    expect(await screen.findByText('Acurite-Tower')).toBeInTheDocument();
    expect(screen.getByText('rtl_433')).toBeInTheDocument();
    expect(screen.getByText(/433\.9200 MHz/)).toBeInTheDocument();
    expect(screen.getByText(/temperature_C: 21\.3/)).toBeInTheDocument();
  });

  it('shows a grey "unknown" badge for unknown protocols', async () => {
    const unknown: DecodeFrame = { ...DECODE, id: 2, known: false, freq_hz: null };
    getDecodes.mockResolvedValue({ decodes: [unknown], decoder_available: true });
    renderDecoder();
    const badge = await screen.findByText('unknown');
    expect(badge).toHaveClass('badge', 'dim');
  });
});
