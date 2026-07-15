import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ColorLegend } from './ColorLegend';

afterEach(cleanup);

describe('ColorLegend', () => {
  it('renders evenly spaced tick labels including min, mid and max dB', () => {
    render(<ColorLegend minDb={-40} maxDb={20} label="Power (dB)" />);
    expect(screen.getByText('Power (dB)')).toBeInTheDocument();
    expect(screen.getByText('-40.0 dB')).toBeInTheDocument();
    expect(screen.getByText('-10.0 dB')).toBeInTheDocument();
    expect(screen.getByText('20.0 dB')).toBeInTheDocument();
  });

  it('describes the colour range for assistive tech in vertical orientation', () => {
    render(<ColorLegend minDb={-40} maxDb={20} orientation="vertical" />);
    expect(screen.getByRole('img', { name: /-40.0 dB to 20.0 dB/ })).toBeInTheDocument();
  });
});
