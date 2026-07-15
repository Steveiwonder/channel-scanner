import { useEffect, useMemo, useState } from 'react';
import type { CandidateChannel, Detection } from '../lib/types';
import { api } from '../lib/api';
import {
  formatConfidence,
  formatDb,
  formatDuration,
  formatIntervalSeconds,
  formatIso,
  formatSnr,
  hzSpanToHuman,
  hzToMHz,
} from '../lib/format';
import './ChannelDetail.css';

export interface ChannelDetailProps {
  channel: CandidateChannel;
  onClose: () => void;
  onFocus?: (ch: CandidateChannel) => void;
}

interface Metric {
  label: string;
  value: string;
  hint: string;
}

/** Chronological (oldest-first) epoch-ms timestamps for the given detections. */
function sortedTimesMs(obs: Detection[]): number[] {
  return obs
    .map((d) => new Date(d.timestamp).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
}

/** Inter-arrival gaps in seconds between consecutive detections. */
function interArrivalGaps(obs: Detection[]): number[] {
  const times = sortedTimesMs(obs);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const cur = times[i];
    const prev = times[i - 1];
    if (cur == null || prev == null) continue;
    gaps.push((cur - prev) / 1000);
  }
  return gaps;
}

function Sparkline({ obs }: { obs: Detection[] }): JSX.Element {
  const points = useMemo(() => {
    const rows = obs
      .map((d) => ({ t: new Date(d.timestamp).getTime(), v: d.peak_power_db }))
      .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.v))
      .sort((a, b) => a.t - b.t);
    if (rows.length === 0) return '';
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      if (r.v < min) min = r.v;
      if (r.v > max) max = r.v;
    }
    const range = max - min > 0 ? max - min : 1;
    const n = rows.length;
    return rows
      .map((r, i) => {
        const x = n <= 1 ? 100 : (i / (n - 1)) * 100;
        const y = 28 - ((r.v - min) / range) * 26 + 1;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [obs]);

  return (
    <svg
      className="channeldetail-sparkline"
      viewBox="0 0 100 30"
      height={40}
      preserveAspectRatio="none"
      role="img"
      aria-label="Peak power over time"
    >
      <polyline className="channeldetail-spark-line" points={points} />
    </svg>
  );
}

function GapHistogram({ obs }: { obs: Detection[] }): JSX.Element {
  const bars = useMemo(() => {
    const gaps = interArrivalGaps(obs);
    if (gaps.length === 0) return [];
    let min = Infinity;
    let max = -Infinity;
    for (const g of gaps) {
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const bucketCount = Math.min(10, Math.max(1, gaps.length));
    const width = max - min > 0 ? max - min : 1;
    const counts = new Array<number>(bucketCount).fill(0);
    for (const g of gaps) {
      let idx = Math.floor(((g - min) / width) * bucketCount);
      if (idx >= bucketCount) idx = bucketCount - 1;
      if (idx < 0) idx = 0;
      const prev = counts[idx] ?? 0;
      counts[idx] = prev + 1;
    }
    const peak = counts.reduce((m, c) => (c > m ? c : m), 0) || 1;
    return counts.map((c) => c / peak);
  }, [obs]);

  if (bars.length === 0) {
    return <div className="channeldetail-state">Not enough detections to measure gaps.</div>;
  }

  const barW = 100 / bars.length;
  return (
    <svg
      className="channeldetail-hist"
      viewBox="0 0 100 30"
      height={40}
      preserveAspectRatio="none"
      role="img"
      aria-label="Burst spacing histogram"
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          className="channeldetail-hist-bar"
          x={i * barW + barW * 0.1}
          y={30 - h * 28 - 1}
          width={barW * 0.8}
          height={h * 28}
        />
      ))}
    </svg>
  );
}

