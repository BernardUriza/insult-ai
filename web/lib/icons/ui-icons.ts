/**
 * UI/General Icons — chrome of the Insult AI app.
 *
 * Mirrors the aurity pattern (lib/icons/ui-icons.ts): curated re-exports
 * from lucide-react with semantic keys, so the components reach for
 * ``getUIIcon("send")`` instead of importing 32 lucide names everywhere.
 * Tighten the icon set here, not in twelve component files.
 */

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ExternalLink,
  Flame,
  ListChecks,
  Receipt,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * UI icon map — semantic key → lucide component.
 * Keys are the role inside the UI, NOT the lucide name (so a swap from
 * Send → CornerDownLeft is a one-line change here, no ripple).
 */
export const UI_ICONS: Record<string, LucideIcon> = {
  // Branding
  brand: Flame, // the 🔥 next to "Insult AI"
  // Assistant identity (the 🤖 of the thinking panel)
  bot: Bot,
  // Composer actions
  send: Send,
  stop: Square, // streaming-cancel button
  // Page chrome
  new: Sparkles, // "✦ nueva conversación"
  back: ArrowLeft, // "← single-shot"
  forward: ArrowRight, // "chat →"
  close: X,
  // Receipts panel header
  receipts: Receipt,
  // Plan checklist header (declare_plan / start_step / complete_step)
  plan: ListChecks,
  // Outgoing-link arrow — shown on hover next to each receipt URL so the user
  // sees the row is clickable AND that it leaves the site.
  external: ExternalLink,
} as const;

export function getUIIcon(key: string): LucideIcon {
  return UI_ICONS[key] || Sparkles;
}
