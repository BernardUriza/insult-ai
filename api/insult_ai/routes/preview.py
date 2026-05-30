"""GET /preview — server-side OG/Twitter card metadata."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..auth import limiter, verify_api_key
from ..models import PreviewResponse
from ..preview import PreviewError, fetch_url_preview

_log = logging.getLogger("insult_ai.routes.preview")

router = APIRouter()


@router.get("/preview", response_model=PreviewResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("120/hour")
async def preview_endpoint(request: Request, url: str = Query(..., max_length=2048)) -> PreviewResponse:
    try:
        data = await fetch_url_preview(url)
    except PreviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - external page boundary
        _log.info("preview fetch failed url=%s err=%s", url, exc)
        raise HTTPException(status_code=502, detail="could not fetch preview metadata") from exc
    return PreviewResponse(url=url, **data)
