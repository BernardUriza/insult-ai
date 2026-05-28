"""FastAPI face for Insult AI. POST /roast (a URL/claim), plus /documents to feed
the agent a personal corpus it can mine during the roast (rag_store), plus
POST /chat/stream — a multi-turn chat with live chain-of-thought (SSE)."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .auth import limiter
from .routes import chat_router, documents_router, roast_router, voice_router
from .startup import _rag  # noqa: F401 — import triggers the psych-corpus probe at boot

# Ensure our logger surfaces in uvicorn's stdout/stderr. uvicorn configures the
# `uvicorn.*` loggers but leaves the root handler-less in some setups — without
# this, `insult_ai.*.info(...)` calls silently disappear. Idempotent on --reload.
_root_log = logging.getLogger()
if not _root_log.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )
logging.getLogger("insult_ai").setLevel(logging.INFO)
_log = logging.getLogger("insult_ai.app")
_log.info("logging cabled — insult_ai routes registered")

app = FastAPI(title="Insult AI", version="0.1.0")

# CORS — accept origins listed in CORS_ALLOW_ORIGINS (comma-separated) or
# fall back to wide-open in dev. Production sets this to the SWA URL via
# Container App env var.
_cors_origins_env = (os.getenv("CORS_ALLOW_ORIGINS") or "").strip()
_cors_origins = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else ["*"]
)
if _cors_origins == ["*"]:
    _log.warning(
        "CORS_ALLOW_ORIGINS unset — accepting requests from any origin "
        "(dev convenience). Set the env var in production to lock CORS to "
        "the SWA URL."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(roast_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(voice_router)


@app.get("/health")
async def health() -> dict:
    # Intentionally UNGATED — Container Apps' liveness probe must reach this
    # without a key. Returns ok even when INSULT_AI_API_KEY is unset.
    return {"ok": True}
