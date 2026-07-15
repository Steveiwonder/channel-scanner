import './Sparkline.css';

export interface SparklineProps {
  /** Ordered samples, oldest first. Empty/one-point inputs render a flat baseline. */
  values: number[];
  width?: number;
  height?: number;
  /** Stroke colour; defaults to the app accent. */
  color?: string;
}

/**
 * Tiny dependency-free SVG sparkline. Pure: given the same props it renders the
 * same output. Scales the y-axis to the min/max of the supplied values so small
 * relative changes stay visible even when absolute magnitudes are large.
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = 'var(--accent)',
}: SparklineProps): JSX.Element {
  const pad = 2;
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);

  const finite = values.filter((v) => Number.isFinite(v));
  const hasData = finite.length > 0;

  let min = hasData ? Math.min(...finite) : 0;
  let max = hasData ? Math.max(...finite) : 0;
  if (max <= min) {
    // Flat series: center the line and give it a nominal range.
    min -= 0.5;
    max += 0.5;
  }
  const range = max - min;

  const n = values.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  const points: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const raw = values[i];
    const v = Number.isFinite(raw as number) ? (raw as number) : min;
    const x = pad + (n > 1 ? i * stepX : innerW / 2);
    const y = pad + innerH - ((v - min) / range) * innerH;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  // A single point still needs two coordinates for a visible horizontal dash.
  if (points.length === 1) {
    const only = points[0] as string;
    const y = only.split(',')[1] ?? String(pad + innerH / 2);
    points.unshift(`${pad},${y}`);
    points.push(`${pad + innerW},${y}`);
  }

  const polyPoints = points.join(' ');

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      {hasData ? (
        <polyline
          points={polyPoints}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <line
          x1={pad}
          y1={pad + innerH / 2}
          x2={pad + innerW}
          y2={pad + innerH / 2}
          stroke="var(--border)"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}
