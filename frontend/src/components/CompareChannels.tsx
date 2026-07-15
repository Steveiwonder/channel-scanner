import { Modal } from './Modal';
import { PatternBadge } from './PatternBadge';
import type { CandidateChannel } from '../lib/types';
import { channelSimilarity } from '../lib/channelSimilarity';
import {
  formatConfidence,
  formatDb,
  formatDuration,
  formatIntervalSeconds,
  formatSnr,
  hzSpanToHuman,
  hzToMHz,
} from '../lib/format';
import './CompareChannels.css';

export interface CompareChannelsProps {
  a: CandidateChannel;
  b: CandidateChannel;
  onClose: () => void;
}

interface Row {
  label: string;
  a: string;
  b: string;
}

/**
 * Side-by-side A/B comparison of two candidate channels. Shows their physical
 * characteristics plus a similarity read-out. Framed as comparing measured
 * characteristics, NOT proving the two channels are the same device.
 */
export function CompareChannels({ a, b, onClose }: CompareChannelsProps): JSX.Element {
  const rows: Row[] = [
    { label: 'Center frequency', a: `${hzToMHz(a.center_hz).toFixed(4)} MHz`, b: `${hzToMHz(b.center_hz).toFixed(4)} MHz` },
    { label: 'Occupied bandwidth', a: hzSpanToHuman(a.bandwidth_hz), b: hzSpanToHuman(b.bandwidth_hz) },
    { label: 'Current power', a: formatDb(a.current_power_db), b: formatDb(b.current_power_db) },
    { label: 'Peak power', a: formatDb(a.peak_power_db), b: formatDb(b.peak_power_db) },
    { label: 'Average power', a: formatDb(a.avg_power_db), b: formatDb(b.avg_power_db) },
    { label: 'SNR', a: formatSnr(a.snr_db), b: formatSnr(b.snr_db) },
    { label: 'Typical burst', a: formatDuration(a.typical_burst_ms), b: formatDuration(b.typical_burst_ms) },
    { label: 'Recurrence interval', a: formatIntervalSeconds(a.recurrence_interval_s), b: formatIntervalSeconds(b.recurrence_interval_s) },
    { label: 'Confidence', a: formatConfidence(a.confidence), b: formatConfidence(b.confidence) },
    { label: 'Observations', a: String(a.observation_count), b: String(b.observation_count) },
  ];

  const sim = channelSimilarity(a, b);
  const simPct = Math.round(sim.score * 100);

  return (
    <Modal title="Compare channels A / B" onClose={onClose}>
      <p className="compare-lede">
        Comparing measured physical characteristics of two candidate channels. A high
        similarity is a clue, not proof, that the two share an emitter.
      </p>

      <div className="table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Characteristic</th>
              <th className="num">A · #{a.id}</th>
              <th className="num">B · #{b.id}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num mono">{r.a}</td>
                <td className="num mono">{r.b}</td>
              </tr>
            ))}
            <tr>
              <td>Pattern</td>
              <td className="num">
                <PatternBadge channel={a} />
              </td>
              <td className="num">
                <PatternBadge channel={b} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="compare-similarity">
        <div className="compare-similarity-head">
          <span>Similarity</span>
          <span className="compare-similarity-score mono">{simPct}%</span>
        </div>
        <div className="compare-similarity-bar" aria-hidden="true">
          <div className="compare-similarity-fill" style={{ width: `${simPct}%` }} />
        </div>
        <p className="compare-similarity-verdict">{sim.verdict}</p>
        <p className="compare-note">
          Based on bandwidth, burst duration, recurrence interval and SNR — center frequency
          is intentionally ignored. This compares characteristics; it does not identify a device.
        </p>
      </div>
    </Modal>
  );
}
