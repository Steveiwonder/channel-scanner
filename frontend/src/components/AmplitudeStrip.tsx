import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';

export interface AmplitudeStripProps {
  /** Canvas CSS height in px. */
  height?: number;
}

const CSS_VARS = {
  line: '#38bdf8',
  fill: 'rgba(56,189,248,0.12)',
  grid: 'rgba(255,255,255,0.06)',
  bg: '#05070d',
};

/**
 * Amplitude-vs-time strip: plots the latest scope frame's `envelope` (dB) against
 * dwell time (derived from env_dt_us). Drawn imperatively on a canvas inside a
 * requestAnimationFrame loop reading the store directly — no per-frame React
 * re-render. Only redraws when a new frame (by seq) arrives or on resize.
 */
export function AmplitudeStrip({ height = 130 }: AmplitudeStripProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let drawnSeq: number | null = null;

    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const frame = useStore.getState().scope;
      const cssW = canvas.clientWidth || 640;
      const dpr = window.devicePixelRatio || 1;
      const wantW = Math.round(cssW * dpr);
      const wantH = Math.round(height * dpr);
      const resized = canvas.width !== wantW || canvas.height !== wantH;
      if (resized) {
        canvas.width = wantW;
        canvas.height = wantH;
      }
      if (!frame || frame.envelope.length === 0) {
        if (resized) {
          ctx.fillStyle = CSS_VARS.bg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      if (frame.seq === drawnSeq && !resized) return;
      drawnSeq = frame.seq;

      const w = canvas.width;
      const h = canvas.height;
      const pad = 4 * dpr;

      ctx.fillStyle = CSS_VARS.bg;
      ctx.fillRect(0, 0, w, h);

      const env = frame.envelope;
      const n = env.length;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < n; i += 1) {
        const v = env[i];
        if (v == null || !Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return;
      if (max - min < 1) {
        max += 0.5;
        min -= 0.5;
      }
      const range = max - min;

      // Horizontal grid lines.
      ctx.strokeStyle = CSS_VARS.grid;
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g += 1) {
        const y = pad + ((h - 2 * pad) * g) / 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const xAt = (i: number): number => (n <= 1 ? 0 : (i / (n - 1)) * w);
      const yAt = (v: number): number => pad + (h - 2 * pad) * (1 - (v - min) / range);

      // Filled area under the trace.
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < n; i += 1) {
        const v = env[i];
        if (v == null || !Number.isFinite(v)) continue;
        ctx.lineTo(xAt(i), yAt(v));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = CSS_VARS.fill;
      ctx.fill();

      // Trace line.
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i += 1) {
        const v = env[i];
        if (v == null || !Number.isFinite(v)) continue;
        const x = xAt(i);
        const y = yAt(v);
        if (started) ctx.lineTo(x, y);
        else {
          ctx.moveTo(x, y);
          started = true;
        }
      }
      ctx.strokeStyle = CSS_VARS.line;
      ctx.lineWidth = 1.25 * dpr;
      ctx.stroke();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [height]);

  return (
    <div className="amplitude-strip" style={{ height }}>
      <canvas ref={canvasRef} style={{ height, width: '100%' }} aria-label="Amplitude versus time" />
    </div>
  );
}
