import { useStore } from '../store/store';
import { useMetricsHistory, type MetricsHistoryField } from '../hooks/useMetricsHistory';
import { Sparkline } from './Sparkline';
import { formatBytes } from '../lib/format';
import './HealthCard.css';

interface SparkTileSpec {
  field: MetricsHistoryField;
  label: string;
  format: (v: number) => string;
  color: string;
  /** Highlight the tile when the current value is non-zero (e.g. dropped frames). */
  warnWhenNonZero?: boolean;
}

const TILES: readonly SparkTileSpec[] = [
  {
    field: 'fft_rate_hz',
    label: 'FFT rate',
    format: (v) => `${v.toFixed(1)} Hz`,
    color: 'var(--accent)',
  },
  {
    field: 'ws_clients',
    label: 'WS clients',
    format: (v) => v.toLocaleString(),
    color: 'var(--accent)',
  },
  {
    field: 'queue_depth',
    label: 'Queue depth',
    format: (v) => v.toLocaleString(),
    color: 'var(--accent-2)',
  },
  {
    field: 'dropped_frames',
    label: 'Dropped frames',
    format: (v) => v.toLocaleString(),
    color: 'var(--danger)',
    warnWhenNonZero: true,
  },
  {
    field: 'db_size_bytes',
    label: 'Database size',
    format: (v) => formatBytes(v),
    color: 'var(--ok)',
  },
  {
    field: 'recording_bytes',
    label: 'Recording storage',
    format: (v) => formatBytes(v),
    color: 'var(--ok)',
  },
];

/**
 * "Live health" card: a rolling sparkline per key backend metric, sampled ~1/s
 * from the store. Reuses the MetricTile look (.tile / .label / .value / .sub).
 */
export function HealthCard(): JSX.Element {
  const metrics = useStore((s) => s.metrics);
  const history = useMetricsHistory();

  return (
    <section className="card health-card" style={{ marginBottom: 16 }}>
      <div className="col" style={{ gap: 2, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Live health</h2>
        <span className="muted small">
          Rolling history of receiver + pipeline metrics, sampled about once per second.
        </span>
      </div>

      <div className="grid tiles">
        {TILES.map((spec) => {
          const series = history[spec.field];
          const current = metrics != null ? metrics[spec.field] : null;
          const nonZeroWarn = spec.warnWhenNonZero === true && current != null && current > 0;
          return (
            <div key={spec.field} className={nonZeroWarn ? 'tile warn' : 'tile'}>
              <div className="label">{spec.label}</div>
              <div className="value">{current != null ? spec.format(current) : '—'}</div>
              <div className="health-spark">
                <Sparkline
                  values={series}
                  color={nonZeroWarn ? 'var(--danger)' : spec.color}
                  height={34}
                />
              </div>
              <div className="sub">
                {series.length > 0 ? `${series.length} samples` : 'awaiting metrics'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
