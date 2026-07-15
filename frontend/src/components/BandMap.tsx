import { useEffect, useMemo, useRef, useState } from 'react';
import type { CandidateChannel, ChannelStatus } from '../lib/types';
import { formatConfidence, formatSnr, hzToMHz } from '../lib/format';
import { markersInRange, rangesInRange } from '../lib/referenceBands';
import './BandMap.css';

export interface BandMapProps {
  channels: CandidateChannel[];
  /** Low edge of the displayed band, exact integer Hz. */
  startHz: number;
  /** High edge of the displayed band, exact integer Hz. */
  endHz: number;
  onSelect?: (ch: CandidateChannel) => void;
  /** Total component height in px (includes the frequency axis). */
  height?: number;
}

const STATUS_LABELS: Record<ChannelStatus, string> = {
  active: 'Active',
  recently_active: 'Recently active',
  inactive: 'Inactive',
};

const AXIS_H = 18;
const MIN_MARKER_H = 4;
const MIN_MARKER_W = 2;
const FALLBACK_W = 960;

interface HoverState {
  ch: CandidateChannel;
  x: number;
}

/** Pick a "nice" MHz tick step so the axis shows roughly 5-12 labels. */
function niceStepHz(spanHz: number): number {
  const target = 5e6; // ~5 MHz as requested
  if (spanHz <= 0) return target;
  const steps = [5e6, 10e6, 20e6, 50e6, 100e6, 200e6, 500e6, 1000e6];
  for (const s of steps) {
    if (spanHz / s <= 12) return s;
  }
  return steps[steps.length - 1] ?? target;
}

/**
 * Horizontal band activity mini-map. Each candidate channel is drawn as a
 * vertical marker positioned by center frequency; marker height encodes
 * confidence, width encodes occupied bandwidth, and colour encodes status.
 * Purely presentational and receive-only — a marker is an inferred occupied
 * region, not a confirmed transmitter.
 */
