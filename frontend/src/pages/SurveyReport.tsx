import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { api, ApiError } from '../lib/api';
import { InfoTip } from '../components/InfoTip';
import { buildMarkdown, scoreAndSort } from '../lib/surveyReport';
import type { Session } from '../lib/types';
import {
  formatConfidence,
  formatIntervalSeconds,
  formatIso,
  formatSnr,
  hzSpanToHuman,
  hzToMHz,
} from '../lib/format';
import './SurveyReport.css';

const INFO_TEXT =
  'A saveable snapshot of the current survey. It describes inferred candidate channels — recurring narrowband ' +
  'patterns picked up receive-only — not confirmed devices. A pattern label or decoded protocol is never a claim ' +
  'about which physical device produced a signal.';

export function SurveyReport(): JSX.Element {
  const channelMap = useStore((s) => s.channels);
  const decodes = useStore((s) => s.decodes);
  const setDecodes = useStore((s) => s.setDecodes);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const [sessionsRes, decodesRes] = await Promise.all([api.getSessions(), api.getDecodes()]);
        if (cancelled) return;
        setSessions(sessionsRes.sessions);
        setDecodes(decodesRes.decodes);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [setDecodes]);

  const channels = useMemo(() => Array.from(channelMap.values()), [channelMap]);
  const scored = useMemo(() => scoreAndSort(channels), [channels]);
  const activeCount = channels.filter((c) => c.status === 'active').length;

  function download(): void {
    const md = buildMarkdown({
      channels,
      sessions,
      decodes,
      generatedAt: new Date().toISOString(),
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `survey-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  async function copy(): Promise<void> {
    setError(null);
    setCopied(false);
    const md = buildMarkdown({
      channels,
      sessions,
      decodes,
      generatedAt: new Date().toISOString(),
    });
    if (!navigator.clipboard?.writeText) {
      setError('Clipboard is not available in this browser. Use “Download report” instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
    } catch (err) {
      setError(`Could not copy to clipboard: ${String(err)}`);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          Survey report <InfoTip text={INFO_TEXT} />
        </h1>
        <div className="row">
          <button className="primary" onClick={download}>
            Download report (Markdown)
          </button>
          <button onClick={() => void copy()}>Copy to clipboard</button>
        </div>
      </div>

      <div className="notice info">
        Receive-only summary. This report describes inferred candidate channels, not confirmed
        devices.
      </div>

      {error && <div className="notice danger">{error}</div>}
      {copied && <div className="notice info">Report copied to clipboard.</div>}

      <div className="row survey-summary" style={{ gap: 12, marginBottom: 16 }}>
        <span className="tile">
          <strong>{channels.length}</strong> channels
        </span>
        <span className="tile">
          <strong>{activeCount}</strong> active
        </span>
        <span className="tile">
          <strong>{sessions.length}</strong> sessions
        </span>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Candidate channels</h2>
          <span className="small faint">sorted by pattern score</span>
        </div>
        {scored.length === 0 ? (
          <div className="empty">No candidate channels detected yet.</div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th className="num">Center (MHz)</th>
                  <th className="num">Bandwidth</th>
                  <th className="num">SNR</th>
                  <th className="num">Confidence</th>
                  <th className="num">Obs</th>
                  <th className="num">Recurrence</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                  <th>Status</th>
                  <th>Pattern</th>
                </tr>
              </thead>
              <tbody>
                {scored.map(({ channel: c, meter }) => (
                  <tr key={c.id}>
                    <td className="num mono">{hzToMHz(c.center_hz).toFixed(4)}</td>
                    <td className="num">{hzSpanToHuman(c.bandwidth_hz)}</td>
                    <td className="num">{formatSnr(c.snr_db)}</td>
                    <td className="num">{formatConfidence(c.confidence)}</td>
                    <td className="num">{c.observation_count}</td>
                    <td className="num">{formatIntervalSeconds(c.recurrence_interval_s)}</td>
                    <td title={formatIso(c.first_seen)}>{formatIso(c.first_seen)}</td>
                    <td title={formatIso(c.last_seen)}>{formatIso(c.last_seen)}</td>
                    <td>{c.status}</td>
                    <td>
                      <span className={`badge meter-${meter.label}`}>{meter.label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
