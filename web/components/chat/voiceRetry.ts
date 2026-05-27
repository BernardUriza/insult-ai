"use client";

/** Shared retry-with-backoff helper for the voice endpoints.
 *
 * Both /voice/speak and /voice/transcribe can hit Azure's RPM quota on the
 * Whisper/TTS deployments (currently 3 req/min each on Bernard's S0). The
 * backend propagates Azure's 429 as a real 429 with a `Retry-After` header
 * (in seconds) so this helper can wait the exact recommended interval
 * instead of guessing.
 *
 * Behavior:
 *   - retry ONLY on 429 (rate-limit) and 503 (transient). Other errors
 *     bubble immediately — a 401 isn't going to fix itself by waiting.
 *   - prefer `Retry-After` from the response; fall back to exponential
 *     (1s, 2s, 4s) when the header isn't set.
 *   - cap retries at 2 (3 total attempts) — beyond that we surface to
 *     the user with the original error so they know quota was hit.
 *   - call `onRetry({attempt, waitMs})` between attempts so the UI can
 *     paint a "retrying in 32s…" status instead of going silent. */

const RETRY_STATUS_CODES = new Set([429, 503]);
const MAX_RETRIES = 2;
const FALLBACK_BACKOFF_MS = [1000, 2000, 4000];

export interface RetryEvent {
  attempt: number;
  waitMs: number;
  reason: "rate-limit" | "transient";
}

export interface FetchWithRetryOptions {
  /** Called with progress before each wait so the UI can show "retrying in
   * N seconds". Not called on the first attempt or on success. */
  onRetry?: (event: RetryEvent) => void;
  /** Override the default max retries (2). */
  maxRetries?: number;
}

function parseRetryAfter(header: string | null, fallbackMs: number): number {
  if (!header) return fallbackMs;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    // Cap at 60s — even a brutal quota window shouldn't block the UX
    // for more than a minute. Beyond that, surface the error.
    return Math.min(asSeconds * 1000, 60_000);
  }
  // Could be an HTTP-date; we don't parse those, fall back to backoff.
  return fallbackMs;
}

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** Wrap a fetch invocation with retry-on-429/503 + Retry-After awareness.
 * The supplied `requestFn` MUST be idempotent — both endpoints we use it
 * with are (synthesize same text, re-upload same audio blob).
 *
 * Returns the final Response (caller checks `.ok` and parses body). */
export async function fetchWithRetry(
  requestFn: () => Promise<Response>,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const { onRetry, maxRetries = MAX_RETRIES } = options;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await requestFn();
    if (response.ok) return response;
    lastResponse = response;
    if (!RETRY_STATUS_CODES.has(response.status)) return response;
    if (attempt === maxRetries) return response;

    const fallback = FALLBACK_BACKOFF_MS[Math.min(attempt, FALLBACK_BACKOFF_MS.length - 1)];
    const waitMs = parseRetryAfter(response.headers.get("retry-after"), fallback);
    onRetry?.({
      attempt: attempt + 1,
      waitMs,
      reason: response.status === 429 ? "rate-limit" : "transient",
    });
    await sleep(waitMs);
  }

  // Unreachable: the loop always returns. The non-null assertion is
  // defensive against future edits.
  return lastResponse!;
}
