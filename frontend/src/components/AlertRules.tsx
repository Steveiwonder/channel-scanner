import { useState } from 'react';
import type { AlertRule } from '../hooks/useChannelAlerts';
import './AlertRules.css';

export interface AlertRulesProps {
  rules: AlertRule[];
  onAdd: (draft: Omit<AlertRule, 'id'>) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}

interface DraftFields {
  freqLoMhz: string;
  freqHiMhz: string;
  minSnr: string;
  minConfidencePct: string;
  requireRegularCadence: boolean;
}

const EMPTY_DRAFT: DraftFields = {
  freqLoMhz: '',
  freqHiMhz: '',
  minSnr: '',
  minConfidencePct: '',
  requireRegularCadence: false,
};

function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function summarize(rule: AlertRule): string {
  const parts: string[] = [];
  if (rule.freqLoMhz != null || rule.freqHiMhz != null) {
    const lo = rule.freqLoMhz != null ? `${rule.freqLoMhz}` : '−∞';
    const hi = rule.freqHiMhz != null ? `${rule.freqHiMhz}` : '∞';
    parts.push(`${lo}–${hi} MHz`);
  }
  if (rule.minSnr != null) parts.push(`SNR ≥ ${rule.minSnr} dB`);
  if (rule.minConfidence != null) parts.push(`conf ≥ ${Math.round(rule.minConfidence * 100)}%`);
  if (rule.requireRegularCadence === true) parts.push('regular cadence');
  return parts.length > 0 ? parts.join(' · ') : 'any active channel';
}

/**
 * Small editor for burst-alert rules. Adds/enables/deletes rules; the parent
 * owns persistence. An alert only means a channel matching the criteria became
 * active — it never identifies a specific device.
 */
export function AlertRules({ rules, onAdd, onToggle, onRemove }: AlertRulesProps): JSX.Element {
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const next: Omit<AlertRule, 'id'> = { enabled: true };
    const lo = parseNumber(draft.freqLoMhz);
    const hi = parseNumber(draft.freqHiMhz);
    const snr = parseNumber(draft.minSnr);
    const confPct = parseNumber(draft.minConfidencePct);
    if (lo != null) next.freqLoMhz = lo;
    if (hi != null) next.freqHiMhz = hi;
    if (snr != null) next.minSnr = snr;
    if (confPct != null) next.minConfidence = Math.max(0, Math.min(1, confPct / 100));
    if (draft.requireRegularCadence) next.requireRegularCadence = true;
    onAdd(next);
    setDraft(EMPTY_DRAFT);
  }

  return (
    <div className="alert-rules">
      <form className="alert-rules-form" onSubmit={submit}>
        <div className="alert-rules-inputs">
          <label className="alert-rules-field">
            <span>Freq low (MHz)</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.freqLoMhz}
              onChange={(e) => setDraft((d) => ({ ...d, freqLoMhz: e.target.value }))}
              placeholder="any"
            />
          </label>
          <label className="alert-rules-field">
            <span>Freq high (MHz)</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.freqHiMhz}
              onChange={(e) => setDraft((d) => ({ ...d, freqHiMhz: e.target.value }))}
              placeholder="any"
            />
          </label>
          <label className="alert-rules-field">
            <span>Min SNR (dB)</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.minSnr}
              onChange={(e) => setDraft((d) => ({ ...d, minSnr: e.target.value }))}
              placeholder="any"
            />
          </label>
          <label className="alert-rules-field">
            <span>Min confidence (%)</span>
            <input
              type="number"
              step="any"
              min="0"
              max="100"
              inputMode="decimal"
              value={draft.minConfidencePct}
              onChange={(e) => setDraft((d) => ({ ...d, minConfidencePct: e.target.value }))}
              placeholder="any"
            />
          </label>
        </div>
        <div className="alert-rules-actions">
          <label className="alert-rules-check">
            <input
              type="checkbox"
              checked={draft.requireRegularCadence}
              onChange={(e) =>
                setDraft((d) => ({ ...d, requireRegularCadence: e.target.checked }))
              }
            />
            <span>Require regular cadence</span>
          </label>
          <button type="submit" className="primary">
            Add rule
          </button>
        </div>
      </form>

      {rules.length === 0 ? (
        <div className="alert-rules-empty muted small">
          No rules yet. Add one to be notified when a matching channel becomes active.
        </div>
      ) : (
        <ul className="alert-rules-list">
          {rules.map((rule) => (
            <li key={rule.id} className={rule.enabled ? 'alert-rule' : 'alert-rule disabled'}>
              <label className="alert-rule-toggle">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => onToggle(rule.id, e.target.checked)}
                  aria-label="Enable rule"
                />
              </label>
              <span className="alert-rule-summary mono">{summarize(rule)}</span>
              <button
                type="button"
                className="danger alert-rule-remove"
                onClick={() => onRemove(rule.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
