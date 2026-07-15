"""POST /api/calibrate — estimate the tuner's ppm error from a known carrier.

Measures the strongest peak near a user-supplied reference frequency and derives
a suggested ppm correction. Receive-only measurement; applying the suggestion is
a normal config change (PUT /api/config).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..context import AppContext
from ..models import schemas
from .deps import get_context

router = APIRouter(tags=["calibrate"])


@router.post("/calibrate", response_model=schemas.CalibrateResponse)
async def calibrate(
    body: schemas.CalibrateBody, ctx: AppContext = Depends(get_context)
) -> schemas.CalibrateResponse:
    result = await ctx.scan_manager.calibrate(body.reference_hz, body.search_hz)
    return schemas.CalibrateResponse(**result)
