import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { BandMap } from '../components/BandMap';
import { CadenceBar } from '../components/CadenceBar';
import { ChannelDetail } from '../components/ChannelDetail';
import { InfoTip } from '../components/InfoTip';
import { PatternBadge } from '../components/PatternBadge';
import { CompareChannels } from '../components/CompareChannels';
import { usePinnedChannels } from '../components/usePinnedChannels';
import { api, ApiError } from '../lib/api';
import type { CandidateChannel, Detection } from '../lib/types';
import {
  formatConfidence,
  formatDb,
  formatDuration,
  formatIso,
  formatRelative,
  formatSnr,
  hzSpanToHuman,
  hzToMHz,
} from '../lib/format';

type SortKey =
  | 'id'
  | 'center_hz'
  | 'bandwidth_hz'
  | 'current_power_db'
  | 'peak_power_db'
  | 'avg_power_db'
  | 'snr_db'
  | 'observation_count'
  | 'first_seen'
  | 'last_seen'
  | 'typical_burst_ms'
  | 'recurrence_interval_s'
  | 'confidence'
  | 'status';

interface ChannelFilters {
  freqLoMhz: string;
  freqHiMhz: string;
  minSnr: string;
  minConf: string;
  status: '' | 'active' | 'recently_active' | 'inactive';
}

const EMPTY_CHANNEL_FILTERS: ChannelFilters = {
  freqLoMhz: '',
  freqHiMhz: '',
  minSnr: '',
  minConf: '',
  status: '',
};

