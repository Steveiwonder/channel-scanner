import { meterScore, type MeterScore } from '../lib/meterScore';
import type { CandidateChannel } from '../lib/types';
import './PatternBadge.css';

export interface PatternBadgeProps {
  channel: CandidateChannel;
}

const LABEL_TEXT: Record<MeterScore['label'], string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  weak: 'Weak',
};

// The exact framing required by the spec: a heuristic pattern indicator, NOT a
// device identification. Kept verbatim in the tooltip.
const DISCLAIMER =
  'Heuristic indicator of a periodic-narrowband transmission pattern, ' +
  'not a claim that it is a meter or any specific device.';

/**
 * Compact "Pattern" badge for a candidate channel. Colour tracks the heuristic
 * label; the tooltip lists the matched reasons and always states that this is a
 * pattern indicator only, never a device identification.
 */
export function PatternBadge({ channel }: PatternBadgeProps): JSX.Element {
  const { score, label, reasons } = meterScore(channel);
  const reasonText = reasons.length > 0 ? reasons.join(', ') : 'no strong pattern cues';
  const title = `Pattern score ${score.toFixed(2)} (${label}). Signals: ${reasonText}. ${DISCLAIMER}`;

  return (
    <span className={`patternbadge patternbadge--${label}`} title={title}>
      <span className="patternbadge-dot" aria-hidden="true" />
      {LABEL_TEXT[label]}
    </span>
  );
}
