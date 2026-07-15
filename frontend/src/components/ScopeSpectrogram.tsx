import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dbToColor } from '../lib/colormap';
import { hzToMHz } from '../lib/format';
import type { ScopeFrame } from '../lib/types';

export interface ScopeSpectrogramProps {
  /** Number of time rows kept in the scrolling history. */
  rows?: number;
  /** Canvas CSS height in px (also the number of pixel rows). */
  height?: number;
  /** dB span above the noise floor mapped across the colormap. */
  spanDb?: number;
}

interface HoverReadout {
  xFrac: number;
  freqHz: number;
  db: number | null;
}

/**
 * High-resolution scrolling spectrogram for the parked focus window.
 *
 * Hot path: this component NEVER re-renders React per frame. It reads the latest
 * scope frame directly from the store inside a requestAnimationFrame loop and
 * draws imperatively to the canvas, coalescing bursts to at most one row per
 * animation frame (stale frames are dropped). Only the (user-driven) hover
 * readout uses React state.
 */
export function ScopeSpectrogram({
  rows = 512,
  height = 320,
  spanDb = 60,
}: ScopeSpectrogramProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestFrameRef = useRef<ScopeFrame | null>(null);
  const [hover, setHover] = useState<HoverReadout | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    canvas.height = rows;

    let raf = 0;
    let drawnSeq: number | null = null;

    const render = (): void => {
      raf = requestAnimationFrame(render);
      const frame = useStore.getState().scope;
      latestFrameRef.current = frame;
      if (!frame || frame.seq === drawnSeq || frame.power_db.length === 0) return;
      drawnSeq = frame.seq;

      const w = frame.power_db.length;
      if (canvas.width !== w) canvas.width = w;
      const h = canvas.height;

      // Scroll existing content down by one row.
      ctx.drawImage(canvas, 0, 0, w, h - 1, 0, 1, w, h - 1);

      // Autoscale color range from the reported noise floor.
      const minDb = frame.noise_floor_db;
      const maxDb = frame.noise_floor_db + spanDb;

      const row = ctx.createImageData(w, 1);
      const data = row.data;
      const power = frame.power_db;
      for (let i = 0; i < w; i += 1) {
        const [r, g, b] = dbToColor(power[i] ?? minDb, minDb, maxDb);
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
      ctx.putImageData(row, 0, 0);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [rows, spanDb]);

  function onMove(ev: React.MouseEvent<HTMLCanvasElement>): void {
    const frame = latestFrameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const xFrac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const freqHz = frame.f_start_hz + xFrac * (frame.f_stop_hz - frame.f_start_hz);
    const bin = Math.min(frame.power_db.length - 1, Math.floor(xFrac * frame.power_db.length));
    const db = frame.power_db[bin] ?? null;
    setHover({ xFrac, freqHz, db });
  }

  return (
    <div
      className="scope-spectrogram"
      style={{ height }}
      onMouseLeave={() => setHover(null)}
    >
      <canvas
        ref={canvasRef}
        height={rows}
        style={{ height }}
        aria-label="Focus scope spectrogram"
        onMouseMove={onMove}
      />
      {hover && (
        <div
          className="scope-hover"
          style={{ left: `${(hover.xFrac * 100).toFixed(2)}%` }}
        >
          <span className="mono">{hzToMHz(hover.freqHz).toFixed(4)} MHz</span>
          <span className="mono faint">
            {hover.db == null ? '—' : `${hover.db.toFixed(1)} dB`}
          </span>
        </div>
      )}
    </div>
  );
}
