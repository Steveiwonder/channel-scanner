// Perceptually-uniform colormap for the scope spectrogram, inlined as a small
// lookup table (no external dependency). This is the "turbo" colormap
// (Anton Mikhailov, Google) sampled at evenly spaced control points; intermediate
// values are linearly interpolated. Pure and deterministic so it can be unit-tested.

export type Rgb = [number, number, number];

/** Turbo control points (r, g, b in 0..255) sampled every 1/16 of the range. */
const TURBO: readonly Rgb[] = [
  [48, 18, 59],
  [64, 74, 186],
  [70, 128, 233],
  [45, 175, 240],
  [26, 214, 203],
  [55, 235, 150],
  [110, 247, 92],
  [166, 252, 54],
  [211, 240, 47],
  [242, 213, 55],
  [253, 176, 51],
  [253, 132, 39],
  [239, 91, 24],
  [214, 57, 15],
  [178, 30, 8],
  [136, 12, 4],
  [122, 4, 3],
];

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Map a normalized value 0..1 to an [r, g, b] triple on the turbo colormap.
 * Values outside 0..1 are clamped. Deterministic.
 */
export function turboColor(t: number): Rgb {
  const x = clamp01(Number.isFinite(t) ? t : 0);
  const last = TURBO.length - 1;
  const scaled = x * last;
  const i = Math.min(Math.floor(scaled), last);
  const j = Math.min(i + 1, last);
  const f = scaled - i;
  const a = TURBO[i] ?? TURBO[0]!;
  const b = TURBO[j] ?? TURBO[last]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/**
 * Map a dB power value to a turbo color given the color-scale window
 * [minDb, maxDb]. Values below minDb clamp to the low end, above maxDb to the
 * high end. If the window is degenerate (max <= min) everything maps to min.
 */
export function dbToColor(db: number, minDb: number, maxDb: number): Rgb {
  const range = maxDb - minDb;
  if (!(range > 0) || !Number.isFinite(db)) return turboColor(0);
  return turboColor((db - minDb) / range);
}