function Metrics({ channel }: { channel: CandidateChannel }): JSX.Element {
  const metrics: Metric[] = [
    {
      label: 'Center frequency',
      value: `${hzToMHz(channel.center_hz).toFixed(4)} MHz`,
      hint: 'Estimated middle of the occupied region.',
    },
    {
      label: 'Occupied bandwidth',
      value: hzSpanToHuman(channel.bandwidth_hz),
      hint: 'How wide the energy spreads around the center.',
    },
    {
      label: 'Current power',
      value: formatDb(channel.current_power_db),
      hint: 'Most recent measured level in this region.',
    },
    {
      label: 'Peak power',
      value: formatDb(channel.peak_power_db),
      hint: 'Strongest level seen so far.',
    },
    {
      label: 'Average power',
      value: formatDb(channel.avg_power_db),
      hint: 'Mean level across all observations.',
    },
    {
      label: 'SNR',
      value: formatSnr(channel.snr_db),
      hint: 'How far above the noise floor it sits; higher is easier to detect.',
    },
    {
      label: 'Confidence',
      value: formatConfidence(channel.confidence),
      hint: 'Derived from recurrence, SNR, stability and repeat count (0–1).',
    },
    {
      label: 'Observations',
      value: String(channel.observation_count),
      hint: 'Number of separate detections attributed to this region.',
    },
    {
      label: 'First seen',
      value: formatIso(channel.first_seen),
      hint: 'When this region was first detected.',
    },
    {
      label: 'Last seen',
      value: formatIso(channel.last_seen),
      hint: 'Most recent detection in this region.',
    },
    {
      label: 'Typical burst',
      value: formatDuration(channel.typical_burst_ms),
      hint: 'Approximate on-air duration of each burst.',
    },
    {
      label: 'Recurrence interval',
      value: formatIntervalSeconds(channel.recurrence_interval_s),
      hint: 'Typical spacing between bursts, if a rhythm is apparent.',
    },
    {
      label: 'Status',
      value: channel.status.replace('_', ' '),
      hint: 'Whether the region is currently active, recently active, or idle.',
    },
  ];

  return (
    <div>
      {metrics.map((m) => (
        <div className="channeldetail-metric" key={m.label}>
          <div className="channeldetail-metric-top">
            <span className="channeldetail-metric-label">{m.label}</span>
            <span className="channeldetail-metric-value">{m.value}</span>
          </div>
          <p className="channeldetail-metric-hint">{m.hint}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Slide-out detail drawer for one candidate channel. Fetches recent
 * observations on mount to render a power sparkline and a burst-spacing
 * histogram. Framing is strictly receive-only: everything shown describes an
 * inferred occupied frequency region, never a confirmed device.
 */
export function ChannelDetail({ channel, onClose, onFocus }: ChannelDetailProps): JSX.Element {
  const [obs, setObs] = useState<Detection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getChannelObservations(channel.id, 300)
      .then((r) => {
        if (!cancelled) setObs(r.observations);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel.id]);

  // Reference window for the bandwidth bar: 4x the occupied width around center.
  const refSpan = Math.max(channel.bandwidth_hz * 4, channel.bandwidth_hz + 1);
  const blockPct = Math.min(100, (channel.bandwidth_hz / refSpan) * 100);
  const blockLeftPct = 50 - blockPct / 2;

  return (
    <div className="channeldetail-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="channeldetail"
        role="dialog"
        aria-modal="true"
        aria-label={`Channel #${channel.id} detail`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="channeldetail-header">
          <div className="channeldetail-title">
            Channel #{channel.id}
            <small>{hzToMHz(channel.center_hz).toFixed(4)} MHz</small>
          </div>
          <button className="channeldetail-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="channeldetail-body">
          <section className="channeldetail-section">
            <h3>What this is</h3>
            <p className="channeldetail-lede">
              An inferred occupied frequency region (a candidate channel), not a confirmed device.
              Everything below is measured passively from received energy.
            </p>
          </section>

          <section className="channeldetail-section">
            <h3>Key metrics</h3>
            <Metrics channel={channel} />
          </section>

          <section className="channeldetail-section">
            <h3>Power over time</h3>
            {loading && <div className="channeldetail-state">Loading observations…</div>}
            {error && (
              <div className="channeldetail-state channeldetail-state--error">{error}</div>
            )}
            {!loading && !error && obs && obs.length === 0 && (
              <div className="channeldetail-state">No observations recorded yet.</div>
            )}
            {!loading && !error && obs && obs.length > 0 && (
              <>
                <Sparkline obs={obs} />
                <p className="channeldetail-note">
                  Peak power per detection, oldest left to newest right.
                </p>
              </>
            )}
          </section>

          <section className="channeldetail-section">
            <h3>Burst spacing</h3>
            {loading && <div className="channeldetail-state">Loading observations…</div>}
            {!loading && !error && obs && (
              <>
                <GapHistogram obs={obs} />
                <p className="channeldetail-note">
                  Gaps between consecutive detections; tightly clustered gaps ≈ a regular cadence.
                </p>
              </>
            )}
          </section>

          <section className="channeldetail-section">
            <h3>Occupied bandwidth</h3>
            <div className="channeldetail-bwbar" aria-hidden="true">
              <div
                className="channeldetail-bwbar-block"
                style={{ left: `${blockLeftPct}%`, width: `${blockPct}%` }}
              />
              <div className="channeldetail-bwbar-center" />
            </div>
            <div className="channeldetail-bwbar-labels">
              <span>{hzToMHz(channel.center_hz).toFixed(4)} MHz</span>
              <span>{hzSpanToHuman(channel.bandwidth_hz)} wide</span>
            </div>
          </section>

          <section className="channeldetail-section channeldetail-actions">
            <button
              className="channeldetail-btn"
              onClick={() => onFocus?.(channel)}
              disabled={onFocus == null}
            >
              Open in Scope
            </button>
          </section>
        </div>
      </aside>
    </div>
  );
}
