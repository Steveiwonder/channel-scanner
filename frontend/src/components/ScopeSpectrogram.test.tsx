import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  ScopeSpectrogram,
  MIN_VISIBLE_COLUMNS,
  clampView,
  columnAbsForX,
  formatAxisOffset,
  formatSecondsAgo,
  formatSpanSeconds,
} from './ScopeSpectrogram';

afterEach(cleanup);

describe('ScopeSpectrogram', () => {
  it('renders a canvas', () => {
    const { container } = render(<ScopeSpectrogram height={200} rows={128} spanDb={60} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders a Reset control', () => {
    const { getByText } = render(<ScopeSpectrogram />);
    expect(getByText('Reset')).not.toBeNull();
  });
});

describe('clampView', () => {
  it('returns an empty range with no history', () => {
    expect(clampView({ totalPushed: 0, count: 0, span: 100, anchorAbs: 0, follow: true })).toEqual({
      startAbs: 0,
      endAbs: 0,
      span: 0,
    });
  });

  it('pins the right edge to the newest column when following', () => {
    const v = clampView({ totalPushed: 1000, count: 500, span: 200, anchorAbs: 0, follow: true });
    expect(v.endAbs).toBe(999);
    expect(v.span).toBe(200);
    expect(v.startAbs).toBe(800);
  });

  it('clamps the span to the available history', () => {
    const v = clampView({ totalPushed: 40, count: 40, span: 5000, anchorAbs: 39, follow: true });
    expect(v.span).toBe(40);
    expect(v.startAbs).toBe(0);
    expect(v.endAbs).toBe(39);
  });

  it('does not zoom in past the minimum column count', () => {
    const v = clampView({ totalPushed: 1000, count: 1000, span: 1, anchorAbs: 999, follow: false });
    expect(v.span).toBe(MIN_VISIBLE_COLUMNS);
  });

  it('keeps a paned view inside the retained window', () => {
    // Buffer holds abs [500, 999]; anchor far in the past clamps to the oldest.
    const v = clampView({ totalPushed: 1000, count: 500, span: 100, anchorAbs: 200, follow: false });
    expect(v.startAbs).toBe(500);
    expect(v.endAbs).toBe(599);
  });
});

describe('columnAbsForX', () => {
  it('maps the left edge to the first visible column', () => {
    expect(columnAbsForX(0, 100, 50)).toBe(100);
  });

  it('maps the right edge to the last visible column', () => {
    expect(columnAbsForX(1, 100, 50)).toBe(149);
  });

  it('maps the midpoint into the visible span', () => {
    expect(columnAbsForX(0.5, 100, 50)).toBe(125);
  });

  it('clamps fractions outside 0..1', () => {
    expect(columnAbsForX(-1, 10, 20)).toBe(10);
    expect(columnAbsForX(2, 10, 20)).toBe(29);
  });
});

describe('time formatting', () => {
  it('labels the newest column as "now"', () => {
    expect(formatAxisOffset(0)).toBe('now');
    expect(formatAxisOffset(20)).toBe('now');
  });

  it('formats sub-10s offsets with one decimal', () => {
    expect(formatAxisOffset(5000)).toBe('-5.0s');
  });

  it('formats large offsets without decimals', () => {
    expect(formatAxisOffset(12000)).toBe('-12s');
  });

  it('formats seconds-ago for the hover readout', () => {
    expect(formatSecondsAgo(0)).toBe('now');
    expect(formatSecondsAgo(3400)).toBe('3.4 s ago');
  });

  it('formats the visible span', () => {
    expect(formatSpanSeconds(12300)).toBe('~12.3 s');
    expect(formatSpanSeconds(0)).toBe('—');
  });
});
