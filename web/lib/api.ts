/** API base URL — single source of truth for the FastAPI backend address.
 *
 * Both ``useRoast`` and ``useChat`` were declaring this literal twice. A
 * future tighten-CORS / origin change is now a one-line edit instead of a
 * grep-and-pray.
 *
 * Note on Next.js: `NEXT_PUBLIC_*` is **build-time** inlined into the bundle,
 * not read at runtime. The Azure SWA pipeline must inject this before
 * ``next build``; otherwise the production chat hits localhost. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/** Join a path onto the API base, normalizing the slash. */
export function apiUrl(path: string): string {
  const base = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
  const tail = path.startsWith("/") ? path : `/${path}`;
  return `${base}${tail}`;
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
