"""GET /api/occupancy — frequency x time occupancy grid from stored detections.

Answers "which parts of the band were active, and when" — useful for spotting
infrequent, scheduled transmitters (e.g. a meter that reports periodically).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from ..context import AppContext
from ..models import schemas
from ..utils import iso, utcnow
from .deps import get_context

router = APIRouter(tags=["occupancy"])


def _parse(ts: str) -> float:
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()


@router.get("/occupancy", response_model=schemas.OccupancyResponse)
async def occupancy(
    freq_bins: int = 96,
    minutes: int = 30,
    bucket_seconds: int = 30,
    ctx: AppContext = Depends(get_context),
) -> schemas.OccupancyResponse:
    freq_bins = max(8, min(512, freq_bins))
    minutes = max(1, min(1440, minutes))
    bucket_seconds = max(5, min(3600, bucket_seconds))

    cfg = ctx.scan_manager.config
    start_hz, end_hz = int(cfg.start_hz), int(cfg.end_hz)
    span = max(1, end_hz - start_hz)

    now = utcnow()
    since = now - timedelta(minutes=minutes)
    since_ts = since.timestamp()
    n_buckets = max(1, int(minutes * 60 // bucket_seconds))

    grid = [[0] * freq_bins for _ in range(n_buckets)]
    for ts, center in await ctx.repos.detections.centers_since(iso(since)):
        b = int((_parse(ts) - since_ts) // bucket_seconds)
        if b < 0 or b >= n_buckets:
            continue
        fb = int((center - start_hz) / span * freq_bins)
        if fb < 0 or fb >= freq_bins:
            continue
        grid[b][fb] += 1

    bucket_starts = [iso(since + timedelta(seconds=i * bucket_seconds)) for i in range(n_buckets)]
    return schemas.OccupancyResponse(
        f_start_hz=start_hz,
        f_stop_hz=end_hz,
        freq_bins=freq_bins,
        bucket_seconds=bucket_seconds,
        bucket_starts=bucket_starts,
        grid=grid,
    )
