"""Decoder, occupancy, and cu8-recording endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_decodes_endpoint_and_run(client: AsyncClient) -> None:
    # No rtl_433 in tests -> decoder unavailable, run synthesizes sim decodes.
    listed = (await client.get("/api/decodes")).json()
    assert listed["decoder_available"] is False

    run = (await client.post("/api/decoder/run")).json()
    assert run["ok"] is True
    assert run["ran"] is False
    assert len(run["decodes"]) >= 1
    assert run["decodes"][0]["decoder"] == "sim"

    after = (await client.get("/api/decodes")).json()
    assert len(after["decodes"]) >= 1


@pytest.mark.asyncio
async def test_occupancy_grid_shape(client: AsyncClient) -> None:
    r = await client.get("/api/occupancy?freq_bins=32&minutes=5&bucket_seconds=30")
    assert r.status_code == 200
    body = r.json()
    assert body["freq_bins"] == 32
    assert len(body["grid"]) == len(body["bucket_starts"])
    assert all(len(row) == 32 for row in body["grid"])


@pytest.mark.asyncio
async def test_cu8_recording_is_smaller(client: AsyncClient, ctx) -> None:  # noqa: ANN001
    ctx.recorder.apply_config(True, 2.0)  # enable IQ recording for the test
    cf32 = (
        await client.post(
            "/api/recordings/start",
            json={"center_hz": 867_500_000, "duration_ms": 200, "format": "cf32"},
        )
    ).json()
    cu8 = (
        await client.post(
            "/api/recordings/start",
            json={"center_hz": 867_500_000, "duration_ms": 200, "format": "cu8"},
        )
    ).json()
    assert cf32["format"] == "cf32_le"
    assert cu8["format"] == "cu8"
    # cu8 is 2 bytes/sample vs 8 for cf32 -> ~4x smaller.
    assert cu8["bytes"] < cf32["bytes"]

    dl = await client.get(f"/api/recordings/{cu8['id']}/download")
    assert dl.status_code == 200
