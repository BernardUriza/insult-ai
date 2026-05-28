"""POST /roast endpoint."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from ..auth import limiter, verify_api_key
from ..models import RoastRequest, RoastResponse
from ..runner import roast
from ..validation import REQUEST_TEXT_MAX_CHARS, clean_optional_id, clean_text, validate_backend

_log = logging.getLogger("insult_ai.routes.roast")

router = APIRouter()


@router.post("/roast", response_model=RoastResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("10/hour")
async def do_roast(request: Request, req: RoastRequest) -> RoastResponse:
    # SlowAPI needs `request: Request` to extract the client IP. Don't drop it.
    target = clean_text(req.target, field="target", max_chars=REQUEST_TEXT_MAX_CHARS)
    backend = validate_backend(req.backend)
    corpus_id = clean_optional_id(req.corpus_id, field="corpus_id")
    try:
        result = await roast(
            target,
            backend=backend,
            corpus_id=corpus_id,
            mode=req.mode,
            tone=req.tone,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - external agent boundary
        _log.exception("roast failed mode=%s backend=%s", req.mode, backend)
        raise HTTPException(
            status_code=502,
            detail="agent backend failed while generating a response",
        ) from exc
    return RoastResponse(roast=result.text, usage=result.usage)
