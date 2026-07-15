"""Live scope (focus) mode + OOK simulator pulse structure."""

from __future__ import annotations

import numpy as np
import pytest
from httpx import AsyncClient

from app.sdr.sim import SimEmitter


@pytest.mark.asyncio
async def test_focus_enters_scope_mode_and_sweep_resets(client: AsyncClient, ctx) -> None:  # noqa: ANN001
    r = await client.post("/api/scan/focus", json={"center_hz": 867_500_000})
    assert r.status_code == 200, r.text
    assert ctx.scan_manager.mode == "focus"
    assert ctx.scan_manager.focus_center_hz == 867_500_000

    r = await client.post("/api/scan/sweep")
    assert r.status_code == 200, r.text
    assert ctx.scan_manager.mode == "sweep"
    assert ctx.scan_manager.focus_center_hz is None


def test_ook_gate_produces_a_pulse_train() -> None:
    em = SimEmitter(
        867_500_000,
        30_000,
        22.0,
        period_s=4.0,
        duty=0.06,
        ook=True,
        baud=1200.0,
        pattern=0b1011010011001011,
    )
    t = np.arange(0.0, 0.05, 1.0 / 2_400_000)
    gate = em.ook_gate(t)
    # Pure on/off, and it actually toggles (a pulse train, not a constant level).
    assert set(np.unique(gate)).issubset({0.0, 1.0})
    transitions = int(np.sum(np.abs(np.diff(gate)) > 0))
    assert transitions >= 4
