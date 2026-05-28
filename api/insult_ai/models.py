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
    source_name: str | None = Field(default=None, max_length=128)

    class Config:
        extra = "forbid"


class DocumentQuestion(BaseModel):
    question_id: int
    question: str
    source: Literal["llm_initial", "user_query"] = "llm_initial"
    timestamp: str = ""
    answer: str | None = None
    image_query: str = ""
    image_url: str = ""
    image_source_url: str = ""


class IngestResponse(BaseModel):
    chunks: int
    suggested_questions: list[DocumentQuestion] = Field(default_factory=list)


class DocumentInfo(BaseModel):
    doc_id: str
    chunk_count: int
    status: str
    suggested_questions: list[DocumentQuestion] = Field(default_factory=list)


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


class QuipRequest(BaseModel):
    # Decorative waiting-room line for the clinical skeleton. The full message
    # is sent so the quip can react to its content; a cheap-tier one-shot
    # generates the line (see clinical/quip.py).
    message: str = Field(..., min_length=1, max_length=REQUEST_TEXT_MAX_CHARS)
    backend: str | None = None  # "claude" | "codex"
    tone: Literal["soft", "medium", "spicy", "no_insults"] = "medium"

    class Config:
        extra = "forbid"


class QuipResponse(BaseModel):
    # Null when the message is sensitive/crisis or generation failed — the
    # UI then keeps its hardcoded fallback line.
    quip: str | None = None
