import { turboColor } from '../lib/colormap';
import { formatDb } from '../lib/format';
import './ColorLegend.css';

export interface ColorLegendProps {
  /** dB value mapped to the low (cold) end of the colormap. */
  minDb: number;
  /** dB value mapped to the high (hot) end of the colormap. */
  maxDb: number;
  /** Bar direction. Horizontal grows left->right, vertical bottom->top. */
  orientation?: 'horizontal' | 'vertical';
  /** Optional caption, e.g. "Power (dB)". */
  label?: string;
  /**
   * For horizontal: bar thickness in px (default 12).
   * For vertical: bar length in px (default 160).
   */
  height?: number;
  /**
   * For horizontal: bar length in px (default: fills container width).
   * For vertical: bar thickness in px (default 14).
   */
  width?: number;
}

/** Number of gradient stops sampled from the turbo colormap. */
const STOP_COUNT = 32;
/** Number of evenly spaced tick labels (including both endpoints). */
const TICK_COUNT = 5;

/**
 * Build a CSS linear-gradient string sampled deterministically from
 * `turboColor` so the legend matches the spectrogram/waterfall colours exactly.
 * The stop fraction maps directly to the colormap parameter t in both
 * orientations; the direction keyword handles which end is "hot".
 */
function buildGradient(direction: 'to right' | 'to top'): string {
  const stops: string[] = [];
  for (let i = 0; i <= STOP_COUNT; i += 1) {
    const t = i / STOP_COUNT;
    const [r, g, b] = turboColor(t);
    stops.push(`rgb(${r}, ${g}, ${b}) ${(t * 100).toFixed(2)}%`);
  }
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

/** Tick dB values ordered low -> high. */
function tickValues(minDb: number, maxDb: number): number[] {
  const ticks: number[] = [];
  for (let i = 0; i < TICK_COUNT; i += 1) {
    const frac = i / (TICK_COUNT - 1);
    ticks.push(minDb + frac * (maxDb - minDb));
  }
  return ticks;
}

/**
 * Colour-scale legend mapping the turbo spectrogram/waterfall colours to dB.
 * Renders deterministically from `turboColor`, so it accurately represents the
 * colormap used by the scope.
 */
export function ColorLegend({
  minDb,
  maxDb,
  orientation = 'horizontal',
  label,
  height,
  width,
}: ColorLegendProps): JSX.Element {
  const isVertical = orientation === 'vertical';
  const gradient = buildGradient(isVertical ? 'to top' : 'to right');

  // Low -> high for horizontal (left -> right). Vertical stacks high at the top,
  // so render the labels high -> low top-to-bottom.
  const lowToHigh = tickValues(minDb, maxDb);
  const ticks = isVertical ? [...lowToHigh].reverse() : lowToHigh;

  const barStyle: React.CSSProperties = isVertical
    ? {
        background: gradient,
        width: `${width ?? 14}px`,
        height: `${height ?? 160}px`,
      }
    : {
        background: gradient,
        height: `${height ?? 12}px`,
        width: width != null ? `${width}px` : '100%',
      };

  const ariaLabel = `${label ? `${label}: ` : ''}colour scale from ${formatDb(minDb)} to ${formatDb(
    maxDb,
  )}`;

  return (
    <div
      className={isVertical ? 'colorlegend colorlegend--vertical' : 'colorlegend colorlegend--horizontal'}
    >
      {label != null && label !== '' && <div className="colorlegend__label">{label}</div>}
      <div className="colorlegend__scale">
        <div className="colorlegend__bar" style={barStyle} role="img" aria-label={ariaLabel} />
        <div className="colorlegend__ticks">
          {ticks.map((db, i) => (
            <span className="colorlegend__tick" key={i}>
              {formatDb(db)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
