"""GET /api/decodes, POST /api/decoder/run — optional receive-only decoding.

Decoder output is kept separate from the app's own channel detections: it is a
best-effort protocol label (via rtl_433 when present, or simulated), never a
claim about a specific device, and never bypasses encryption.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..context import AppContext
from ..models import schemas
from .deps import get_context

router = APIRouter(tags=["decoder"])


@router.get("/decodes", response_model=schemas.DecodesResponse)
async def list_decodes(
    limit: int = 200, ctx: AppContext = Depends(get_context)
) -> schemas.DecodesResponse:
    decodes = await ctx.repos.decodes.list(limit=max(1, min(1000, limit)))
    return schemas.DecodesResponse(decodes=decodes, decoder_available=ctx.decoder.available())


@router.post("/decoder/run", response_model=schemas.DecoderRunResponse)
async def run_decoder(ctx: AppContext = Depends(get_context)) -> schemas.DecoderRunResponse:
    ran, message, frames = await ctx.scan_manager.run_decoder()
    return schemas.DecoderRunResponse(ok=True, ran=ran, message=message, decodes=frames)
