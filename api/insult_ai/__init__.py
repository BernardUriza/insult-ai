"""insult_ai — a thin consumer of fi_runner for the Web Data UNLOCKED hackathon.

A brutally-honest roast & fact-check agent that pulls LIVE web data via the
Bright Data MCP server. Backend is swappable: Claude Code (Max OAuth) or
Codex (Azure OpenAI, API-motor mode). All the heavy lifting lives in the
public MIT library `fi-runner`; this package is just config + a FastAPI face.
"""

__version__ = "0.1.0"
