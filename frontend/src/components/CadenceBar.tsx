import { formatDuration, formatIntervalSeconds } from '../lib/format';
import './CadenceBar.css';

export interface CadenceBarProps {
  recurrenceIntervalS: number | null;
  observationCount: number;
  typicalBurstMs?: number | null;
}

type Verdict = 'regular' | 'emerging' | 'irregular';

const VERDICT_LABELS: Record<Verdict, string> = {
  regular: 'Regular',
  emerging: 'Emerging',
  irregular: 'Irregular',
};

function deriveVerdict(recurrenceIntervalS: number | null, observationCount: number): Verdict {
  if (recurrenceIntervalS != null && observationCount >= 4) return 'regular';
  if (recurrenceIntervalS != null && observationCount >= 2) return 'emerging';
  return 'irregular';
}

/**
 * Compact periodicity indicator for a single candidate channel, sized to sit
 * inside a table cell. A regular cadence is a clue — not proof — of a periodic
 * transmitter such as a utility meter. Receive-only: never asserts device identity.
 */
export function CadenceBar({
  recurrenceIntervalS,
  observationCount,
  typicalBurstMs,
}: CadenceBarProps): JSX.Element {
  const verdict = deriveVerdict(recurrenceIntervalS, observationCount);
  const intervalText = recurrenceIntervalS != null ? formatIntervalSeconds(recurrenceIntervalS) : '—';

  const burstNote =
    typicalBurstMs != null ? ` Typical burst ${formatDuration(typicalBurstMs)}.` : '';
  const title =
    `Recurrence interval: ${intervalText} across ${observationCount} observation(s). ` +
    `A regular cadence is a clue (not proof) of a periodic transmitter such as a meter.` +
    burstNote;

  return (
    <span className="cadencebar" title={title}>
      <span className={`cadencebar-dot cadencebar-dot--${verdict}`} aria-hidden="true" />
      <span className="cadencebar-interval">{intervalText}</span>
      <span className="cadencebar-label">{VERDICT_LABELS[verdict]}</span>
    </span>
  );
}
