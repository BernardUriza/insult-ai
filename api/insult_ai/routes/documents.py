"""Document corpus endpoints: POST /documents, /documents/upload, GET /documents/list."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from ..document_questions import generate_source_questions, get_document_questions
from ..auth import limiter, verify_api_key
from ..models import DocumentInfo, DocumentListResponse, DocumentQuestion, IngestRequest, IngestResponse
from ..startup import _rag
from ..validation import (
    INGEST_TEXT_MAX_BYTES,
    REQUEST_TEXT_MAX_CHARS,
    clean_text,
    read_upload_limited,
    validate_id,
)

_log = logging.getLogger("insult_ai.routes.documents")

router = APIRouter()

# Whitelist of file extensions. Text-only for v1 — adding PDFs is one
# `pypdf` dep + a few lines below when the asks come in.
_UPLOAD_ALLOWED_EXTENSIONS = {".txt", ".md"}
# 5 MB raw upload ceiling.
_UPLOAD_MAX_BYTES = 5 * 1024 * 1024


def _clean_source_name(value: str | None, fallback: str) -> str:
    cleaned = " ".join((value or "").strip().split())
    return (cleaned or fallback)[:128]


def _question_models(records: list[dict[str, str]]) -> list[DocumentQuestion]:
    return [
        DocumentQuestion(
            question_id=i + 1,
            question=record.get("question", ""),
            image_query=record.get("image_query", ""),
            image_url=record.get("image_url", ""),
            image_source_url=record.get("image_source_url", ""),
        )
        for i, record in enumerate(records)
        if record.get("question")
    ]


@router.post("/documents", response_model=IngestResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("60/hour")
async def ingest_document(request: Request, req: IngestRequest) -> IngestResponse:
    """Feed a document into a corpus the agent can mine during a later roast."""
    corpus_id = validate_id(req.corpus_id, field="corpus_id")
    doc_id = validate_id(req.doc_id, field="doc_id")
    text = clean_text(req.text, field="text", max_chars=REQUEST_TEXT_MAX_CHARS * 10)
    text_bytes = len(text.encode("utf-8"))
    if text_bytes > INGEST_TEXT_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"text too large ({text_bytes} bytes); max {INGEST_TEXT_MAX_BYTES} bytes",
        )
    try:
        chunks = await _rag.ingest(corpus_id, doc_id, text, min_chunk_size=30)
    except Exception as exc:  # noqa: BLE001 - RAG store boundary
        _log.exception("document ingest failed corpus_id=%s doc_id=%s", corpus_id, doc_id)
        raise HTTPException(
            status_code=502, detail="document store failed while ingesting text"
        ) from exc
    questions = await generate_source_questions(
        corpus_id=corpus_id,
        doc_id=doc_id,
        text=text,
        source_name=_clean_source_name(req.source_name, doc_id),
    )
    return IngestResponse(chunks=chunks, suggested_questions=_question_models(questions))


@router.post(
    "/documents/upload",
    response_model=IngestResponse,
    dependencies=[Depends(verify_api_key)],
)
@limiter.limit("60/hour")
async def upload_document(
    request: Request,
    corpus_id: str = Form(...),
    doc_id: str = Form(...),
    source_name: str | None = Form(None),
    file: UploadFile = File(...),
) -> IngestResponse:
    """Multipart sibling of /documents — accepts a `.txt` or `.md` file.
    Same chunking + embedding + pgvector path as the paste flow."""
    corpus_id = validate_id(corpus_id, field="corpus_id")
    doc_id = validate_id(doc_id, field="doc_id")
    try:
        filename = file.filename or "uploaded.txt"
        dot = filename.rfind(".")
        ext = filename[dot:].lower() if dot >= 0 else ""
        if ext not in _UPLOAD_ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=(
                    f"unsupported file type {ext!r}; "
                    f"allowed: {sorted(_UPLOAD_ALLOWED_EXTENSIONS)}"
                ),
            )
        raw = await read_upload_limited(file, max_bytes=_UPLOAD_MAX_BYTES)
        # errors="replace" — bad bytes become U+FFFD; doc still useful for search.
        text = raw.decode("utf-8", errors="replace").strip()
        if not text:
            raise HTTPException(status_code=400, detail="file contains no text")
        try:
            chunks = await _rag.ingest(corpus_id, doc_id, text, min_chunk_size=30)
        except Exception as exc:  # noqa: BLE001 - RAG store boundary
            _log.exception(
                "document upload ingest failed corpus_id=%s doc_id=%s filename=%s",
                corpus_id, doc_id, filename,
            )
            raise HTTPException(
                status_code=502, detail="document store failed while ingesting upload"
            ) from exc
    finally:
        await file.close()
    questions = await generate_source_questions(
        corpus_id=corpus_id,
        doc_id=doc_id,
        text=text,
        source_name=_clean_source_name(source_name, filename),
    )
    return IngestResponse(chunks=chunks, suggested_questions=_question_models(questions))


@router.get(
    "/documents/list",
    response_model=DocumentListResponse,
    dependencies=[Depends(verify_api_key)],
)
@limiter.limit("60/hour")
async def list_documents_endpoint(request: Request, corpus_id: str) -> DocumentListResponse:
    """List documents ingested into a corpus — straight from pgvector."""
    corpus = validate_id(corpus_id, field="corpus_id")
    docs = await _rag.list_documents(corpus)
    documents: list[DocumentInfo] = []
    for d in docs:
        doc_id = d["doc_id"]
        documents.append(
            DocumentInfo(
                doc_id=doc_id,
                chunk_count=d["chunk_count"],
                status=d.get("status", ""),
                suggested_questions=_question_models(await get_document_questions(corpus, doc_id)),
            )
        )
    return DocumentListResponse(corpus_id=corpus, documents=documents)


@router.get(
    "/documents/{doc_id}/questions",
    response_model=list[DocumentQuestion],
    dependencies=[Depends(verify_api_key)],
)
@limiter.limit("60/hour")
async def document_questions_endpoint(
    request: Request, doc_id: str, corpus_id: str
) -> list[DocumentQuestion]:
    """Return LLM-generated starter questions for one document source."""
    corpus = validate_id(corpus_id, field="corpus_id")
    doc = validate_id(doc_id, field="doc_id")
    questions = await get_document_questions(corpus, doc)
    return _question_models(questions)
