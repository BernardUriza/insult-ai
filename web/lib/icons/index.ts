/**
 * Icons Module Index — Insult AI's curated icon surface.
 *
 * One module to import from when a component needs an icon. Bundles are
 * split by domain (ui-icons, tool-icons, status-icons) so the autocompleted
 * keys read like the role you want (``getToolIcon("scrape_as_markdown")``,
 * ``getUIIcon("send")``) rather than like the underlying lucide name.
 *
 * Pattern lifted from ``aurity/lib/icons/`` — same shape, same idea: tighten
 * the icon set here, not in twelve component files.
 */

export { UI_ICONS, getUIIcon } from "./ui-icons";
export { TOOL_ICONS, classifyTool, getToolIcon, shortToolName } from "./tool-icons";
export { STATUS_ICONS, getStatusIcon, stepStatusKey } from "./status-icons";
export type { LucideIcon } from "lucide-react";
