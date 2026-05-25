"""FastAPI face for Insult AI. POST /roast (a URL/claim), plus /documents to feed
the agent a personal corpus it can mine during the roast (rag_store)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fi_runner.rag_store import RagStoreClient
from pydantic import BaseModel

from .runner import roast

app = FastAPI(title="Insult AI", version="0.1.0")

# Wide-open CORS for the demo (the Next.js front lives on a different origin).
# Tighten to the SWA origin before anything real.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Programmatic, boundary-clean store client (imports fi_core internally; results
# are plain dicts). Same FI_RAG_* env as the agent's rag_store MCP, so a doc
# ingested here is searchable by the agent during a roast.
_rag = RagStoreClient()


class RoastRequest(BaseModel):
    target: str  # a URL or a claim to roast + fact-check
    backend: str | None = None  # "claude" | "codex" (defaults to INSULT_AI_BACKEND)
    corpus_id: str | None = None  # if set, the agent also mines this document corpus


class RoastResponse(BaseModel):
    roast: str
    usage: dict | None = None


class IngestRequest(BaseModel):
    corpus_id: str
    doc_id: str
    text: str


class IngestResponse(BaseModel):
    chunks: int


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/roast", response_model=RoastResponse)
async def do_roast(req: RoastRequest) -> RoastResponse:
    result = await roast(req.target, backend=req.backend, corpus_id=req.corpus_id)
    return RoastResponse(roast=result.text, usage=result.usage)


@app.post("/documents", response_model=IngestResponse)
async def ingest_document(req: IngestRequest) -> IngestResponse:
    """Feed a document into a corpus the agent can mine during a later roast."""
    # Low min_chunk_size so short pastes (a paragraph, a bio) still get stored,
    # not silently dropped.
    chunks = await _rag.ingest(req.corpus_id, req.doc_id, req.text, min_chunk_size=30)
    return IngestResponse(chunks=chunks)