export function Channels(): JSX.Element {
  const channelMap = useStore((s) => s.channels);
  const isOperator = useStore((s) => s.isOperator());
  const config = useStore((s) => s.config);
  const navigate = useNavigate();

  const [sortKey, setSortKey] = useState<SortKey>('center_hz');
  const [asc, setAsc] = useState(true);
  const [obsFor, setObsFor] = useState<CandidateChannel | null>(null);
  const [detailFor, setDetailFor] = useState<CandidateChannel | null>(null);
  const [filters, setFilters] = useState<ChannelFilters>(EMPTY_CHANNEL_FILTERS);
  // Freeze the table so it stops reshuffling while you read/compare. When
  // frozen we display a snapshot taken at freeze time instead of the live map.
  const [frozen, setFrozen] = useState(false);
  const frozenSnapshot = useRef<CandidateChannel[]>([]);
  // Pin / watch + annotate (persisted in localStorage, no backend).
  const { pins, isPinned, getLabel, togglePin, setLabel } = usePinnedChannels();
  // Burst A/B compare: ids selected for comparison (max 2) + open state.
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);

  const source = frozen ? frozenSnapshot.current : Array.from(channelMap.values());
  const totalCount = source.length;
  const activeCount = source.filter((c) => c.status === 'active').length;
  const strongest = source.reduce<CandidateChannel | null>(
    (best, c) => (best == null || c.peak_power_db > best.peak_power_db ? c : best),
    null,
  );

  function toggleFreeze(): void {
    if (!frozen) {
      frozenSnapshot.current = Array.from(channelMap.values());
      setFrozen(true);
    } else {
      setFrozen(false);
    }
  }

  const channels = useMemo(() => {
    const lo = filters.freqLoMhz ? Number(filters.freqLoMhz) * 1e6 : null;
    const hi = filters.freqHiMhz ? Number(filters.freqHiMhz) * 1e6 : null;
    const minSnr = filters.minSnr ? Number(filters.minSnr) : null;
    const minConf = filters.minConf ? Number(filters.minConf) : null;
    const arr = source.filter((c) => {
      if (lo != null && c.center_hz < lo) return false;
      if (hi != null && c.center_hz > hi) return false;
      if (minSnr != null && Number.isFinite(minSnr) && c.snr_db < minSnr) return false;
      if (minConf != null && Number.isFinite(minConf) && c.confidence < minConf) return false;
      if (filters.status && c.status !== filters.status) return false;
      return true;
    });
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      // Null/undefined (e.g. burst duration, recurrence not yet known) sort last.
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = -1;
      else if (bv == null) cmp = 1;
      else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [source, filters, sortKey, asc]);

  // Pinned rows always float to the TOP, but each group (pinned / unpinned) still
  // honours the active column sort computed above.
  const orderedChannels = useMemo(() => {
    const pinnedRows: CandidateChannel[] = [];
    const rest: CandidateChannel[] = [];
    for (const c of channels) {
      if (pins[c.id]?.pinned === true) pinnedRows.push(c);
      else rest.push(c);
    }
    return [...pinnedRows, ...rest];
  }, [channels, pins]);

  function setFilter<K extends keyof ChannelFilters>(key: K, value: ChannelFilters[K]): void {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function toggleCompare(id: number): void {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  const compareChannels = compareIds
    .map((id) => source.find((c) => c.id === id))
    .filter((c): c is CandidateChannel => c != null);
  const canCompare = compareChannels.length === 2;

  // Normalize avg power to 0..1 across the current channels so similar values
  // read as similar-length bars — a block of similar channels stands out,
  // especially when the table is sorted by Avg.
  const avgRange = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const c of channels) {
      if (c.avg_power_db < min) min = c.avg_power_db;
      if (c.avg_power_db > max) max = c.avg_power_db;
    }
    return { min, max, span: max - min };
  }, [channels]);

  function avgNorm(db: number): number {
    if (!Number.isFinite(avgRange.span) || avgRange.span <= 0) return 0.5;
    return Math.min(1, Math.max(0, (db - avgRange.min) / avgRange.span));
  }

  function toggleSort(key: SortKey): void {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  function focus(ch: CandidateChannel): void {
    // Open the Scope page parked on this channel's center; Scope auto-focuses
    // via the ?center query param on mount.
    navigate(`/scope?center=${ch.center_hz}`);
  }

  const sortArrow = (key: SortKey): string => (key === sortKey ? (asc ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="page-header">
        <h1>Candidate channels</h1>
        <div className="row">
          <NoiseFloorIndicator />
          <button
            disabled={!canCompare}
            onClick={() => setComparing(true)}
            title={
              canCompare
                ? 'Compare the two selected channels side by side'
                : 'Select exactly two channels (checkboxes) to compare'
            }
          >
            Compare selected ({compareChannels.length}/2)
          </button>
          <button
            className={frozen ? 'danger' : ''}
            onClick={toggleFreeze}
            title="Freeze the table so it stops updating while you read/compare"
          >
            {frozen ? 'Frozen — resume' : 'Freeze'}
          </button>
          <a className="badge dim" href={api.exportUrl('csv', 'channels')} download>
            Export CSV
          </a>
          <a className="badge dim" href={api.exportUrl('json', 'channels')} download>
            Export JSON
          </a>
        </div>
      </div>

      <div className="row small faint" style={{ gap: 12, marginBottom: 12 }}>
        <span>
          <strong>{totalCount}</strong> channels
        </span>
        <span>
          <strong>{activeCount}</strong> active
        </span>
        <span>
          showing <strong>{channels.length}</strong> after filters
        </span>
        {strongest && (
          <span>
            strongest <strong>{hzToMHz(strongest.center_hz).toFixed(4)} MHz</strong> (
            {formatDb(strongest.peak_power_db)})
          </span>
        )}
        {frozen && <span className="danger-text">display frozen</span>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          Band activity
          <InfoTip text="Every candidate channel plotted by frequency across the scanned band. Marker height = confidence, width = occupied bandwidth, colour = status. Click a marker to open its details." />
        </h2>
        <BandMap
          channels={channels}
          startHz={config?.start_hz ?? 867_000_000}
          endHz={config?.end_hz ?? 870_000_000}
          onSelect={(ch) => setDetailFor(ch)}
        />
      </div>

      {!isOperator && (
        <div className="notice warn">
          You are not the control operator. Focus will be applied by the backend but may be
          overridden by the operator&apos;s scan configuration.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Filter</h2>
          <button onClick={() => setFilters(EMPTY_CHANNEL_FILTERS)}>Clear</button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Freq low (MHz)</label>
            <input
              value={filters.freqLoMhz}
              onChange={(e) => setFilter('freqLoMhz', e.target.value)}
              inputMode="decimal"
              placeholder="867"
            />
          </div>
          <div className="field">
            <label>Freq high (MHz)</label>
            <input
              value={filters.freqHiMhz}
              onChange={(e) => setFilter('freqHiMhz', e.target.value)}
              inputMode="decimal"
              placeholder="870"
            />
          </div>
          <div className="field">
            <label>Min SNR (dB)</label>
            <input
              value={filters.minSnr}
              onChange={(e) => setFilter('minSnr', e.target.value)}
              inputMode="decimal"
              placeholder="10"
            />
          </div>
          <div className="field">
            <label>Min confidence (0–1)</label>
            <input
              value={filters.minConf}
              onChange={(e) => setFilter('minConf', e.target.value)}
              inputMode="decimal"
              placeholder="0.5"
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value as ChannelFilters['status'])}
            >
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="recently_active">Recently active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="card empty">
          {totalCount === 0 ? 'No candidate channels detected yet.' : 'No channels match the filters.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>
                  Pin
                  <span onClick={(e) => e.stopPropagation()}>
                    <InfoTip text="Pin/watch a channel (★) to keep it at the top of the table and add a note. Use the checkbox to select up to two channels, then Compare selected. Pins and notes are saved in this browser only." />
                  </span>
                </th>
                <th className="num sortable" onClick={() => toggleSort('id')}>
                  ID{sortArrow('id')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('center_hz')}>
                  Center (MHz){sortArrow('center_hz')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('bandwidth_hz')}>
                  Bandwidth{sortArrow('bandwidth_hz')}
                  <span onClick={(e) => e.stopPropagation()}>
                    <InfoTip text="Estimated occupied bandwidth — how wide in frequency the signal spreads." />
                  </span>
                </th>
                <th className="num sortable" onClick={() => toggleSort('current_power_db')}>
                  Current{sortArrow('current_power_db')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('peak_power_db')}>
                  Peak{sortArrow('peak_power_db')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('avg_power_db')}>
                  Avg{sortArrow('avg_power_db')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('snr_db')}>
                  SNR{sortArrow('snr_db')}
                  <span onClick={(e) => e.stopPropagation()}>
                    <InfoTip text="Signal-to-noise ratio (dB): how far the signal rises above the noise floor. Higher = clearer/stronger." />
                  </span>
                </th>
                <th className="num sortable" onClick={() => toggleSort('observation_count')}>
                  Obs{sortArrow('observation_count')}
                </th>
                <th className="sortable" onClick={() => toggleSort('first_seen')}>
                  First seen{sortArrow('first_seen')}
                </th>
                <th className="sortable" onClick={() => toggleSort('last_seen')}>
                  Last seen{sortArrow('last_seen')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('typical_burst_ms')}>
                  Burst{sortArrow('typical_burst_ms')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('recurrence_interval_s')}>
                  Recurrence{sortArrow('recurrence_interval_s')}
                </th>
                <th className="num sortable" onClick={() => toggleSort('confidence')}>
                  Conf.{sortArrow('confidence')}
                  <span onClick={(e) => e.stopPropagation()}>
                    <InfoTip text="Confidence (0–1) that this is a real, recurring channel — combines recurrence regularity, SNR, stability and how many times it has been observed. Not a claim about which device it is." />
                  </span>
                </th>
                <th>
                  Pattern
                  <span onClick={(e) => e.stopPropagation()}>
                    <InfoTip text="Heuristic indicator of a periodic-narrowband transmission pattern, not a claim that it is a meter or any specific device." />
                  </span>
                </th>
                <th className="sortable" onClick={() => toggleSort('status')}>
                  Status{sortArrow('status')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderedChannels.map((ch) => {
                const pinned = isPinned(ch.id);
                const selected = compareIds.includes(ch.id);
                const label = getLabel(ch.id);
                return (
                <tr
                  key={ch.id}
                  style={
                    pinned
                      ? { background: 'rgba(56, 189, 248, 0.08)', boxShadow: 'inset 3px 0 0 var(--accent)' }
                      : undefined
                  }
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => togglePin(ch.id)}
                        aria-pressed={pinned}
                        title={pinned ? 'Unpin (stop watching)' : 'Pin / watch this channel'}
                        style={{
                          padding: '0 4px',
                          fontSize: '1rem',
                          lineHeight: 1,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: pinned ? 'var(--accent)' : 'var(--text-faint)',
                        }}
                      >
                        {pinned ? '★' : '☆'}
                      </button>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!selected && compareIds.length >= 2}
                        onChange={() => toggleCompare(ch.id)}
                        aria-label={`Select channel ${ch.id} to compare`}
                        title="Select to compare (max 2)"
                      />
                    </div>
                  </td>
                  <td className="num mono">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span>{ch.id}</span>
                      <input
                        value={label}
                        onChange={(e) => setLabel(ch.id, e.target.value)}
                        placeholder="label…"
                        aria-label={`Label for channel ${ch.id}`}
                        title="Add a note/label for this channel (saved in this browser)"
                        style={{
                          width: 84,
                          padding: '1px 4px',
                          fontSize: '0.72rem',
                          textAlign: 'right',
                          background: 'var(--bg-elev)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                  </td>
                  <td className="num mono">{hzToMHz(ch.center_hz).toFixed(4)}</td>
                  <td className="num">{hzSpanToHuman(ch.bandwidth_hz)}</td>
                  <td className="num">{formatDb(ch.current_power_db)}</td>
                  <td className="num">{formatDb(ch.peak_power_db)}</td>
                  <td className="num">
                    <div
                      className="heatcell"
                      title={`Normalized avg power: ${avgNorm(ch.avg_power_db).toFixed(2)} (0 = lowest, 1 = highest of listed channels)`}
                    >
                      <div
                        className="heatcell-bar"
                        style={{ width: `${(avgNorm(ch.avg_power_db) * 100).toFixed(0)}%` }}
                      />
                      <span className="heatcell-val">
                        {formatDb(ch.avg_power_db)}{' '}
                        <span className="faint">{avgNorm(ch.avg_power_db).toFixed(2)}</span>
                      </span>
                    </div>
                  </td>
                  <td className="num">{formatSnr(ch.snr_db)}</td>
                  <td className="num">{ch.observation_count}</td>
                  <td title={formatIso(ch.first_seen)}>{formatRelative(ch.first_seen)}</td>
                  <td title={formatIso(ch.last_seen)}>{formatRelative(ch.last_seen)}</td>
                  <td className="num">{formatDuration(ch.typical_burst_ms)}</td>
                  <td>
                    <CadenceBar
                      recurrenceIntervalS={ch.recurrence_interval_s}
                      observationCount={ch.observation_count}
                      typicalBurstMs={ch.typical_burst_ms}
                    />
                  </td>
                  <td className="num">
                    <div
                      className="heatcell"
                      title={`Confidence ${ch.confidence.toFixed(2)} (recurrence, SNR, stability)`}
                    >
                      <div
                        className="heatcell-bar conf"
                        style={{ width: `${(Math.min(1, Math.max(0, ch.confidence)) * 100).toFixed(0)}%` }}
                      />
                      <span className="heatcell-val">{formatConfidence(ch.confidence)}</span>
                    </div>
                  </td>
                  <td>
                    <PatternBadge channel={ch} />
                  </td>
                  <td>
                    <StatusBadge status={ch.status} />
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button onClick={() => setDetailFor(ch)}>Details</button>
                      <button onClick={() => focus(ch)}>Focus</button>
                      <button onClick={() => setObsFor(ch)}>History</button>
                      <a
                        className="badge dim"
                        href={api.exportUrl('csv', 'detections')}
                        download
                        title="Export related detections"
                      >
                        Export
                      </a>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {comparing && canCompare && compareChannels[0] && compareChannels[1] && (
        <CompareChannels
          a={compareChannels[0]}
          b={compareChannels[1]}
          onClose={() => setComparing(false)}
        />
      )}
      {obsFor && <ObservationsModal channel={obsFor} onClose={() => setObsFor(null)} />}
      {detailFor && (
        <ChannelDetail
          channel={detailFor}
          onClose={() => setDetailFor(null)}
          onFocus={(ch) => {
            setDetailFor(null);
            focus(ch);
          }}
        />
      )}
    </div>
  );
}

/** Live noise floor from the latest spectrum frame. Isolated in its own
 *  component so the (large) channels table does not re-render on every frame. */
function NoiseFloorIndicator(): JSX.Element {
  const noiseFloor = useStore((s) => s.spectrum?.noise_floor_db ?? null);
  return (
    <span className="badge dim mono" title="Live noise floor (latest spectrum frame)">
      Noise floor: {noiseFloor == null ? '—' : formatDb(noiseFloor)}
    </span>
  );
}

function ObservationsModal({
  channel,
  onClose,
}: {
  channel: CandidateChannel;
  onClose: () => void;
}): JSX.Element {
  const [obs, setObs] = useState<Detection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getChannelObservations(channel.id, 200)
      .then((r) => {
        if (!cancelled) setObs(r.observations);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channel.id]);

  return (
    <Modal
      title={`Channel #${channel.id} · ${hzToMHz(channel.center_hz).toFixed(4)} MHz observations`}
      onClose={onClose}
    >
      {loading && <div className="empty">Loading observations…</div>}
      {error && <div className="notice danger">{error}</div>}
      {obs && obs.length === 0 && <div className="empty">No observations recorded.</div>}
      {obs && obs.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th className="num">Center (MHz)</th>
                <th className="num">BW</th>
                <th className="num">Peak</th>
                <th className="num">Avg</th>
                <th className="num">SNR</th>
                <th className="num">Duration</th>
              </tr>
            </thead>
            <tbody>
              {obs.map((d) => (
                <tr key={d.id}>
                  <td title={formatIso(d.timestamp)}>{formatIso(d.timestamp)}</td>
                  <td className="num mono">{hzToMHz(d.center_hz).toFixed(4)}</td>
                  <td className="num">{hzSpanToHuman(d.bandwidth_hz)}</td>
                  <td className="num">{formatDb(d.peak_power_db)}</td>
                  <td className="num">{formatDb(d.avg_power_db)}</td>
                  <td className="num">{formatSnr(d.snr_db)}</td>
                  <td className="num">{formatDuration(d.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
