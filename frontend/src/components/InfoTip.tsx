import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './InfoTip.css';

export interface InfoTipProps {
  /** Plain-language explanation shown inside the tooltip bubble. */
  text: string;
  /** Optional visible label rendered before the "?" badge. */
  label?: string;
}

interface BubblePos {
  left: number;
  top: number;
  placement: 'above' | 'below';
}

const BUBBLE_WIDTH = 260;
const MARGIN = 8;

/**
 * Accessible "?" info popover for explaining a metric in plain language.
 *
 * The bubble is rendered in a portal on document.body with fixed positioning
 * (computed from the badge's bounding rect and clamped to the viewport), so it
 * is never clipped by overflow containers (tables, cards) or the window edge.
 * Shown on pointer hover and on keyboard focus.
 */
export function InfoTip({ text, label }: InfoTipProps): JSX.Element {
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<BubblePos | null>(null);

  const open = useCallback(() => {
    const el = badgeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = r.left + r.width / 2 - BUBBLE_WIDTH / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - BUBBLE_WIDTH - MARGIN));
    // Prefer above; flip below when there isn't room near the top of the window.
    const placement: 'above' | 'below' = r.top > 140 ? 'above' : 'below';
    setPos({ left, top: placement === 'above' ? r.top : r.bottom, placement });
  }, []);

  const close = useCallback(() => setPos(null), []);

  return (
    <span className="infotip">
      {label != null && label !== '' && <span className="infotip__label">{label}</span>}
      <span
        ref={badgeRef}
        className="infotip__badge"
        role="button"
        tabIndex={0}
        aria-label={text}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
      >
        <span aria-hidden="true">?</span>
      </span>
      {pos != null &&
        createPortal(
          <span
            className={`infotip__bubble infotip__bubble--${pos.placement}`}
            role="tooltip"
            style={{ left: pos.left, top: pos.top, width: BUBBLE_WIDTH }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
