"""FastAPI face for Insult AI. Mirrors discord-bot's runner (POST /v1/turn),
but trimmed to the hackathon's one job: POST /roast."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .runner import roast

app = FastAPI(title="Insult AI", version="0.1.0")

# Wide-open CORS for the demo (the Next.js front lives on a different origin).
# Tighten to the Vercel/SWA origin before anything real.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RoastRequest(BaseModel):
    target: str  # a URL or a claim to roast + fact-check
    backend: str | None = None  # "claude" | "codex" (defaults to INSULT_AI_BACKEND)


class RoastResponse(BaseModel):
    roast: str
    usage: dict | None = None


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/roast", response_model=RoastResponse)
async def do_roast(req: RoastRequest) -> RoastResponse:
    result = await roast(req.target, backend=req.backend)
    return RoastResponse(roast=result.text, usage=result.usage)
