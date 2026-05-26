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
