"""POST /api/data/clear — wipe all recorded data.

Destructive: deletes channels, detections, bursts, events, sessions, recording
metadata, and recording files. The scan configuration is preserved. Requires the
control lease (like config changes) since the receiver is shared.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..context import AppContext
from ..models import schemas
from .deps import get_context

router = APIRouter(prefix="/data", tags=["data"])


@router.post("/clear", response_model=schemas.OkResponse)
async def clear_data(
    body: schemas.ClientActionBody, ctx: AppContext = Depends(get_context)
) -> schemas.OkResponse:
    if not ctx.lease.is_operator(body.client_id):
        raise HTTPException(
            status_code=403,
            detail="control lease required; acquire it via POST /api/control/acquire",
        )
    await ctx.scan_manager.clear_all_data()
    return schemas.OkResponse(ok=True)
