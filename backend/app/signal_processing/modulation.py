"""Rough, receive-only modulation hint from a short IQ block.

Heuristic only: distinguishes on-off keying (OOK) from constant-envelope
frequency-shift (FSK) by amplitude modulation depth, and estimates a symbol rate
from the envelope's shortest on/off runs. This is a hint to aid investigation, not
a demodulator and not a claim about a specific device or protocol.
"""

from __future__ import annotations

from typing import TypedDict

import numpy as np


class ModulationEstimate(TypedDict):
    modulation: str  # "OOK" | "FSK" | "unknown"
    symbol_rate_hz: float | None
    amplitude_depth: float  # 0..1 (1 = strong on/off keying)
    freq_spread_hz: float
    confidence: float  # 0..1


def isolate_and_decimate(
    iq: np.ndarray, sample_rate: int, bw_hz: float
) -> tuple[np.ndarray, float]:
    """Brickwall low-pass the IQ around DC (the parked centre) to +/-bw/2 and
    decimate, so modulation is estimated on the ISOLATED channel rather than the
    whole wideband window. Returns (iq, effective_sample_rate)."""
    n = int(iq.size)
    if n < 8 or sample_rate <= 0 or bw_hz <= 0:
        return iq, float(sample_rate)
    spec = np.fft.fft(iq)
    freqs = np.fft.fftfreq(n, d=1.0 / sample_rate)
    spec[np.abs(freqs) > bw_hz / 2.0] = 0.0
    filt = np.fft.ifft(spec)
    m = max(1, int(sample_rate // max(1.0, 2.0 * bw_hz)))
    return filt[::m].astype(np.complex64), sample_rate / m


def _empty(reason_conf: float = 0.0) -> ModulationEstimate:
    return {
        "modulation": "unknown",
        "symbol_rate_hz": None,
        "amplitude_depth": 0.0,
        "freq_spread_hz": 0.0,
        "confidence": reason_conf,
    }


def estimate_modulation(iq: np.ndarray, sample_rate: int) -> ModulationEstimate:
    """Estimate a coarse modulation type + symbol rate from an ISOLATED-channel
    IQ block. Presence-gated: returns "unknown" (conf 0) when no clear burst is
    present, so noise in an idle window is not misreported."""
    n = int(iq.size)
    if n < 128 or sample_rate <= 0:
        return _empty()

    mag = np.abs(iq).astype(np.float64)
    mmax = float(mag.max())
    if mmax <= 1e-9:
        return _empty()

    # Duty-robust envelope statistics (percentiles, not mean/median, so both
    # low-duty bursts and ~50% keying behave sensibly).
    noise_level = float(np.percentile(mag, 40))  # robust "off"/noise level
    peak = float(np.percentile(mag, 99))  # robust "on"/peak level
    p10 = float(np.percentile(mag, 10))
    p90 = float(np.percentile(mag, 90))
    contrast = peak / (noise_level + 1e-12)  # high => distinct on/off (OOK)
    flatness = p10 / (p90 + 1e-12)  # ~1 constant envelope, ~0 noise or OOK

    # Frequency movement (for FSK): std of instantaneous frequency.
    phase = np.unwrap(np.angle(iq))
    inst = np.diff(phase) * (sample_rate / (2.0 * np.pi))
    freq_spread = float(np.std(inst)) if inst.size else 0.0

    if contrast >= 5.0:
        # Distinct on/off keying.
        on = mag > (noise_level + 0.5 * (peak - noise_level))
        symbol_rate: float | None = None
        edges = np.flatnonzero(np.diff(on.astype(np.int8)) != 0)
        if edges.size >= 2:
            runs = np.diff(edges).astype(np.float64)
            unit = float(np.percentile(runs, 20))
            if unit >= 2.0:
                rate = sample_rate / unit
                if 10.0 <= rate <= sample_rate / 4.0:
                    symbol_rate = round(rate, 1)
        inst_on = inst[on[:-1]] if on.any() else inst
        return {
            "modulation": "OOK",
            "symbol_rate_hz": symbol_rate,
            "amplitude_depth": round(min(1.0, (peak - noise_level) / peak), 3),
            "freq_spread_hz": round(float(np.std(inst_on)) if inst_on.size else 0.0, 1),
            "confidence": round(min(1.0, 0.4 + 0.08 * (contrast - 5.0)), 2),
        }

    if flatness > 0.5 and freq_spread > 0.02 * sample_rate:
        # Constant-envelope carrier (not noise: even the low percentile is high)
        # with frequency movement -> looks like FSK.
        return {
            "modulation": "FSK",
            "symbol_rate_hz": None,
            "amplitude_depth": round(min(1.0, (peak - noise_level) / peak), 3),
            "freq_spread_hz": round(freq_spread, 1),
            "confidence": 0.5,
        }

    # No clear on/off keying and no clean constant carrier: don't guess.
    return _empty()
