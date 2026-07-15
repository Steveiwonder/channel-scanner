import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OccupancyResponse } from '../lib/types';

const getOccupancy = vi.fn<() => Promise<OccupancyResponse>>();

vi.mock('../lib/api', () => ({
  api: {
    getOccupancy: () => getOccupancy(),
  },
  ApiError: class ApiError extends Error {},
}));

// Imported after vi.mock so the mocked api is wired up.
import { Occupancy } from './Occupancy';

function emptyGrid(): OccupancyResponse {
  return {
    f_start_hz: 433_000_000,
    f_stop_hz: 434_000_000,
    freq_bins: 4,
    bucket_seconds: 30,
    bucket_starts: ['2026-07-15T10:00:00.000Z', '2026-07-15T10:00:30.000Z'],
    grid: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  };
}

function activeGrid(): OccupancyResponse {
  return {
    ...emptyGrid(),
    grid: [
      [0, 2, 0, 5],
      [1, 0, 3, 0],
    ],
  };
}

function renderOccupancy(): void {
  render(
    <MemoryRouter>
      <Occupancy />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getOccupancy.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Occupancy page', () => {
  it('renders the window/bins/bucket controls and a Refresh button', async () => {
    getOccupancy.mockResolvedValue(emptyGrid());
    renderOccupancy();
    expect(screen.getByText('Window')).toBeInTheDocument();
    expect(screen.getByText('Freq bins')).toBeInTheDocument();
    expect(screen.getByText('Bucket')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh|Loading/i })).toBeInTheDocument();
    // Empty-window message appears once the (all-zero) grid resolves.
    expect(await screen.findByText(/No detections in this window yet/i)).toBeInTheDocument();
  });

  it('renders the heatmap canvas when the grid has detections', async () => {
    getOccupancy.mockResolvedValue(activeGrid());
    renderOccupancy();
    const canvas = await screen.findByRole('img', { name: /occupancy heatmap/i });
    expect(canvas.tagName).toBe('CANVAS');
    expect(screen.getByText(/Brighter = more detections/i)).toBeInTheDocument();
  });
});
