"""Route sub-package — re-exports all APIRouters for include_router in app.py."""
from .chat import router as chat_router
from .documents import router as documents_router
from .roast import router as roast_router
from .voice import router as voice_router

__all__ = ["chat_router", "documents_router", "roast_router", "voice_router"]
