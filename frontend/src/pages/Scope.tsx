import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/store';
import { api, ApiError } from '../lib/api';
import { ScopeSpectrogram } from '../components/ScopeSpectrogram';
import { AmplitudeStrip } from '../components/AmplitudeStrip';
import { ColorLegend } from '../components/ColorLegend';
import { InfoTip } from '../components/InfoTip';
import { CadenceBar } from '../components/CadenceBar';
import { StatusBadge } from '../components/StatusBadge';
import type { CandidateChannel } from '../lib/types';
import {
  formatConfidence,
  formatDb,
  formatIntervalSeconds,
  formatRelative,
  formatSampleRate,
  formatSnr,
  hzSpanToHuman,
  hzToMHz,
  mhzToHz,
} from '../lib/format';

const DEFAULT_CENTER_HZ = 433_920_000; // mid ISM 433 band fallback.

function bandMidpointHz(startHz?: number, endHz?: number): number {
  if (startHz != null && endHz != null && endHz > startHz) {
    return Math.round((startHz + endHz) / 2);
  }
  return DEFAULT_CENTER_HZ;
}

export function Scope(): JSX.Element {
  const mode = useStore((s) => s.mode);
  const focusCenterHz = useStore((s) => s.focusCenterHz);
  const config = useStore((s) => s.config);
  // Low-frequency selector: this string only changes when the focus window
  // changes, so the page does NOT re-render on every ~20/s scope frame.
  const windowKey = useStore((s) =>
    s.scope ? `${s.scope.f_start_hz}|${s.scope.f_stop_hz}|${s.scope.bin_count}` : null,
  );

  const [searchParams] = useSearchParams();
  const [centerMhz, setCenterMhz] = useState<string>('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<boolean>(false);
  const didAutoFocus = useRef(false);

  // Prefill the input from the current focus, band midpoint, or default.
  useEffect(() => {
    if (centerMhz !== '') return;
    const hz = focusCenterHz ?? bandMidpointHz(config?.start_hz, config?.end_hz);
    setCenterMhz(hzToMHz(hz).toFixed(4));
    // Only seed once when empty; user edits take precedence afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCenterHz, config]);

  const startFocus = useCallback(async (centerHz: number): Promise<void> => {
    setActionErr(false);
    setActionMsg(null);
    try {
      await api.focus(centerHz);
      // Optimistically flip to focus mode so the UI reacts immediately; the
      // periodic server status tick then confirms/corrects it.
      useStore.getState().setMode('focus', centerHz);
      setActionMsg(`Focusing on ${hzToMHz(centerHz).toFixed(4)} MHz…`);
    } catch (err) {
      setActionErr(true);
      setActionMsg(err instanceof ApiError ? err.message : String(err));
    }
  }, []);

  // Auto-focus when navigated from the Channels page with ?center=<hz>.
  useEffect(() => {
    if (didAutoFocus.current) return;
    const raw = searchParams.get('center');
    if (raw == null) return;
    const hz = Number(raw);
    if (!Number.isFinite(hz) || hz <= 0) return;
    didAutoFocus.current = true;
    setCenterMhz(hzToMHz(hz).toFixed(4));
    void startFocus(Math.round(hz));
  }, [searchParams, startFocus]);

  function onStartClick(): void {
    const mhz = Number(centerMhz);
    if (!Number.isFinite(mhz) || mhz <= 0) {
      setActionErr(true);
      setActionMsg('Enter a valid center frequency in MHz.');
      return;
    }
    void startFocus(mhzToHz(mhz));
  }

  async function onBackToSweep(): Promise<void> {
    setActionErr(false);
    setActionMsg(null);
    try {
      await api.resumeSweep();
      useStore.getState().setMode('sweep', null); // optimistic; status confirms
      setActionMsg('Resumed normal sweeping.');
    } catch (err) {
      setActionErr(true);
      setActionMsg(err instanceof ApiError ? err.message : String(err));
    }
  }

  const inFocus = mode === 'focus';

  // Read exact window edges for axis labels only when the window changes
  // (windowKey drives the re-render; the actual numbers come from the store).
  const axis = useMemo(() => {
    if (windowKey == null) return null;
    const frame = useStore.getState().scope;
    if (!frame) return null;
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i += 1) {
      ticks.push(frame.f_start_hz + ((frame.f_stop_hz - frame.f_start_hz) * i) / 4);
    }
    return {
      startHz: frame.f_start_hz,
      stopHz: frame.f_stop_hz,
      binCount: frame.bin_count,
      sampleRate: frame.sample_rate,
      noiseFloorDb: frame.noise_floor_db,
      envDtUs: frame.env_dt_us,
      envLen: frame.envelope.length,
      ticks,
    };
  }, [windowKey]);

  const dwellMs = axis != null ? (axis.envLen * axis.envDtUs) / 1000 : null;

  // Nearest candidate channel to the focused centre (within the window), and a
  // 1 s tick so the "next expected" countdown stays live.
  const channels = useStore((s) => s.channels);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const focusChannel = useMemo<CandidateChannel | null>(() => {
    if (focusCenterHz == null) return null;
    const tol = (config?.sample_rate ?? 2_400_000) / 2;
    const near = Array.from(channels.values()).filter(
      (c) => Math.abs(c.center_hz - focusCenterHz) <= tol,
    );
    if (near.length === 0) return null;
    // Prefer the most recently-seen channel near the parked centre: drift often
    // spawns near-duplicate candidates, and we want the ACTIVE one (so the
    // countdown resets on each burst), not a stale sibling. Tiebreak on proximity.
    near.sort((a, b) => {
      const t = b.last_seen.localeCompare(a.last_seen);
      if (t !== 0) return t;
      return Math.abs(a.center_hz - focusCenterHz) - Math.abs(b.center_hz - focusCenterHz);
    });
    return near[0] ?? null;
  }, [channels, focusCenterHz, config]);

  const nextExpected = ((): { text: string; tone?: 'ok' | 'warn' } => {
    const ch = focusChannel;
    if (ch == null || ch.recurrence_interval_s == null) return { text: '—' };
    const last = new Date(ch.last_seen).getTime();
    if (Number.isNaN(last)) return { text: '—' };
    const intervalMs = ch.recurrence_interval_s * 1000;
    const deltaS = Math.round((last + intervalMs - nowMs) / 1000);
    if (deltaS >= 0) return { text: `in ~${deltaS}s`, tone: 'ok' };
    // Overdue. If it has been silent for well beyond the expected interval, say
    // so plainly instead of an ever-growing "overdue by" counter.
    const silentS = Math.round((nowMs - last) / 1000);
    if (nowMs - last > Math.max(60_000, 3 * intervalMs)) {
      return {
        text: `silent ${silentS}s (expected ~${Math.round(ch.recurrence_interval_s)}s)`,
        tone: 'warn',
      };
    }
    return { text: `overdue by ${-deltaS}s`, tone: 'warn' };
  })();

  return (
    <div>
      <div className="page-header">
        <h1>Signal scope</h1>
        <div className="row">
          <span className={`badge ${inFocus ? 'ok' : 'dim'}`}>
            {inFocus ? 'Focus mode' : 'Sweep mode'}
          </span>
          {focusCenterHz != null && (
            <span className="badge dim mono">{hzToMHz(focusCenterHz).toFixed(4)} MHz</span>
          )}
        </div>
      </div>

      <div className="notice info">
        Receive-only. The scope visualizes received IQ from a single parked window; it never
        transmits, and any payloads are treated as opaque and are not decoded.
      </div>

      <div className="card scope-controls">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="scope-center">Focus center (MHz)</label>
          <input
            id="scope-center"
            className="mono"
            inputMode="decimal"
            value={centerMhz}
            onChange={(e) => setCenterMhz(e.target.value)}
            placeholder="433.9200"
            style={{ width: 160 }}
          />
        </div>
        <div className="row">
          <button className="primary" onClick={onStartClick}>
            {inFocus ? 'Re-tune scope' : 'Start scope (focus)'}
          </button>
          {inFocus && (
            <button className="danger" onClick={() => void onBackToSweep()}>
              Stop scope
            </button>
          )}
        </div>
      </div>

      {actionMsg && <div className={`notice ${actionErr ? 'danger' : 'info'}`}>{actionMsg}</div>}

      {inFocus && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            Focus details
            <InfoTip text="Details for the candidate channel nearest the parked centre. 'Next expected' is estimated from the observed recurrence interval and last-seen time — a cadence estimate, not a guarantee, and not a device identification." />
          </h2>
          {focusChannel ? (
            <div className="row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Detail
                label="Parked centre"
                value={`${hzToMHz(focusCenterHz ?? 0).toFixed(4)} MHz`}
              />
              <Detail
                label="Matched channel"
                value={`#${focusChannel.id} · ${hzToMHz(focusChannel.center_hz).toFixed(4)} MHz`}
              />
              <Detail label="Bandwidth" value={hzSpanToHuman(focusChannel.bandwidth_hz)} />
              <Detail label="SNR" value={formatSnr(focusChannel.snr_db)} />
              <Detail label="Confidence" value={formatConfidence(focusChannel.confidence)} />
              <Detail label="Observations" value={String(focusChannel.observation_count)} />
              <Detail
                label="Recurrence"
                value={formatIntervalSeconds(focusChannel.recurrence_interval_s)}
              />
              <Detail label="Last seen" value={formatRelative(focusChannel.last_seen)} />
              <Detail label="Next expected" value={nextExpected.text} tone={nextExpected.tone} />
              <div className="col" style={{ gap: 2 }}>
                <span className="small faint">Status</span>
                <StatusBadge status={focusChannel.status} />
              </div>
              <div className="col" style={{ gap: 2 }}>
                <span className="small faint">Cadence</span>
                <CadenceBar
                  recurrenceIntervalS={focusChannel.recurrence_interval_s}
                  observationCount={focusChannel.observation_count}
                  typicalBurstMs={focusChannel.typical_burst_ms}
                />
              </div>
            </div>
          ) : (
            <div className="empty">
              No candidate channel detected at this centre yet. The scope still shows live IQ; let
              the sweep run to build up detections, then re-open this focus.
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="chart-toolbar">
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            Spectrogram
            <InfoTip text="Fine spectrogram of the parked window. Time flows left→right (newest on the right); frequency is vertical (high at top); colour = power. OOK/pulse bursts show as short horizontal dashes." />
          </h2>
          <div className="spacer" style={{ flex: 1 }} />
          {inFocus && axis && (
            <span className="small faint mono">
              {hzToMHz(axis.startHz).toFixed(3)} – {hzToMHz(axis.stopHz).toFixed(3)} MHz ·{' '}
              {axis.binCount} bins · {formatSampleRate(axis.sampleRate)} · noise{' '}
              {formatDb(axis.noiseFloorDb)}
            </span>
          )}
        </div>

        {inFocus ? (
          <>
            <div className="scope-view" style={{ height: 360 }}>
              {axis && (
                // Reserve the same ~20px the spectrogram uses for its bottom time
                // axis so these frequency ticks stay aligned with the canvas.
                <div className="scope-yaxis mono" style={{ paddingBottom: 20 }}>
                  {[...axis.ticks].reverse().map((hz, i) => (
                    <span key={i}>{hzToMHz(hz).toFixed(3)}</span>
                  ))}
                </div>
              )}
              <div className="scope-canvas-col">
                <ScopeSpectrogram key={windowKey ?? 'pending'} height={360} rows={512} spanDb={60} />
              </div>
            </div>
            {!axis && <div className="hint">Waiting for the first scope frame…</div>}
            {axis && (
              <div style={{ marginTop: 8, marginLeft: 70, maxWidth: 320 }}>
                <ColorLegend
                  minDb={axis.noiseFloorDb}
                  maxDb={axis.noiseFloorDb + 60}
                  label="Power (dB)"
                />
              </div>
            )}
            <div className="hint">
              Time runs left → right (newest on the right); frequency (MHz) is on the vertical axis,
              high at the top. Scroll to zoom the time axis, drag to pan through history,
              double-click to reset. Hover for a frequency/time/level readout.
            </div>
          </>
        ) : (
          <div className="empty">
            Focus a frequency to start the scope. Enter a center above and press{' '}
            <strong>Start scope (focus)</strong>, or use the Focus action on the Channels page.
          </div>
        )}
      </div>

      {inFocus && (
        <div className="card">
          <div className="chart-toolbar">
            <h2 style={{ margin: 0 }}>Amplitude vs time</h2>
            <div className="spacer" style={{ flex: 1 }} />
            {dwellMs != null && (
              <span className="small faint mono">dwell ≈ {dwellMs.toFixed(2)} ms</span>
            )}
          </div>
          <AmplitudeStrip height={140} />
          <div className="hint">
            Envelope (|IQ| in dB) of the latest dwell. Time spans 0 – {dwellMs?.toFixed(2) ?? '—'} ms
            left to right.
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | undefined;
}): JSX.Element {
  const color = tone === 'warn' ? 'var(--warn, #f59e0b)' : tone === 'ok' ? 'var(--ok, #4ade80)' : undefined;
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="small faint">{label}</span>
      <span className="mono" style={color != null ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}
