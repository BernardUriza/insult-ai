/**
 * Status Icons — pending / done / error indicators.
 *
 * Mirrors the aurity pattern (lib/icons/status-icons.ts): replaces emoji
 * literals (``✓ ✗ …``) with lucide components so the indicator color and
 * weight match the surrounding text instead of falling back to the OS
 * emoji font (which varies per platform).
 */

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Semantic status → lucide component. */
export const STATUS_ICONS: Record<string, LucideIcon> = {
  done: CheckCircle2,
  ok: CheckCircle2,
  pending: Loader2, // pair with ``animate-spin`` at the call site
  running: Loader2,
  error: XCircle,
  failed: XCircle,
  warning: AlertTriangle,
} as const;

export function getStatusIcon(key: string): LucideIcon {
  return STATUS_ICONS[key] || CheckCircle2;
}

/**
 * Resolve a tri-state (``is_error: bool | null``) to a status key. ``null``
 * means the tool call is still in flight (no ``ToolResultBlock`` yet); ``false``
 * is success; ``true`` is an explicit tool error reported by the SDK.
 */
export function stepStatusKey(isError: boolean | null): "pending" | "done" | "error" {
  if (isError === null) return "pending";
  return isError ? "error" : "done";
}
