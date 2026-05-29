/** API base URL — single source of truth for the FastAPI backend address.
 *
 * Both ``useRoast`` and ``useChat`` were declaring this literal twice. A
 * future tighten-CORS / origin change is now a one-line edit instead of a
 * grep-and-pray.
 *
 * Note on Next.js: `NEXT_PUBLIC_*` is **build-time** inlined into the bundle,
 * not read at runtime. The Azure SWA pipeline must inject this before
 * ``next build``; otherwise the production chat hits localhost. */
const DEFAULT_DEV_API_URL = "http://localhost:8080";

export const API_URL = normalizeApiUrl(
  process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_DEV_API_URL,
);

// Client abort for a /chat/stream turn. MUST stay LONGER than the backend's
// INSULT_AI_CHAT_TURN_TIMEOUT_S (600s) so the SERVER wins the race and returns
// its own timeout message instead of the client aborting first. Heavy agentic
// briefs run 3-6 min; the old 210s killed them client-side (P0, 2026-05-28).
export const CHAT_STREAM_TIMEOUT_MS = 630_000;
export const API_REQUEST_TIMEOUT_MS = 30_000;
export const MAX_CHAT_MESSAGE_CHARS = 12_000;
export const MAX_LIBRARY_TEXT_CHARS = 120_000;
export const MAX_LIBRARY_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_INLINE_ATTACHMENT_BYTES = 256 * 1024;
export const MAX_VOICE_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_TTS_CHARS = 4096;

function normalizeApiUrl(raw: string): string {
  const value = raw.trim();
  try {
    const url = new URL(value);
    return url.toString().replace(/\/$/, "");
  } catch {
    if (process.env.NODE_ENV !== "production") return DEFAULT_DEV_API_URL;
    throw new Error(`Invalid NEXT_PUBLIC_API_URL: ${value}`);
  }
}

/** Join a path onto the API base, normalizing the slash. */
export function apiUrl(path: string): string {
  const tail = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${tail}`;
}

/** Optional shared API key — same caveat as `API_URL`: `NEXT_PUBLIC_*` is
 * **build-time** inlined, so it ends up in the bundle a user can read in
 * DevTools. That's intentional: this is NOT a secret, it's a public gate
 * that costs an attacker the price of opening `Sources` to skim. The real
 * cost-control floor is the API-side per-IP rate limit (see
 * `app.py:limiter`). Leave unset in dev — the API fail-opens. */
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

/** Build the headers needed to talk to the API. Centralized so a future
 * scheme change (e.g. Bearer JWT) is one edit, and so we never accidentally
 * ship a request that forgets the key. */
export function apiHeaders(extra?: HeadersInit): HeadersInit {
  const base: Record<string, string> = {};
  if (API_KEY) base["X-API-Key"] = API_KEY;
  if (extra instanceof Headers) {
    extra.forEach((v, k) => (base[k] = v));
  } else if (Array.isArray(extra)) {
    for (const [k, v] of extra) base[k] = v;
  } else if (extra) {
    Object.assign(base, extra);
  }
  return base;
}

export async function apiErrorMessage(res: Response): Promise<string> {
  let body = "";
  try {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await res.json()) as { detail?: unknown; error?: unknown; message?: unknown };
      const detail = json.detail ?? json.error ?? json.message;
      if (typeof detail === "string") body = detail;
      else if (Array.isArray(detail)) body = detail.map((d) => String(d?.msg ?? d)).join("; ");
      else if (detail) body = String(detail);
    } else {
      body = await res.text();
    }
  } catch {
    body = "";
  }
  return body ? `HTTP ${res.status}: ${body}` : `HTTP ${res.status}: ${res.statusText}`;
}

export async function fetchApi(
  path: string,
  init: RequestInit = {},
  timeoutMs = API_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    return await fetch(apiUrl(path), { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw err;
  } finally {
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", onAbort);
  }
}
