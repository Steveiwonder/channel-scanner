import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

afterEach(cleanup);

describe('Sparkline', () => {
  it('renders a polyline with one coordinate per value', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4]} width={100} height={40} />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    const points = (poly?.getAttribute('points') ?? '').trim().split(/\s+/);
    expect(points).toHaveLength(4);
  });

  it('renders a flat baseline line when given no data', () => {
    const { container } = render(<Sparkline values={[]} />);
    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelector('line')).not.toBeNull();
  });

  it('expands a single point into a horizontal segment', () => {
    const { container } = render(<Sparkline values={[5]} />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    const points = (poly?.getAttribute('points') ?? '').trim().split(/\s+/);
    expect(points).toHaveLength(3);
  });

  it('applies the provided stroke colour', () => {
    const { container } = render(<Sparkline values={[1, 2]} color="#ff0000" />);
    expect(container.querySelector('polyline')?.getAttribute('stroke')).toBe('#ff0000');
  });
});
