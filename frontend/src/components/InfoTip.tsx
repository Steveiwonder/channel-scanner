import { useState } from 'react';
import './InfoTip.css';

export interface InfoTipProps {
  /** Plain-language explanation shown inside the tooltip bubble. */
  text: string;
  /** Optional visible label rendered before the "?" badge. */
  label?: string;
}

/**
 * Accessible "?" info popover for explaining a metric in plain language.
 *
 * The badge is focusable (tabIndex=0, role="button") and exposes `text` as its
 * accessible name via aria-label. The tooltip bubble is shown on pointer hover
 * (pure CSS) and on keyboard focus (React state), so keyboard and mouse users
 * get the same affordance. It renders inline so it can sit next to a table
 * header or a metric label.
 */
export function InfoTip({ text, label }: InfoTipProps): JSX.Element {
  const [focused, setFocused] = useState(false);

  return (
    <span className="infotip">
      {label != null && label !== '' && <span className="infotip__label">{label}</span>}
      <span
        className="infotip__badge"
        role="button"
        tabIndex={0}
        aria-label={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <span aria-hidden="true">?</span>
        <span
          className={focused ? 'infotip__bubble infotip__bubble--visible' : 'infotip__bubble'}
          role="tooltip"
        >
          {text}
        </span>
      </span>
    </span>
  );
}
