import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { hzToMHz } from '../lib/format';
import { buildSpectrumData } from '../lib/spectrum';
import {
  markersInRange,
  rangesInRange,
  type ReferenceMarker,
} from '../lib/referenceBands';

export interface ChannelMarker {
  id: number;
  centerHz: number;
  label: string;
}

export interface SpectrumChartProps {
  /** X axis frequencies in Hz (converted to MHz internally for the axis). */
  freqsHz: Float64Array | number[];
  /** Power in dB, same length as freqsHz. */
  powerDb: Float64Array | number[];
  noiseFloorDb?: number | null;
  /** Detected candidate channel markers. */
  markers?: ChannelMarker[];
  /** Current scan window [startHz, stopHz] to shade. */
  scanWindowHz?: [number, number] | null;
  height?: number;
}

export function SpectrumChart({
  freqsHz,
  powerDb,
  noiseFloorDb,
  markers = [],
  scanWindowHz,
  height = 320,
}: SpectrumChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  // Optional overlay of known 868-band reference channels / ETSI sub-bands.
  const [showReference, setShowReference] = useState(true);

  // Visible frequency range in exact Hz, derived from the data we already have.
  const refRangeHz = useMemo<[number, number] | null>(() => {
    if (freqsHz.length === 0) return null;
    const first = freqsHz[0] as number;
    const last = freqsHz[freqsHz.length - 1] as number;
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
    return [Math.min(first, last), Math.max(first, last)];
  }, [freqsHz]);

  // Keep the most recent inputs in refs so the draw hook reads live values.
  const markersRef = useRef<ChannelMarker[]>(markers);
  const noiseRef = useRef<number | null>(noiseFloorDb ?? null);
  const windowRef = useRef<[number, number] | null>(scanWindowHz ?? null);
  const showReferenceRef = useRef<boolean>(showReference);
  const refRangeRef = useRef<[number, number] | null>(refRangeHz);
  markersRef.current = markers;
  noiseRef.current = noiseFloorDb ?? null;
  windowRef.current = scanWindowHz ?? null;
  showReferenceRef.current = showReference;
  refRangeRef.current = refRangeHz;

  const data = useMemo(() => buildSpectrumData(freqsHz, powerDb), [freqsHz, powerDb]);

  // Create the plot once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const opts: uPlot.Options = {
      width: el.clientWidth || 640,
      height,
      class: 'uplot',
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: false } },
      legend: { show: true },
      series: [
        { label: 'Freq (MHz)', value: (_u, v) => (v == null ? '—' : `${v.toFixed(4)} MHz`) },
        {
          label: 'Power (dB)',
          stroke: '#38bdf8',
          width: 1,
          fill: 'rgba(56,189,248,0.10)',
          value: (_u, v) => (v == null ? '—' : `${v.toFixed(1)} dB`),
        },
      ],
      axes: [
        {
          stroke: '#9fb0c8',
          grid: { stroke: 'rgba(255,255,255,0.06)' },
          ticks: { stroke: 'rgba(255,255,255,0.12)' },
          values: (_u, splits) => splits.map((s) => `${s.toFixed(3)}`),
        },
        {
          stroke: '#9fb0c8',
          grid: { stroke: 'rgba(255,255,255,0.06)' },
          ticks: { stroke: 'rgba(255,255,255,0.12)' },
        },
      ],
      hooks: {
        draw: [
          (u) => {
            drawOverlays(
              u,
              markersRef.current,
              noiseRef.current,
              windowRef.current,
              showReferenceRef.current ? refRangeRef.current : null,
            );
          },
        ],
      },
    };

    const plot = new uPlot(opts, data, el);
    plotRef.current = plot;

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) plot.setSize({ width: el.clientWidth, height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // Intentionally create the plot only once; data updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Feed new data to the existing plot.
  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data]);

  // Redraw when the reference overlay is toggled (draw hook reads the ref).
  useEffect(() => {
    plotRef.current?.redraw();
  }, [showReference, refRangeHz]);

  return (
    <div style={{ width: '100%' }}>
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          margin: '0 0 6px',
          fontSize: 11,
          color: '#9fb0c8',
          fontFamily: 'ui-monospace, monospace',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        title="Overlay known 868-band reference channels and ETSI sub-bands (reference only — alignment is a hint, not proof)"
      >
        <input
          type="checkbox"
          checked={showReference}
          onChange={(e) => setShowReference(e.target.checked)}
        />
        868 references
      </label>
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
}

