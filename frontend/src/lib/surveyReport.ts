// Pure helpers for the Survey report page. Kept DOM-free and side-effect-free so
// they can be unit-tested directly and reused by both the download and
// copy-to-clipboard actions. This describes INFERRED candidate channels — never
// a claim that a channel is a confirmed device.

import type { CandidateChannel, DecodeFrame, Session } from './types';
import { meterScore } from './meterScore';
import type { MeterScore } from './meterScore';
import {
  formatConfidence,
  formatIntervalSeconds,
  formatIso,
  formatSnr,
  hzSpanToHuman,
  hzToMHz,
} from './format';

export interface ReportInput {
  channels: CandidateChannel[];
  sessions: Session[];
  decodes: DecodeFrame[];
  /** ISO 8601 timestamp, typically new Date().toISOString(). */
  generatedAt: string;
}

export interface ScoredChannel {
  channel: CandidateChannel;
  meter: MeterScore;
}

/** Sort channels by meter-like pattern score, strongest first. */
export function scoreAndSort(channels: CandidateChannel[]): ScoredChannel[] {
  return channels
    .map((channel) => ({ channel, meter: meterScore(channel) }))
    .sort((a, b) => b.meter.score - a.meter.score);
}

/**
 * Build a Markdown survey report. Pure (no DOM / no I/O) so it can be unit-tested
 * and reused by both the download and copy-to-clipboard actions.
 */
export function buildMarkdown(input: ReportInput): string {
  const { channels, sessions, decodes, generatedAt } = input;
  const scored = scoreAndSort(channels);
  const activeCount = channels.filter((c) => c.status === 'active').length;

  const lines: string[] = [];
  lines.push('# Channel survey report');
  lines.push('');
  lines.push(`_Generated ${generatedAt}_`);
  lines.push('');
  lines.push(
    'Receive-only survey. The entries below are **inferred candidate channels** — recurring ' +
      'narrowband patterns observed over the air — not confirmed devices.',
  );
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total candidate channels: ${channels.length}`);
  lines.push(`- Active channels: ${activeCount}`);
  lines.push(`- Sessions: ${sessions.length}`);
  lines.push('');

  lines.push('## Candidate channels');
  lines.push('');
  if (scored.length === 0) {
    lines.push('_No candidate channels detected._');
  } else {
    lines.push(
      '| Center (MHz) | Bandwidth | SNR | Confidence | Obs | Recurrence | First seen | Last seen | Status | Pattern |',
    );
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const { channel: c, meter } of scored) {
      lines.push(
        `| ${hzToMHz(c.center_hz).toFixed(4)} | ${hzSpanToHuman(c.bandwidth_hz)} | ${formatSnr(
          c.snr_db,
        )} | ${formatConfidence(c.confidence)} | ${c.observation_count} | ${formatIntervalSeconds(
          c.recurrence_interval_s,
        )} | ${formatIso(c.first_seen)} | ${formatIso(c.last_seen)} | ${c.status} | ${meter.label} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Decoded protocols');
  lines.push('');
  const known = decodes.filter((d) => d.known);
  if (known.length === 0) {
    lines.push('_No known protocols decoded. Unknown or encrypted transmissions stay unidentified._');
  } else {
    const protocols = new Map<string, number>();
    for (const d of known) protocols.set(d.protocol, (protocols.get(d.protocol) ?? 0) + 1);
    for (const [protocol, count] of protocols) {
      lines.push(`- ${protocol} (${count} decode${count === 1 ? '' : 's'})`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
