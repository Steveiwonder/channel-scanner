"""Modulation-hint estimator: OOK burst vs noise vs constant carrier."""

from __future__ import annotations

import numpy as np

from app.signal_processing.modulation import estimate_modulation, isolate_and_decimate


def test_noise_is_unknown() -> None:
    rng = np.random.default_rng(1)
    n = 20000
    noise = (rng.standard_normal(n) + 1j * rng.standard_normal(n)).astype(np.complex64)
    est = estimate_modulation(noise, 240_000)
    assert est["modulation"] == "unknown"
    assert est["confidence"] == 0.0


def test_ook_burst_classified_ook() -> None:
    fs = 240_000
    n = 24000
    rng = np.random.default_rng(2)
    noise = (rng.standard_normal(n) + 1j * rng.standard_normal(n)) * 0.02
    t = np.arange(n) / fs
    carrier = np.exp(1j * 2 * np.pi * 1000.0 * t)
    # OOK gate: 1200 baud square-ish on/off pattern.
    gate = (np.floor(t * 1200.0).astype(int) % 2 == 0).astype(float)
    iq = (carrier * gate + noise).astype(np.complex64)
    est = estimate_modulation(iq, fs)
    assert est["modulation"] == "OOK"
    assert est["symbol_rate_hz"] is not None
    assert est["confidence"] > 0.0


def test_isolate_and_decimate_reduces_rate() -> None:
    fs = 2_400_000
    n = 32768
    rng = np.random.default_rng(3)
    iq = (rng.standard_normal(n) + 1j * rng.standard_normal(n)).astype(np.complex64)
    dec, rate = isolate_and_decimate(iq, fs, 60_000.0)
    assert rate < fs
    assert dec.size < n