export function BandMap({
  channels,
  startHz,
  endHz,
  onSelect,
  height = 64,
}: BandMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredW, setMeasuredW] = useState(0);
  const [hover, setHover] = useState<HoverState | null>(null);
  // Optional overlay of known 868-band reference channels / ETSI sub-bands.
  const [showReference, setShowReference] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (): void => setMeasuredW(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = measuredW > 0 ? measuredW : FALLBACK_W;
  const span = endHz - startHz > 0 ? endHz - startHz : 1;
  const drawH = Math.max(0, height - AXIS_H);
  const maxMarkerW = Math.max(6, w * 0.2);

  const ticks = useMemo(() => {
    const step = niceStepHz(span);
    const first = Math.ceil(startHz / step) * step;
    const out: number[] = [];
    for (let hz = first; hz <= endHz; hz += step) {
      out.push(hz);
      if (out.length > 64) break; // hard safety cap
    }
    return out;
  }, [startHz, endHz, span]);

  const refMarkers = useMemo(
    () => (showReference ? markersInRange(startHz, endHz) : []),
    [showReference, startHz, endHz],
  );
  const refRanges = useMemo(
    () => (showReference ? rangesInRange(startHz, endHz) : []),
    [showReference, startHz, endHz],
  );

  const clampX = (x: number): number => Math.min(w, Math.max(0, x));

  if (channels.length === 0) {
    return (
      <div className="bandmap" ref={containerRef} style={{ height }}>
        <div className="bandmap-empty" style={{ height }}>
          No channels yet
        </div>
      </div>
    );
  }

  const select = (ch: CandidateChannel): void => {
    onSelect?.(ch);
  };

  return (
    <div className="bandmap" ref={containerRef} style={{ height }}>
      <svg
        className="bandmap-svg"
        viewBox={`0 0 ${w} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="group"
        aria-label="Band activity map"
      >
        {/* Known 868-band reference overlay, drawn first so it sits beneath channels. */}
        {refRanges.length > 0 && (
          <g className="bandmap-ref-ranges" aria-hidden="true">
            {refRanges.map((r) => {
              const rx0 = clampX(((r.loHz - startHz) / span) * w);
              const rx1 = clampX(((r.hiHz - startHz) / span) * w);
              return (
                <rect
                  key={`${r.loHz}-${r.hiHz}`}
                  className="bandmap-ref-range"
                  x={rx0}
                  y={0}
                  width={Math.max(0, rx1 - rx0)}
                  height={drawH}
                >
                  <title>{`${r.label} — ${r.detail}`}</title>
                </rect>
              );
            })}
          </g>
        )}
        {refMarkers.length > 0 && (
          <g className="bandmap-ref-markers">
            {refMarkers.map((m, i) => {
              const rx = clampX(((m.freqHz - startHz) / span) * w);
              return (
                <g key={`${m.kind}-${m.freqHz}-${m.label}`}>
                  <title>{`${m.label} — ${m.detail}`}</title>
                  <line
                    className={`bandmap-ref-line bandmap-ref-line--${m.kind}`}
                    x1={rx}
                    y1={0}
                    x2={rx}
                    y2={drawH}
                  />
                  <text
                    className={`bandmap-ref-label bandmap-ref-label--${m.kind}`}
                    x={rx + 2}
                    y={7 + (i % 3) * 8}
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {channels.map((ch) => {
          const cx = clampX(((ch.center_hz - startHz) / span) * w);
          const bwFrac = ch.bandwidth_hz / span;
          const mw = Math.min(maxMarkerW, Math.max(MIN_MARKER_W, bwFrac * w));
          const conf = Number.isFinite(ch.confidence) ? Math.min(1, Math.max(0, ch.confidence)) : 0;
          const mh = MIN_MARKER_H + conf * Math.max(0, drawH - MIN_MARKER_H);
          const rectX = clampX(cx - mw / 2);
          const rectY = drawH - mh;
          const label = `Channel #${ch.id} at ${hzToMHz(ch.center_hz).toFixed(4)} MHz`;
          return (
            <rect
              key={ch.id}
              className={`bandmap-marker bandmap-marker--${ch.status}`}
              x={rectX}
              y={rectY}
              width={mw}
              height={mh}
              rx={1}
              role="button"
              tabIndex={0}
              aria-label={label}
              onMouseEnter={() => setHover({ ch, x: cx })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ ch, x: cx })}
              onBlur={() => setHover(null)}
              onClick={() => select(ch)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select(ch);
                }
              }}
            />
          );
        })}

        <line className="bandmap-axis-line" x1={0} y1={drawH} x2={w} y2={drawH} />
        {ticks.map((hz) => {
          const tx = clampX(((hz - startHz) / span) * w);
          return (
            <g key={hz}>
              <line className="bandmap-tick-line" x1={tx} y1={drawH} x2={tx} y2={drawH + 4} />
              <text className="bandmap-tick-label" x={tx} y={height - 4} textAnchor="middle">
                {hzToMHz(hz).toFixed(hz % 1e6 === 0 ? 0 : 1)}
              </text>
            </g>
          );
        })}
      </svg>

      <label
        className="bandmap-ref-toggle"
        title="Overlay known 868-band reference channels and ETSI sub-bands (reference only — alignment is a hint, not proof)"
      >
        <input
          type="checkbox"
          checked={showReference}
          onChange={(e) => setShowReference(e.target.checked)}
        />
        Ref
      </label>

      {hover && (
        <div
          className="bandmap-tooltip"
          style={{ left: clampX(hover.x) }}
          role="tooltip"
        >
          <div className="bandmap-tooltip-title">
            #{hover.ch.id} · {hzToMHz(hover.ch.center_hz).toFixed(4)} MHz
          </div>
          <div className="bandmap-tooltip-row">SNR {formatSnr(hover.ch.snr_db)}</div>
          <div className="bandmap-tooltip-row">
            Confidence {formatConfidence(hover.ch.confidence)}
          </div>
          <div className="bandmap-tooltip-row">{STATUS_LABELS[hover.ch.status]}</div>
        </div>
      )}
    </div>
  );
}
