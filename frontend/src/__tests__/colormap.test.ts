import { describe, expect, it } from 'vitest';
import { dbToColor, turboColor } from '../lib/colormap';

describe('turboColor', () => {
  it('is deterministic for a given input', () => {
    expect(turboColor(0.5)).toEqual(turboColor(0.5));
  });

  it('clamps out-of-range values to the endpoints', () => {
    expect(turboColor(-5)).toEqual(turboColor(0));
    expect(turboColor(5)).toEqual(turboColor(1));
  });

  it('returns dark blue-purple at the low end and warm red at the high end', () => {
    const low = turboColor(0);
    const high = turboColor(1);
    // Turbo starts dark blue/purple: blue channel exceeds red.
    expect(low[2]).toBeGreaterThan(low[0]);
    // Turbo ends deep red: red channel dominates blue.
    expect(high[0]).toBeGreaterThan(high[2]);
  });

  it('produces valid 0..255 integer channels across the range', () => {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const [r, g, b] = turboColor(t);
      for (const c of [r, g, b]) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('dbToColor', () => {
  it('maps the noise floor to the low end and the top of the window to the high end', () => {
    const minDb = -40;
    const maxDb = 20;
    expect(dbToColor(minDb, minDb, maxDb)).toEqual(turboColor(0));
    expect(dbToColor(maxDb, minDb, maxDb)).toEqual(turboColor(1));
  });

  it('maps the window midpoint to the colormap midpoint deterministically', () => {
    expect(dbToColor(-10, -40, 20)).toEqual(turboColor(0.5));
  });

  it('clamps values outside the dB window', () => {
    expect(dbToColor(-100, -40, 20)).toEqual(turboColor(0));
    expect(dbToColor(100, -40, 20)).toEqual(turboColor(1));
  });

  it('falls back to the low color for a degenerate window', () => {
    expect(dbToColor(5, 10, 10)).toEqual(turboColor(0));
  });
});
