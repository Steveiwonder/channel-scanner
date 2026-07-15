/* Pure view/time helpers are exported from this file (for unit tests) alongside
   the component, which trips the HMR-only react-refresh rule; the helpers can't
   move to another module under this change's file scope. */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dbToColor } from '../lib/colormap';
import { hzToMHz } from '../lib/format';
import './ScopeSpectrogram.css';

export interface ScopeSpectrogramProps {
  /** Initial number of time columns shown (initial zoom level). */
  rows?: number;
  /** Canvas CSS height in px. */
  height?: number;
  /** dB span above the noise floor mapped across the colormap. */
  spanDb?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing).
// ---------------------------------------------------------------------------

/** Minimum number of columns the view can be zoomed into. */
export const MIN_VISIBLE_COLUMNS = 32;
/** Rolling history capacity, in columns. Fixed per mount. */
export const HISTORY_CAPACITY = 4096;
/** Fixed backing-store width of the canvas (output x-pixels). */
export const OUTPUT_WIDTH = 1024;

export interface ViewRange {
  /** Absolute index of the leftmost (oldest) visible column. */
  startAbs: number;
  /** Absolute index of the rightmost (newest) visible column. */
  endAbs: number;
  /** Number of visible columns (endAbs - startAbs + 1). */
  span: number;
}

export interface ClampViewParams {
  /** Total columns ever pushed (monotonic). */
  totalPushed: number;
  /** Columns currently retained in the ring buffer. */
  count: number;
  /** Desired visible span (columns). */
  span: number;
  /** Desired rightmost absolute index when not following. */
  anchorAbs: number;
  /** When true, pin the right edge to the newest column. */
  follow: boolean;
}

/**
 * Resolve a requested view (span + anchor) to a valid, clamped absolute range
 * that fits inside the retained history [totalPushed-count, totalPushed-1].
 * Pure and deterministic.
 */
export function clampView(params: ClampViewParams): ViewRange {
  const { totalPushed, count, follow } = params;
  if (count <= 0) return { startAbs: 0, endAbs: 0, span: 0 };
  const newestAbs = totalPushed - 1;
  const oldestAbs = totalPushed - count;

  const minSpan = Math.min(MIN_VISIBLE_COLUMNS, count);
  let span = Math.round(params.span);
  if (!Number.isFinite(span)) span = count;
  span = Math.max(minSpan, Math.min(count, span));

  let anchorAbs = follow ? newestAbs : Math.round(params.anchorAbs);
  if (!Number.isFinite(anchorAbs)) anchorAbs = newestAbs;
  const maxAnchor = newestAbs;
  const minAnchor = oldestAbs + span - 1;
  if (anchorAbs > maxAnchor) anchorAbs = maxAnchor;
  if (anchorAbs < minAnchor) anchorAbs = minAnchor;

  return { startAbs: anchorAbs - span + 1, endAbs: anchorAbs, span };
}

/**
 * Map a horizontal fraction (0..1 across the canvas) to the absolute column
 * index it samples from, given the visible range. Clamped to [start, end].
 */
export function columnAbsForX(xFrac: number, startAbs: number, span: number): number {
  if (span <= 0) return startAbs;
  const f = xFrac < 0 ? 0 : xFrac > 1 ? 1 : xFrac;
  const rel = Math.min(span - 1, Math.floor(f * span));
  return startAbs + rel;
}

/**
 * Axis-tick label for a column's age relative to the newest column.
 * "now" near zero, else "-5.0s" / "-12s".
 */
export function formatAxisOffset(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < 50) return 'now';
  const s = deltaMs / 1000;
  const digits = s < 10 ? 1 : 0;
  return `-${s.toFixed(digits)}s`;
}

/** Hover time readout: "now" or "3.4 s ago". */
export function formatSecondsAgo(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < 50) return 'now';
  return `${(deltaMs / 1000).toFixed(1)} s ago`;
}

