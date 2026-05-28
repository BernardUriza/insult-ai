"""Pydantic request/response models for the Insult AI HTTP API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .validation import REQUEST_TEXT_MAX_CHARS
from .voice import DEFAULT_VOICE, MAX_TTS_CHARS, TTSVoice


class RoastRequest(BaseModel):
    target: str = Field(..., min_length=1, max_length=REQUEST_TEXT_MAX_CHARS)
    backend: str | None = None  # "claude" | "codex" (defaults to INSULT_AI_BACKEND)
    corpus_id: str | None = Field(default=None, max_length=128)
    # roast (hook), brief (business value), clinical (compa-clínico coach).
    mode: Literal["roast", "brief", "clinical"] = "roast"
    # Only meaningful for `mode=clinical` — see policies/tone_levels.md.
    tone: Literal["soft", "medium", "spicy", "no_insults"] = "medium"

    class Config:
        extra = "forbid"


class RoastResponse(BaseModel):
    # Field name kept as `roast` for compat with useRoast.ts (reads data.roast).
    roast: str
    usage: dict | None = None


class IngestRequest(BaseModel):
    corpus_id: str = Field(..., min_length=1, max_length=128)
    doc_id: str = Field(..., min_length=1, max_length=128)
    text: str = Field(..., min_length=1, max_length=REQUEST_TEXT_MAX_CHARS * 10)

    class Config:
        extra = "forbid"


class IngestResponse(BaseModel):
    chunks: int


class DocumentInfo(BaseModel):
    doc_id: str
    chunk_count: int
    status: str


class DocumentListResponse(BaseModel):
    corpus_id: str
    documents: list[DocumentInfo]


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TTS_CHARS)
    # onyx = deadpan-anchor tone matching the roast persona.
    voice: TTSVoice = DEFAULT_VOICE

    class Config:
        extra = "forbid"


class TranscribeResponse(BaseModel):
    text: str


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=REQUEST_TEXT_MAX_CHARS)
    backend: str | None = None  # "claude" | "codex" (only claude streams live)
    corpus_id: str | None = Field(default=None, max_length=128)
    # Switching mode mid-conversation is allowed — the store replays prior
    # turns into the new persona's context. That's the whole point of three
    # modes over one engine.
    mode: Literal["roast", "brief", "clinical"] = "roast"
    # Only meaningful for clinical mode. Safety can override downward at
    # runtime — see policies/tone_levels.md.
    tone: Literal["soft", "medium", "spicy", "no_insults"] = "medium"

    class Config:
        extra = "forbid"
