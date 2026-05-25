#!/bin/bash
# insult_ai entrypoint. Materializes the Claude Max OAuth token (same pattern as
# discord-bot/infra/azure/entrypoint.sh), then serves FastAPI.
set -euo pipefail

echo "[entrypoint] insult_ai booting — node $(node -v) | python $(python -V 2>&1)"

# --- Claude Code (Max) OAuth credential ------------------------------------
# The Claude Agent SDK looks for ~/.claude/.credentials.json. We write it from
# the CLAUDE_CODE_OAUTH_TOKEN secret at runtime (never baked into the image).
CRED_DIR="${HOME:-/home/runner}/.claude"
if [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  mkdir -p "$CRED_DIR"
  printf '{"oauth_token":"%s"}\n' "$CLAUDE_CODE_OAUTH_TOKEN" > "$CRED_DIR/.credentials.json"
  chmod 600 "$CRED_DIR/.credentials.json"
  echo "[entrypoint] Claude OAuth token materialized"
else
  echo "[entrypoint] WARN: CLAUDE_CODE_OAUTH_TOKEN unset — Claude backend will 401 (Codex backend still works)"
fi

# --- Serve -----------------------------------------------------------------
exec uvicorn insult_ai.app:app --host 0.0.0.0 --port 8080