/** Visible-span readout: "~12.3 s". */
export function formatSpanSeconds(spanMs: number): string {
  if (!Number.isFinite(spanMs) || spanMs <= 0) return '—';
  return `~${(spanMs / 1000).toFixed(1)} s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ZOOM_STEP = 1.2;
const UI_THROTTLE_MS = 250; // <= 4 label updates / second
const AXIS_HEIGHT = 20;

interface AxisTick {
  leftPct: number;
  label: string;
}

interface UiState {
  live: boolean;
  spanMs: number;
  ticks: AxisTick[];
}

interface HoverReadout {
  xFrac: number;
  yFrac: number;
  freqHz: number;
  deltaMs: number;
  db: number | null;
}

interface WindowMeta {
  fStart: number;
  fStop: number;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Zoomable, pannable scrolling spectrogram for the parked focus window.
 *
 * Time flows LEFT -> RIGHT (newest on the right); frequency is vertical (high
 * at the top); turbo colormap autoscaled from noise_floor_db .. +spanDb per
 * column. A rolling ring buffer keeps the last {@link HISTORY_CAPACITY} columns
 * (one per unique `seq`). The mouse wheel zooms the time axis, click-drag pans
 * through history, and double-click / Reset returns to full + live.
 *
 * Hot path: NEVER re-renders React per frame. A requestAnimationFrame loop reads
 * the latest scope frame from the store, pushes new columns, and re-rasterizes
 * the visible range to canvas via ImageData only when a dirty flag is set (new
 * data, view change, or resize). Only user-driven hover and throttled axis/
 * toolbar labels use React state.
 */
export function ScopeSpectrogram({
  rows = 512,
  height = 320,
  spanDb = 60,
}: ScopeSpectrogramProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // History ring buffer (allocated on first frame; bins fixed per mount).
  const powerRef = useRef<Float32Array | null>(null);
  const tMsRef = useRef<Float64Array>(new Float64Array(HISTORY_CAPACITY));
  const noiseRef = useRef<Float32Array>(new Float32Array(HISTORY_CAPACITY));
  const colBufRef = useRef<Uint8ClampedArray>(new Uint8ClampedArray(0));
  const binsRef = useRef<number>(0);
  const totalRef = useRef<number>(0);
  const lastSeqRef = useRef<number | null>(null);
  const windowRef = useRef<WindowMeta | null>(null);

  // View state (refs so the hot path never depends on React renders).
  const followRef = useRef<boolean>(true);
  const spanRef = useRef<number>(Math.max(MIN_VISIBLE_COLUMNS, Math.round(rows)));
  const anchorAbsRef = useRef<number>(0);
  const dirtyRef = useRef<boolean>(true);
  // Lets the Reset button call into the active effect's reset closure.
  const resetViewRef = useRef<(() => void) | null>(null);

  const [ui, setUi] = useState<UiState | null>(null);
  const [hover, setHover] = useState<HoverReadout | null>(null);

  // Keep the latest spanDb readable from the RAF loop without re-subscribing.
  const spanDbRef = useRef<number>(spanDb);
  spanDbRef.current = spanDb;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    canvas.width = OUTPUT_WIDTH;

    let raf = 0;
    let lastUi = 0;
    let uiSig = '';
    let dragStartX = 0;
    let dragStartAnchor = 0;
    let dragging = false;

    const count = (): number => Math.min(totalRef.current, HISTORY_CAPACITY);

    const currentView = (): ViewRange =>
      clampView({
        totalPushed: totalRef.current,
        count: count(),
        span: spanRef.current,
        anchorAbs: anchorAbsRef.current,
        follow: followRef.current,
      });

    const ensureAlloc = (bins: number, fStart: number, fStop: number): void => {
      if (powerRef.current || bins <= 0) return;
      binsRef.current = bins;
      powerRef.current = new Float32Array(HISTORY_CAPACITY * bins);
      colBufRef.current = new Uint8ClampedArray(bins * 4);
      windowRef.current = { fStart, fStop };
      canvas.height = bins;
    };

    const pushColumn = (power: number[], tMs: number, noise: number): void => {
      const store = powerRef.current;
      const bins = binsRef.current;
      if (!store || bins === 0) return;
      const slot = mod(totalRef.current, HISTORY_CAPACITY);
      const base = slot * bins;
      for (let i = 0; i < bins; i += 1) store[base + i] = power[i] ?? noise;
      tMsRef.current[slot] = tMs;
      noiseRef.current[slot] = noise;
      totalRef.current += 1;
    };

    const render = (): void => {
      const store = powerRef.current;
      const bins = binsRef.current;
      const n = count();
      if (!store || bins === 0 || n === 0) return;

      const view = currentView();
      spanRef.current = view.span;
      if (followRef.current) anchorAbsRef.current = view.endAbs;

      const w = OUTPUT_WIDTH;
      const img = ctx.createImageData(w, bins);
      const data = img.data;
      const colBuf = colBufRef.current;
      const sdb = spanDbRef.current;
      let prevSlot = -1;

      for (let x = 0; x < w; x += 1) {
        const abs = columnAbsForX((x + 0.5) / w, view.startAbs, view.span);
        const slot = mod(abs, HISTORY_CAPACITY);
        if (slot !== prevSlot) {
          prevSlot = slot;
          const b = slot * bins;
          const minDb = noiseRef.current[slot] ?? 0;
          const maxDb = minDb + sdb;
          for (let i = 0; i < bins; i += 1) {
            const [r, g, bl] = dbToColor(store[b + i] ?? minDb, minDb, maxDb);
            const o = (bins - 1 - i) * 4; // bin 0 (low freq) -> bottom
            colBuf[o] = r;
            colBuf[o + 1] = g;
            colBuf[o + 2] = bl;
            colBuf[o + 3] = 255;
          }
        }
        for (let y = 0; y < bins; y += 1) {
          const src = y * 4;
          const o = (y * w + x) * 4;
          data[o] = colBuf[src] ?? 0;
          data[o + 1] = colBuf[src + 1] ?? 0;
          data[o + 2] = colBuf[src + 2] ?? 0;
          data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    const maybeUpdateUi = (now: number): void => {
      if (now - lastUi < UI_THROTTLE_MS) return;
      lastUi = now;
      const n = count();
      if (n === 0) return;
      const view = currentView();
      const bins = binsRef.current;
      const newestSlot = mod(totalRef.current - 1, HISTORY_CAPACITY);
      const tNewest = tMsRef.current[newestSlot] ?? 0;
      const tStart = tMsRef.current[mod(view.startAbs, HISTORY_CAPACITY)] ?? 0;
      const tEnd = tMsRef.current[mod(view.endAbs, HISTORY_CAPACITY)] ?? 0;
      const spanMs = Math.max(0, tEnd - tStart);
      const live = followRef.current && view.endAbs === totalRef.current - 1;

      const ticks: AxisTick[] = [];
      for (let i = 0; i <= 4; i += 1) {
        const frac = i / 4;
        const abs = Math.round(view.startAbs + frac * (view.span - 1));
        const tCol = tMsRef.current[mod(abs, HISTORY_CAPACITY)] ?? 0;
        ticks.push({ leftPct: frac * 100, label: formatAxisOffset(tNewest - tCol) });
      }

      const sig = `${live ? 1 : 0}|${bins}|${Math.round(spanMs)}|${ticks
        .map((t) => t.label)
        .join(',')}`;
      if (sig === uiSig) return;
      uiSig = sig;
      setUi({ live, spanMs, ticks });
    };

    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const frame = useStore.getState().scope;
      if (frame && frame.power_db.length > 0 && frame.seq !== lastSeqRef.current) {
        lastSeqRef.current = frame.seq;
        ensureAlloc(frame.power_db.length, frame.f_start_hz, frame.f_stop_hz);
        pushColumn(frame.power_db, frame.t_ms, frame.noise_floor_db);
        dirtyRef.current = true;
      }
      if (dirtyRef.current) {
        dirtyRef.current = false;
        render();
      }
      maybeUpdateUi(performance.now());
    };

    // --- interaction: zoom (non-passive wheel), pan (drag), reset (dblclick) ---

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const n = count();
      if (n === 0) return;
      const view = currentView();
      const factor = e.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP; // up = zoom in
      const minSpan = Math.min(MIN_VISIBLE_COLUMNS, n);
      const newSpan = Math.max(minSpan, Math.min(n, Math.round(view.span * factor)));
      if (followRef.current) {
        spanRef.current = newSpan; // stay live: right edge pinned to newest
      } else {
        const rect = canvas.getBoundingClientRect();
        const xFrac = rect.width > 0 ? clamp01((e.clientX - rect.left) / rect.width) : 1;
        const cursorAbs = columnAbsForX(xFrac, view.startAbs, view.span);
        const newStart = Math.round(cursorAbs - xFrac * newSpan);
        spanRef.current = newSpan;
        anchorAbsRef.current = newStart + newSpan - 1;
      }
      dirtyRef.current = true;
    };

    const onDrag = (e: MouseEvent): void => {
      if (!dragging) return;
      const n = count();
      if (n === 0) return;
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - dragStartX;
      const colsPerPx = rect.width > 0 ? spanRef.current / rect.width : 0;
      const wantAnchor = dragStartAnchor - dx * colsPerPx; // drag right -> older
      const v = clampView({
        totalPushed: totalRef.current,
        count: n,
        span: spanRef.current,
        anchorAbs: wantAnchor,
        follow: false,
      });
      anchorAbsRef.current = v.endAbs;
      dirtyRef.current = true;
    };

    const onUp = (): void => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('mouseup', onUp);
      // Snap back to live if the user released at the newest edge.
      if (anchorAbsRef.current >= totalRef.current - 1) followRef.current = true;
      dirtyRef.current = true;
    };

    const onDown = (e: MouseEvent): void => {
      if (e.button !== 0 || count() === 0) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartAnchor = currentView().endAbs;
      followRef.current = false;
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', onUp);
    };

    const resetView = (): void => {
      followRef.current = true;
      spanRef.current = HISTORY_CAPACITY; // clamped to available -> full history
      anchorAbsRef.current = totalRef.current - 1;
      dirtyRef.current = true;
    };

    const onHover = (e: MouseEvent): void => {
      const n = count();
      const win = windowRef.current;
      const bins = binsRef.current;
      const store = powerRef.current;
      if (n === 0 || !win || bins === 0 || !store) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const xFrac = clamp01((e.clientX - rect.left) / rect.width);
      const yFrac = clamp01((e.clientY - rect.top) / rect.height);
      const view = currentView();
      const abs = columnAbsForX(xFrac, view.startAbs, view.span);
      const slot = mod(abs, HISTORY_CAPACITY);
      const tCol = tMsRef.current[slot] ?? 0;
      const tNewest = tMsRef.current[mod(totalRef.current - 1, HISTORY_CAPACITY)] ?? 0;
      const freqHz = win.fStop - yFrac * (win.fStop - win.fStart);
      const bin = Math.min(bins - 1, Math.max(0, Math.floor((1 - yFrac) * bins)));
      const db = store[slot * bins + bin] ?? null;
      setHover({ xFrac, yFrac, freqHz, deltaMs: tNewest - tCol, db });
    };

    const onLeave = (): void => setHover(null);

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onHover);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('dblclick', resetView);
    resetViewRef.current = resetView;

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onHover);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('dblclick', resetView);
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('mouseup', onUp);
      resetViewRef.current = null;
    };
    // spanDb is read via spanDbRef; rows only seeds the initial span refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onResetClick = (): void => resetViewRef.current?.();

  const live = ui?.live ?? true;
  const spanMs = ui?.spanMs ?? 0;
  const ticks = ui?.ticks ?? [];

  return (
    <div className="scopespec-root" style={{ height }}>
      <div className="scopespec-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={OUTPUT_WIDTH}
          aria-label="Focus scope spectrogram (zoomable, pannable)"
          className="scopespec-canvas"
        />
        <div className="scopespec-toolbar">
          <span className={`scopespec-badge ${live ? 'is-live' : 'is-paused'}`}>
            {live ? 'LIVE' : 'PAUSED'}
          </span>
          <span className="scopespec-readout mono">showing {formatSpanSeconds(spanMs)}</span>
          <button type="button" className="scopespec-reset" onClick={onResetClick}>
            Reset
          </button>
        </div>
        {hover && (
          <div
            className="scopespec-hover mono"
            style={{
              left: `${(hover.xFrac * 100).toFixed(2)}%`,
              top: `${(hover.yFrac * 100).toFixed(2)}%`,
              transform: `translate(${hover.xFrac > 0.6 ? '-100%' : '0'}, -50%)`,
            }}
          >
            <span>{hzToMHz(hover.freqHz).toFixed(4)} MHz</span>
            <span className="faint">{formatSecondsAgo(hover.deltaMs)}</span>
            <span className="faint">{hover.db == null ? '—' : `${hover.db.toFixed(1)} dB`}</span>
          </div>
        )}
      </div>
      <div className="scopespec-axis mono" style={{ height: AXIS_HEIGHT }} aria-hidden="true">
        {ticks.map((t, i) => (
          <span
            key={i}
            style={{
              left: `${t.leftPct}%`,
              transform:
                i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
