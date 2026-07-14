"""Sweep-plan coverage tests.

Guards against a regression where the incrementing sweep position could stall
at a single centre and leave part of the band unscanned. The sweep must tile
the whole band and, when cycled, must visit every window centre (no stall).
"""

from __future__ import annotations

from app.config import Settings
from app.services.scan_manager import ScanManager


def _prepare(start_hz: int, end_hz: int, sample_rate: int, step_hz: int = 0) -> ScanManager:
    settings = Settings(
        simulation_mode=True,
        sdr_backend="sim",
        scan_start_hz=start_hz,
        scan_end_hz=end_hz,
        sdr_sample_rate=sample_rate,
        scan_step_hz=step_hz,
    )
    mgr = ScanManager.__new__(ScanManager)  # type: ignore[assignment]
    mgr._config = ScanManager._initial_config(settings)
    mgr._mode = "sweep"
    mgr._focus_center = None
    mgr._sweep_centers = []
    mgr._sweep_idx = 0
    return mgr


def _band_covered(mgr: ScanManager) -> bool:
    """Every point in [start, end] falls inside at least one window."""
    span = mgr._config.sample_rate
    start = mgr._config.start_hz
    end = mgr._config.end_hz
    windows = [(c - span // 2, c + span // 2) for c in mgr._sweep_centers]
    # Sample the band finely and assert coverage.
    n = 2000
    for i in range(n + 1):
        f = start + (end - start) * i // n
        if not any(lo <= f <= hi for lo, hi in windows):
            return False
    return True


def test_wide_band_is_fully_tiled() -> None:
    # 3 MHz band, 2.4 MHz window -> must need more than one window and cover all.
    mgr = _prepare(867_000_000, 870_000_000, 2_400_000)
    mgr._compute_sweep_plan()
    assert len(mgr._sweep_centers) >= 2
    assert _band_covered(mgr)


def test_sweep_does_not_stall_and_visits_all_centres() -> None:
    mgr = _prepare(867_000_000, 870_000_000, 2_400_000)
    mgr._compute_sweep_plan()
    plan = list(mgr._sweep_centers)
    visited: set[int] = set()
    # Advancing len(plan) times must cycle through every centre exactly once.
    for _ in range(len(plan)):
        visited.add(mgr._current_center())
        mgr._advance_sweep(mgr._config.sample_rate)
    assert visited == set(plan)
    # And it wraps back to the first centre (no permanent stall).
    assert mgr._current_center() == plan[0]


def test_narrow_band_parks_single_window() -> None:
    # Band (200 kHz) narrower than window (2.4 MHz) -> one parked centre at mid-band.
    mgr = _prepare(868_200_000, 868_400_000, 2_400_000)
    mgr._compute_sweep_plan()
    assert mgr._sweep_centers == [868_300_000]
    assert _band_covered(mgr)


def test_explicit_step_respected() -> None:
    mgr = _prepare(867_000_000, 872_000_000, 2_000_000, step_hz=1_000_000)
    mgr._compute_sweep_plan()
    centers = mgr._sweep_centers
    # Centres spaced by the explicit 1 MHz step.
    diffs = {centers[i + 1] - centers[i] for i in range(len(centers) - 1)}
    assert diffs == {1_000_000}
    assert _band_covered(mgr)