/** Stroke/fill colours for a reference marker, keyed by protocol group. */
function referenceColour(kind: ReferenceMarker['kind']): string {
  switch (kind) {
    case 'wmbus':
      return 'rgba(251,191,36,0.55)'; // amber
    case 'lora':
      return 'rgba(56,189,248,0.55)'; // cyan
    default:
      return 'rgba(148,163,184,0.5)'; // slate/grey
  }
}

function drawOverlays(
  u: uPlot,
  markers: ChannelMarker[],
  noiseFloorDb: number | null,
  windowHz: [number, number] | null,
  referenceRangeHz: [number, number] | null,
): void {
  const { ctx } = u;
  const { left, top, width, height } = u.bbox;
  ctx.save();

  // Shade the active scan window.
  if (windowHz) {
    const x0 = u.valToPos(hzToMHz(windowHz[0]), 'x', true);
    const x1 = u.valToPos(hzToMHz(windowHz[1]), 'x', true);
    ctx.fillStyle = 'rgba(244,114,182,0.10)';
    ctx.fillRect(Math.min(x0, x1), top, Math.abs(x1 - x0), height);
  }

  // Known-band reference overlay, drawn beneath candidate markers.
  if (referenceRangeHz) {
    drawReferenceOverlay(u, referenceRangeHz[0], referenceRangeHz[1]);
  }

  // Noise-floor reference line.
  if (noiseFloorDb != null && Number.isFinite(noiseFloorDb)) {
    const y = u.valToPos(noiseFloorDb, 'y', true);
    if (y >= top && y <= top + height) {
      ctx.strokeStyle = 'rgba(251,191,36,0.7)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Candidate channel markers (vertical lines + labels).
  ctx.font = '10px ui-monospace, monospace';
  for (const m of markers) {
    const x = u.valToPos(hzToMHz(m.centerHz), 'x', true);
    if (x < left || x > left + width) continue;
    ctx.strokeStyle = 'rgba(52,211,153,0.75)';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();
    ctx.fillStyle = '#34d399';
    ctx.fillText(m.label, x + 3, top + 12);
  }

  ctx.restore();
}

/**
 * Draw the known 868-band reference overlay: faint ETSI sub-band spans plus
 * vertical protocol-channel centres with terse labels. Positions map through
 * the chart's own x scale (MHz), so it tracks zoom/pan.
 */
function drawReferenceOverlay(u: uPlot, startHz: number, endHz: number): void {
  const { ctx } = u;
  const { left, top, width, height } = u.bbox;
  const right = left + width;
  const bottom = top + height;

  ctx.save();

  // Faint shaded ETSI sub-band spans.
  for (const r of rangesInRange(startHz, endHz)) {
    const xa = u.valToPos(hzToMHz(r.loHz), 'x', true);
    const xb = u.valToPos(hzToMHz(r.hiHz), 'x', true);
    const x0 = Math.max(left, Math.min(xa, xb));
    const x1 = Math.min(right, Math.max(xa, xb));
    if (x1 <= x0) continue;
    ctx.fillStyle = 'rgba(148,163,184,0.06)';
    ctx.fillRect(x0, top, x1 - x0, height);
    ctx.fillStyle = 'rgba(148,163,184,0.55)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(r.label, x0 + 3, bottom - 4);
  }

  // Vertical protocol-channel centres, coloured by kind, with a terse label.
  const refMarkers = markersInRange(startHz, endHz);
  ctx.font = '10px ui-monospace, monospace';
  ctx.setLineDash([3, 3]);
  refMarkers.forEach((m, i) => {
    const x = u.valToPos(hzToMHz(m.freqHz), 'x', true);
    if (x < left || x > right) return;
    const colour = referenceColour(m.kind);
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillStyle = colour;
    // Stagger labels down a few rows so neighbours/duplicates stay legible,
    // and below the candidate-marker labels (which sit at top + 12).
    ctx.fillText(m.label, x + 3, top + 26 + (i % 3) * 11);
  });
  ctx.setLineDash([]);

  ctx.restore();
}
