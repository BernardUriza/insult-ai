"""Voice endpoints: POST /voice/transcribe (Whisper) + POST /voice/speak (TTS)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from ..auth import limiter, verify_api_key
from ..models import SpeakRequest, TranscribeResponse
from ..validation import VOICE_UPLOAD_MAX_BYTES, read_upload_limited
from ..voice import (
    MAX_TTS_CHARS,
    VoiceError,
    VoiceRateLimitError,
    synthesize_speech,
    transcribe_audio,
)

router = APIRouter()

_AUDIO_ALLOWED_EXTS = {"webm", "mp3", "wav", "m4a", "ogg", "flac", "mp4", "mpeg", "mpga", "oga"}


@router.post(
    "/voice/transcribe",
    response_model=TranscribeResponse,
    dependencies=[Depends(verify_api_key)],
)
@limiter.limit("60/hour")
async def voice_transcribe(
    request: Request, audio: UploadFile = File(...)
) -> TranscribeResponse:
    """Multipart upload → Whisper → text. Frontend posts the MediaRecorder
    blob directly; no client-side transcoding needed."""
    try:
        filename = audio.filename or "audio.webm"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "webm"
        if ext not in _AUDIO_ALLOWED_EXTS:
            raise HTTPException(status_code=415, detail=f"unsupported audio type .{ext}")
        audio_bytes = await read_upload_limited(audio, max_bytes=VOICE_UPLOAD_MAX_BYTES)
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="empty audio payload")
        text = await transcribe_audio(audio_bytes, filename=filename)
    except VoiceRateLimitError as exc:
        # Propagate AS 429 with Retry-After so the frontend hook can back off.
        headers = {"Retry-After": str(exc.retry_after_seconds)} if exc.retry_after_seconds else {}
        raise HTTPException(status_code=429, detail=str(exc), headers=headers) from exc
    except VoiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        await audio.close()
    return TranscribeResponse(text=text)


@router.post("/voice/speak", dependencies=[Depends(verify_api_key)])
@limiter.limit("60/hour")
async def voice_speak(request: Request, req: SpeakRequest) -> Response:
    """Text → TTS (onyx by default) → audio/mpeg blob. Returns raw MP3
    bytes so the browser plays via URL.createObjectURL(blob)."""
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is empty")
    if len(text) > MAX_TTS_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"text is too long ({len(text)} chars); max {MAX_TTS_CHARS}",
        )
    try:
        audio_bytes = await synthesize_speech(text, voice=req.voice)
    except VoiceRateLimitError as exc:
        headers = {"Retry-After": str(exc.retry_after_seconds)} if exc.retry_after_seconds else {}
        raise HTTPException(status_code=429, detail=str(exc), headers=headers) from exc
    except VoiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    # 1h cache per (text, voice) — replaying a roast doesn't re-hit Azure.
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )
