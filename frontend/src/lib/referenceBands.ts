/**
 * Known reference frequencies/channels in the European 863–870 MHz SRD band.
 *
 * These are drawn as optional overlay markers on the spectrum / scope / band map
 * so a detected candidate can be compared against real protocol channels and the
 * ETSI sub-band edges. They are references only — a signal lining up with one of
 * these is a hint, not proof of the protocol or device.
 */

export interface ReferenceMarker {
  /** Exact integer Hz of the marker (a channel centre). */
  freqHz: number;
  /** Short label shown on the axis. */
  label: string;
  /** Longer description for tooltips. */
  detail: string;
  /** Grouping for colour/legend. */
  kind: 'wmbus' | 'lora' | 'srd' | 'other';
}

export interface ReferenceRange {
  loHz: number;
  hiHz: number;
  label: string;
  detail: string;
}

/** Point channels of interest (protocol channel centres). */
export const REFERENCE_MARKERS: ReferenceMarker[] = [
  {
    freqHz: 868_300_000,
    label: 'wM-Bus S',
    detail: 'Wireless M-Bus S-mode (stationary) — 868.30 MHz',
    kind: 'wmbus',
  },
  {
    freqHz: 868_950_000,
    label: 'wM-Bus T/C',
    detail: 'Wireless M-Bus T-mode / C-mode — 868.95 MHz',
    kind: 'wmbus',
  },
  {
    freqHz: 869_525_000,
    label: 'wM-Bus N',
    detail: 'Wireless M-Bus N-mode region — ~869.525 MHz',
    kind: 'wmbus',
  },
  {
    freqHz: 868_100_000,
    label: 'LoRa 1',
    detail: 'LoRaWAN EU868 default channel 868.10 MHz',
    kind: 'lora',
  },
  {
    freqHz: 868_300_000,
    label: 'LoRa 2',
    detail: 'LoRaWAN EU868 default channel 868.30 MHz',
    kind: 'lora',
  },
  {
    freqHz: 868_500_000,
    label: 'LoRa 3',
    detail: 'LoRaWAN EU868 default channel 868.50 MHz',
    kind: 'lora',
  },
];

/** ETSI EN 300 220 sub-band ranges (duty-cycle / power constrained). */
export const REFERENCE_RANGES: ReferenceRange[] = [
  { loHz: 868_000_000, hiHz: 868_600_000, label: 'g (868.0–868.6)', detail: 'SRD sub-band, 1% duty' },
  {
    loHz: 868_700_000,
    hiHz: 869_200_000,
    label: 'g1 (868.7–869.2)',
    detail: 'SRD sub-band, 0.1% duty',
  },
  {
    loHz: 869_400_000,
    hiHz: 869_650_000,
    label: 'g3 (869.4–869.65)',
    detail: 'SRD sub-band, 10% duty / higher power',
  },
  {
    loHz: 869_700_000,
    hiHz: 870_000_000,
    label: 'g4 (869.7–870.0)',
    detail: 'SRD sub-band',
  },
];

/** Markers whose centre falls within [startHz, endHz]. */
export function markersInRange(startHz: number, endHz: number): ReferenceMarker[] {
  return REFERENCE_MARKERS.filter((m) => m.freqHz >= startHz && m.freqHz <= endHz);
}

/** Ranges that overlap [startHz, endHz]. */
export function rangesInRange(startHz: number, endHz: number): ReferenceRange[] {
  return REFERENCE_RANGES.filter((r) => r.hiHz >= startHz && r.loHz <= endHz);
}
