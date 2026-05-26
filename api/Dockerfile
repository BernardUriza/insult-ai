# insult_ai backend — Azure Container Apps image.
# Imitates discord-bot/infra/azure/runner.Dockerfile: conda-native base, Node
# CLIs for both agent backends, non-root user (Claude Code refuses root).
# Build from the api/ dir:  docker build -t insult-ai api/
FROM quay.io/condaforge/miniforge3:latest
SHELL ["/bin/bash", "-l", "-c"]
WORKDIR /app

# Conda env into base (Python + Node + fi-runner + FastAPI).
COPY environment.yml .
RUN mamba env update -n base -f environment.yml \
 && mamba clean --all --yes \
 && find /opt/conda/ -follow -type f -name '*.pyc' -delete

# Agent CLIs (npm binaries — fi_runner shells out to these):
#   - @anthropic-ai/claude-code  → ClaudeCodeBackend
#   - @openai/codex              → CodexBackend (Azure API-motor)
#   - @brightdata/mcp            → the live-web MCP server (pre-installed so the
#                                   first request doesn't pay an npx cold fetch)
# Pin npm's global prefix to /usr/local (Linux standard) instead of conda's
# /opt/conda. The Python `mcp` package (Claude Agent SDK dep) installs its own
# /opt/conda/bin/mcp, and `@brightdata/mcp` would collide there — EEXIST.
# /usr/local/bin is already in the default PATH, so the resulting `claude`,
# `codex`, `mcp` binaries resolve cleanly from any shell. fi-runner shells out
# via `claude`, `codex` and `npx @brightdata/mcp` — npx finds the package
# wherever it's installed.
RUN npm config set prefix /usr/local && \
    npm install -g @anthropic-ai/claude-code @openai/codex @brightdata/mcp

# App code (insult_ai/ package + entrypoint).
COPY . /app/
RUN chmod +x /app/entrypoint.sh

# Non-root user — MANDATORY: Claude Code refuses --dangerously-skip-permissions
# (BYPASS mode) as root. HOME set so the SDK writes ~/.claude/.credentials.json.
RUN useradd --create-home --shell /bin/bash --uid 10001 runner \
 && chown -R runner:runner /app /home/runner
USER runner
ENV HOME=/home/runner

EXPOSE 8080
CMD ["/app/entrypoint.sh"]
