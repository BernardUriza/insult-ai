const SCHEME_RE = /^https?:\/\/\S+$/i;
const BARE_DOMAIN_RE =
  /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

export function targetUrlFromInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.includes("@")) return null;
  const candidate = SCHEME_RE.test(trimmed)
    ? trimmed
    : BARE_DOMAIN_RE.test(trimmed)
      ? `https://${trimmed}`
      : "";
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeTargetInput(value: string): string {
  return targetUrlFromInput(value) ?? value.trim();
}

export function targetHost(value: string): string | null {
  const url = targetUrlFromInput(value);
  if (!url) return null;
  return new URL(url).host.replace(/^www\./, "");
}
