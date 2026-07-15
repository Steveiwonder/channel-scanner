import { useCallback, useEffect, useRef, useState } from 'react';
import type { CandidateChannel, ChannelStatus } from '../lib/types';
import { useStore } from '../store/store';

export interface AlertRule {
  id: string;
  enabled: boolean;
  /** Inclusive lower frequency bound in MHz. */
  freqLoMhz?: number;
  /** Inclusive upper frequency bound in MHz. */
  freqHiMhz?: number;
  /** Minimum SNR in dB. */
  minSnr?: number;
  /** Minimum confidence as a 0..1 fraction. */
  minConfidence?: number;
  /** Require a regular cadence: recurrence_interval_s != null && observation_count >= 4. */
  requireRegularCadence?: boolean;
}

export interface AlertToast {
  id: number;
  channelId: number;
  title: string;
  body: string;
  createdAt: number;
}

const STORAGE_KEY = 'rtlsdr.alertRules';
const DEBOUNCE_MS = 60_000;
const MAX_TOASTS = 4;

/**
 * Pure predicate: does a channel satisfy a rule's criteria? A disabled rule
 * never matches. All bounds are inclusive. A match means only that a channel
 * fits the operator's criteria — it never asserts a specific device identity.
 */
export function matchesRule(channel: CandidateChannel, rule: AlertRule): boolean {
  if (!rule.enabled) return false;

  const freqMhz = channel.center_hz / 1e6;
  if (rule.freqLoMhz != null && freqMhz < rule.freqLoMhz) return false;
  if (rule.freqHiMhz != null && freqMhz > rule.freqHiMhz) return false;
  if (rule.minSnr != null && channel.snr_db < rule.minSnr) return false;
  if (rule.minConfidence != null && channel.confidence < rule.minConfidence) return false;
  if (rule.requireRegularCadence === true) {
    const regular = channel.recurrence_interval_s != null && channel.observation_count >= 4;
    if (!regular) return false;
  }
  return true;
}

/** First enabled rule the channel matches, or null. */
export function firstMatchingRule(
  channel: CandidateChannel,
  rules: readonly AlertRule[],
): AlertRule | null {
  for (const rule of rules) {
    if (matchesRule(channel, rule)) return rule;
  }
  return null;
}

// --- rule persistence -------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function coerceRule(raw: unknown): AlertRule | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (id == null) return null;
  const rule: AlertRule = { id, enabled: raw.enabled === true };
  if (typeof raw.freqLoMhz === 'number' && Number.isFinite(raw.freqLoMhz))
    rule.freqLoMhz = raw.freqLoMhz;
  if (typeof raw.freqHiMhz === 'number' && Number.isFinite(raw.freqHiMhz))
    rule.freqHiMhz = raw.freqHiMhz;
  if (typeof raw.minSnr === 'number' && Number.isFinite(raw.minSnr)) rule.minSnr = raw.minSnr;
  if (typeof raw.minConfidence === 'number' && Number.isFinite(raw.minConfidence))
    rule.minConfidence = raw.minConfidence;
  if (raw.requireRegularCadence === true) rule.requireRegularCadence = true;
  return rule;
}

function loadRules(): AlertRule[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return [];
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceRule).filter((r): r is AlertRule => r !== null);
  } catch {
    return [];
  }
}

function saveRules(rules: AlertRule[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Storage full / unavailable — degrade to in-memory only.
  }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Request Web Notification permission once, on first enable. Safe if unsupported. */
export function ensureNotificationPermission(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => {
      /* denied / unsupported — degrade gracefully */
    });
  }
}

function fireNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // Some environments throw for constructor-based notifications; ignore.
  }
}

export interface UseAlertRules {
  rules: AlertRule[];
  addRule: (draft: Omit<AlertRule, 'id'>) => void;
  toggleRule: (id: string, enabled: boolean) => void;
  removeRule: (id: string) => void;
}

/** localStorage-backed CRUD for alert rules. */
export function useAlertRules(): UseAlertRules {
  const [rules, setRules] = useState<AlertRule[]>(() => loadRules());

  useEffect(() => {
    saveRules(rules);
  }, [rules]);

  const addRule = useCallback((draft: Omit<AlertRule, 'id'>): void => {
    if (draft.enabled) ensureNotificationPermission();
    setRules((prev) => [...prev, { ...draft, id: makeId() }]);
  }, []);

  const toggleRule = useCallback((id: string, enabled: boolean): void => {
    if (enabled) ensureNotificationPermission();
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
  }, []);

  const removeRule = useCallback((id: string): void => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { rules, addRule, toggleRule, removeRule };
}

function describeChannel(channel: CandidateChannel): string {
  const mhz = (channel.center_hz / 1e6).toFixed(3);
  return `${mhz} MHz · SNR ${channel.snr_db.toFixed(1)} dB · confidence ${Math.round(
    channel.confidence * 100,
  )}%`;
}

export interface UseChannelAlerts {
  toasts: AlertToast[];
  dismiss: (id: number) => void;
}

/**
 * Watches store channels for transitions into `status === 'active'` and raises
 * an alert (in-app toast + optional Web Notification) when a newly-active
 * channel matches an enabled rule. Debounced to at most one alert per channel
 * per {@link DEBOUNCE_MS}. Pre-existing active channels at mount do not fire.
 */
export function useChannelAlerts(rules: readonly AlertRule[]): UseChannelAlerts {
  const channels = useStore((s) => s.channels);
  const [toasts, setToasts] = useState<AlertToast[]>([]);

  const prevStatusRef = useRef<Map<number, ChannelStatus>>(new Map());
  const lastAlertRef = useRef<Map<number, number>>(new Map());
  const seededRef = useRef(false);
  const toastIdRef = useRef(0);
  const rulesRef = useRef<readonly AlertRule[]>(rules);
  rulesRef.current = rules;

  const dismiss = useCallback((id: number): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;

    // Detect fresh transitions into 'active' before we overwrite prev state.
    const newlyActive: CandidateChannel[] = [];
    if (seededRef.current) {
      channels.forEach((ch) => {
        if (ch.status === 'active' && prevStatus.get(ch.id) !== 'active') {
          newlyActive.push(ch);
        }
      });
    }

    // Refresh tracked statuses.
    const nextStatus = new Map<number, ChannelStatus>();
    channels.forEach((ch) => nextStatus.set(ch.id, ch.status));
    prevStatusRef.current = nextStatus;

    // First pass just seeds baseline statuses; never fires on page load.
    if (!seededRef.current) {
      seededRef.current = true;
      return;
    }

    if (newlyActive.length === 0) return;

    const now = Date.now();
    const fresh: AlertToast[] = [];
    for (const ch of newlyActive) {
      const rule = firstMatchingRule(ch, rulesRef.current);
      if (rule == null) continue;

      const last = lastAlertRef.current.get(ch.id) ?? 0;
      if (now - last < DEBOUNCE_MS) continue;
      lastAlertRef.current.set(ch.id, now);

      const title = 'Channel matching your criteria became active';
      const body = describeChannel(ch);
      toastIdRef.current += 1;
      fresh.push({ id: toastIdRef.current, channelId: ch.id, title, body, createdAt: now });
      fireNotification(title, body);
    }

    if (fresh.length > 0) {
      setToasts((prev) => {
        const merged = [...prev, ...fresh];
        return merged.length > MAX_TOASTS ? merged.slice(merged.length - MAX_TOASTS) : merged;
      });
    }
  }, [channels]);

  return { toasts, dismiss };
}
