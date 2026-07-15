"""POST /api/data/clear — control-lease gating and data wipe."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_clear_requires_control_lease(client: AsyncClient) -> None:
    r = await client.post("/api/data/clear", json={"client_id": "nobody"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_clear_wipes_channels_but_keeps_config(client: AsyncClient) -> None:
    await client.post("/api/control/acquire", json={"client_id": "op", "display_name": "Op"})
    cfg_before = (await client.get("/api/config")).json()

    r = await client.post("/api/data/clear", json={"client_id": "op"})
    assert r.status_code == 200, r.text

    channels = (await client.get("/api/channels")).json()["channels"]
    assert channels == []
    recordings = (await client.get("/api/recordings")).json()["recordings"]
    assert recordings == []

    # Scan configuration is preserved across a data wipe.
    cfg_after = (await client.get("/api/config")).json()
    assert cfg_after["start_hz"] == cfg_before["start_hz"]
    assert cfg_after["end_hz"] == cfg_before["end_hz"]
