import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { api, ApiError } from '../lib/api';
import { InfoTip } from '../components/InfoTip';
import { formatIso, hzToMHz } from '../lib/format';
import type { DecodeFrame } from '../lib/types';
import './Decoder.css';

const INFO_TEXT =
  'Decodes are optional. They are receive-only protocol labels — read from the air via rtl_433 when it is installed, ' +
  'or simulated when it is not. They are SEPARATE from this app\'s own channel detections, are not a claim about any ' +
  'specific device, and never bypass or break encryption.';

/** Compact "key: value" rendering of a decode\'s fields, one per line. */
function formatFields(fields: Record<string, unknown>): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
}

export function Decoder(): JSX.Element {
  const decodes = useStore((s) => s.decodes);
  const setDecodes = useStore((s) => s.setDecodes);

  const [decoderAvailable, setDecoderAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getDecodes();
        if (cancelled) return;
        setDecodes(res.decodes);
        setDecoderAvailable(res.decoder_available);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [setDecodes]);

  async function runDecoder(): Promise<void> {
    setRunning(true);
    setError(null);
    setRunMessage(null);
    try {
      const res = await api.runDecoder();
      setRunMessage(res.message);
      // Merge any freshly returned decodes so the operator sees results even if
      // the WebSocket push has not arrived yet.
      if (res.decodes.length > 0) {
        const existing = useStore.getState().decodes;
        const seen = new Set(existing.map((d) => d.id));
        const merged = [...res.decodes.filter((d) => !seen.has(d.id)), ...existing];
        merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        setDecodes(merged);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          Decoder <InfoTip text={INFO_TEXT} />
        </h1>
        <div className="row">
          <button className="primary" onClick={() => void runDecoder()} disabled={running}>
            {running ? 'Running…' : 'Run decoder now'}
          </button>
        </div>
      </div>

      {decoderAvailable === false && (
        <div className="notice warn">
          rtl_433 not detected — showing simulated decodes. Install rtl_433 for real decoding.
        </div>
      )}
      {decoderAvailable === true && (
        <div className="notice info">
          rtl_433 detected. Decodes below are real receive-only protocol labels.
        </div>
      )}
      {runMessage && <div className="notice info">{runMessage}</div>}
      {error && <div className="notice danger">{error}</div>}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Decodes</h2>
          <span className="small faint">
            {loading ? 'Loading…' : `${decodes.length} decode${decodes.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {decodes.length === 0 ? (
          <div className="empty">
            {loading
              ? 'Loading decodes…'
              : 'No decodes yet — run the decoder or start a scan and let it run.'}
          </div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Decoder</th>
                  <th>Protocol</th>
                  <th className="num">Frequency</th>
                  <th>Fields</th>
                </tr>
              </thead>
              <tbody>
                {decodes.map((d) => (
                  <DecodeRow key={d.id} decode={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DecodeRow({ decode }: { decode: DecodeFrame }): JSX.Element {
  return (
    <tr>
      <td title={formatIso(decode.timestamp)}>{formatIso(decode.timestamp)}</td>
      <td className="mono">{decode.decoder}</td>
      <td>
        {decode.known ? (
          <span className="badge">{decode.protocol}</span>
        ) : (
          <span className="badge dim" title={decode.protocol}>
            unknown
          </span>
        )}
      </td>
      <td className="num mono">
        {decode.freq_hz == null ? '—' : `${hzToMHz(decode.freq_hz).toFixed(4)} MHz`}
      </td>
      <td>
        <pre className="mono small decoder-fields">{formatFields(decode.fields)}</pre>
      </td>
    </tr>
  );
}
